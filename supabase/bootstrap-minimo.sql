-- ============================================================
-- Bootstrap mínimo (SEM dados de exemplo) — obrigatório para o app funcionar
-- Cria: 1 tenant + 1 área + 1 pessoa (você) + vínculo com seu login.
-- Execute no SQL Editor DEPOIS de criar seu usuário em Authentication → Users.
-- ============================================================

insert into tenants (id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'ASA Locadora');

insert into areas (id, tenant_id, nome) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Controladoria');

insert into pessoas (id, tenant_id, nome, cargo, perfil, area_id, auth_user_id) values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111',
   'Leonardo Cavalcanti', 'Controller', 'admin', '22222222-2222-2222-2222-222222222201',
   (select id from auth.users where email = 'leonardo.cavalcanti@asalocadora.com.br'));

-- Confira o vínculo (deve retornar 1 linha com auth_user_id preenchido):
select nome, perfil, auth_user_id is not null as vinculado from pessoas;
