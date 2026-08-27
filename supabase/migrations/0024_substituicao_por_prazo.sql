-- ============================================================
-- Migration 0024 — Substituição vale apenas para o que VENCE na ausência
-- Sprint 22g · 07/08/2026
--
-- Regra: uma demanda só passa ao substituto se o PRAZO dela cair dentro
-- do período (prazo >= início da ausência). O que vence antes das férias
-- é responsabilidade do titular — ele ainda está trabalhando.
-- ============================================================

-- 1) Aplicar ausência: filtra pelo prazo
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
              and prazo >= a.inicio          -- só o que vence durante (ou após) o início
  loop
    insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
    values (a.id, d.id, a.pessoa_id) on conflict do nothing;

    update demandas set responsavel_id = a.substituto_id, substituindo_id = a.pessoa_id
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

-- 2) Reconciliação e reparo: mesmo critério de prazo
create or replace function fn_reparar_substituicoes()
returns int language plpgsql security definer set search_path = public as $$
declare a record; v_qtd int := 0; r record;
begin
  for a in select * from ausencias where ativa and substituto_id is not null
  loop
    for r in
      with recursive origem as (
        select ad.demanda_id as id from ausencia_demandas ad where ad.ausencia_id = a.id
        union
        select e.objeto_id from eventos e
         where e.objeto_tipo = 'demanda' and e.tipo = 'substituicao_inicio'
           and (e.dados->>'de')::uuid = a.pessoa_id
      ),
      cadeia as (
        select id from origem
        union
        select (e.dados->>'proxima')::uuid
          from eventos e join cadeia c on c.id = e.objeto_id
         where e.objeto_tipo = 'demanda' and e.tipo = 'recorrencia_gerada'
           and e.dados->>'proxima' is not null
      )
      select d.* from demandas d
       join cadeia c on c.id = d.id
      where d.status in ('aberta','em_execucao','bloqueada','em_validacao')
        and d.archived_at is null
        and d.responsavel_id = a.substituto_id
        and d.prazo >= a.inicio and d.prazo <= a.fim      -- só dentro da janela
        and coalesce(d.substituindo_id, '00000000-0000-0000-0000-000000000000') <> a.pessoa_id
    loop
      perform set_config('app.bypass_guard','on', true);
      update demandas set substituindo_id = a.pessoa_id where id = r.id;
      perform set_config('app.bypass_guard','off', true);
      insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
      values (a.id, r.id, a.pessoa_id) on conflict do nothing;
      v_qtd := v_qtd + 1;
    end loop;
  end loop;
  return v_qtd;
end $$;

-- 3) DEVOLVER o que foi transferido indevidamente (vence antes ou depois da janela)
create or replace function fn_devolver_fora_da_janela()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_qtd int := 0;
begin
  for r in
    select d.id, d.substituindo_id, a.id as ausencia_id
      from demandas d
      join ausencias a on a.pessoa_id = d.substituindo_id and a.ativa
     where d.substituindo_id is not null
       and d.status in ('aberta','em_execucao','bloqueada','em_validacao')
       and (d.prazo < a.inicio or d.prazo > a.fim)
  loop
    perform set_config('app.bypass_guard','on', true);
    update demandas
       set responsavel_id = r.substituindo_id, substituindo_id = null
     where id = r.id;
    perform set_config('app.bypass_guard','off', true);

    update ausencia_demandas set devolvida = true
     where ausencia_id = r.ausencia_id and demanda_id = r.id;

    insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
    select d.tenant_id, 'demanda', d.id, 'substituicao_corrigida', current_pessoa_id(),
           jsonb_build_object('motivo', 'prazo fora do periodo de ausencia',
                              'devolvida_para', r.substituindo_id)
      from demandas d where d.id = r.id;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end $$;
grant execute on function fn_devolver_fora_da_janela to authenticated;

select fn_devolver_fora_da_janela() as demandas_devolvidas_ao_titular;

-- 4) Sincronização passa a corrigir a janela também
create or replace function sincronizar_ausencias()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_ap int := 0; v_dev int := 0; v_rec int; v_rep int; v_fora int;
begin
  for r in select id from ausencias
            where tenant_id = current_tenant_id() and ativa and not aplicada
              and substituto_id is not null and inicio <= current_date and fim >= current_date
  loop
    perform fn_aplicar_ausencia(r.id); v_ap := v_ap + 1;
  end loop;
  v_rec  := fn_reconciliar_ausencias();
  v_rep  := fn_reparar_substituicoes();
  v_fora := fn_devolver_fora_da_janela();
  for r in select id from ausencias
            where tenant_id = current_tenant_id() and ativa and fim < current_date
  loop
    perform fn_devolver_ausencia(r.id);
    update ausencias set ativa = false, encerrada_em = now() where id = r.id;
    v_dev := v_dev + 1;
  end loop;
  return jsonb_build_object('aplicadas', v_ap, 'reconciliadas', v_rec,
                            'reparadas', v_rep, 'corrigidas', v_fora, 'encerradas', v_dev);
end $$;

create or replace function sincronizar_ausencias_global()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_ap int := 0; v_dev int := 0; v_rec int; v_rep int; v_fora int;
begin
  for r in select id from ausencias
            where ativa and not aplicada and substituto_id is not null
              and inicio <= current_date and fim >= current_date
  loop
    perform fn_aplicar_ausencia(r.id); v_ap := v_ap + 1;
  end loop;
  v_rec  := fn_reconciliar_ausencias();
  v_rep  := fn_reparar_substituicoes();
  v_fora := fn_devolver_fora_da_janela();
  for r in select id from ausencias where ativa and fim < current_date
  loop
    perform fn_devolver_ausencia(r.id);
    update ausencias set ativa = false, encerrada_em = now() where id = r.id;
    v_dev := v_dev + 1;
  end loop;
  return jsonb_build_object('aplicadas', v_ap, 'reconciliadas', v_rec,
                            'reparadas', v_rep, 'corrigidas', v_fora, 'encerradas', v_dev);
end $$;

insert into migrations_aplicadas (numero, descricao)
values ('0024', 'Substituição limitada ao prazo dentro da ausência')
on conflict (numero) do nothing;

-- Conferência
select d.titulo, r.nome as responsavel, t.nome as titular, d.prazo, d.status
  from demandas d
  left join pessoas r on r.id = d.responsavel_id
  left join pessoas t on t.id = d.substituindo_id
 where d.status in ('aberta','em_execucao','bloqueada','em_validacao')
 order by d.prazo;
