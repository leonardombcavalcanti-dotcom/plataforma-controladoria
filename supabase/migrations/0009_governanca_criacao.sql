-- ============================================================
-- Migration 0009 — Governança de criação (Sprint 12) · 06/07/2026
-- Colaborador SOLICITA; gestor (ou acima) valida. Regra no banco.
-- ============================================================

-- ---------- 1. DEMANDA: criação direta exige gestor ----------
create or replace function fn_demanda_pre_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_gestor uuid;
begin
  if new.status not in ('aberta','solicitada') then
    raise exception 'Demanda nasce Aberta ou Solicitada — nunca em %.', new.status;
  end if;
  -- Colaborador não cria demanda direta: solicita (o sistema/RPCs usam bypass)
  if new.status = 'aberta'
     and coalesce(current_setting('app.bypass_guard', true), 'off') <> 'on'
     and not fn_atual_e_gestor() then
    raise exception 'Seu perfil registra solicitações — envie para aprovação do gestor.';
  end if;
  if new.status = 'aberta' and new.responsavel_id is null then
    raise exception 'Demanda Aberta exige responsável.';
  end if;
  if new.status = 'solicitada' then
    new.responsavel_id := null;
    if new.aprovador_id is null then
      select gestor_id into v_gestor from pessoas where id = new.criador_id;
      new.aprovador_id := v_gestor;
    end if;
  end if;
  return new;
end $$;

-- Geração pela ocorrência e recorrência usam bypass (são fluxos oficiais)
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

    insert into demandas (tenant_id, area_id, titulo, tipo, processo_id, ocorrencia_id,
                          recorrencia_id, criador_id, responsavel_id, validador_id,
                          exige_validacao, prazo, objetivo_negocio)
    values (p.tenant_id, p.area_id,
            r.titulo_modelo || ' — ' || p_competencia,
            'rotina', p_id, o.id, r.id,
            coalesce(current_pessoa_id(), p.dono_id), v_resp, p.dono_id,
            r.exige_validacao,
            fn_add_dias_uteis(current_date, coalesce(r.dia_util_gatilho, 1) + r.prazo_dias),
            p.nome)
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
                          tempo_estimado_h, recorrencia)
    values (d.tenant_id, d.area_id, d.titulo, d.descricao, d.tipo, d.prioridade, d.valor,
            d.complexidade, d.objetivo_negocio, d.processo_id, d.criador_id,
            d.responsavel_id, d.validador_id, d.exige_validacao, 'aberta', v_prazo,
            d.tempo_estimado_h, d.recorrencia)
    returning id into v_nova;
    perform set_config('app.bypass_guard','off', true);

    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_nova, ordem, texto from demanda_checklist
     where demanda_id = d.id and archived_at is null;

    perform fn_evento_demanda(d, 'recorrencia_gerada',
      jsonb_build_object('proxima', v_nova, 'prazo', v_prazo));
  end if;
end $$;

-- Aprovação de solicitação também é caminho oficial (bypass no update já existe;
-- o pre-insert não roda em update — nada a mudar).

-- ---------- 2. PROCESSO: decisões de gestor ----------
-- Colaborador pode criar, preencher tudo e ENVIAR PARA VALIDAÇÃO.
-- Ativar, devolver, tornar obsoleto e arquivar: somente gestor (ou acima).
create or replace function transicionar_processo(p_id uuid, p_novo status_processo, p_justificativa text default null)
returns processos language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; v_valida boolean; v_exige_just boolean; v_faltas text;
begin
  select * into p from processos where id = p_id and tenant_id = current_tenant_id();
  if p.id is null then raise exception 'Processo não encontrado.'; end if;

  v_valida := case
    when p.status = 'rascunho'      and p_novo = 'em_construcao' then true
    when p.status = 'em_construcao' and p_novo = 'em_validacao'  then true
    when p.status = 'em_validacao'  and p_novo in ('ativo','em_construcao') then true
    when p.status = 'ativo'         and p_novo in ('em_revisao','obsoleto','em_construcao') then true
    when p.status = 'em_revisao'    and p_novo in ('ativo','obsoleto') then true
    when p.status = 'obsoleto'      and p_novo in ('arquivado','em_validacao') then true
    else false end;
  if not v_valida then
    raise exception 'Transição inválida: % → %.', p.status, p_novo;
  end if;

  -- Governança (Sprint 12): decisões de validação/encerramento são de gestor
  if (p_novo in ('ativo','obsoleto','arquivado')
      or (p.status = 'em_validacao' and p_novo = 'em_construcao'))
     and not fn_atual_e_gestor() then
    raise exception 'Ativação, devolução e encerramento de processos são decisões de gestor — envie para validação e aguarde.';
  end if;

  v_exige_just := p_novo in ('obsoleto','arquivado')
    or (p.status = 'em_validacao' and p_novo = 'em_construcao')
    or (p.status = 'ativo' and p_novo = 'em_construcao');
  if v_exige_just and coalesce(trim(p_justificativa),'') = '' then
    raise exception 'Esta transição exige justificativa.';
  end if;

  if p_novo = 'em_validacao' then
    v_faltas := fn_checar_rn01(p_id);
    if v_faltas is not null then
      raise exception 'Requisitos de ativação incompletos (RN-01): %', v_faltas;
    end if;
  end if;

  perform set_config('app.bypass_guard','on', true);
  update processos
     set status = p_novo,
         archived_at = case when p_novo = 'arquivado' then now() else archived_at end,
         ultima_revisao = case when p.status = 'em_revisao' and p_novo = 'ativo'
                               then current_date else ultima_revisao end
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);

  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (p.tenant_id, 'processo', p_id, 'transicao', current_pessoa_id(),
          jsonb_build_object('de', p.status, 'para', p_novo, 'justificativa', p_justificativa));

  select * into p from processos where id = p_id;
  return p;
end $$;
