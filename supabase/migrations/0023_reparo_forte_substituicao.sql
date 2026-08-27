-- ============================================================
-- Migration 0023 — Reparo forte da substituição (via trilha de eventos)
-- Recupera as demandas que "vazaram" para o substituto pela recorrência,
-- seguindo a cadeia: substituicao_inicio → recorrencia_gerada → ...
-- Idempotente. Ao final, mostra o diagnóstico.
-- ============================================================

create or replace function fn_reparar_substituicoes()
returns int language plpgsql security definer set search_path = public as $$
declare a record; v_qtd int := 0; r record;
begin
  for a in select * from ausencias where ativa and substituto_id is not null
  loop
    -- Cadeia de descendentes: começa nas demandas transferidas no início da ausência
    for r in
      with recursive origem as (
        -- demandas registradas no vínculo da ausência
        select ad.demanda_id as id from ausencia_demandas ad where ad.ausencia_id = a.id
        union
        -- ou marcadas pelo evento de substituição desta pessoa
        select e.objeto_id from eventos e
         where e.objeto_tipo = 'demanda' and e.tipo = 'substituicao_inicio'
           and (e.dados->>'de')::uuid = a.pessoa_id
      ),
      cadeia as (
        select id from origem
        union
        -- filhas geradas por recorrência
        select (e.dados->>'proxima')::uuid
          from eventos e join cadeia c on c.id = e.objeto_id
         where e.objeto_tipo = 'demanda' and e.tipo = 'recorrencia_gerada'
           and e.dados->>'proxima' is not null
      )
      select d.* from demandas d
       join cadeia c on c.id = d.id
      where d.status in ('aberta','em_execucao','bloqueada','em_validacao')
        and d.archived_at is null
        and d.responsavel_id = a.substituto_id
        and coalesce(d.substituindo_id, '00000000-0000-0000-0000-000000000000') <> a.pessoa_id
    loop
      perform set_config('app.bypass_guard','on', true);
      update demandas set substituindo_id = a.pessoa_id where id = r.id;
      perform set_config('app.bypass_guard','off', true);

      insert into ausencia_demandas (ausencia_id, demanda_id, responsavel_original)
      values (a.id, r.id, a.pessoa_id) on conflict do nothing;
      insert into demanda_observadores (demanda_id, pessoa_id, origem)
      values (r.id, a.pessoa_id, 'ausencia') on conflict do nothing;
      v_qtd := v_qtd + 1;
    end loop;
  end loop;
  return v_qtd;
end $$;
grant execute on function fn_reparar_substituicoes to authenticated;

select fn_reparar_substituicoes() as demandas_remarcadas;

-- Passa a rodar junto das sincronizações
create or replace function sincronizar_ausencias()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_ap int := 0; v_dev int := 0; v_rec int; v_rep int;
begin
  for r in select id from ausencias
            where tenant_id = current_tenant_id() and ativa and not aplicada
              and substituto_id is not null and inicio <= current_date and fim >= current_date
  loop
    perform fn_aplicar_ausencia(r.id); v_ap := v_ap + 1;
  end loop;
  v_rec := fn_reconciliar_ausencias();
  v_rep := fn_reparar_substituicoes();
  for r in select id from ausencias
            where tenant_id = current_tenant_id() and ativa and fim < current_date
  loop
    perform fn_devolver_ausencia(r.id);
    update ausencias set ativa = false, encerrada_em = now() where id = r.id;
    v_dev := v_dev + 1;
  end loop;
  return jsonb_build_object('aplicadas', v_ap, 'reconciliadas', v_rec,
                            'reparadas', v_rep, 'encerradas', v_dev);
end $$;

insert into migrations_aplicadas (numero, descricao)
values ('0023', 'Reparo forte da substituição via eventos')
on conflict (numero) do nothing;

-- ============ DIAGNÓSTICO (leia os resultados) ============
-- 1) Ausências cadastradas
select 'AUSENCIAS' as bloco, a.id, p.nome as titular, s.nome as substituto,
       a.inicio, a.fim, a.ativa, a.aplicada,
       (select count(*) from ausencia_demandas ad where ad.ausencia_id = a.id and not ad.devolvida) as vinculadas
  from ausencias a
  join pessoas p on p.id = a.pessoa_id
  left join pessoas s on s.id = a.substituto_id
 order by a.inicio desc;
