-- ============================================================
-- Migration 0027 — Validação da entrega pelo gestor
-- Sprint 23b · 27/08/2026
--
-- Toda entrega concluída volta a ser pendência do gestor, mas o que ele faz
-- mudou: ele VALIDA (um clique) e, se necessário, deixa um COMENTÁRIO.
-- O comentário vira pendência do liderado até ele dar ciência — laço fechado
-- sem inventar um subsistema de notificações.
--
-- avaliada_em / avaliada_por passam a significar "validada em / por".
-- ============================================================

alter table demandas add column if not exists comentario_lido_em timestamptz;

-- Entregas já concluídas antes desta mudança nascem validadas: não faz sentido
-- despejar meses de pendência retroativa no gestor.
do $$
declare v_qtd int;
begin
  perform set_config('app.bypass_guard','on', true);
  update demandas
     set avaliada_em = coalesce(avaliada_em, concluida_em, now())
   where status = 'concluida' and avaliada_em is null;
  get diagnostics v_qtd = row_count;
  perform set_config('app.bypass_guard','off', true);
  raise notice 'Entregas antigas marcadas como validadas: %', v_qtd;
end $$;

-- 1) Gestor valida (com ou sem comentário)
create or replace function validar_entrega(p_id uuid, p_comentario text default null)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype; v_com text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  d := fn_obter_demanda(p_id);
  if d.status <> 'concluida' then
    raise exception 'Somente demandas Concluídas são validadas.';
  end if;
  if not fn_atual_e_gestor() then
    raise exception 'Somente gestores validam entregas.';
  end if;
  if d.responsavel_id = current_pessoa_id() and not fn_atual_e_admin() then
    raise exception 'Você não valida a própria entrega — o seu gestor valida.';
  end if;

  perform set_config('app.bypass_guard','on', true);
  update demandas
     set avaliada_por = current_pessoa_id(),
         avaliada_em  = now(),
         avaliacao_comentario = coalesce(v_com, avaliacao_comentario),
         comentario_lido_em = case when v_com is not null then null else comentario_lido_em end
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);

  perform fn_evento_demanda(d,
    case when v_com is null then 'entrega_validada' else 'comentario_entrega' end,
    jsonb_build_object('comentario', v_com));

  select * into d from demandas where id = p_id; return d;
end $$;
grant execute on function validar_entrega to authenticated;

-- 2) Liderado dá ciência do comentário
create or replace function marcar_comentario_lido(p_id uuid)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.responsavel_id <> current_pessoa_id() then
    raise exception 'Só o responsável pela entrega dá ciência do comentário.';
  end if;
  perform set_config('app.bypass_guard','on', true);
  update demandas set comentario_lido_em = now() where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'comentario_lido', '{}'::jsonb);
  select * into d from demandas where id = p_id; return d;
end $$;
grant execute on function marcar_comentario_lido to authenticated;

-- 3) comentar_entrega (0026) passa a delegar para validar_entrega
create or replace function comentar_entrega(p_id uuid, p_comentario text)
returns demandas language plpgsql security definer set search_path = public as $$
begin
  return validar_entrega(p_id, p_comentario);
end $$;

insert into migrations_aplicadas (numero, descricao)
values ('0027', 'Validação da entrega pelo gestor + ciência do comentário')
on conflict (numero) do nothing;

-- Conferência: o que ainda aguarda validação
select count(*) as aguardando_validacao
  from demandas where status = 'concluida' and avaliada_em is null;
