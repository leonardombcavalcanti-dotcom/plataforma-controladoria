-- ============================================================
-- Migration 0016 — Ausência ativa por PERÍODO (Sprint 22b)
-- Registrar agenda; a transferência só acontece no início das férias
-- e a devolução no retorno. Nada muda fora da janela.
-- ============================================================

alter table ausencias add column if not exists aplicada boolean not null default false;

-- Registrar: agenda a ausência; transfere AGORA apenas se já estiver em curso.
create or replace function registrar_ausencia(
  p_pessoa uuid, p_substituto uuid, p_tipo tipo_ausencia,
  p_inicio date, p_fim date, p_observacao text default null)
returns ausencias language plpgsql security definer set search_path = public as $$
declare a ausencias%rowtype;
begin
  if not fn_atual_e_gestor() then
    raise exception 'Somente gestor/admin registra ausências.';
  end if;
  if p_fim < p_inicio then raise exception 'A data de retorno deve ser posterior ao início.'; end if;
  if p_substituto = p_pessoa then raise exception 'O substituto deve ser outra pessoa.'; end if;

  insert into ausencias (tenant_id, pessoa_id, substituto_id, tipo, inicio, fim, observacao, criado_por)
  values (current_tenant_id(), p_pessoa, p_substituto, p_tipo, p_inicio, p_fim, p_observacao, current_pessoa_id())
  returning * into a;

  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (current_tenant_id(), 'pessoa', p_pessoa, 'ausencia_registrada', current_pessoa_id(),
          jsonb_build_object('tipo', p_tipo::text, 'inicio', p_inicio, 'fim', p_fim,
                             'substituto', p_substituto));

  -- Só transfere se as férias já começaram (senão, fica agendada)
  if p_inicio <= current_date and p_fim >= current_date then
    perform fn_aplicar_ausencia(a.id);
    select * into a from ausencias where id = a.id;
  end if;
  return a;
end $$;

-- Aplica a substituição (chamada no início do período)
create or replace function fn_aplicar_ausencia(p_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare a ausencias%rowtype; d record; v_qtd int := 0;
begin
  select * into a from ausencias where id = p_id;
  if a.id is null or a.aplicada or not a.ativa or a.substituto_id is null then return 0; end if;

  perform set_config('app.bypass_guard','on', true);
  for d in select * from demandas
            where tenant_id = a.tenant_id
              and responsavel_id = a.pessoa_id
              and status in ('aberta','em_execucao','bloqueada','em_validacao')
              and archived_at is null
  loop
    insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
    values (a.id, d.id, a.pessoa_id) on conflict do nothing;

    update demandas set responsavel_id = a.substituto_id where id = d.id;

    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (d.id, a.pessoa_id, 'ausencia') on conflict do nothing;

    insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
    values (d.tenant_id, 'demanda', d.id, 'substituicao_inicio', current_pessoa_id(),
            jsonb_build_object('de', a.pessoa_id, 'para', a.substituto_id,
                               'motivo', a.tipo::text, 'ate', a.fim));
    v_qtd := v_qtd + 1;
  end loop;
  perform set_config('app.bypass_guard','off', true);

  update ausencias set aplicada = true where id = p_id;
  return v_qtd;
end $$;

-- Devolve as demandas (retorno das férias ou encerramento manual)
create or replace function fn_devolver_ausencia(p_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare a ausencias%rowtype; r record; v_qtd int := 0;
begin
  select * into a from ausencias where id = p_id;
  if a.id is null then return 0; end if;

  perform set_config('app.bypass_guard','on', true);
  for r in select ad.*, d.status from ausencia_demandas ad
            join demandas d on d.id = ad.demanda_id
           where ad.ausencia_id = p_id and not ad.devolvida
  loop
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
  return v_qtd;
end $$;

create or replace function encerrar_ausencia(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a ausencias%rowtype; v_qtd int;
begin
  if not fn_atual_e_gestor() then
    raise exception 'Somente gestor/admin encerra ausências.';
  end if;
  select * into a from ausencias where id = p_id and tenant_id = current_tenant_id();
  if a.id is null then raise exception 'Ausência não encontrada.'; end if;
  if not a.ativa then raise exception 'Esta ausência já foi encerrada.'; end if;

  v_qtd := fn_devolver_ausencia(p_id);
  update ausencias set ativa = false, encerrada_em = now() where id = p_id;

  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (a.tenant_id, 'pessoa', a.pessoa_id, 'ausencia_encerrada', current_pessoa_id(),
          jsonb_build_object('demandas_devolvidas', v_qtd));
end $$;

-- ---------- SINCRONIZAÇÃO POR DATA ----------
-- Aplica as que começaram e devolve as que terminaram. Idempotente:
-- pode ser chamada quantas vezes quiser (o app chama ao carregar).
create or replace function sincronizar_ausencias()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_aplicadas int := 0; v_devolvidas int := 0;
begin
  for r in select id from ausencias
            where tenant_id = current_tenant_id() and ativa and not aplicada
              and substituto_id is not null
              and inicio <= current_date and fim >= current_date
  loop
    if fn_aplicar_ausencia(r.id) >= 0 then v_aplicadas := v_aplicadas + 1; end if;
  end loop;

  for r in select id from ausencias
            where tenant_id = current_tenant_id() and ativa and fim < current_date
  loop
    perform fn_devolver_ausencia(r.id);
    update ausencias set ativa = false, encerrada_em = now() where id = r.id;
    v_devolvidas := v_devolvidas + 1;
  end loop;

  return jsonb_build_object('aplicadas', v_aplicadas, 'encerradas', v_devolvidas);
end $$;

grant execute on function registrar_ausencia, encerrar_ausencia, sincronizar_ausencias,
  fn_aplicar_ausencia, fn_devolver_ausencia to authenticated;
