-- ============================================================
-- Migration 0022 — Controle de migrations aplicadas
-- A partir daqui, todo script se registra aqui no final.
-- Consulta: select * from migrations_aplicadas order by numero;
-- ============================================================

create table if not exists migrations_aplicadas (
  numero text primary key,
  descricao text,
  aplicada_em timestamptz not null default now()
);
alter table migrations_aplicadas enable row level security;
drop policy if exists sel_migrations on migrations_aplicadas;
create policy sel_migrations on migrations_aplicadas for select to authenticated using (true);

-- Registra o histórico detectando o que já existe no banco
insert into migrations_aplicadas (numero, descricao) values
  ('0001', 'Núcleo do módulo Processos'),
  ('0002', 'Núcleo do módulo Demandas'),
  ('0003', 'Solicitações + aprovação'),
  ('0004', 'Equipe: feedback bilateral'),
  ('0005', 'Administração: escrita da estrutura'),
  ('0006', 'Saúde Operacional, conformidade e maturidade'),
  ('0007', 'Ajustes de uso real (recorrência, acesso, exclusão)'),
  ('0008', 'Avaliação de demandas + exclusão de pessoa'),
  ('0009', 'Governança de criação'),
  ('0010', 'Peso + recorrência completa'),
  ('0011', 'Recorrência por prazo'),
  ('0012', 'V2: anexos e documentação'),
  ('0013', 'E-mail das pessoas'),
  ('0014', 'Proteção de séries recorrentes'),
  ('0015', 'Férias e substituição')
on conflict (numero) do nothing;

insert into migrations_aplicadas (numero, descricao)
select '0016', 'Ausência ativa por período'
 where exists (select 1 from information_schema.columns
                where table_name = 'ausencias' and column_name = 'aplicada')
on conflict (numero) do nothing;

insert into migrations_aplicadas (numero, descricao)
select '0017', 'Marca de substituição na demanda'
 where exists (select 1 from information_schema.columns
                where table_name = 'demandas' and column_name = 'substituindo_id')
on conflict (numero) do nothing;

insert into migrations_aplicadas (numero, descricao)
select '0018', 'Corrige propagação da marca de substituição'
 where to_regprocedure('public.fn_limpar_marca_substituicao()') is not null
on conflict (numero) do nothing;

insert into migrations_aplicadas (numero, descricao)
select '0019', 'Recorrência respeita o período de férias'
 where to_regprocedure('public.fn_reconciliar_ausencias()') is not null
on conflict (numero) do nothing;

insert into migrations_aplicadas (numero, descricao)
select '0021', 'View bi.vw_demandas com titular original'
 where exists (select 1 from information_schema.columns
                where table_schema = 'bi' and table_name = 'vw_demandas'
                  and column_name = 'titular_original')
on conflict (numero) do nothing;

insert into migrations_aplicadas (numero, descricao) values
  ('0020', 'Reparo de colunas das ausências'),
  ('0022', 'Controle de migrations aplicadas')
on conflict (numero) do nothing;

-- Panorama final
select numero, descricao, aplicada_em from migrations_aplicadas order by numero;
