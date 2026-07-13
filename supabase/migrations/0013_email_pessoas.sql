-- ============================================================
-- Migration 0013 — E-mail da pessoa (V2 · relatórios) · Sprint 17
-- ============================================================

alter table pessoas add column email text;

-- Preenche automaticamente a partir dos logins já vinculados
update pessoas p
   set email = u.email
  from auth.users u
 where p.auth_user_id = u.id
   and p.email is null;
