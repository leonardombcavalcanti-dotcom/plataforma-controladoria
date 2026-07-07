-- ============================================================
-- Migration 0011 — Demanda-modelo com PRAZO (data) + RECORRÊNCIA
-- Sprint 14b · 06/07/2026
-- Igual à criação de demandas: prazo base + ciclo (diária/semanal/mensal/anual).
-- ============================================================

alter table processo_recorrencia add column prazo date;
alter table processo_recorrencia add column recorrencia recorrencia_demanda;
-- dia_util_gatilho/prazo_dias permanecem como fallback de linhas antigas.

-- Avança uma data pelo ciclo até não estar no passado
create or replace function fn_avancar_recorrencia(p_data date, p_rec recorrencia_demanda)
returns date language plpgsql immutable as $$
declare d date := p_data; guarda int := 0;
begin
  if p_rec is null then return d; end if;
  while d < current_date and guarda < 1000 loop
    d := case p_rec
      when 'diaria'  then fn_add_dias_uteis(d, 1)
      when 'semanal' then d + 7
      when 'mensal'  then (d + interval '1 month')::date
      else                (d + interval '1 year')::date end;
    guarda := guarda + 1;
  end loop;
  return d;
end $$;
grant execute on function fn_avancar_recorrencia to authenticated;

-- Geração: prazo = data-modelo avançada ao ciclo atual; a demanda nasce
-- com a recorrência configurada e se perpetua sozinha ao concluir (0007/0010).
create or replace function gerar_ocorrencia(p_id uuid, p_competencia text)
returns ocorrencias language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; o ocorrencias%rowtype; r record; v_resp uuid; v_dem uuid; v_prazo date;
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

    -- Novo modelo: prazo-base avançado ao ciclo. Fallback: cálculo antigo (D+N útil).
    v_prazo := case
      when r.prazo is not null then greatest(fn_avancar_recorrencia(r.prazo, r.recorrencia), current_date)
      else fn_add_dias_uteis(current_date, coalesce(r.dia_util_gatilho, 1) + r.prazo_dias) end;

    insert into demandas (tenant_id, area_id, titulo, descricao, tipo, prioridade, valor,
                          complexidade, objetivo_negocio, tempo_estimado_h, peso, recorrencia,
                          processo_id, ocorrencia_id, recorrencia_id,
                          criador_id, responsavel_id, validador_id, exige_validacao, prazo)
    values (p.tenant_id, p.area_id,
            r.titulo_modelo || ' — ' || p_competencia,
            r.descricao, r.tipo, r.prioridade, r.valor,
            r.complexidade, coalesce(r.objetivo_negocio, p.nome), r.tempo_estimado_h, r.peso,
            r.recorrencia,
            p_id, o.id, r.id,
            coalesce(current_pessoa_id(), p.dono_id), v_resp, p.dono_id,
            r.exige_validacao, v_prazo)
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
