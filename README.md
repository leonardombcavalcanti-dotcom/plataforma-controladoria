# Plataforma Controladoria — Sprints 01–02 · Processos + Demandas

Sistema de Gestão da Operação da Controladoria.
**Sprint 01:** núcleo do módulo Processos (catálogo, ficha canônica, ciclo de vida de 7 estados, Como Executar, recorrência, ocorrências, versionamento, auditoria imutável).
**Sprint 02:** núcleo do módulo Demandas — a ocorrência gera demandas automaticamente da recorrência (com responsável, prazo em dias úteis e checklist herdado); ciclo de vida com motivo de conclusão **automático**; bloqueio com causa + previsão + pedir ajuda; delegação com observador automático; validação com retrabalho; encerramento ≠ conclusão (ADR-09); apontamento de tempo; timeline por eventos; vistas Inbox / Minhas / Equipe (leitura) / Observando / Arquivadas; conclusão automática da ocorrência com Resumo da Execução real; views `bi.vw_demandas` e `bi.vw_bloqueios`.

> **Atualizando do Sprint 01:** basta executar `supabase/migrations/0002_demandas_core.sql` no SQL Editor (inclui o endurecimento da `fn_checar_rn01`).

**Fonte de verdade funcional:** `modelo-processos.md` v1.1 (especificação congelada) + Product Design Constitution.
**Arquitetura:** `sprint-01-arquitetura-processos.md` v1.1 (validada em 06/07/2026).

## Stack

React 18 + TypeScript + Vite · TanStack Query (estado do servidor) · Zustand (estado de UI) · Supabase (PostgreSQL, Auth, RLS). **Todos os dados operacionais moram no PostgreSQL** — localStorage guarda apenas preferências visuais (filtros da biblioteca). As regras de negócio críticas (transições de status, versionamento, geração de ocorrência) são funções RPC no banco: nem o front nem o acesso via API conseguem violá-las.

## Como rodar

### 1. Supabase (uma vez)
1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito serve).
2. No **SQL Editor**, execute na ordem:
   - `supabase/migrations/0001_processos_core.sql`
   - `supabase/seed.sql` (dados de exemplo da ASA)
3. Em **Authentication → Users → Add user**, crie seu usuário (e-mail + senha).
4. Vincule o usuário à pessoa do seed — no SQL Editor:
   ```sql
   update pessoas
      set auth_user_id = (select id from auth.users where email = 'SEU-EMAIL')
    where id = '33333333-3333-3333-3333-333333333301'; -- Leonardo Cavalcanti
   ```

### 2. Front-end
```bash
cp .env.example .env      # preencha com URL e anon key (Settings → API)
npm install
npm run dev               # abre em http://localhost:5173
```

## Power BI / Excel / API

- **Views estáveis:** `bi.vw_processos`, `bi.vw_ocorrencias`, `bi.vw_eventos` — contrato versionado para relatórios.
- **Power BI/Excel:** conector PostgreSQL apontando para o host do Supabase (Settings → Database), usando uma role somente-leitura (exemplo comentado no fim da migration).
- **API REST:** o PostgREST do Supabase expõe as tabelas/views automaticamente, respeitando RLS.

## Estrutura

```
supabase/           migration (fonte de verdade do schema) + seed
src/lib/            client Supabase · prefs (localStorage SÓ para UI)
src/domain/         tipos + regras de exibição (regras de negócio ficam no banco)
src/data/           repository (api.ts) + hooks TanStack Query
src/store/          Zustand — toasts e estado visual
src/components/     design system mínimo (tokens da Constituição)
src/modules/
  auth/             Login
  processos/        Biblioteca · Ficha canônica (5 abas) · Assistente · Ciclo de vida
```

## Rastreabilidade spec → código

| Especificação | Onde está |
|---|---|
| Ciclo de vida 7 estados (§3) | `transicionar_processo` (migration) + `CicloDeVida.tsx` |
| RN-01 requisitos de ativação | `fn_checar_rn01` (migration) |
| RN-02/05 ocorrências | `gerar_ocorrencia` (migration) |
| RN-08 versionamento com snapshot | `publicar_versao` (migration) |
| §4 Resumo da Execução | `concluir_ocorrencia` (migration) |
| §7.4 Saúde do Processo (subset MVP) | cabeçalho da `FichaProcesso.tsx` |
| §9 Assistente com modelos | `Assistente.tsx` |
| Máx. 2 níveis de macroprocesso | trigger `trg_macroprocesso_2niveis` |
| Campos governados só via RPC | trigger `trg_guard_processos` |
| created_by / updated_by / archived_at | colunas + triggers (ajuste validado 06/07/2026) |
| Auditoria imutável | tabela `eventos` (sem UPDATE/DELETE) |
| ADR-24 drawer com URL canônica | rota aninhada `/processos/:id` |
| ADR-25 genericidade | `processo_artefatos` tipado e extensível |

## Fora desta sprint (por decisão)

Demandas geradas pela ocorrência · conformidade e maturidade (dependem de Demandas) · Mapa da Operação visual · fila de melhorias · recorrência automática agendada · demais módulos (Central de Trabalho, Demandas, Equipe, Calendário, Administração).
