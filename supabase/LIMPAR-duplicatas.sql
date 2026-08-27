-- ============================================================
-- Duplicatas de demandas recorrentes — diagnóstico e limpeza
-- (2) usa o bypass oficial do guard, como as funções do sistema.
-- Rode a (1) primeiro; só execute a (2) se concordar com a lista.
-- ============================================================

-- (1) DIAGNÓSTICO: mais de uma demanda ativa para o mesmo modelo do processo
select p.nome as processo, r.titulo_modelo,
       count(*) as ativas,
       string_agg(d.titulo || ' (venc. ' || to_char(d.prazo, 'DD/MM') || ')', ' | ' order by d.prazo) as instancias
  from demandas d
  join processo_recorrencia r on r.id = d.recorrencia_id
  join processos p on p.id = d.processo_id
 where d.status in ('aberta','em_execucao','bloqueada','em_validacao')
   and d.archived_at is null
 group by p.nome, r.titulo_modelo
having count(*) > 1
 order by p.nome;


-- (2) LIMPEZA — mantém a instância que vence primeiro e encerra as demais
--     como "duplicada" (preserva histórico e não conta como produtividade).
do $$
declare v_qtd int;
begin
  perform set_config('app.bypass_guard', 'on', true);

  with duplicadas as (
    select d.id,
           row_number() over (partition by d.recorrencia_id order by d.prazo, d.criado_em) as posicao,
           first_value(d.id) over (partition by d.recorrencia_id order by d.prazo, d.criado_em) as original
      from demandas d
     where d.recorrencia_id is not null
       and d.status in ('aberta','em_execucao','bloqueada','em_validacao')
       and d.archived_at is null
  )
  update demandas dm
     set status = 'encerrada',
         concluida_em = now(),
         motivo_encerramento = 'duplicada',
         justificativa_encerramento = 'Instância duplicada da mesma demanda-modelo (limpeza)',
         demanda_original_id = dp.original
    from duplicadas dp
   where dm.id = dp.id and dp.posicao > 1;

  get diagnostics v_qtd = row_count;
  perform set_config('app.bypass_guard', 'off', true);
  raise notice 'Duplicatas encerradas: %', v_qtd;
end $$;


-- (3) Confirmação: não deve retornar linhas
select p.nome as processo, r.titulo_modelo, count(*) as ainda_duplicadas
  from demandas d
  join processo_recorrencia r on r.id = d.recorrencia_id
  join processos p on p.id = d.processo_id
 where d.status in ('aberta','em_execucao','bloqueada','em_validacao')
 group by p.nome, r.titulo_modelo
having count(*) > 1;
