-- ============================================================
-- Migration 0015 — Férias / ausência com substituição temporária
-- Sprint 22 · Regime de Substituição (ADR-19) na prática
-- ============================================================

create type tipo_ausencia as enum ('ferias','licenca','afastamento','viagem','outro');

create table ausencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  pessoa_id uuid not null references pessoas(id),
  substituto_id uuid references pessoas(id),
  tipo tipo_ausencia not null default 'ferias',
  inicio date not null,
  fim date not null,
  observacao text,
  ativa boolean not null default true,          -- false = já devolvida
  criado_por uuid references pessoas(id),
  criado_em timestamptz not null default now(),
  encerrada_em timestamptz,
  check (fim >= inicio),
  check (substituto_id is null or substituto_id <> pessoa_id)
);
create index idx_ausencias_pessoa on ausencias(pessoa_id);

-- Guarda de qual demanda foi transferida por qual ausência (para devolver depois)
create table ausencia_demandas (
  ausencia_id uuid not null references ausencias(id) on delete cascade,
  demanda_id uuid not null references demandas(id) on delete cascade,
  responsavel_original uuid not null references pessoas(id),
  devolvida boolean not null default false,
  primary key (ausencia_id, demanda_id)
);

alter table ausencias enable row level security;
alter table ausencia_demandas enable row level security;

create policy sel_ausencias on ausencias for select
  using (tenant_id = current_tenant_id());
create policy ins_ausencias on ausencias for insert
  with check (tenant_id = current_tenant_id() and fn_atual_e_gestor());
create policy upd_ausencias on ausencias for update
  using (tenant_id = current_tenant_id() and fn_atual_e_gestor())
  with check (tenant_id = current_tenant_id());

create policy sel_aus_dem on ausencia_demandas for select
  using (exists (select 1 from ausencias a where a.id = ausencia_id and a.tenant_id = current_tenant_id()));

-- ---------- RPC: registrar ausência e transferir as demandas ativas ----------
create or replace function registrar_ausencia(
  p_pessoa uuid, p_substituto uuid, p_tipo tipo_ausencia,
  p_inicio date, p_fim date, p_observacao text default null)
returns ausencias language plpgsql security definer set search_path = public as $$
declare a ausencias%rowtype; d record; v_qtd int := 0;
begin
  if not fn_atual_e_gestor() then
    raise exception 'Somente gestor/admin registra ausências.';
  end if;
  if p_fim < p_inicio then raise exception 'A data final deve ser posterior ao início.'; end if;
  if p_substituto = p_pessoa then raise exception 'O substituto deve ser outra pessoa.'; end if;

  insert into ausencias (tenant_id, pessoa_id, substituto_id, tipo, inicio, fim, observacao, criado_por)
  values (current_tenant_id(), p_pessoa, p_substituto, p_tipo, p_inicio, p_fim, p_observacao, current_pessoa_id())
  returning * into a;

  -- Transfere as demandas ativas (respeitando a autoria: registra quem era o titular)
  if p_substituto is not null then
    perform set_config('app.bypass_guard','on', true);
    for d in select * from demandas
              where tenant_id = current_tenant_id()
                and responsavel_id = p_pessoa
                and status in ('aberta','em_execucao','bloqueada','em_validacao')
                and archived_at is null
    loop
      insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
      values (a.id, d.id, p_pessoa);

      update demandas set responsavel_id = p_substituto where id = d.id;

      -- titular acompanha como observador enquanto estiver fora
      insert into demanda_observadores (demanda_id, pessoa_id, origem)
      values (d.id, p_pessoa, 'ausencia') on conflict do nothing;

      insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
      values (d.tenant_id, 'demanda', d.id, 'substituicao_inicio', current_pessoa_id(),
              jsonb_build_object('de', p_pessoa, 'para', p_substituto,
                                 'motivo', p_tipo::text, 'ate', p_fim));
      v_qtd := v_qtd + 1;
    end loop;
    perform set_config('app.bypass_guard','off', true);
  end if;

  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (current_tenant_id(), 'pessoa', p_pessoa, 'ausencia_registrada', current_pessoa_id(),
          jsonb_build_object('tipo', p_tipo::text, 'inicio', p_inicio, 'fim', p_fim,
                             'substituto', p_substituto, 'demandas_transferidas', v_qtd));
  return a;
end $$;

-- ---------- RPC: encerrar ausência e devolver as demandas ----------
create or replace function encerrar_ausencia(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a ausencias%rowtype; r record; v_qtd int := 0;
begin
  if not fn_atual_e_gestor() then
    raise exception 'Somente gestor/admin encerra ausências.';
  end if;
  select * into a from ausencias where id = p_id and tenant_id = current_tenant_id();
  if a.id is null then raise exception 'Ausência não encontrada.'; end if;
  if not a.ativa then raise exception 'Esta ausência já foi encerrada.'; end if;

  perform set_config('app.bypass_guard','on', true);
  for r in select ad.*, d.status from ausencia_demandas ad
            join demandas d on d.id = ad.demanda_id
           where ad.ausencia_id = p_id and not ad.devolvida
  loop
    -- devolve só o que ainda está ativo (concluídas pelo substituto ficam com ele)
    if r.status in ('aberta','em_execucao','bloqueada','em_validacao') then
      update demandas set responsavel_id = r.responsavel_original where id = r.demanda_id;
      insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
      values (a.tenant_id, 'demanda', r.demanda_id, 'substituicao_fim', current_pessoa_id(),
              jsonb_build_object('devolvida_para', r.responsavel_original));
      v_qtd := v_qtd + 1;
    end if;
    update ausencia_demandas set devolvida = true
     where ausencia_id = p_id and demanda_id = r.demanda_id;
  end loop;
  perform set_config('app.bypass_guard','off', true);

  update ausencias set ativa = false, encerrada_em = now() where id = p_id;

  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (a.tenant_id, 'pessoa', a.pessoa_id, 'ausencia_encerrada', current_pessoa_id(),
          jsonb_build_object('demandas_devolvidas', v_qtd));
end $$;

grant execute on function registrar_ausencia, encerrar_ausencia to authenticated;
