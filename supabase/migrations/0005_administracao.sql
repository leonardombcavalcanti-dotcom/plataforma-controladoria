-- ============================================================
-- Migration 0005 — Administração: escrita governada da estrutura
-- Sprint 07 · 06/07/2026
-- ============================================================

create or replace function fn_atual_e_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from pessoas
                  where auth_user_id = auth.uid() and perfil = 'admin') $$;
grant execute on function fn_atual_e_admin to authenticated;

-- ---------- POLÍTICAS DE ESCRITA (só existiam SELECTs) ----------
create policy upd_tenants on tenants for update
  using (id = current_tenant_id() and fn_atual_e_admin())
  with check (id = current_tenant_id());

create policy ins_areas on areas for insert
  with check (tenant_id = current_tenant_id() and fn_atual_e_admin());
create policy upd_areas on areas for update
  using (tenant_id = current_tenant_id() and fn_atual_e_admin())
  with check (tenant_id = current_tenant_id());

create policy ins_pessoas on pessoas for insert
  with check (tenant_id = current_tenant_id() and fn_atual_e_admin());
create policy upd_pessoas on pessoas for update
  using (tenant_id = current_tenant_id() and fn_atual_e_admin())
  with check (tenant_id = current_tenant_id());

-- ---------- SALVAGUARDAS: tenant nunca fica órfão de admin ----------
create or replace function fn_guard_pessoas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.id = current_pessoa_id() then
    if old.perfil = 'admin' and new.perfil <> 'admin' then
      raise exception 'Você não pode rebaixar o próprio perfil de admin — peça a outro administrador.';
    end if;
    if old.ativa and not new.ativa then
      raise exception 'Você não pode desativar a si mesmo.';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_pessoas before update on pessoas
  for each row execute function fn_guard_pessoas();

-- ---------- AUDITORIA DA ESTRUTURA ----------
create or replace function fn_auditar_pessoa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
    values (new.tenant_id, 'pessoa', new.id, 'criacao', current_pessoa_id(),
            jsonb_build_object('nome', new.nome, 'perfil', new.perfil));
  else
    insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
    values (new.tenant_id, 'pessoa', new.id, 'edicao', current_pessoa_id(),
            jsonb_build_object('nome', new.nome, 'campos_alterados', (
              select jsonb_agg(key) from jsonb_each(to_jsonb(new))
              where to_jsonb(new)->key is distinct from to_jsonb(old)->key)));
  end if;
  return new;
end $$;
create trigger trg_auditar_pessoas after insert or update on pessoas
  for each row execute function fn_auditar_pessoa();

create or replace function fn_auditar_area()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (new.tenant_id, 'area', new.id,
          case when tg_op = 'INSERT' then 'criacao' else 'edicao' end,
          current_pessoa_id(), jsonb_build_object('nome', new.nome));
  return new;
end $$;
create trigger trg_auditar_areas after insert or update on areas
  for each row execute function fn_auditar_area();
