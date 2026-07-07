-- ============================================================
-- Migration 0008 — Avaliação de demandas + exclusão de pessoa
-- Sprint 11 · 06/07/2026
-- ============================================================

-- ---------- 1. AVALIAÇÃO DA DEMANDA CONCLUÍDA ----------
-- Nova etapa do fluxo: o gestor avalia a entrega (1–5 + comentário).
-- Concluída SEM avaliação = pendência do gestor (Inbox/Central).
alter table demandas add column avaliacao_nota int check (avaliacao_nota between 1 and 5);
alter table demandas add column avaliacao_comentario text;
alter table demandas add column avaliada_por uuid references pessoas(id);
alter table demandas add column avaliada_em timestamptz;

-- Campos de avaliação passam a ser governados (só via RPC)
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
      or new.motivo_rejeicao is distinct from old.motivo_rejeicao
      or new.avaliacao_nota is distinct from old.avaliacao_nota
      or new.avaliacao_comentario is distinct from old.avaliacao_comentario
      or new.avaliada_por is distinct from old.avaliada_por
      or new.avaliada_em is distinct from old.avaliada_em)
     and coalesce(current_setting('app.bypass_guard', true), 'off') <> 'on' then
    raise exception 'Status, desfechos e avaliação da demanda mudam apenas pelas funções oficiais.';
  end if;
  new.atualizado_em := now();
  new.updated_by := coalesce(current_pessoa_id(), new.updated_by);
  return new;
end $$;

create or replace function avaliar_demanda(p_id uuid, p_nota int, p_comentario text default null)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.status <> 'concluida' then
    raise exception 'Somente demandas Concluídas recebem avaliação.';
  end if;
  if d.avaliacao_nota is not null then
    raise exception 'Esta demanda já foi avaliada — a avaliação é imutável.';
  end if;
  if not fn_atual_e_gestor() then
    raise exception 'Somente gestores avaliam entregas.';
  end if;
  if d.responsavel_id = current_pessoa_id() and not fn_atual_e_admin() then
    raise exception 'Você não pode avaliar a própria entrega — o seu gestor avalia.';
  end if;
  if p_nota is null or p_nota not between 1 and 5 then
    raise exception 'Nota de 1 a 5.';
  end if;

  perform set_config('app.bypass_guard','on', true);
  update demandas
     set avaliacao_nota = p_nota, avaliacao_comentario = p_comentario,
         avaliada_por = current_pessoa_id(), avaliada_em = now()
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);

  perform fn_evento_demanda(d, 'avaliacao',
    jsonb_build_object('nota', p_nota, 'comentario', p_comentario));
  select * into d from demandas where id = p_id; return d;
end $$;
grant execute on function avaliar_demanda to authenticated;

-- ---------- 2. EXCLUSÃO DE PESSOA (admin, SEM histórico) ----------
-- Rastreabilidade: pessoa citada em qualquer registro NÃO pode ser excluída — desative.
create or replace function excluir_pessoa(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p pessoas%rowtype;
begin
  select * into p from pessoas where id = p_id and tenant_id = current_tenant_id();
  if p.id is null then raise exception 'Pessoa não encontrada.'; end if;
  if not fn_atual_e_admin() then
    raise exception 'Somente o administrador pode excluir pessoas.';
  end if;
  if p.id = current_pessoa_id() then
    raise exception 'Você não pode excluir a si mesmo.';
  end if;
  if exists (select 1 from pessoas where gestor_id = p_id) then
    raise exception 'Esta pessoa é gestora de outras — reatribua a equipe antes.';
  end if;

  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (p.tenant_id, 'pessoa', p_id, 'exclusao', current_pessoa_id(),
          jsonb_build_object('nome', p.nome));

  begin
    delete from demanda_observadores where pessoa_id = p_id;
    delete from demanda_favoritos where pessoa_id = p_id;
    delete from pessoas where id = p_id;
  exception when foreign_key_violation then
    raise exception 'Esta pessoa tem histórico na plataforma (demandas, processos, feedbacks ou apontamentos) — desative-a em vez de excluir (rastreabilidade).';
  end;
end $$;
grant execute on function excluir_pessoa to authenticated;

-- Nota: o login (auth.users) correspondente deve ser removido pelo admin
-- no Dashboard do Supabase (Authentication → Users), se desejado.
