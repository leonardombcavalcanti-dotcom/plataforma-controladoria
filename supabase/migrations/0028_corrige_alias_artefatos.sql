-- ============================================================
-- Migration 0028 — Corrige "record \"a\" has no field \"ordem\""
-- Sprint 23c · 27/08/2026
--
-- Na 0025 a variável de ausência foi declarada como `a` e, no mesmo bloco,
-- `a` também virou apelido da tabela processo_artefatos. O PL/pgSQL resolve
-- a.ordem para a VARIÁVEL, que não tem esse campo — e gerar_ocorrencia quebra.
-- Aqui a variável passa a se chamar v_aus e o apelido da tabela, art.
-- ============================================================

create or replace function gerar_ocorrencia(p_id uuid, p_competencia text)
returns ocorrencias language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; o ocorrencias%rowtype; r record;
        v_resp uuid; v_dem uuid; v_prazo date; v_criadas int := 0; v_puladas int := 0;
        v_titular uuid; v_marca uuid; v_aus ausencias%rowtype;
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
    v_aus := null;
    select * into v_aus from ausencias
     where pessoa_id = v_titular and ativa and substituto_id is not null
       and inicio <= v_prazo and fim >= v_prazo
     order by inicio limit 1;
    if v_aus.id is not null then
      v_resp := v_aus.substituto_id;
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
    select v_dem, art.ordem, art.titulo
      from processo_artefatos art
     where art.processo_id = p_id and art.tipo = 'checklist_item' and art.archived_at is null;

    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (v_dem, p.dono_id, 'dono_processo') on conflict do nothing;

    if v_aus.id is not null then
      insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
      values (v_aus.id, v_dem, v_titular) on conflict do nothing;
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

insert into migrations_aplicadas (numero, descricao)
values ('0028', 'Corrige colisão de alias em gerar_ocorrencia (a → v_aus / art)')
on conflict (numero) do nothing;
