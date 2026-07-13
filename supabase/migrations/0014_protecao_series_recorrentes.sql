-- ============================================================
-- Migration 0014 — Proteção de séries recorrentes vivas · Sprint 18
-- Gerar ocorrência PULA demandas-modelo cuja série ainda está ativa
-- (evita duplicar séries diárias/semanais que se autoperpetuam).
-- ============================================================

-- 1) A instância gerada na conclusão passa a carregar a origem (recorrencia_id):
--    é o que permite rastrear a série viva — e melhora o agrupamento do Histórico.
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
                          complexidade, objetivo_negocio, processo_id, recorrencia_id,
                          criador_id, responsavel_id, validador_id, exige_validacao, status, prazo,
                          tempo_estimado_h, peso, recorrencia, anexo_obrigatorio)
    values (d.tenant_id, d.area_id, d.titulo, d.descricao, d.tipo, d.prioridade, d.valor,
            d.complexidade, d.objetivo_negocio, d.processo_id, d.recorrencia_id,
            d.criador_id, d.responsavel_id, d.validador_id, d.exige_validacao, 'aberta', v_prazo,
            d.tempo_estimado_h, d.peso, d.recorrencia, d.anexo_obrigatorio)
    returning id into v_nova;
    perform set_config('app.bypass_guard','off', true);

    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_nova, ordem, texto from demanda_checklist
     where demanda_id = d.id and archived_at is null;

    perform fn_evento_demanda(d, 'recorrencia_gerada',
      jsonb_build_object('proxima', v_nova, 'prazo', v_prazo));
  end if;
end $$;

-- 2) Gerar ocorrência: pula moldes com série recorrente ainda viva
create or replace function gerar_ocorrencia(p_id uuid, p_competencia text)
returns ocorrencias language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; o ocorrencias%rowtype; r record;
        v_resp uuid; v_dem uuid; v_prazo date; v_criadas int := 0; v_puladas int := 0;
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
    -- PROTEÇÃO (Sprint 18): molde com recorrência própria e série ainda ativa
    -- não gera de novo — a série se perpetua sozinha ao concluir.
    if r.recorrencia is not null and exists (
         select 1 from demandas dx
          where dx.recorrencia_id = r.id
            and dx.status in ('aberta','em_execucao','bloqueada','em_validacao')) then
      v_puladas := v_puladas + 1;
      continue;
    end if;

    select pe.id into v_resp from pessoas pe
     where pe.id = r.responsavel_padrao_id and pe.ativa;
    v_resp := coalesce(v_resp, p.dono_id);

    v_prazo := case
      when r.prazo is not null then greatest(fn_avancar_recorrencia(r.prazo, r.recorrencia), current_date)
      else fn_add_dias_uteis(current_date, coalesce(r.dia_util_gatilho, 1) + r.prazo_dias) end;

    insert into demandas (tenant_id, area_id, titulo, descricao, tipo, prioridade, valor,
                          complexidade, objetivo_negocio, tempo_estimado_h, peso, recorrencia,
                          anexo_obrigatorio,
                          processo_id, ocorrencia_id, recorrencia_id,
                          criador_id, responsavel_id, validador_id, exige_validacao, prazo)
    values (p.tenant_id, p.area_id,
            r.titulo_modelo || ' — ' || p_competencia,
            r.descricao, r.tipo, r.prioridade, r.valor,
            r.complexidade, coalesce(r.objetivo_negocio, p.nome), r.tempo_estimado_h, r.peso,
            r.recorrencia, r.anexo_obrigatorio,
            p_id, o.id, r.id,
            coalesce(current_pessoa_id(), p.dono_id), v_resp, p.dono_id,
            r.exige_validacao, v_prazo)
    returning id into v_dem;
    v_criadas := v_criadas + 1;

    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_dem, a.ordem, a.titulo
      from processo_artefatos a
     where a.processo_id = p_id and a.tipo = 'checklist_item' and a.archived_at is null;

    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (v_dem, p.dono_id, 'dono_processo') on conflict do nothing;
  end loop;
  perform set_config('app.bypass_guard','off', true);

  -- Nada a gerar? Não deixa ocorrência vazia para trás.
  if v_criadas = 0 then
    delete from ocorrencias where id = o.id;
    raise exception 'Nada a gerar: as % demanda(s)-modelo têm séries recorrentes ainda ativas — elas se renovam sozinhas ao concluir.', v_puladas;
  end if;

  return o;
end $$;
