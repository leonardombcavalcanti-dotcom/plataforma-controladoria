-- ============================================================
-- Migration 0026 — Fim da nota manual do gestor
-- Sprint 23 · 27/08/2026
--
-- A nota da entrega passa a ser CALCULADA (peso × SLA × atraso × retrabalho).
-- O gestor deixa de dar estrelas e passa apenas a COMENTAR a entrega,
-- quando julgar necessário. O comentário é opcional e pode ser repetido —
-- cada registro fica na trilha de auditoria (eventos).
-- ============================================================

-- 1) Novo verbo: comentar a entrega (sem nota)
create or replace function comentar_entrega(p_id uuid, p_comentario text)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.status <> 'concluida' then
    raise exception 'Somente demandas Concluídas recebem comentário de entrega.';
  end if;
  if not fn_atual_e_gestor() then
    raise exception 'Somente gestores comentam entregas.';
  end if;
  if d.responsavel_id = current_pessoa_id() and not fn_atual_e_admin() then
    raise exception 'Você não comenta a própria entrega — o seu gestor comenta.';
  end if;
  if p_comentario is null or length(btrim(p_comentario)) = 0 then
    raise exception 'O comentário não pode ficar vazio.';
  end if;

  perform set_config('app.bypass_guard','on', true);
  update demandas
     set avaliacao_comentario = btrim(p_comentario),
         avaliada_por = current_pessoa_id(),
         avaliada_em = now()
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);

  perform fn_evento_demanda(d, 'comentario_entrega',
    jsonb_build_object('comentario', btrim(p_comentario)));

  select * into d from demandas where id = p_id; return d;
end $$;
grant execute on function comentar_entrega to authenticated;

-- 2) A nota manual deixa de ser aceita — a trilha antiga permanece intacta
create or replace function avaliar_demanda(p_id uuid, p_nota int, p_comentario text default null)
returns demandas language plpgsql security definer set search_path = public as $$
begin
  raise exception 'A nota manual foi descontinuada. A nota da entrega é calculada '
                  'a partir de peso, SLA, atraso e retrabalho. Use comentar_entrega().';
end $$;

insert into migrations_aplicadas (numero, descricao)
values ('0026', 'Gestor comenta a entrega; nota manual descontinuada')
on conflict (numero) do nothing;

-- Conferência: entregas já comentadas
select d.titulo, p.nome as comentou, d.avaliada_em, d.avaliacao_comentario
  from demandas d left join pessoas p on p.id = d.avaliada_por
 where d.avaliacao_comentario is not null
 order by d.avaliada_em desc limit 20;
