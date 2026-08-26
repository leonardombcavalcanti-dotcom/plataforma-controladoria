-- ============================================================
-- Migration 0019 — Recorrência respeita o período de ausência
-- Sprint 22e · 07/08/2026
--
-- Problema: numa série recorrente transferida por férias, a instância
-- seguinte nascia com o substituto como responsável, SEM marca e SEM
-- vínculo com a ausência — logo, nunca voltava ao titular.
--
-- Regra correta: a próxima instância pertence ao TITULAR;
-- se o prazo dela cai dentro da ausência, ela nasce com o substituto,
-- marcada e vinculada (para devolução automática no retorno).
-- ============================================================

create or replace function fn_concluir_interna(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype; v_motivo motivo_conclusao; v_prazo date; v_nova uuid;
        v_titular uuid; v_resp uuid; v_marca uuid; a ausencias%rowtype;
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

    -- O dono real da série é o titular (se esta instância estava em substituição)
    v_titular := coalesce(d.substituindo_id, d.responsavel_id);
    v_resp := v_titular;
    v_marca := null;

    -- Se a próxima cair dentro de uma ausência ativa do titular, já nasce com o substituto
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
    values (d.tenant_id, d.area_id, d.titulo, d.descricao, d.tipo, d.prioridade, d.valor,
            d.complexidade, d.objetivo_negocio, d.processo_id, d.recorrencia_id,
            d.criador_id, v_resp, d.validador_id, d.exige_validacao, 'aberta', v_prazo,
            d.tempo_estimado_h, d.peso, d.recorrencia, d.anexo_obrigatorio, v_marca)
    returning id into v_nova;
    perform set_config('app.bypass_guard','off', true);

    -- Vincula à ausência para voltar sozinha ao titular no retorno
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
      jsonb_build_object('proxima', v_nova, 'prazo', v_prazo,
                         'substituicao', a.id is not null));
  end if;
end $$;

-- ---------- RECONCILIAÇÃO: conserta o que já existe ----------
-- Para cada ausência ativa e aplicada, marca e vincula as demandas ativas
-- que estão com o substituto e pertencem às séries transferidas.
create or replace function fn_reconciliar_ausencias()
returns int language plpgsql security definer set search_path = public as $$
declare a record; d record; v_qtd int := 0;
begin
  for a in select * from ausencias where ativa and aplicada and substituto_id is not null
  loop
    for d in
      select dm.* from demandas dm
       where dm.tenant_id = a.tenant_id
         and dm.responsavel_id = a.substituto_id
         and dm.status in ('aberta','em_execucao','bloqueada','em_validacao')
         and dm.archived_at is null
         and coalesce(dm.substituindo_id, '00000000-0000-0000-0000-000000000000') <> a.pessoa_id
         and (
           -- mesma série de uma demanda já transferida
           (dm.recorrencia_id is not null and dm.recorrencia_id in (
              select d2.recorrencia_id from ausencia_demandas ad2
                join demandas d2 on d2.id = ad2.demanda_id
               where ad2.ausencia_id = a.id and d2.recorrencia_id is not null))
           -- ou mesmo título-base de uma demanda já transferida (avulsas)
           or exists (
              select 1 from ausencia_demandas ad3
                join demandas d3 on d3.id = ad3.demanda_id
               where ad3.ausencia_id = a.id
                 and regexp_replace(d3.titulo, ' — \d{4}-\d{2}$', '') =
                     regexp_replace(dm.titulo, ' — \d{4}-\d{2}$', ''))
         )
    loop
      perform set_config('app.bypass_guard','on', true);
      update demandas set substituindo_id = a.pessoa_id where id = d.id;
      perform set_config('app.bypass_guard','off', true);

      insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
      values (a.id, d.id, a.pessoa_id) on conflict do nothing;
      insert into demanda_observadores (demanda_id, pessoa_id, origem)
      values (d.id, a.pessoa_id, 'ausencia') on conflict do nothing;
      v_qtd := v_qtd + 1;
    end loop;
  end loop;
  return v_qtd;
end $$;
grant execute on function fn_reconciliar_ausencias to authenticated;

-- Sincronizações passam a reconciliar também
create or replace function sincronizar_ausencias()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_ap int := 0; v_dev int := 0; v_rec int;
begin
  for r in select id from ausencias
            where tenant_id = current_tenant_id() and ativa and not aplicada
              and substituto_id is not null
              and inicio <= current_date and fim >= current_date
  loop
    perform fn_aplicar_ausencia(r.id);
    v_ap := v_ap + 1;
  end loop;

  v_rec := fn_reconciliar_ausencias();

  for r in select id from ausencias
            where tenant_id = current_tenant_id() and ativa and fim < current_date
  loop
    perform fn_devolver_ausencia(r.id);
    update ausencias set ativa = false, encerrada_em = now() where id = r.id;
    v_dev := v_dev + 1;
  end loop;

  return jsonb_build_object('aplicadas', v_ap, 'reconciliadas', v_rec, 'encerradas', v_dev);
end $$;

create or replace function sincronizar_ausencias_global()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_ap int := 0; v_dev int := 0; v_rec int;
begin
  for r in select id from ausencias
            where ativa and not aplicada and substituto_id is not null
              and inicio <= current_date and fim >= current_date
  loop
    perform fn_aplicar_ausencia(r.id);
    v_ap := v_ap + 1;
  end loop;

  v_rec := fn_reconciliar_ausencias();

  for r in select id from ausencias where ativa and fim < current_date
  loop
    perform fn_devolver_ausencia(r.id);
    update ausencias set ativa = false, encerrada_em = now() where id = r.id;
    v_dev := v_dev + 1;
  end loop;

  return jsonb_build_object('aplicadas', v_ap, 'reconciliadas', v_rec, 'encerradas', v_dev);
end $$;

-- Conserta agora o estado atual
select fn_reconciliar_ausencias();
