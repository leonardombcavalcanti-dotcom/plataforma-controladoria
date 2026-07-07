-- ============================================================
-- Seed — dados de exemplo (tenant ASA / Controladoria)
-- Executar APÓS a migration 0001. Idempotente por limpeza prévia opcional.
-- ============================================================

insert into tenants (id, nome) values
  ('11111111-1111-1111-1111-111111111111', 'ASA Locadora');

insert into areas (id, tenant_id, nome) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Controladoria'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'FP&A');

insert into pessoas (id, tenant_id, nome, cargo, perfil, area_id) values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111',
   'Leonardo Cavalcanti', 'Controller', 'admin', '22222222-2222-2222-2222-222222222201'),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111',
   'Marina Duarte', 'Coordenadora de Controladoria', 'gestor', '22222222-2222-2222-2222-222222222201'),
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111111',
   'Rafael Souza', 'Analista de Controladoria', 'colaborador', '22222222-2222-2222-2222-222222222201'),
  ('33333333-3333-3333-3333-333333333304', '11111111-1111-1111-1111-111111111111',
   'Paulo Mendes', 'Analista de FP&A', 'colaborador', '22222222-2222-2222-2222-222222222202');

update pessoas set gestor_id = '33333333-3333-3333-3333-333333333301'
 where id = '33333333-3333-3333-3333-333333333302';
update pessoas set gestor_id = '33333333-3333-3333-3333-333333333302'
 where id in ('33333333-3333-3333-3333-333333333303','33333333-3333-3333-3333-333333333304');

-- ---------- PROCESSOS ----------
insert into processos (id, tenant_id, area_id, nome, objetivo, descricao, periodicidade,
                       dono_id, substituto_id, status, versao, entradas, saidas,
                       criterio_inicio, criterio_encerramento, ultima_revisao)
values
  ('44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222201',
   'Fechamento Mensal',
   'Apurar e consolidar o resultado contábil-gerencial do mês com integridade e prazo.',
   'Rotina central da Controladoria. Consolida conciliações, apurações e validações até a DRE gerencial.',
   'mensal',
   '33333333-3333-3333-3333-333333333302', '33333333-3333-3333-3333-333333333303',
   'ativo', 3,
   array['Extratos bancários D+1','Razão contábil transmitido','Folha processada'],
   array['DRE gerencial consolidada','Pacote de fechamento para diretoria'],
   'Todas as filiais com movimento transmitido',
   'Checklist 100% + validação do Controller',
   '2026-04-15'),

  ('44444444-4444-4444-4444-444444444402', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222202',
   'Forecast',
   'Projetar o resultado dos próximos meses com premissas revisadas e desvios explicados.',
   null, 'mensal',
   '33333333-3333-3333-3333-333333333302', null,
   'ativo', 2,
   array['Realizado do mês fechado','Premissas comerciais'],
   array['Forecast aprovado','Apresentação para diretoria'],
   null, 'Apresentação validada pela diretoria', '2026-05-20'),

  ('44444444-4444-4444-4444-444444444403', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222201',
   'Conciliação Bancária',
   'Garantir que todos os saldos bancários estejam conciliados com o razão.',
   null, 'mensal',
   '33333333-3333-3333-3333-333333333303', null,
   'em_revisao', 4,
   array['Extratos bancários'], array['Conciliações assinadas'],
   null, null, '2025-10-01'),

  ('44444444-4444-4444-4444-444444444404', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222202',
   'Budget Anual',
   'Construir o orçamento anual da companhia por área e centro de resultado.',
   null, 'anual',
   '33333333-3333-3333-3333-333333333302', null,
   'rascunho', 1, '{}', '{}', null, null, null);

-- ---------- COMO EXECUTAR (artefatos) ----------
insert into processo_artefatos (processo_id, tipo, ordem, titulo, conteudo) values
  -- Fechamento Mensal
  ('44444444-4444-4444-4444-444444444401','fluxo_etapa',1,'Conciliar contas bancárias','Concluir todas as conciliações do processo Conciliação Bancária.'),
  ('44444444-4444-4444-4444-444444444401','fluxo_etapa',2,'Apurar provisões e competências','Provisões de folha, férias, bônus e despesas recorrentes.'),
  ('44444444-4444-4444-4444-444444444401','fluxo_etapa',3,'Consolidar DRE gerencial','Consolidação por empresa, unidade e centro de resultado.'),
  ('44444444-4444-4444-4444-444444444401','fluxo_etapa',4,'Validação do Controller','Revisão final e assinatura do fechamento.'),
  ('44444444-4444-4444-4444-444444444401','checklist_item',1,'Extratos importados e conferidos', null),
  ('44444444-4444-4444-4444-444444444401','checklist_item',2,'Conciliações 100% concluídas', null),
  ('44444444-4444-4444-4444-444444444401','checklist_item',3,'Provisões lançadas na competência', null),
  ('44444444-4444-4444-4444-444444444401','checklist_item',4,'DRE consolidada sem divergência', null),
  ('44444444-4444-4444-4444-444444444401','sql',1,'Consulta de saldos por conta','select conta, sum(valor) from lancamentos where competencia = :comp group by conta;'),
  ('44444444-4444-4444-4444-444444444401','boa_pratica',1,'Feche filiais pequenas primeiro','Reduz retrabalho quando surge divergência na matriz.'),
  ('44444444-4444-4444-4444-444444444401','risco',1,'ERP indisponível na semana de fechamento','Contingência: exportação manual dos extratos + planilha de conciliação temporária.'),
  -- Forecast
  ('44444444-4444-4444-4444-444444444402','fluxo_etapa',1,'Atualizar premissas','Revisar premissas comerciais e de custos com as áreas.'),
  ('44444444-4444-4444-4444-444444444402','fluxo_etapa',2,'Importar realizado','Carregar o realizado do mês fechado.'),
  ('44444444-4444-4444-4444-444444444402','fluxo_etapa',3,'Analisar variações','Explicar desvios relevantes vs. forecast anterior.'),
  ('44444444-4444-4444-4444-444444444402','fluxo_etapa',4,'Apresentar à diretoria','Reunião de validação do forecast.'),
  ('44444444-4444-4444-4444-444444444402','checklist_item',1,'Premissas revisadas com comercial', null),
  ('44444444-4444-4444-4444-444444444402','checklist_item',2,'Desvios > 5% explicados', null),
  -- Conciliação
  ('44444444-4444-4444-4444-444444444403','fluxo_etapa',1,'Importar extratos','Todos os bancos, D+1.'),
  ('44444444-4444-4444-4444-444444444403','fluxo_etapa',2,'Conciliar razão x extrato','Item a item, com justificativa de pendências.'),
  ('44444444-4444-4444-4444-444444444403','checklist_item',1,'Pendências > 5 dias justificadas', null);

-- ---------- RECORRÊNCIA ----------
insert into processo_recorrencia (processo_id, titulo_modelo, responsavel_padrao_id, dia_util_gatilho, prazo_dias, exige_validacao, ordem) values
  ('44444444-4444-4444-4444-444444444401','Conciliação bancária consolidada','33333333-3333-3333-3333-333333333303',1,2,false,1),
  ('44444444-4444-4444-4444-444444444401','Provisões e competências','33333333-3333-3333-3333-333333333303',2,2,true,2),
  ('44444444-4444-4444-4444-444444444401','Consolidação da DRE gerencial','33333333-3333-3333-3333-333333333302',3,2,true,3),
  ('44444444-4444-4444-4444-444444444401','Pacote de fechamento para diretoria','33333333-3333-3333-3333-333333333302',5,1,true,4),
  ('44444444-4444-4444-4444-444444444402','Atualização de premissas','33333333-3333-3333-3333-333333333304',6,2,false,1),
  ('44444444-4444-4444-4444-444444444402','Análise de variações','33333333-3333-3333-3333-333333333304',8,2,true,2),
  ('44444444-4444-4444-4444-444444444403','Conciliação de todas as contas','33333333-3333-3333-3333-333333333303',1,3,false,1);

-- ---------- RELAÇÕES (§6.2) ----------
insert into processo_relacoes (origem_id, destino_id, tipo) values
  ('44444444-4444-4444-4444-444444444403','44444444-4444-4444-4444-444444444401','alimenta'),
  ('44444444-4444-4444-4444-444444444401','44444444-4444-4444-4444-444444444402','alimenta'),
  ('44444444-4444-4444-4444-444444444402','44444444-4444-4444-4444-444444444404','relacionado');

-- ---------- VERSÕES (histórico mínimo) ----------
insert into processo_versoes (processo_id, versao, snapshot, autor_id, motivo) values
  ('44444444-4444-4444-4444-444444444401', 3,
   '{"nota":"snapshot inicial do seed"}',
   '33333333-3333-3333-3333-333333333302', 'Novo checklist de provisões (melhoria aceita)'),
  ('44444444-4444-4444-4444-444444444403', 4,
   '{"nota":"snapshot inicial do seed"}',
   '33333333-3333-3333-3333-333333333303', 'Inclusão da regra de pendências > 5 dias');

-- ---------- OCORRÊNCIAS ----------
insert into ocorrencias (processo_id, competencia, versao_processo, status, criada_em, concluida_em, resumo_execucao) values
  ('44444444-4444-4444-4444-444444444401', '2026-06', 3, 'concluida',
   '2026-06-25 08:00-03', '2026-07-03 18:00-03',
   '{"competencia":"2026-06","versao_processo":3,"duracao_dias":8,"demandas":{"nota":"anterior ao módulo Demandas"}}'),
  ('44444444-4444-4444-4444-444444444401', '2026-07', 3, 'em_andamento',
   '2026-07-01 08:00-03', null, null),
  ('44444444-4444-4444-4444-444444444402', '2026-06', 2, 'concluida',
   '2026-06-10 08:00-03', '2026-06-18 17:00-03',
   '{"competencia":"2026-06","versao_processo":2,"duracao_dias":8}');

-- ============================================================
-- VINCULAR SEU USUÁRIO (obrigatório para logar):
-- 1) Supabase Dashboard → Authentication → Add user (email + senha)
-- 2) Execute, trocando o e-mail:
--    update pessoas
--       set auth_user_id = (select id from auth.users where email = 'leonardo.cavalcanti@asalocadora.com.br')
--     where id = '33333333-3333-3333-3333-333333333301';
-- ============================================================
