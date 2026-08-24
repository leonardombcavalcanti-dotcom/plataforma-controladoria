-- ============================================================
-- Migration 0017 — Marca de substituição na demanda (Sprint 22c)
-- Deixa explícito, em qualquer visão, que a demanda é de outra pessoa
-- e está sendo executada por um substituto.
-- ============================================================

alter table demandas add column if not exists substituindo_id uuid references pessoas(id);
comment on column demandas.substituindo_id is
  'Titular original quando a demanda está temporariamente com um substituto (ausência).';

-- Guard: campo governado (só as funções oficiais alteram)
create or replace function fn_guard_demandas()
returns trigger language plpgsql as $$
begin
  if (new.status is distinct from old.status
      or new.motivo_conclusao is distinct from old.motivo_conclusao
      or new.motivo_encerramento is distinct from old.motivo_encerramento
      or new.retrabalho is distinct from old.retrabalho
      or new.iniciada_em is distinct from old.iniciada_em
      or new.concluida_em is distinct from old.concluida_em
      or new.archived_at is distinct from old.archived_at
      or new.devolvida is distinct from old.devolvida
      or new.comentario_devolucao is distinct from old.comentario_devolucao
      or new.motivo_rejeicao is distinct from old.motivo_rejeicao
      or new.avaliacao_nota is distinct from old.avaliacao_nota
      or new.avaliacao_comentario is distinct from old.avaliacao_comentario
      or new.avaliada_por is distinct from old.avaliada_por
      or new.avaliada_em is distinct from old.avaliada_em
      or new.substituindo_id is distinct from old.substituindo_id)
     and coalesce(current_setting('app.bypass_guard', true), 'off') <> 'on' then
    raise exception 'Status, desfechos, avaliação e substituição mudam apenas pelas funções oficiais.';
  end if;
  if (new.prazo is distinct from old.prazo or new.peso is distinct from old.peso)
     and coalesce(current_setting('app.bypass_guard', true), 'off') <> 'on'
     and not fn_atual_e_gestor() then
    raise exception 'Ajuste de prazo e peso é decisão de gestor/admin.';
  end if;
  new.atualizado_em := now();
  new.updated_by := coalesce(current_pessoa_id(), new.updated_by);
  return new;
end $$;

-- Aplicar ausência: marca o titular na demanda
create or replace function fn_aplicar_ausencia(p_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare a ausencias%rowtype; d record; v_qtd int := 0;
begin
  select * into a from ausencias where id = p_id;
  if a.id is null or a.aplicada or not a.ativa or a.substituto_id is null then return 0; end if;

  perform set_config('app.bypass_guard','on', true);
  for d in select * from demandas
            where tenant_id = a.tenant_id
              and responsavel_id = a.pessoa_id
              and status in ('aberta','em_execucao','bloqueada','em_validacao')
              and archived_at is null
  loop
    insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
    values (a.id, d.id, a.pessoa_id) on conflict do nothing;

    update demandas
       set responsavel_id = a.substituto_id,
           substituindo_id = a.pessoa_id          -- marca visual em todas as telas
     where id = d.id;

    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (d.id, a.pessoa_id, 'ausencia') on conflict do nothing;

    insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
    values (d.tenant_id, 'demanda', d.id, 'substituicao_inicio', current_pessoa_id(),
            jsonb_build_object('de', a.pessoa_id, 'para', a.substituto_id,
                               'motivo', a.tipo::text, 'ate', a.fim));
    v_qtd := v_qtd + 1;
  end loop;
  perform set_config('app.bypass_guard','off', true);

  update ausencias set aplicada = true where id = p_id;
  return v_qtd;
end $$;

-- Devolver: limpa a marca
create or replace function fn_devolver_ausencia(p_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare a ausencias%rowtype; r record; v_qtd int := 0;
begin
  select * into a from ausencias where id = p_id;
  if a.id is null then return 0; end if;

  perform set_config('app.bypass_guard','on', true);
  for r in select ad.*, d.status from ausencia_demandas ad
            join demandas d on d.id = ad.demanda_id
           where ad.ausencia_id = p_id and not ad.devolvida
  loop
    if r.status in ('aberta','em_execucao','bloqueada','em_validacao') then
      update demandas
         set responsavel_id = r.responsavel_original, substituindo_id = null
       where id = r.demanda_id;
      insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
      values (a.tenant_id, 'demanda', r.demanda_id, 'substituicao_fim', current_pessoa_id(),
              jsonb_build_object('devolvida_para', r.responsavel_original));
      v_qtd := v_qtd + 1;
    else
      -- finalizadas pelo substituto: mantém a autoria, mas encerra a marca
      update demandas set substituindo_id = null where id = r.demanda_id;
    end if;
    update ausencia_demandas set devolvida = true
     where ausencia_id = p_id and demanda_id = r.demanda_id;
  end loop;
  perform set_config('app.bypass_guard','off', true);
  return v_qtd;
end $$;

-- Sincronização acessível ao cron (service_role) — sem depender do tenant da sessão
create or replace function sincronizar_ausencias_global()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_ap int := 0; v_dev int := 0;
begin
  for r in select id from ausencias
            where ativa and not aplicada and substituto_id is not null
              and inicio <= current_date and fim >= current_date
  loop
    perform fn_aplicar_ausencia(r.id);
    v_ap := v_ap + 1;
  end loop;

  for r in select id from ausencias where ativa and fim < current_date
  loop
    perform fn_devolver_ausencia(r.id);
    update ausencias set ativa = false, encerrada_em = now() where id = r.id;
    v_dev := v_dev + 1;
  end loop;

  return jsonb_build_object('aplicadas', v_ap, 'encerradas', v_dev);
end $$;

grant execute on function sincronizar_ausencias_global to authenticated;

-- BI enxerga a substituição
create or replace view bi.vw_demandas as
  select d.id, t.nome as empresa, a.nome as area, d.titulo, d.tipo::text as tipo,
         d.status::text as status, d.prioridade::text as prioridade, d.valor::text as valor,
         d.complexidade::text as complexidade,
         pr.nome as processo, o.competencia,
         resp.nome as responsavel, cri.nome as criador,
         tit.nome as titular_original,
         d.prazo, d.iniciada_em, d.concluida_em,
         d.motivo_conclusao::text as motivo_conclusao,
         d.motivo_encerramento::text as motivo_encerramento,
         d.retrabalho, d.tempo_estimado_h, d.peso,
         d.avaliacao_nota,
         (select coalesce(sum(horas),0) from demanda_tempos t2 where t2.demanda_id = d.id) as horas_apontadas,
         d.criado_em
  from demandas d
  join tenants t on t.id = d.tenant_id
  join areas a on a.id = d.area_id
  left join pessoas resp on resp.id = d.responsavel_id
  join pessoas cri on cri.id = d.criador_id
  left join pessoas tit on tit.id = d.substituindo_id
  left join processos pr on pr.id = d.processo_id
  left join ocorrencias o on o.id = d.ocorrencia_id;
