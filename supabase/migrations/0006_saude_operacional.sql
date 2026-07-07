-- ============================================================
-- Migration 0006 — Saúde Operacional · Conformidade · Maturidade
-- Fase 2, incremento 1 · 06/07/2026
-- Regra inegociável (§9.1): nunca caixa-preta — todo score nasce com breakdown.
-- ============================================================

-- ---------- MATURIDADE (RN-10): o processo é bem definido? ----------
create or replace function fn_maturidade_processo(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p processos%rowtype; comp jsonb := '[]'::jsonb; total int := 0;
        v int; tem boolean;
begin
  select * into p from processos where id = p_id and tenant_id = current_tenant_id();
  if p.id is null then return null; end if;

  -- Documentação (20): objetivo (sempre existe) + descrição ou fluxo
  select exists (select 1 from processo_artefatos a where a.processo_id = p_id
                 and a.tipo = 'fluxo_etapa' and a.archived_at is null) into tem;
  v := case when coalesce(trim(p.descricao),'') <> '' and tem then 20
            when coalesce(trim(p.descricao),'') <> '' or tem then 12 else 4 end;
  total := total + v;
  comp := comp || jsonb_build_object('nome','Documentação','pontos',v,'peso',20,
    'dica', case when v < 20 then 'Descreva o processo e mapeie o fluxo em etapas.' else null end);

  -- Checklist/procedimentos (20)
  select exists (select 1 from processo_artefatos a where a.processo_id = p_id
                 and a.tipo in ('checklist_item','procedimento') and a.archived_at is null) into tem;
  v := case when tem then 20 else 0 end;
  total := total + v;
  comp := comp || jsonb_build_object('nome','Checklist e procedimentos','pontos',v,'peso',20,
    'dica', case when v = 0 then 'Sem checklist, o processo depende do "expert".' else null end);

  -- Responsáveis (15): dono (10) + substituto (5)
  v := 10 + case when p.substituto_id is not null then 5 else 0 end;
  total := total + v;
  comp := comp || jsonb_build_object('nome','Responsáveis','pontos',v,'peso',15,
    'dica', case when v < 15 then 'Defina o substituto do dono.' else null end);

  -- Recorrência/critérios de operação (15)
  if p.periodicidade = 'sob_demanda' then
    v := case when coalesce(trim(p.criterio_inicio),'') <> '' then 15 else 5 end;
  else
    select exists (select 1 from processo_recorrencia r where r.processo_id = p_id
                   and r.archived_at is null) into tem;
    v := case when tem then 15 else 0 end;
  end if;
  total := total + v;
  comp := comp || jsonb_build_object('nome','Recorrência configurada','pontos',v,'peso',15,
    'dica', case when v < 15 then 'Configure as demandas recorrentes (ou o critério de início).' else null end);

  -- Templates e materiais (10)
  select exists (select 1 from processo_artefatos a where a.processo_id = p_id
                 and a.tipo in ('template','arquivo','sql','dashboard','video') and a.archived_at is null) into tem;
  v := case when tem then 10 else 0 end;
  total := total + v;
  comp := comp || jsonb_build_object('nome','Templates e materiais','pontos',v,'peso',10,
    'dica', case when v = 0 then 'Anexe templates, SQLs ou dashboards de apoio.' else null end);

  -- Revisão em dia (10): mensal+ = 12 meses; diária/semanal = 6
  v := case when p.ultima_revisao is not null and p.ultima_revisao >=
        (current_date - (case when p.periodicidade in ('diaria','semanal') then 183 else 365 end))
       then 10 else 0 end;
  total := total + v;
  comp := comp || jsonb_build_object('nome','Revisão em dia','pontos',v,'peso',10,
    'dica', case when v = 0 then 'Revise o processo (ciclo de vida → Em Revisão).' else null end);

  -- Fronteiras (10): entradas/saídas + critério de encerramento
  v := (case when array_length(p.entradas,1) > 0 or array_length(p.saidas,1) > 0 then 5 else 0 end)
     + (case when coalesce(trim(p.criterio_encerramento),'') <> '' then 5 else 0 end);
  total := total + v;
  comp := comp || jsonb_build_object('nome','Fronteiras (entradas/saídas/critérios)','pontos',v,'peso',10,
    'dica', case when v < 10 then 'Defina entradas, saídas e o critério objetivo de "pronto".' else null end);

  return jsonb_build_object('score', total, 'componentes', comp);
end $$;

-- ---------- CONFORMIDADE (RN-07): o processo é bem executado? ----------
create or replace function fn_indicadores_processo(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ocorrencias jsonb; v_conf numeric; v_tempo numeric;
begin
  if not exists (select 1 from processos where id = p_id and tenant_id = current_tenant_id()) then
    return null;
  end if;

  -- Por ocorrência concluída (últimas 6): média de 3 fatores
  select coalesce(jsonb_agg(o_row order by o_row->>'competencia' desc), '[]'::jsonb)
    into v_ocorrencias
  from (
    select jsonb_build_object(
      'competencia', o.competencia,
      'score', round((
        coalesce(x.pct_prazo, 0) + coalesce(x.pct_sem_retrabalho, 0) + coalesce(x.pct_checklist, 1)
      ) / 3 * 100),
      'no_prazo', x.no_prazo, 'concluidas', x.concluidas,
      'retrabalho', x.retrabalho_total,
      'duracao_dias', extract(day from o.concluida_em - o.criada_em)
    ) as o_row
    from ocorrencias o
    cross join lateral (
      select
        count(*) filter (where d.status = 'concluida') as concluidas,
        count(*) filter (where d.motivo_conclusao in ('no_prazo','antecipada')) as no_prazo,
        coalesce(sum(d.retrabalho), 0) as retrabalho_total,
        (count(*) filter (where d.motivo_conclusao in ('no_prazo','antecipada')))::numeric
          / nullif(count(*) filter (where d.status = 'concluida'), 0) as pct_prazo,
        (count(*) filter (where d.status = 'concluida' and d.retrabalho = 0))::numeric
          / nullif(count(*) filter (where d.status = 'concluida'), 0) as pct_sem_retrabalho,
        (select count(*) filter (where c.feito)::numeric / nullif(count(*), 0)
           from demanda_checklist c join demandas d2 on d2.id = c.demanda_id
          where d2.ocorrencia_id = o.id and c.archived_at is null) as pct_checklist
      from demandas d where d.ocorrencia_id = o.id
    ) x
    where o.processo_id = p_id
      and o.status in ('concluida','concluida_pendencias')
    order by o.competencia desc
    limit 6
  ) sub;

  select avg((e->>'score')::numeric) into v_conf
    from jsonb_array_elements(v_ocorrencias) e;

  select avg(extract(epoch from o.concluida_em - o.criada_em) / 86400)
    into v_tempo
  from ocorrencias o
  where o.processo_id = p_id and o.status in ('concluida','concluida_pendencias');

  return jsonb_build_object(
    'maturidade', fn_maturidade_processo(p_id),
    'conformidade', jsonb_build_object(
      'score', round(v_conf), 'ocorrencias', v_ocorrencias),
    'tempo_medio_dias', round(v_tempo, 1));
end $$;

-- ---------- SAÚDE OPERACIONAL (§9.1): o termômetro ----------
create or replace function fn_saude_operacional()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare comp jsonb := '[]'::jsonb; total numeric := 0;
        v numeric; f numeric;
        v_concl_30d int; v_no_prazo int; v_ativas int; v_atrasadas int;
        v_bloqueadas int; v_sem_retra int; v_com_processo int; v_total_30d int;
        v_procs_ativos int; v_revisao_ok int;
begin
  select count(*) filter (where motivo_conclusao is not null),
         count(*) filter (where motivo_conclusao in ('no_prazo','antecipada')),
         count(*) filter (where motivo_conclusao is not null and retrabalho = 0)
    into v_concl_30d, v_no_prazo, v_sem_retra
  from demandas
  where tenant_id = current_tenant_id()
    and concluida_em >= now() - interval '30 days' and status = 'concluida';

  select count(*),
         count(*) filter (where prazo < current_date),
         count(*) filter (where status = 'bloqueada')
    into v_ativas, v_atrasadas, v_bloqueadas
  from demandas
  where tenant_id = current_tenant_id()
    and status in ('aberta','em_execucao','bloqueada','em_validacao');

  select count(*), count(*) filter (where processo_id is not null)
    into v_total_30d, v_com_processo
  from demandas
  where tenant_id = current_tenant_id()
    and criado_em >= now() - interval '30 days'
    and status not in ('solicitada','rejeitada');

  select count(*),
         count(*) filter (where ultima_revisao is not null and ultima_revisao >=
           (current_date - (case when periodicidade in ('diaria','semanal') then 183 else 365 end)))
    into v_procs_ativos, v_revisao_ok
  from processos
  where tenant_id = current_tenant_id() and status in ('ativo','em_revisao');

  -- 1. Entrega no prazo (25)
  f := coalesce(v_no_prazo::numeric / nullif(v_concl_30d, 0), 1);
  v := round(f * 25, 1); total := total + v;
  comp := comp || jsonb_build_object('nome','Entrega no prazo (30 dias)','pontos',v,'peso',25,
    'detalhe', v_no_prazo || ' de ' || v_concl_30d || ' concluída(s) no prazo', 'rota','/demandas/arquivadas');

  -- 2. Ativas sem atraso (15)
  f := 1 - coalesce(v_atrasadas::numeric / nullif(v_ativas, 0), 0);
  v := round(f * 15, 1); total := total + v;
  comp := comp || jsonb_build_object('nome','Demandas ativas sem atraso','pontos',v,'peso',15,
    'detalhe', v_atrasadas || ' atrasada(s) de ' || v_ativas || ' ativa(s)', 'rota','/demandas/equipe');

  -- 3. Sem retrabalho (15)
  f := coalesce(v_sem_retra::numeric / nullif(v_concl_30d, 0), 1);
  v := round(f * 15, 1); total := total + v;
  comp := comp || jsonb_build_object('nome','Execução sem retrabalho (30 dias)','pontos',v,'peso',15,
    'detalhe', (v_concl_30d - v_sem_retra) || ' com retrabalho de ' || v_concl_30d, 'rota','/demandas/arquivadas');

  -- 4. Sem bloqueio (15)
  f := 1 - coalesce(v_bloqueadas::numeric / nullif(v_ativas, 0), 0);
  v := round(f * 15, 1); total := total + v;
  comp := comp || jsonb_build_object('nome','Operação sem bloqueio','pontos',v,'peso',15,
    'detalhe', v_bloqueadas || ' bloqueada(s) agora', 'rota','/demandas/equipe');

  -- 5. Cobertura Operacional (15) — ADR-15
  f := coalesce(v_com_processo::numeric / nullif(v_total_30d, 0), 1);
  v := round(f * 15, 1); total := total + v;
  comp := comp || jsonb_build_object('nome','Cobertura Operacional','pontos',v,'peso',15,
    'detalhe', round(f * 100) || '% das demandas nascem de processos', 'rota','/processos');

  -- 6. Catálogo com revisão em dia (15)
  f := coalesce(v_revisao_ok::numeric / nullif(v_procs_ativos, 0), 1);
  v := round(f * 15, 1); total := total + v;
  comp := comp || jsonb_build_object('nome','Catálogo com revisão em dia','pontos',v,'peso',15,
    'detalhe', v_revisao_ok || ' de ' || v_procs_ativos || ' processo(s) ativo(s) revisado(s)', 'rota','/processos');

  return jsonb_build_object('score', round(total), 'componentes', comp);
end $$;

grant execute on function fn_maturidade_processo, fn_indicadores_processo,
  fn_saude_operacional to authenticated;
