-- ============================================================
-- Migration 0018 — Corrige propagação indevida da marca de substituição
-- Sprint 22d · 07/08/2026
--
-- BUG: ao concluir uma demanda em substituição, a próxima instância da
-- recorrência herdava `substituindo_id`, mantendo o selo para sempre.
-- A marca deve existir SOMENTE nas demandas efetivamente transferidas
-- por uma ausência ativa.
-- ============================================================

-- 1) A recorrência nasce SEM marca de substituição (é demanda nova, do titular atual)
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
    returning id into v_nova;   -- sem substituindo_id: nasce limpa
    perform set_config('app.bypass_guard','off', true);

    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_nova, ordem, texto from demanda_checklist
     where demanda_id = d.id and archived_at is null;

    perform fn_evento_demanda(d, 'recorrencia_gerada',
      jsonb_build_object('proxima', v_nova, 'prazo', v_prazo));
  end if;
end $$;

-- 2) Ao concluir/encerrar, a marca deixa de fazer sentido (trabalho entregue)
create or replace function fn_limpar_marca_substituicao()
returns trigger language plpgsql as $$
begin
  if new.status in ('concluida','encerrada') and new.substituindo_id is not null then
    new.substituindo_id := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_limpar_marca_subst on demandas;
create trigger trg_limpar_marca_subst before update on demandas
  for each row execute function fn_limpar_marca_substituicao();

-- 3) LIMPEZA do que já ficou marcado indevidamente:
--    mantém a marca apenas em demandas ATIVAS de uma ausência ATIVA e aplicada.
update demandas d
   set substituindo_id = null
 where d.substituindo_id is not null
   and not exists (
     select 1
       from ausencia_demandas ad
       join ausencias a on a.id = ad.ausencia_id
      where ad.demanda_id = d.id
        and not ad.devolvida
        and a.ativa and a.aplicada
        and d.status in ('aberta','em_execucao','bloqueada','em_validacao'));
