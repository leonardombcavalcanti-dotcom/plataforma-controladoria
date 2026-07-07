-- ============================================================
-- Migration 0010 — Peso da demanda + recorrência com campos completos
-- Sprint 14 · 06/07/2026
-- ============================================================

-- ---------- 1. PESO (esforço 1–10) ----------
alter table demandas add column peso int check (peso between 1 and 10);

-- ---------- 2. RECORRÊNCIA COMPLETA: todos os campos da demanda ----------
alter table processo_recorrencia add column descricao text;
alter table processo_recorrencia add column tipo tipo_demanda not null default 'rotina';
alter table processo_recorrencia add column prioridade prioridade_demanda not null default 'media';
alter table processo_recorrencia add column valor valor_demanda not null default 'medio';
alter table processo_recorrencia add column complexidade complexidade_demanda;
alter table processo_recorrencia add column objetivo_negocio text;
alter table processo_recorrencia add column tempo_estimado_h numeric;
alter table processo_recorrencia add column peso int check (peso between 1 and 10);

-- Geração da ocorrência herda TUDO (RN-03 completa)
create or replace function gerar_ocorrencia(p_id uuid, p_competencia text)
returns ocorrencias language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; o ocorrencias%rowtype; r record; v_resp uuid; v_dem uuid;
begin
  select * into p from processos where id = p_id and tenant_id = current_tenant_id();
  if p.id is null then raise exception 'Processo não encontrado.'; end if;
  if p.status not in ('ativo','em_revisao') then
    raise exception 'Somente processos Ativos ou Em Revisão geram ocorrências (RN-02).';
  end if;
  if p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Competência inválida. Use AAAA-MM.';
  end if;

  insert into ocorrencias (processo_id, competencia, versao_processo)
  values (p_id, p_competencia, p.versao)
  returning * into o;

  perform set_config('app.bypass_guard','on', true);
  for r in select * from processo_recorrencia
            where processo_id = p_id and archived_at is null order by ordem
  loop
    select pe.id into v_resp from pessoas pe
     where pe.id = r.responsavel_padrao_id and pe.ativa;
    v_resp := coalesce(v_resp, p.dono_id);

    insert into demandas (tenant_id, area_id, titulo, descricao, tipo, prioridade, valor,
                          complexidade, objetivo_negocio, tempo_estimado_h, peso,
                          processo_id, ocorrencia_id, recorrencia_id,
                          criador_id, responsavel_id, validador_id, exige_validacao, prazo)
    values (p.tenant_id, p.area_id,
            r.titulo_modelo || ' — ' || p_competencia,
            r.descricao, r.tipo, r.prioridade, r.valor,
            r.complexidade, coalesce(r.objetivo_negocio, p.nome), r.tempo_estimado_h, r.peso,
            p_id, o.id, r.id,
            coalesce(current_pessoa_id(), p.dono_id), v_resp, p.dono_id,
            r.exige_validacao,
            fn_add_dias_uteis(current_date, coalesce(r.dia_util_gatilho, 1) + r.prazo_dias))
    returning id into v_dem;

    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_dem, a.ordem, a.titulo
      from processo_artefatos a
     where a.processo_id = p_id and a.tipo = 'checklist_item' and a.archived_at is null;

    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (v_dem, p.dono_id, 'dono_processo') on conflict do nothing;
  end loop;
  perform set_config('app.bypass_guard','off', true);

  return o;
end $$;

-- Recorrência da própria demanda também propaga o peso
create or replace function fn_concluir_interna(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype; v_motivo motivo_conclusao; v_prazo date; v_nova uuid;
begin
  select * into d from demandas where id = p_id;
  v_motivo := case
    when current_date < d.prazo then 'antecipada'
    when current_date = d.prazo then 'no_prazo'
    else 'com_atraso' end;
  perform set_config('app.bypass_guard','on', true);
  update demandas
     set status = 'concluida', concluida_em = now(), motivo_conclusao = v_motivo,
         iniciada_em = coalesce(iniciada_em, now())
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'conclusao', jsonb_build_object('motivo', v_motivo));
  if d.ocorrencia_id is not null then perform fn_verificar_ocorrencia(d.ocorrencia_id); end if;

  if d.recorrencia is not null then
    v_prazo := case d.recorrencia
      when 'diaria'  then fn_add_dias_uteis(greatest(d.prazo, current_date), 1)
      when 'semanal' then greatest(d.prazo, current_date) + 7
      when 'mensal'  then (greatest(d.prazo, current_date) + interval '1 month')::date
      else                (greatest(d.prazo, current_date) + interval '1 year')::date end;

    perform set_config('app.bypass_guard','on', true);
    insert into demandas (tenant_id, area_id, titulo, descricao, tipo, prioridade, valor,
                          complexidade, objetivo_negocio, processo_id, criador_id,
                          responsavel_id, validador_id, exige_validacao, status, prazo,
                          tempo_estimado_h, peso, recorrencia)
    values (d.tenant_id, d.area_id, d.titulo, d.descricao, d.tipo, d.prioridade, d.valor,
            d.complexidade, d.objetivo_negocio, d.processo_id, d.criador_id,
            d.responsavel_id, d.validador_id, d.exige_validacao, 'aberta', v_prazo,
            d.tempo_estimado_h, d.peso, d.recorrencia)
    returning id into v_nova;
    perform set_config('app.bypass_guard','off', true);

    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_nova, ordem, texto from demanda_checklist
     where demanda_id = d.id and archived_at is null;

    perform fn_evento_demanda(d, 'recorrencia_gerada',
      jsonb_build_object('proxima', v_nova, 'prazo', v_prazo));
  end if;
end $$;

-- ---------- 3. APROVAÇÃO VALIDA O PESO SOLICITADO ----------
drop function if exists aprovar_solicitacao(uuid, uuid, date);

create or replace function aprovar_solicitacao(p_id uuid, p_responsavel uuid, p_prazo date, p_peso int default null)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.status <> 'solicitada' then raise exception 'Esta não é uma solicitação pendente.'; end if;
  if not fn_pode_decidir_solicitacao(d) then
    raise exception 'Somente o aprovador designado (ou um gestor) pode decidir.';
  end if;
  if p_responsavel is null or p_prazo is null then
    raise exception 'Aprovar exige definir responsável e prazo.';
  end if;
  if p_peso is not null and p_peso not between 1 and 10 then
    raise exception 'Peso de 1 a 10.';
  end if;

  perform set_config('app.bypass_guard','on', true);
  update demandas
     set status = 'aberta', responsavel_id = p_responsavel, prazo = p_prazo,
         peso = coalesce(p_peso, peso),          -- gestor valida/ajusta o peso solicitado
         devolvida = false, comentario_devolucao = null
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);

  if d.criador_id <> p_responsavel then
    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (p_id, d.criador_id, 'criador') on conflict do nothing;
  end if;

  perform fn_evento_demanda(d, 'solicitacao_aprovada',
    jsonb_build_object('responsavel', p_responsavel, 'prazo', p_prazo,
                       'peso_solicitado', d.peso, 'peso_validado', coalesce(p_peso, d.peso)));
  select * into d from demandas where id = p_id; return d;
end $$;
grant execute on function aprovar_solicitacao to authenticated;
