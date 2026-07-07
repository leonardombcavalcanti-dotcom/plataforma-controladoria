-- ============================================================
-- Migration 0001 — Núcleo do módulo Processos
-- Fonte de verdade: modelo-processos.md v1.1 (congelado)
-- Sprint 01 · Arquitetura validada em 06/07/2026
-- ============================================================

-- ---------- ENUMS ----------
create type status_processo as enum
  ('rascunho','em_construcao','em_validacao','ativo','em_revisao','obsoleto','arquivado');
create type periodicidade as enum
  ('diaria','semanal','mensal','trimestral','anual','sob_demanda');
create type status_ocorrencia as enum
  ('em_andamento','concluida','concluida_pendencias','cancelada');

-- ---------- NÚCLEO ----------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  nome text not null,
  unique (tenant_id, nome)
);

create table pessoas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  auth_user_id uuid unique references auth.users(id),
  nome text not null,
  cargo text,
  perfil text not null check (perfil in ('colaborador','gestor','executivo','admin')),
  gestor_id uuid references pessoas(id),
  area_id uuid references areas(id),
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table processos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  area_id uuid not null references areas(id),
  macroprocesso_id uuid references processos(id),
  nome text not null,
  objetivo text not null,
  descricao text,
  periodicidade periodicidade not null,
  dono_id uuid not null references pessoas(id),
  substituto_id uuid references pessoas(id),
  status status_processo not null default 'rascunho',
  versao int not null default 1,
  entradas text[] not null default '{}',
  saidas text[] not null default '{}',
  criterio_inicio text,
  criterio_encerramento text,
  ultima_revisao date,
  proxima_revisao date,
  -- rastreabilidade (ajuste do product owner, 06/07/2026)
  created_by uuid references pessoas(id),
  updated_by uuid references pessoas(id),
  archived_at timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, area_id, nome)
);

-- Como Executar (§2.3): artefatos tipados e genéricos (ADR-25)
create table processo_artefatos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos(id) on delete cascade,
  tipo text not null check (tipo in
    ('fluxo_etapa','procedimento','checklist_item','template','arquivo',
     'video','sql','dashboard','boa_pratica','risco')),
  ordem int not null default 0,
  titulo text not null,
  conteudo text,
  storage_path text,
  created_by uuid references pessoas(id),
  updated_by uuid references pessoas(id),
  archived_at timestamptz,
  criado_em timestamptz not null default now()
);

-- Recorrência (§2.2): demandas-modelo (a geração vira Demanda em sprint futura)
create table processo_recorrencia (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos(id) on delete cascade,
  titulo_modelo text not null,
  responsavel_padrao_id uuid references pessoas(id),
  dia_util_gatilho int,
  prazo_dias int not null default 3,
  exige_validacao boolean not null default false,
  ordem int not null default 0,
  created_by uuid references pessoas(id),
  archived_at timestamptz
);

-- Relações processo↔processo (§6.2): apenas 2 tipos
create table processo_relacoes (
  id uuid primary key default gen_random_uuid(),
  origem_id uuid not null references processos(id) on delete cascade,
  destino_id uuid not null references processos(id) on delete cascade,
  tipo text not null check (tipo in ('alimenta','relacionado')),
  created_by uuid references pessoas(id),
  unique (origem_id, destino_id, tipo),
  check (origem_id <> destino_id)
);

-- Versionamento (RN-08): snapshot integral por versão
create table processo_versoes (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos(id) on delete cascade,
  versao int not null,
  snapshot jsonb not null,
  autor_id uuid references pessoas(id),
  motivo text not null,
  criado_em timestamptz not null default now(),
  unique (processo_id, versao)
);

-- Ocorrências (§4): a unidade de medição
create table ocorrencias (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos(id) on delete cascade,
  competencia text not null,                    -- 'AAAA-MM'
  versao_processo int not null,                 -- RN-05
  status status_ocorrencia not null default 'em_andamento',
  criada_em timestamptz not null default now(),
  concluida_em timestamptz,
  resumo_execucao jsonb,                        -- §4: a "ata" automática
  created_by uuid references pessoas(id),
  updated_by uuid references pessoas(id),
  unique (processo_id, competencia)
);
-- Demandas da ocorrência: FK chega na sprint de Demandas (fora do escopo — decisão validada)

-- Auditoria imutável
create table eventos (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  objeto_tipo text not null,
  objeto_id uuid not null,
  tipo text not null,
  autor_id uuid,
  dados jsonb,
  criado_em timestamptz not null default now()
);
revoke update, delete on eventos from anon, authenticated;

create index idx_processos_tenant on processos(tenant_id);
create index idx_eventos_objeto on eventos(objeto_tipo, objeto_id);
create index idx_ocorrencias_processo on ocorrencias(processo_id);

-- ---------- FUNÇÕES DE APOIO ----------
create or replace function current_pessoa_id()
returns uuid language sql stable security definer set search_path = public as
$$ select id from pessoas where auth_user_id = auth.uid() $$;

create or replace function current_tenant_id()
returns uuid language sql stable security definer set search_path = public as
$$ select tenant_id from pessoas where auth_user_id = auth.uid() $$;

-- ---------- TRIGGERS DE INTEGRIDADE ----------

-- §8.2 da Etapa 1: macroprocesso com no máximo 2 níveis
create or replace function fn_macroprocesso_2niveis()
returns trigger language plpgsql as $$
begin
  if new.macroprocesso_id is not null then
    if exists (select 1 from processos p
               where p.id = new.macroprocesso_id and p.macroprocesso_id is not null) then
      raise exception 'Hierarquia máxima de 2 níveis: o processo pai já possui um macroprocesso.';
    end if;
    if new.id = new.macroprocesso_id then
      raise exception 'Um processo não pode ser pai de si mesmo.';
    end if;
  end if;
  return new;
end $$;
create trigger trg_macroprocesso_2niveis
  before insert or update of macroprocesso_id on processos
  for each row execute function fn_macroprocesso_2niveis();

-- Campos governados (status, versao, archived_at) só mudam via RPC
create or replace function fn_guard_campos_governados()
returns trigger language plpgsql as $$
begin
  if (new.status is distinct from old.status
      or new.versao is distinct from old.versao
      or new.archived_at is distinct from old.archived_at)
     and coalesce(current_setting('app.bypass_guard', true), 'off') <> 'on' then
    raise exception 'Status, versão e arquivamento mudam apenas pelas funções oficiais (transicionar_processo / publicar_versao).';
  end if;
  new.atualizado_em := now();
  new.updated_by := coalesce(current_pessoa_id(), new.updated_by);
  return new;
end $$;
create trigger trg_guard_processos
  before update on processos
  for each row execute function fn_guard_campos_governados();

-- created_by automático
create or replace function fn_set_created_by()
returns trigger language plpgsql as $$
begin
  new.created_by := coalesce(new.created_by, current_pessoa_id());
  return new;
end $$;
create trigger trg_created_processos before insert on processos
  for each row execute function fn_set_created_by();
create trigger trg_created_artefatos before insert on processo_artefatos
  for each row execute function fn_set_created_by();
create trigger trg_created_recorrencia before insert on processo_recorrencia
  for each row execute function fn_set_created_by();
create trigger trg_created_ocorrencias before insert on ocorrencias
  for each row execute function fn_set_created_by();

-- Auditoria: criação e edição de processos
create or replace function fn_auditar_processo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
    values (new.tenant_id, 'processo', new.id, 'criacao', current_pessoa_id(),
            jsonb_build_object('nome', new.nome));
  elsif tg_op = 'UPDATE' and new.status = old.status and new.versao = old.versao then
    insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
    values (new.tenant_id, 'processo', new.id, 'edicao', current_pessoa_id(),
            jsonb_build_object('campos_alterados', (
              select jsonb_agg(key) from jsonb_each(to_jsonb(new))
              where to_jsonb(new)->key is distinct from to_jsonb(old)->key
                and key not in ('atualizado_em','updated_by'))));
  end if;
  return new;
end $$;
create trigger trg_auditar_processos
  after insert or update on processos
  for each row execute function fn_auditar_processo();

create or replace function fn_auditar_ocorrencia()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from processos where id = new.processo_id;
  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (v_tenant, 'ocorrencia', new.id,
          case when tg_op = 'INSERT' then 'criacao' else 'atualizacao' end,
          current_pessoa_id(),
          jsonb_build_object('competencia', new.competencia, 'status', new.status));
  return new;
end $$;
create trigger trg_auditar_ocorrencias
  after insert or update on ocorrencias
  for each row execute function fn_auditar_ocorrencia();

-- ---------- RPCs — regra de negócio no banco ----------

-- RN-01: requisitos de ativação
create or replace function fn_checar_rn01(p_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare p processos%rowtype; faltas text := '';
begin
  select * into p from processos where id = p_id;
  if p.dono_id is null then faltas := faltas || 'dono; '; end if;
  if coalesce(trim(p.objetivo),'') = '' then faltas := faltas || 'objetivo; '; end if;
  if not exists (select 1 from processo_artefatos a
                 where a.processo_id = p_id and a.archived_at is null
                   and a.tipo in ('fluxo_etapa','checklist_item','procedimento')) then
    faltas := faltas || 'pelo menos 1 artefato de método (fluxo, checklist ou procedimento); ';
  end if;
  if p.periodicidade <> 'sob_demanda'
     and not exists (select 1 from processo_recorrencia r
                     where r.processo_id = p_id and r.archived_at is null) then
    faltas := faltas || 'configuração de recorrência (processo recorrente); ';
  end if;
  return nullif(faltas, '');
end $$;

-- §3: grafo de transições do ciclo de vida
create or replace function transicionar_processo(p_id uuid, p_novo status_processo, p_justificativa text default null)
returns processos language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; v_valida boolean; v_exige_just boolean; v_faltas text;
begin
  select * into p from processos where id = p_id and tenant_id = current_tenant_id();
  if p.id is null then raise exception 'Processo não encontrado.'; end if;

  v_valida := case
    when p.status = 'rascunho'      and p_novo = 'em_construcao' then true
    when p.status = 'em_construcao' and p_novo = 'em_validacao'  then true
    when p.status = 'em_validacao'  and p_novo in ('ativo','em_construcao') then true
    when p.status = 'ativo'         and p_novo in ('em_revisao','obsoleto','em_construcao') then true
    when p.status = 'em_revisao'    and p_novo in ('ativo','obsoleto') then true
    when p.status = 'obsoleto'      and p_novo in ('arquivado','em_validacao') then true
    else false end;
  if not v_valida then
    raise exception 'Transição inválida: % → %.', p.status, p_novo;
  end if;

  -- justificativa obrigatória em retrocessos e encerramentos (§3, RN-11)
  v_exige_just := p_novo in ('obsoleto','arquivado')
    or (p.status = 'em_validacao' and p_novo = 'em_construcao')
    or (p.status = 'ativo' and p_novo = 'em_construcao');
  if v_exige_just and coalesce(trim(p_justificativa),'') = '' then
    raise exception 'Esta transição exige justificativa.';
  end if;

  -- RN-01 na entrada de Em Validação
  if p_novo = 'em_validacao' then
    v_faltas := fn_checar_rn01(p_id);
    if v_faltas is not null then
      raise exception 'Requisitos de ativação incompletos (RN-01): %', v_faltas;
    end if;
  end if;

  perform set_config('app.bypass_guard','on', true);
  update processos
     set status = p_novo,
         archived_at = case when p_novo = 'arquivado' then now() else archived_at end,
         ultima_revisao = case when p.status = 'em_revisao' and p_novo = 'ativo'
                               then current_date else ultima_revisao end
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);

  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (p.tenant_id, 'processo', p_id, 'transicao', current_pessoa_id(),
          jsonb_build_object('de', p.status, 'para', p_novo, 'justificativa', p_justificativa));

  select * into p from processos where id = p_id;
  return p;
end $$;

-- RN-08: publicar versão (snapshot integral)
create or replace function publicar_versao(p_id uuid, p_motivo text)
returns processos language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; v_nova int; v_snap jsonb;
begin
  select * into p from processos where id = p_id and tenant_id = current_tenant_id();
  if p.id is null then raise exception 'Processo não encontrado.'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo da nova versão (RN-08).'; end if;

  v_nova := p.versao + 1;
  v_snap := jsonb_build_object(
    'processo', to_jsonb(p),
    'artefatos', (select coalesce(jsonb_agg(to_jsonb(a) order by a.ordem),'[]'::jsonb)
                  from processo_artefatos a where a.processo_id = p_id and a.archived_at is null),
    'recorrencia', (select coalesce(jsonb_agg(to_jsonb(r) order by r.ordem),'[]'::jsonb)
                    from processo_recorrencia r where r.processo_id = p_id and r.archived_at is null));

  insert into processo_versoes (processo_id, versao, snapshot, autor_id, motivo)
  values (p_id, v_nova, v_snap, current_pessoa_id(), p_motivo);

  perform set_config('app.bypass_guard','on', true);
  update processos set versao = v_nova where id = p_id;
  perform set_config('app.bypass_guard','off', true);

  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (p.tenant_id, 'processo', p_id, 'versao', current_pessoa_id(),
          jsonb_build_object('versao', v_nova, 'motivo', p_motivo));

  select * into p from processos where id = p_id;
  return p;
end $$;

-- RN-02 + RN-05: gerar ocorrência (manual nesta sprint — decisão validada)
create or replace function gerar_ocorrencia(p_id uuid, p_competencia text)
returns ocorrencias language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; o ocorrencias%rowtype;
begin
  select * into p from processos where id = p_id and tenant_id = current_tenant_id();
  if p.id is null then raise exception 'Processo não encontrado.'; end if;
  if p.status not in ('ativo','em_revisao') then
    raise exception 'Somente processos Ativos ou Em Revisão geram ocorrências (RN-02).';
  end if;
  if p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Competência inválida. Use AAAA-MM.';
  end if;

  insert into ocorrencias (processo_id, competencia, versao_processo)
  values (p_id, p_competencia, p.versao)
  returning * into o;
  return o;
end $$;

-- §4: concluir ocorrência com Resumo da Execução automático
create or replace function concluir_ocorrencia(p_ocorrencia_id uuid)
returns ocorrencias language plpgsql security definer set search_path = public as $$
declare o ocorrencias%rowtype; v_resumo jsonb; v_anterior ocorrencias%rowtype;
begin
  select o2.* into o from ocorrencias o2
    join processos p on p.id = o2.processo_id
   where o2.id = p_ocorrencia_id and p.tenant_id = current_tenant_id();
  if o.id is null then raise exception 'Ocorrência não encontrada.'; end if;
  if o.status <> 'em_andamento' then raise exception 'Ocorrência já finalizada.'; end if;

  select * into v_anterior from ocorrencias
   where processo_id = o.processo_id and competencia < o.competencia
     and status in ('concluida','concluida_pendencias')
   order by competencia desc limit 1;

  v_resumo := jsonb_build_object(
    'competencia', o.competencia,
    'versao_processo', o.versao_processo,
    'duracao_dias', extract(day from now() - o.criada_em),
    'demandas', jsonb_build_object('nota','Módulo Demandas ainda não construído — contagens entram na sprint de Demandas.'),
    'comparacao_anterior', case when v_anterior.id is null then null
      else jsonb_build_object('competencia', v_anterior.competencia,
                              'duracao_dias', extract(day from v_anterior.concluida_em - v_anterior.criada_em)) end);

  update ocorrencias
     set status = 'concluida', concluida_em = now(),
         resumo_execucao = v_resumo, updated_by = current_pessoa_id()
   where id = p_ocorrencia_id
  returning * into o;
  return o;
end $$;

grant execute on function transicionar_processo, publicar_versao,
  gerar_ocorrencia, concluir_ocorrencia, fn_checar_rn01,
  current_pessoa_id, current_tenant_id to authenticated;

-- ---------- RLS ----------
alter table tenants enable row level security;
alter table areas enable row level security;
alter table pessoas enable row level security;
alter table processos enable row level security;
alter table processo_artefatos enable row level security;
alter table processo_recorrencia enable row level security;
alter table processo_relacoes enable row level security;
alter table processo_versoes enable row level security;
alter table ocorrencias enable row level security;
alter table eventos enable row level security;

create policy sel_tenants on tenants for select using (id = current_tenant_id());
create policy sel_areas on areas for select using (tenant_id = current_tenant_id());
create policy sel_pessoas on pessoas for select using (tenant_id = current_tenant_id());

create policy all_processos on processos
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy all_artefatos on processo_artefatos
  using (exists (select 1 from processos p where p.id = processo_id and p.tenant_id = current_tenant_id()))
  with check (exists (select 1 from processos p where p.id = processo_id and p.tenant_id = current_tenant_id()));

create policy all_recorrencia on processo_recorrencia
  using (exists (select 1 from processos p where p.id = processo_id and p.tenant_id = current_tenant_id()))
  with check (exists (select 1 from processos p where p.id = processo_id and p.tenant_id = current_tenant_id()));

create policy all_relacoes on processo_relacoes
  using (exists (select 1 from processos p where p.id = origem_id and p.tenant_id = current_tenant_id()))
  with check (exists (select 1 from processos p where p.id = origem_id and p.tenant_id = current_tenant_id()));

create policy sel_versoes on processo_versoes for select
  using (exists (select 1 from processos p where p.id = processo_id and p.tenant_id = current_tenant_id()));

create policy all_ocorrencias on ocorrencias
  using (exists (select 1 from processos p where p.id = processo_id and p.tenant_id = current_tenant_id()))
  with check (exists (select 1 from processos p where p.id = processo_id and p.tenant_id = current_tenant_id()));

create policy sel_eventos on eventos for select using (tenant_id = current_tenant_id());

-- ---------- BI (Power BI / Excel / API) ----------
create schema if not exists bi;

create or replace view bi.vw_processos as
  select p.id, t.nome as empresa, a.nome as area, p.nome, p.status::text as status,
         p.periodicidade::text as periodicidade, d.nome as dono, p.versao,
         p.ultima_revisao, p.proxima_revisao, p.criado_em, p.archived_at
  from processos p
  join tenants t on t.id = p.tenant_id
  join areas a on a.id = p.area_id
  join pessoas d on d.id = p.dono_id;

create or replace view bi.vw_ocorrencias as
  select o.id, p.nome as processo, a.nome as area, o.competencia, o.status::text as status,
         o.versao_processo, o.criada_em, o.concluida_em, o.resumo_execucao
  from ocorrencias o
  join processos p on p.id = o.processo_id
  join areas a on a.id = p.area_id;

create or replace view bi.vw_eventos as
  select e.id, e.objeto_tipo, e.objeto_id, e.tipo, pe.nome as autor, e.dados, e.criado_em
  from eventos e left join pessoas pe on pe.id = e.autor_id;

-- Role somente-leitura para BI (conexão direta Power BI/Excel)
-- Executar uma vez, ajustando a senha:
--   create role bi_readonly login password '<defina-uma-senha-forte>';
grant usage on schema bi to authenticated;
grant select on all tables in schema bi to authenticated;
