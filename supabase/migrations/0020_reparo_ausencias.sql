-- ============================================================
-- Migration 0020 — Reparo: garante as colunas das ausências
-- Rode este script ANTES de reexecutar a 0019 (ou sozinho: ele já reconcilia).
-- Idempotente: pode rodar quantas vezes quiser.
-- ============================================================

-- 1) Colunas que podem ter faltado (0016 / 0017)
alter table ausencias  add column if not exists aplicada boolean not null default false;
alter table demandas   add column if not exists substituindo_id uuid references pessoas(id);

-- 2) Ausências que já transferiram demandas ficam marcadas como aplicadas
update ausencias a
   set aplicada = true
 where not a.aplicada
   and exists (select 1 from ausencia_demandas ad where ad.ausencia_id = a.id);

-- 3) Confere o estado (resultado aparece no painel)
select a.id, p.nome as pessoa, s.nome as substituto, a.inicio, a.fim,
       a.ativa, a.aplicada,
       (select count(*) from ausencia_demandas ad
         where ad.ausencia_id = a.id and not ad.devolvida) as demandas_em_substituicao
  from ausencias a
  join pessoas p on p.id = a.pessoa_id
  left join pessoas s on s.id = a.substituto_id
 order by a.inicio desc;
