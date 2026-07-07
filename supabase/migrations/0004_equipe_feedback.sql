-- ============================================================
-- Migration 0004 — Módulo Equipe: feedback bilateral (Fluxo 9)
-- Sprint 05 · 06/07/2026
-- ============================================================

create type tipo_feedback as enum
  ('reconhecimento','desenvolvimento','correcao','orientacao','parabenizacao');

-- Imutáveis após envio: integridade do histórico (Fluxo 9)
create table feedbacks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  de_id uuid not null references pessoas(id),
  para_id uuid not null references pessoas(id),
  tipo tipo_feedback not null,
  texto text not null,
  demanda_id uuid references demandas(id),      -- vínculo opcional ao que o originou
  criado_em timestamptz not null default now(),
  check (de_id <> para_id)
);
revoke update, delete on feedbacks from anon, authenticated;

create table feedback_respostas (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references feedbacks(id) on delete cascade,
  autor_id uuid not null references pessoas(id),
  texto text not null,
  criado_em timestamptz not null default now()
);
revoke update, delete on feedback_respostas from anon, authenticated;

create index idx_feedbacks_para on feedbacks(para_id);
create index idx_feedbacks_de on feedbacks(de_id);

-- ---------- VISIBILIDADE: cadeia de gestão (Etapa 3 §2.4) ----------
-- p_gestor está na cadeia de gestão (direta ou indireta) de p_pessoa?
create or replace function fn_na_cadeia_de_gestao(p_gestor uuid, p_pessoa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive cadeia as (
    select gestor_id from pessoas where id = p_pessoa
    union all
    select p.gestor_id from pessoas p join cadeia c on p.id = c.gestor_id
    where p.gestor_id is not null
  )
  select exists (select 1 from cadeia where gestor_id = p_gestor)
$$;
grant execute on function fn_na_cadeia_de_gestao to authenticated;

-- ---------- RLS ----------
alter table feedbacks enable row level security;
alter table feedback_respostas enable row level security;

-- Visível a: autor · destinatário · cadeia de gestão do destinatário.
-- Nenhum outro perfil enxerga sequer a existência (privacidade da Correção).
create policy sel_feedbacks on feedbacks for select
  using (tenant_id = current_tenant_id()
         and (de_id = current_pessoa_id()
              or para_id = current_pessoa_id()
              or fn_na_cadeia_de_gestao(current_pessoa_id(), para_id)));

-- Envio: somente gestor/admin (feedback entre pares: F2), nunca para si mesmo.
create policy ins_feedbacks on feedbacks for insert
  with check (tenant_id = current_tenant_id()
              and de_id = current_pessoa_id()
              and fn_atual_e_gestor());

create policy sel_respostas on feedback_respostas for select
  using (exists (select 1 from feedbacks f
                 where f.id = feedback_id
                   and (f.de_id = current_pessoa_id()
                        or f.para_id = current_pessoa_id()
                        or fn_na_cadeia_de_gestao(current_pessoa_id(), f.para_id))));

-- Responder: destinatário sempre pode (bilateral); autor e cadeia também.
create policy ins_respostas on feedback_respostas for insert
  with check (autor_id = current_pessoa_id()
              and exists (select 1 from feedbacks f
                          where f.id = feedback_id
                            and (f.de_id = current_pessoa_id()
                                 or f.para_id = current_pessoa_id()
                                 or fn_na_cadeia_de_gestao(current_pessoa_id(), f.para_id))));

-- DECISÃO DE PRIVACIDADE: feedbacks NÃO geram linha em `eventos`
-- (eventos é legível pelo tenant; a tabela imutável já é a trilha de auditoria).
