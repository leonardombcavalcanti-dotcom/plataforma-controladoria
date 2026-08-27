-- ============================================================
-- DIAGNÓSTICO — por que as demandas não aparecem no calendário
-- Rode UMA consulta por vez e me mande o resultado das 3.
-- ============================================================

-- (1) Como está cada demanda ativa: de quem é, quem é o titular, tem recorrência?
select d.titulo,
       r.nome  as responsavel_atual,
       t.nome  as titular_original,
       d.status, d.prazo, d.recorrencia,
       p.nome  as processo
  from demandas d
  left join pessoas r on r.id = d.responsavel_id
  left join pessoas t on t.id = d.substituindo_id
  left join processos p on p.id = d.processo_id
 where d.status in ('aberta','em_execucao','bloqueada','em_validacao')
   and d.archived_at is null
 order by r.nome, d.prazo;

-- (2) Ausências e quantas demandas estão vinculadas a elas
select a.id, p.nome as titular, s.nome as substituto, a.inicio, a.fim,
       a.ativa, a.aplicada,
       (select count(*) from ausencia_demandas ad
         where ad.ausencia_id = a.id and not ad.devolvida) as vinculadas
  from ausencias a
  join pessoas p on p.id = a.pessoa_id
  left join pessoas s on s.id = a.substituto_id
 order by a.inicio desc;

-- (3) Existe registro de transferência na auditoria?
select e.criado_em, e.tipo, d.titulo,
       (select nome from pessoas where id = (e.dados->>'de')::uuid)   as de,
       (select nome from pessoas where id = (e.dados->>'para')::uuid) as para
  from eventos e
  left join demandas d on d.id = e.objeto_id
 where e.tipo in ('substituicao_inicio','substituicao_fim')
 order by e.criado_em desc
 limit 30;
