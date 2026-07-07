-- ============================================================
-- Migration 0003 — Solicitações + Aprovação (Fluxo 4, 1 nível)
-- Sprint 03 · 06/07/2026
-- ============================================================

-- Novo estado final próprio (rejeição ≠ encerramento operacional)
alter type status_demanda add value if not exists 'rejeitada';

-- Solicitação é demanda (ADR-03): nasce sem responsável
alter table demandas alter column responsavel_id drop not null;
alter table demandas add column aprovador_id uuid references pessoas(id);
alter table demandas add column devolvida boolean not null default false;
alter table demandas add column comentario_devolucao text;
alter table demandas add column motivo_rejeicao text;

-- ---------- ENDURECIMENTO DE INSERT ----------
-- Demanda só nasce 'aberta' (com responsável) ou 'solicitada' (sem responsável).
create or replace function fn_demanda_pre_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_gestor uuid;
begin
  if new.status not in ('aberta','solicitada') then
    raise exception 'Demanda nasce Aberta ou Solicitada — nunca em %.', new.status;
  end if;
  if new.status = 'aberta' and new.responsavel_id is null then
    raise exception 'Demanda Aberta exige responsável.';
  end if;
  if new.status = 'solicitada' then
    new.responsavel_id := null;                      -- quem aprova define
    if new.aprovador_id is null then
      select gestor_id into v_gestor from pessoas where id = new.criador_id;
      new.aprovador_id := v_gestor;                  -- gestor direto; null → qualquer gestor decide
    end if;
  end if;
  return new;
end $$;
create trigger trg_demanda_pre_insert before insert on demandas
  for each row execute function fn_demanda_pre_insert();

-- Campos do fluxo de solicitação passam a ser governados
create or replace function fn_guard_demandas()
returns trigger language plpgsql as $$
begin
  if (new.status is distinct from old.status
      or new.motivo_conclusao is distinct from old.motivo_conclusao
      or new.motivo_encerramento is distinct from old.motivo_encerramento
      or new.retrabalho is distinct from old.retrabalho
      or new.iniciada_em is distinct from old.iniciada_em
      or new.concluida_em is distinct from old.concluida_em
      or new.archived_at is distinct from old.archived_at
      or new.devolvida is distinct from old.devolvida
      or new.comentario_devolucao is distinct from old.comentario_devolucao
      or new.motivo_rejeicao is distinct from old.motivo_rejeicao)
     and coalesce(current_setting('app.bypass_guard', true), 'off') <> 'on' then
    raise exception 'Status e desfechos da demanda mudam apenas pelas funções oficiais.';
  end if;
  new.atualizado_em := now();
  new.updated_by := coalesce(current_pessoa_id(), new.updated_by);
  return new;
end $$;

-- ---------- FUNÇÕES DO FLUXO 4 ----------
create or replace function fn_pode_decidir_solicitacao(p_demanda demandas)
returns boolean language sql stable security definer set search_path = public as
$$ select (p_demanda.aprovador_id = current_pessoa_id()) or fn_atual_e_gestor() $$;

create or replace function aprovar_solicitacao(p_id uuid, p_responsavel uuid, p_prazo date)
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

  perform set_config('app.bypass_guard','on', true);
  update demandas
     set status = 'aberta', responsavel_id = p_responsavel, prazo = p_prazo,
         devolvida = false, comentario_devolucao = null
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);

  -- Solicitante acompanha a execução (Fluxo 4 + ADR-08)
  if d.criador_id <> p_responsavel then
    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (p_id, d.criador_id, 'criador') on conflict do nothing;
  end if;

  perform fn_evento_demanda(d, 'solicitacao_aprovada',
    jsonb_build_object('responsavel', p_responsavel, 'prazo', p_prazo));
  select * into d from demandas where id = p_id; return d;
end $$;

create or replace function devolver_solicitacao(p_id uuid, p_comentario text)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.status <> 'solicitada' then raise exception 'Esta não é uma solicitação pendente.'; end if;
  if not fn_pode_decidir_solicitacao(d) then
    raise exception 'Somente o aprovador designado (ou um gestor) pode decidir.';
  end if;
  if coalesce(trim(p_comentario),'') = '' then
    raise exception 'Devolver exige comentário orientando o ajuste.';
  end if;
  perform set_config('app.bypass_guard','on', true);
  update demandas set devolvida = true, comentario_devolucao = p_comentario where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'solicitacao_devolvida', jsonb_build_object('comentario', p_comentario));
  select * into d from demandas where id = p_id; return d;
end $$;

create or replace function reenviar_solicitacao(p_id uuid)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.status <> 'solicitada' or not d.devolvida then
    raise exception 'Somente solicitações devolvidas podem ser reenviadas.';
  end if;
  if d.criador_id <> current_pessoa_id() then
    raise exception 'Somente o solicitante reenvia a própria solicitação.';
  end if;
  perform set_config('app.bypass_guard','on', true);
  update demandas set devolvida = false, comentario_devolucao = null where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'solicitacao_reenviada', '{}'::jsonb);
  select * into d from demandas where id = p_id; return d;
end $$;

create or replace function rejeitar_solicitacao(p_id uuid, p_motivo text)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.status <> 'solicitada' then raise exception 'Esta não é uma solicitação pendente.'; end if;
  if not fn_pode_decidir_solicitacao(d) then
    raise exception 'Somente o aprovador designado (ou um gestor) pode decidir.';
  end if;
  if coalesce(trim(p_motivo),'') = '' then
    raise exception 'Rejeitar exige motivo — ele fica registrado permanentemente.';
  end if;
  perform set_config('app.bypass_guard','on', true);
  update demandas set status = 'rejeitada', motivo_rejeicao = p_motivo where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'solicitacao_rejeitada', jsonb_build_object('motivo', p_motivo));
  select * into d from demandas where id = p_id; return d;
end $$;

grant execute on function aprovar_solicitacao, devolver_solicitacao,
  reenviar_solicitacao, rejeitar_solicitacao to authenticated;
