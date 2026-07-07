-- ============================================================
-- Migration 0007 — Ajustes de uso real (Sprint 09) · 06/07/2026
-- 1) Recorrência na demanda  2) Solicitação de acesso  3) Exclusão de processo
-- ============================================================

-- ---------- 1. RECORRÊNCIA DA DEMANDA ----------
-- Ao concluir uma demanda recorrente, a próxima nasce automaticamente:
-- diária = próximo dia útil · semanal = +7 dias (mesmo dia da semana)
-- mensal = mesmo dia do mês seguinte · anual = mesmo dia do ano seguinte.
create type recorrencia_demanda as enum ('diaria','semanal','mensal','anual');
alter table demandas add column recorrencia recorrencia_demanda;

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

  -- Recorrência: concluiu → nasce a próxima (encerrar SEM executar quebra a série)
  if d.recorrencia is not null then
    v_prazo := case d.recorrencia
      when 'diaria'  then fn_add_dias_uteis(greatest(d.prazo, current_date), 1)
      when 'semanal' then greatest(d.prazo, current_date) + 7
      when 'mensal'  then (greatest(d.prazo, current_date) + interval '1 month')::date
      else                (greatest(d.prazo, current_date) + interval '1 year')::date end;

    insert into demandas (tenant_id, area_id, titulo, descricao, tipo, prioridade, valor,
                          complexidade, objetivo_negocio, processo_id, criador_id,
                          responsavel_id, validador_id, exige_validacao, status, prazo,
                          tempo_estimado_h, recorrencia)
    values (d.tenant_id, d.area_id, d.titulo, d.descricao, d.tipo, d.prioridade, d.valor,
            d.complexidade, d.objetivo_negocio, d.processo_id, d.criador_id,
            d.responsavel_id, d.validador_id, d.exige_validacao, 'aberta', v_prazo,
            d.tempo_estimado_h, d.recorrencia)
    returning id into v_nova;

    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_nova, ordem, texto from demanda_checklist
     where demanda_id = d.id and archived_at is null;

    perform fn_evento_demanda(d, 'recorrencia_gerada',
      jsonb_build_object('proxima', v_nova, 'prazo', v_prazo));
  end if;
end $$;

-- ---------- 2. SOLICITAÇÃO DE ACESSO ----------
create table acessos_pendentes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  auth_user_id uuid,
  status text not null default 'pendente' check (status in ('pendente','aprovado','rejeitado')),
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por uuid
);
alter table acessos_pendentes enable row level security;

-- Quem acabou de se cadastrar (ou anônimo) pode registrar a solicitação
create policy ins_acessos on acessos_pendentes for insert
  to anon, authenticated with check (true);
-- Somente admin lê e decide
create policy sel_acessos on acessos_pendentes for select using (fn_atual_e_admin());
create policy upd_acessos on acessos_pendentes for update
  using (fn_atual_e_admin()) with check (fn_atual_e_admin());

-- ---------- 3. EXCLUSÃO DE PROCESSO (admin, SEM histórico de execução) ----------
-- Rastreabilidade preservada: processo com ocorrências/demandas NUNCA é excluído
-- (o caminho é Obsoleto → Arquivado). Exclusão real só para o que nunca rodou.
create or replace function excluir_processo(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p processos%rowtype;
begin
  select * into p from processos where id = p_id and tenant_id = current_tenant_id();
  if p.id is null then raise exception 'Processo não encontrado.'; end if;
  if not fn_atual_e_admin() then
    raise exception 'Somente o administrador pode excluir processos.';
  end if;
  if exists (select 1 from ocorrencias where processo_id = p_id)
     or exists (select 1 from demandas where processo_id = p_id) then
    raise exception 'Este processo tem histórico de execução — exclusão não é permitida (rastreabilidade). Use Tornar obsoleto → Arquivar.';
  end if;

  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (p.tenant_id, 'processo', p_id, 'exclusao', current_pessoa_id(),
          jsonb_build_object('nome', p.nome, 'status', p.status));

  delete from processo_artefatos where processo_id = p_id;
  delete from processo_recorrencia where processo_id = p_id;
  delete from processo_relacoes where origem_id = p_id or destino_id = p_id;
  delete from processo_versoes where processo_id = p_id;
  update processos set macroprocesso_id = null where macroprocesso_id = p_id;
  delete from processos where id = p_id;
end $$;

grant execute on function excluir_processo to authenticated;
