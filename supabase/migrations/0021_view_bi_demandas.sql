-- ============================================================
-- Migration 0021 — Recria a view de BI (corrige o erro 42P16)
-- `create or replace view` não aceita nova coluna no meio da lista:
-- é preciso derrubar e recriar. Rode este script no lugar do trecho
-- final da 0017 (o restante daquela migration já pode ter passado).
-- ============================================================

drop view if exists bi.vw_demandas;

create view bi.vw_demandas as
  select d.id,
         t.nome  as empresa,
         a.nome  as area,
         d.titulo,
         d.tipo::text        as tipo,
         d.status::text      as status,
         d.prioridade::text  as prioridade,
         d.valor::text       as valor,
         d.complexidade::text as complexidade,
         pr.nome as processo,
         o.competencia,
         resp.nome as responsavel,
         cri.nome  as criador,
         tit.nome  as titular_original,      -- preenchido quando há substituição
         d.prazo, d.iniciada_em, d.concluida_em,
         d.motivo_conclusao::text   as motivo_conclusao,
         d.motivo_encerramento::text as motivo_encerramento,
         d.retrabalho, d.tempo_estimado_h, d.peso,
         d.avaliacao_nota,
         (select coalesce(sum(horas), 0) from demanda_tempos t2 where t2.demanda_id = d.id) as horas_apontadas,
         d.criado_em
    from demandas d
    join tenants t on t.id = d.tenant_id
    join areas a on a.id = d.area_id
    left join pessoas resp on resp.id = d.responsavel_id
    join pessoas cri on cri.id = d.criador_id
    left join pessoas tit on tit.id = d.substituindo_id
    left join processos pr on pr.id = d.processo_id
    left join ocorrencias o on o.id = d.ocorrencia_id;

grant select on bi.vw_demandas to authenticated;
