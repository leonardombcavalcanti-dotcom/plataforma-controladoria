-- ============================================================
-- Migration 0025 — Competência do título acompanha o prazo real
-- Sprint 22h · 07/08/2026
--
-- BUG: numa demanda-modelo com recorrência própria (ex.: semanal), o título
-- recebia a competência da OCORRÊNCIA ("— 2026-08") e a mantinha para sempre,
-- mesmo vencendo em setembro, outubro... O rótulo passava a mentir.
--
-- Regra: o sufixo de competência reflete o MÊS DO PRAZO da instância.
-- ============================================================

-- 1) Geração da ocorrência: sufixo pelo prazo calculado
create or replace function gerar_ocorrencia(p_id uuid, p_competencia text)
returns ocorrencias language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; o ocorrencias%rowtype; r record;
        v_resp uuid; v_dem uuid; v_prazo date; v_criadas int := 0; v_puladas int := 0;
        v_titular uuid; v_marca uuid; a ausencias%rowtype;
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
    -- Série recorrente já viva não é gerada de novo (proteção 0014)
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

    -- Se o prazo cai dentro de uma ausência ativa do responsável, já nasce com o substituto
    v_titular := v_resp;
    v_marca := null;
    select * into a from ausencias
     where pessoa_id = v_titular and ativa and substituto_id is not null
       and inicio <= v_prazo and fim >= v_prazo
     order by inicio limit 1;
    if a.id is not null then
      v_resp := a.substituto_id;
      v_marca := v_titular;
    end if;

    insert into demandas (tenant_id, area_id, titulo, descricao, tipo, prioridade, valor,
                          complexidade, objetivo_negocio, tempo_estimado_h, peso, recorrencia,
                          anexo_obrigatorio,
                          processo_id, ocorrencia_id, recorrencia_id, substituindo_id,
                          criador_id, responsavel_id, validador_id, exige_validacao, prazo)
    values (p.tenant_id, p.area_id,
            -- competência do PRAZO da instância (não a da ocorrência)
            r.titulo_modelo || ' — ' || to_char(v_prazo, 'YYYY-MM'),
            r.descricao, r.tipo, r.prioridade, r.valor,
            r.complexidade, coalesce(r.objetivo_negocio, p.nome), r.tempo_estimado_h, r.peso,
            r.recorrencia, r.anexo_obrigatorio,
            p_id, o.id, r.id, v_marca,
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

    if a.id is not null then
      insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
      values (a.id, v_dem, v_titular) on conflict do nothing;
      insert into demanda_observadores (demanda_id, pessoa_id, origem)
      values (v_dem, v_titular, 'ausencia') on conflict do nothing;
    end if;
  end loop;
  perform set_config('app.bypass_guard','off', true);

  if v_criadas = 0 then
    delete from ocorrencias where id = o.id;
    raise exception 'Nada a gerar: as % demanda(s)-modelo têm séries recorrentes ainda ativas — elas se renovam sozinhas ao concluir.', v_puladas;
  end if;

  return o;
end $$;

-- 2) Recorrência: a próxima instância atualiza o sufixo conforme o novo prazo
create or replace function fn_concluir_interna(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype; v_motivo motivo_conclusao; v_prazo date; v_nova uuid;
        v_titular uuid; v_resp uuid; v_marca uuid; a ausencias%rowtype; v_titulo text;
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

    -- Atualiza o sufixo " — AAAA-MM" para a competência do novo prazo
    v_titulo := case
      when d.titulo ~ ' — \d{4}-\d{2}$'
        then regexp_replace(d.titulo, ' — \d{4}-\d{2}$', ' — ' || to_char(v_prazo, 'YYYY-MM'))
      else d.titulo end;

    v_titular := coalesce(d.substituindo_id, d.responsavel_id);
    v_resp := v_titular;
    v_marca := null;

    select * into a from ausencias
     where pessoa_id = v_titular and ativa and substituto_id is not null
       and inicio <= v_prazo and fim >= v_prazo
     order by inicio limit 1;
    if a.id is not null then
      v_resp := a.substituto_id;
      v_marca := v_titular;
    end if;

    perform set_config('app.bypass_guard','on', true);
    insert into demandas (tenant_id, area_id, titulo, descricao, tipo, prioridade, valor,
                          complexidade, objetivo_negocio, processo_id, recorrencia_id,
                          criador_id, responsavel_id, validador_id, exige_validacao, status, prazo,
                          tempo_estimado_h, peso, recorrencia, anexo_obrigatorio, substituindo_id)
    values (d.tenant_id, d.area_id, v_titulo, d.descricao, d.tipo, d.prioridade, d.valor,
            d.complexidade, d.objetivo_negocio, d.processo_id, d.recorrencia_id,
            d.criador_id, v_resp, d.validador_id, d.exige_validacao, 'aberta', v_prazo,
            d.tempo_estimado_h, d.peso, d.recorrencia, d.anexo_obrigatorio, v_marca)
    returning id into v_nova;
    perform set_config('app.bypass_guard','off', true);

    if a.id is not null then
      insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
      values (a.id, v_nova, v_titular) on conflict do nothing;
      insert into demanda_observadores (demanda_id, pessoa_id, origem)
      values (v_nova, v_titular, 'ausencia') on conflict do nothing;
    end if;

    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_nova, ordem, texto from demanda_checklist
     where demanda_id = d.id and archived_at is null;

    perform fn_evento_demanda(d, 'recorrencia_gerada',
      jsonb_build_object('proxima', v_nova, 'prazo', v_prazo, 'substituicao', a.id is not null));
  end if;
end $$;

-- 3) Corrige os títulos já defasados das demandas ATIVAS
do $$
declare v_qtd int;
begin
  perform set_config('app.bypass_guard','on', true);
  update demandas
     set titulo = regexp_replace(titulo, ' — \d{4}-\d{2}$', ' — ' || to_char(prazo, 'YYYY-MM'))
   where titulo ~ ' — \d{4}-\d{2}$'
     and status in ('aberta','em_execucao','bloqueada','em_validacao')
     and substring(titulo from ' — (\d{4}-\d{2})$') <> to_char(prazo, 'YYYY-MM');
  get diagnostics v_qtd = row_count;
  perform set_config('app.bypass_guard','off', true);
  raise notice 'Títulos corrigidos: %', v_qtd;
end $$;

-- 4) ALINHAMENTO: cada demanda ativa fica com quem responde por ela na data do prazo
create or replace function fn_alinhar_responsaveis_ausencia()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_tr int := 0; v_dev int := 0;
begin
  perform set_config('app.bypass_guard','on', true);

  -- (a) prazo DENTRO de ausência ativa e ainda com o titular → passa ao substituto
  for r in
    select d.id, d.responsavel_id as titular, a.substituto_id, a.id as ausencia_id
      from demandas d
      join ausencias a on a.pessoa_id = d.responsavel_id and a.ativa and a.substituto_id is not null
     where d.status in ('aberta','em_execucao','bloqueada','em_validacao')
       and d.archived_at is null
       and d.prazo between a.inicio and a.fim
       and d.substituindo_id is null
  loop
    update demandas set responsavel_id = r.substituto_id, substituindo_id = r.titular where id = r.id;
    insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
    values (r.ausencia_id, r.id, r.titular) on conflict do nothing;
    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (r.id, r.titular, 'ausencia') on conflict do nothing;
    v_tr := v_tr + 1;
  end loop;

  -- (b) prazo FORA da janela e ainda marcada → volta ao titular
  for r in
    select d.id, d.substituindo_id as titular, a.id as ausencia_id
      from demandas d
      join ausencias a on a.pessoa_id = d.substituindo_id and a.ativa
     where d.substituindo_id is not null
       and d.status in ('aberta','em_execucao','bloqueada','em_validacao')
       and (d.prazo < a.inicio or d.prazo > a.fim)
  loop
    update demandas set responsavel_id = r.titular, substituindo_id = null where id = r.id;
    update ausencia_demandas set devolvida = true
     where ausencia_id = r.ausencia_id and demanda_id = r.id;
    v_dev := v_dev + 1;
  end loop;

  perform set_config('app.bypass_guard','off', true);
  return jsonb_build_object('transferidas', v_tr, 'devolvidas', v_dev);
end $$;
grant execute on function fn_alinhar_responsaveis_ausencia to authenticated;

select fn_alinhar_responsaveis_ausencia() as alinhamento;

-- Sincronizações passam a alinhar sempre
create or replace function sincronizar_ausencias()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_dev int := 0; v_alin jsonb;
begin
  for r in select id from ausencias
            where tenant_id = current_tenant_id() and ativa and not aplicada
              and substituto_id is not null and inicio <= current_date and fim >= current_date
  loop
    perform fn_aplicar_ausencia(r.id);
  end loop;
  perform fn_reconciliar_ausencias();
  perform fn_reparar_substituicoes();
  v_alin := fn_alinhar_responsaveis_ausencia();
  for r in select id from ausencias
            where tenant_id = current_tenant_id() and ativa and fim < current_date
  loop
    perform fn_devolver_ausencia(r.id);
    update ausencias set ativa = false, encerrada_em = now() where id = r.id;
    v_dev := v_dev + 1;
  end loop;
  return jsonb_build_object('alinhamento', v_alin, 'encerradas', v_dev);
end $$;

create or replace function sincronizar_ausencias_global()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_dev int := 0; v_alin jsonb;
begin
  for r in select id from ausencias
            where ativa and not aplicada and substituto_id is not null
              and inicio <= current_date and fim >= current_date
  loop
    perform fn_aplicar_ausencia(r.id);
  end loop;
  perform fn_reconciliar_ausencias();
  perform fn_reparar_substituicoes();
  v_alin := fn_alinhar_responsaveis_ausencia();
  for r in select id from ausencias where ativa and fim < current_date
  loop
    perform fn_devolver_ausencia(r.id);
    update ausencias set ativa = false, encerrada_em = now() where id = r.id;
    v_dev := v_dev + 1;
  end loop;
  return jsonb_build_object('alinhamento', v_alin, 'encerradas', v_dev);
end $$;

insert into migrations_aplicadas (numero, descricao)
values ('0025', 'Competência no título + responsável pela janela de ausência')
on conflict (numero) do nothing;

-- Conferência
select d.titulo, d.prazo, d.recorrencia, d.status,
       r.nome as responsavel, t.nome as titular_original
  from demandas d
  left join pessoas r on r.id = d.responsavel_id
  left join pessoas t on t.id = d.substituindo_id
 where d.status in ('aberta','em_execucao','bloqueada','em_validacao')
 order by d.prazo;
