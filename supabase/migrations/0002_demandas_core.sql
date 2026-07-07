-- ============================================================
-- Migration 0002 — Núcleo do módulo Demandas
-- Fonte: Etapa 2 (Fluxos 1,2,3,6,10) · Arquitetura Sprint 02 validada 06/07/2026
-- ============================================================

-- ---------- ENUMS ----------
create type status_demanda as enum
  ('solicitada','aberta','em_execucao','bloqueada','em_validacao','concluida','encerrada');
create type motivo_conclusao as enum ('antecipada','no_prazo','com_atraso');
create type motivo_encerramento as enum ('cancelada','duplicada','nao_aplicavel');
create type causa_bloqueio as enum ('pessoa','area','sistema','fornecedor','cliente','outro');
create type tipo_demanda as enum
  ('rotina','projeto','incidente','solicitacao','melhoria','correcao','analise','aprovacao');
create type prioridade_demanda as enum ('baixa','media','alta','critica');
create type valor_demanda as enum ('baixo','medio','alto','critico');
create type complexidade_demanda as enum ('baixa','media','alta','especialista');

-- ---------- TABELAS ----------
create table demandas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  area_id uuid not null references areas(id),
  titulo text not null,
  descricao text,
  tipo tipo_demanda not null default 'rotina',
  prioridade prioridade_demanda not null default 'media',
  valor valor_demanda not null default 'medio',
  complexidade complexidade_demanda,
  objetivo_negocio text,
  processo_id uuid references processos(id),
  ocorrencia_id uuid references ocorrencias(id),
  recorrencia_id uuid references processo_recorrencia(id),
  criador_id uuid not null references pessoas(id),
  responsavel_id uuid not null references pessoas(id),
  validador_id uuid references pessoas(id),
  exige_validacao boolean not null default false,
  status status_demanda not null default 'aberta',
  prazo date not null,
  iniciada_em timestamptz,
  concluida_em timestamptz,
  motivo_conclusao motivo_conclusao,
  motivo_encerramento motivo_encerramento,
  justificativa_encerramento text,
  demanda_original_id uuid references demandas(id),
  tempo_estimado_h numeric,
  retrabalho int not null default 0,
  created_by uuid references pessoas(id),
  updated_by uuid references pessoas(id),
  archived_at timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table demanda_observadores (
  demanda_id uuid not null references demandas(id) on delete cascade,
  pessoa_id uuid not null references pessoas(id),
  origem text not null default 'manual',   -- manual | criador | delegacao | dono_processo
  criado_em timestamptz not null default now(),
  primary key (demanda_id, pessoa_id)
);

create table demanda_checklist (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demandas(id) on delete cascade,
  ordem int not null default 0,
  texto text not null,
  feito boolean not null default false,
  feito_por uuid references pessoas(id),
  feito_em timestamptz,
  archived_at timestamptz
);

create table demanda_comentarios (      -- imutáveis (rastreabilidade)
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demandas(id) on delete cascade,
  autor_id uuid not null references pessoas(id),
  texto text not null,
  criado_em timestamptz not null default now()
);
revoke update, delete on demanda_comentarios from anon, authenticated;

create table demanda_bloqueios (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demandas(id) on delete cascade,
  causa causa_bloqueio not null,
  descricao text not null,
  previsao_desbloqueio date,
  pedir_ajuda boolean not null default false,
  inicio timestamptz not null default now(),
  fim timestamptz,
  criado_por uuid references pessoas(id)
);

create table demanda_tempos (            -- Fluxo 10: apontamento opcional
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demandas(id) on delete cascade,
  pessoa_id uuid not null references pessoas(id),
  horas numeric not null check (horas > 0 and horas <= 24),
  data date not null default current_date,
  comentario text,
  criado_em timestamptz not null default now()
);

create table demanda_favoritos (
  demanda_id uuid not null references demandas(id) on delete cascade,
  pessoa_id uuid not null references pessoas(id),
  primary key (demanda_id, pessoa_id)
);

create index idx_demandas_tenant on demandas(tenant_id);
create index idx_demandas_responsavel on demandas(responsavel_id);
create index idx_demandas_ocorrencia on demandas(ocorrencia_id);
create index idx_demandas_processo on demandas(processo_id);
create index idx_bloqueios_demanda on demanda_bloqueios(demanda_id);

-- ---------- FUNÇÕES DE APOIO ----------
create or replace function fn_atual_e_gestor()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from pessoas
                  where auth_user_id = auth.uid() and perfil in ('gestor','admin')) $$;

-- Quem pode EDITAR a demanda (RLS de UPDATE ≠ SELECT — decisão validada)
create or replace function fn_pode_editar_demanda(p_demanda_id uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from demandas d
     where d.id = p_demanda_id
       and d.tenant_id = current_tenant_id()
       and (d.responsavel_id = current_pessoa_id()
            or d.criador_id = current_pessoa_id()
            or fn_atual_e_gestor())) $$;

-- Dias úteis seg–sex (calendário de feriados por tenant: sprint futura — decisão validada)
create or replace function fn_add_dias_uteis(p_base date, p_dias int)
returns date language plpgsql immutable as $$
declare d date := p_base; n int := 0;
begin
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

create or replace function fn_evento_demanda(p_demanda demandas, p_tipo text, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (p_demanda.tenant_id, 'demanda', p_demanda.id, p_tipo, current_pessoa_id(), p_dados);
end $$;

-- ---------- TRIGGERS ----------
-- Campos governados mudam somente via RPC
create or replace function fn_guard_demandas()
returns trigger language plpgsql as $$
begin
  if (new.status is distinct from old.status
      or new.motivo_conclusao is distinct from old.motivo_conclusao
      or new.motivo_encerramento is distinct from old.motivo_encerramento
      or new.retrabalho is distinct from old.retrabalho
      or new.iniciada_em is distinct from old.iniciada_em
      or new.concluida_em is distinct from old.concluida_em
      or new.archived_at is distinct from old.archived_at)
     and coalesce(current_setting('app.bypass_guard', true), 'off') <> 'on' then
    raise exception 'Status e desfechos da demanda mudam apenas pelas funções oficiais.';
  end if;
  new.atualizado_em := now();
  new.updated_by := coalesce(current_pessoa_id(), new.updated_by);
  return new;
end $$;
create trigger trg_guard_demandas before update on demandas
  for each row execute function fn_guard_demandas();

create trigger trg_created_demandas before insert on demandas
  for each row execute function fn_set_created_by();

-- Criador vira observador automático quando não é o responsável (Fluxo 2)
create or replace function fn_demanda_pos_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.criador_id <> new.responsavel_id then
    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (new.id, new.criador_id, 'criador')
    on conflict do nothing;
  end if;
  insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
  values (new.tenant_id, 'demanda', new.id, 'criacao', coalesce(current_pessoa_id(), new.criador_id),
          jsonb_build_object('titulo', new.titulo,
                             'origem', case when new.ocorrencia_id is not null then 'ocorrencia' else 'manual' end));
  return new;
end $$;
create trigger trg_demanda_pos_insert after insert on demandas
  for each row execute function fn_demanda_pos_insert();

-- Auditoria de edições comuns (transições são logadas pelas RPCs)
create or replace function fn_auditar_demanda_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status then
    insert into eventos (tenant_id, objeto_tipo, objeto_id, tipo, autor_id, dados)
    values (new.tenant_id, 'demanda', new.id, 'edicao', current_pessoa_id(),
            jsonb_build_object('campos_alterados', (
              select jsonb_agg(key) from jsonb_each(to_jsonb(new))
              where to_jsonb(new)->key is distinct from to_jsonb(old)->key
                and key not in ('atualizado_em','updated_by'))));
  end if;
  return new;
end $$;
create trigger trg_auditar_demanda_update after update on demandas
  for each row execute function fn_auditar_demanda_update();

-- ---------- RPCs — CICLO DE VIDA (Fluxo 1) ----------

create or replace function fn_obter_demanda(p_id uuid)
returns demandas language plpgsql stable security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  select * into d from demandas where id = p_id and tenant_id = current_tenant_id();
  if d.id is null then raise exception 'Demanda não encontrada.'; end if;
  return d;
end $$;

create or replace function iniciar_demanda(p_id uuid)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.status <> 'aberta' then raise exception 'Só demandas Abertas podem ser iniciadas.'; end if;
  perform set_config('app.bypass_guard','on', true);
  update demandas set status = 'em_execucao', iniciada_em = now() where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'transicao', jsonb_build_object('de','aberta','para','em_execucao'));
  select * into d from demandas where id = p_id; return d;
end $$;

create or replace function bloquear_demanda(
  p_id uuid, p_causa causa_bloqueio, p_descricao text,
  p_previsao date default null, p_pedir_ajuda boolean default false)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.status not in ('aberta','em_execucao') then
    raise exception 'Só demandas Abertas ou Em Execução podem ser bloqueadas.';
  end if;
  if coalesce(trim(p_descricao),'') = '' then
    raise exception 'Descreva o bloqueio — a causa alimenta o indicador de gargalos.';
  end if;
  insert into demanda_bloqueios (demanda_id, causa, descricao, previsao_desbloqueio, pedir_ajuda, criado_por)
  values (p_id, p_causa, p_descricao, p_previsao, p_pedir_ajuda, current_pessoa_id());
  perform set_config('app.bypass_guard','on', true);
  update demandas set status = 'bloqueada' where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'bloqueio',
    jsonb_build_object('causa', p_causa, 'descricao', p_descricao,
                       'previsao', p_previsao, 'pedir_ajuda', p_pedir_ajuda));
  select * into d from demandas where id = p_id; return d;
end $$;

create or replace function desbloquear_demanda(p_id uuid)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype; v_horas numeric;
begin
  d := fn_obter_demanda(p_id);
  if d.status <> 'bloqueada' then raise exception 'A demanda não está bloqueada.'; end if;
  update demanda_bloqueios set fim = now()
   where demanda_id = p_id and fim is null;
  select round(extract(epoch from now() - inicio)/3600, 1) into v_horas
    from demanda_bloqueios where demanda_id = p_id order by inicio desc limit 1;
  perform set_config('app.bypass_guard','on', true);
  update demandas set status = 'em_execucao' where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'desbloqueio', jsonb_build_object('duracao_horas', v_horas));
  select * into d from demandas where id = p_id; return d;
end $$;

create or replace function enviar_para_validacao(p_id uuid)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if not d.exige_validacao then raise exception 'Esta demanda não exige validação — conclua diretamente.'; end if;
  if d.status <> 'em_execucao' then raise exception 'Só demandas Em Execução vão para validação.'; end if;
  perform set_config('app.bypass_guard','on', true);
  update demandas set status = 'em_validacao' where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'transicao', jsonb_build_object('de','em_execucao','para','em_validacao'));
  select * into d from demandas where id = p_id; return d;
end $$;

-- Conclusão interna: motivo SEMPRE calculado (nunca escolhido) + fecho automático da ocorrência
create or replace function fn_concluir_interna(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype; v_motivo motivo_conclusao;
begin
  select * into d from demandas where id = p_id;
  v_motivo := case
    when current_date < d.prazo then 'antecipada'
    when current_date = d.prazo then 'no_prazo'
    else 'com_atraso' end;
  perform set_config('app.bypass_guard','on', true);
  update demandas
     set status = 'concluida', concluida_em = now(), motivo_conclusao = v_motivo,
         iniciada_em = coalesce(iniciada_em, now())
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'conclusao', jsonb_build_object('motivo', v_motivo));
  if d.ocorrencia_id is not null then perform fn_verificar_ocorrencia(d.ocorrencia_id); end if;
end $$;

create or replace function concluir_demanda(p_id uuid, p_confirmar_pendencias boolean default false)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype; v_pendentes int;
begin
  d := fn_obter_demanda(p_id);
  if d.status not in ('aberta','em_execucao') then
    raise exception 'Demanda em %s não pode ser concluída diretamente.', d.status;
  end if;
  if d.exige_validacao then
    raise exception 'Esta demanda exige validação — use "Enviar para validação".';
  end if;
  select count(*) into v_pendentes from demanda_checklist
   where demanda_id = p_id and archived_at is null and not feito;
  if v_pendentes > 0 and not p_confirmar_pendencias then
    raise exception 'Checklist com % item(ns) pendente(s). Confirme a conclusão com pendências.', v_pendentes;
  end if;
  if v_pendentes > 0 then
    perform fn_evento_demanda(d, 'conclusao_com_pendencias', jsonb_build_object('itens_pendentes', v_pendentes));
  end if;
  perform fn_concluir_interna(p_id);
  select * into d from demandas where id = p_id; return d;
end $$;

create or replace function validar_demanda(p_id uuid, p_aprovada boolean, p_motivo text default null)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype; v_validador uuid;
begin
  d := fn_obter_demanda(p_id);
  if d.status <> 'em_validacao' then raise exception 'A demanda não está Em Validação.'; end if;
  v_validador := coalesce(d.validador_id, d.criador_id);
  if current_pessoa_id() <> v_validador and not fn_atual_e_gestor() then
    raise exception 'Somente o validador designado (ou um gestor) pode validar.';
  end if;
  if p_aprovada then
    perform fn_evento_demanda(d, 'validacao_aprovada', '{}'::jsonb);
    perform fn_concluir_interna(p_id);
  else
    if coalesce(trim(p_motivo),'') = '' then
      raise exception 'Reprovação exige motivo — ele alimenta o indicador de retrabalho.';
    end if;
    perform set_config('app.bypass_guard','on', true);
    update demandas set status = 'em_execucao', retrabalho = retrabalho + 1 where id = p_id;
    perform set_config('app.bypass_guard','off', true);
    perform fn_evento_demanda(d, 'validacao_reprovada', jsonb_build_object('motivo', p_motivo));
  end if;
  select * into d from demandas where id = p_id; return d;
end $$;

create or replace function encerrar_demanda(
  p_id uuid, p_motivo motivo_encerramento, p_justificativa text, p_original uuid default null)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.status in ('concluida','encerrada') then raise exception 'Demanda já finalizada.'; end if;
  if coalesce(trim(p_justificativa),'') = '' then raise exception 'Encerramento exige justificativa (ADR-09).'; end if;
  if p_motivo = 'duplicada' and p_original is null then
    raise exception 'Encerramento como duplicada exige apontar a demanda original.';
  end if;
  if d.criador_id <> current_pessoa_id() and d.responsavel_id <> current_pessoa_id()
     and not fn_atual_e_gestor() then
    raise exception 'Somente criador, responsável ou gestor podem encerrar.';
  end if;
  perform set_config('app.bypass_guard','on', true);
  update demandas
     set status = 'encerrada', concluida_em = now(),
         motivo_encerramento = p_motivo, justificativa_encerramento = p_justificativa,
         demanda_original_id = p_original
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'encerramento',
    jsonb_build_object('motivo', p_motivo, 'justificativa', p_justificativa, 'original', p_original));
  if d.ocorrencia_id is not null then perform fn_verificar_ocorrencia(d.ocorrencia_id); end if;
  select * into d from demandas where id = p_id; return d;
end $$;

create or replace function reabrir_demanda(p_id uuid, p_justificativa text, p_novo_prazo date)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if d.status not in ('concluida','encerrada') then raise exception 'Só demandas finalizadas podem ser reabertas.'; end if;
  if coalesce(trim(p_justificativa),'') = '' then raise exception 'Reabertura exige justificativa.'; end if;
  if d.criador_id <> current_pessoa_id() and not fn_atual_e_gestor() then
    raise exception 'Somente criador ou gestor podem reabrir.';
  end if;
  perform set_config('app.bypass_guard','on', true);
  update demandas
     set status = 'aberta', concluida_em = null, motivo_conclusao = null,
         motivo_encerramento = null, justificativa_encerramento = null, prazo = p_novo_prazo
   where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'reabertura',
    jsonb_build_object('justificativa', p_justificativa, 'novo_prazo', p_novo_prazo));
  select * into d from demandas where id = p_id; return d;
end $$;

-- Fluxo 3: delegação atômica (ADR-08)
create or replace function delegar_demanda(p_id uuid, p_novo_responsavel uuid, p_mensagem text default null)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype; v_quem uuid := current_pessoa_id();
begin
  d := fn_obter_demanda(p_id);
  if d.status in ('concluida','encerrada') then raise exception 'Demanda finalizada não pode ser delegada.'; end if;
  if d.responsavel_id <> v_quem and not fn_atual_e_gestor() then
    raise exception 'Somente o responsável atual ou um gestor podem delegar.';
  end if;
  update demandas set responsavel_id = p_novo_responsavel where id = p_id;
  insert into demanda_observadores (demanda_id, pessoa_id, origem)
  values (p_id, v_quem, 'delegacao') on conflict do nothing;
  perform fn_evento_demanda(d, 'delegacao',
    jsonb_build_object('de', d.responsavel_id, 'para', p_novo_responsavel, 'mensagem', p_mensagem));
  select * into d from demandas where id = p_id; return d;
end $$;

-- Fluxo 10: apontamento de tempo
create or replace function apontar_tempo(p_id uuid, p_horas numeric, p_data date, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  insert into demanda_tempos (demanda_id, pessoa_id, horas, data, comentario)
  values (p_id, current_pessoa_id(), p_horas, p_data, p_comentario);
  perform fn_evento_demanda(d, 'tempo_apontado', jsonb_build_object('horas', p_horas, 'data', p_data));
end $$;

-- ---------- OCORRÊNCIA: geração e conclusão com vida real ----------

-- Conclusão interna da ocorrência com Resumo da Execução REAL (§4)
create or replace function fn_concluir_ocorrencia_interna(p_ocorrencia_id uuid, p_auto boolean)
returns void language plpgsql security definer set search_path = public as $$
declare o ocorrencias%rowtype; v_resumo jsonb; v_anterior ocorrencias%rowtype;
        v_total int; v_no_prazo int; v_antecipadas int; v_atraso int; v_encerradas int;
        v_retrabalho int; v_horas numeric; v_estimado numeric;
begin
  select * into o from ocorrencias where id = p_ocorrencia_id;
  if o.status <> 'em_andamento' then return; end if;

  select count(*),
         count(*) filter (where motivo_conclusao = 'no_prazo'),
         count(*) filter (where motivo_conclusao = 'antecipada'),
         count(*) filter (where motivo_conclusao = 'com_atraso'),
         count(*) filter (where status = 'encerrada'),
         coalesce(sum(retrabalho), 0),
         coalesce(sum(tempo_estimado_h), 0)
    into v_total, v_no_prazo, v_antecipadas, v_atraso, v_encerradas, v_retrabalho, v_estimado
    from demandas where ocorrencia_id = p_ocorrencia_id;

  select coalesce(sum(t.horas), 0) into v_horas
    from demanda_tempos t join demandas d on d.id = t.demanda_id
   where d.ocorrencia_id = p_ocorrencia_id;

  select * into v_anterior from ocorrencias
   where processo_id = o.processo_id and competencia < o.competencia
     and status in ('concluida','concluida_pendencias')
   order by competencia desc limit 1;

  v_resumo := jsonb_build_object(
    'competencia', o.competencia,
    'versao_processo', o.versao_processo,
    'conclusao_automatica', p_auto,
    'duracao_dias', extract(day from now() - o.criada_em),
    'demandas', jsonb_build_object(
      'total', v_total, 'no_prazo', v_no_prazo, 'antecipadas', v_antecipadas,
      'com_atraso', v_atraso, 'encerradas_sem_execucao', v_encerradas),
    'retrabalho_total', v_retrabalho,
    'horas', jsonb_build_object('apontadas', v_horas, 'estimadas', v_estimado),
    'bloqueios', (
      select coalesce(jsonb_agg(jsonb_build_object('causa', s.causa, 'quantidade', s.n, 'horas', s.h)), '[]'::jsonb)
      from (select b.causa::text as causa, count(*) as n,
                   round(sum(extract(epoch from coalesce(b.fim, now()) - b.inicio))/3600, 1) as h
              from demanda_bloqueios b join demandas d on d.id = b.demanda_id
             where d.ocorrencia_id = p_ocorrencia_id group by b.causa) s),
    'comparacao_anterior', case when v_anterior.id is null then null else jsonb_build_object(
      'competencia', v_anterior.competencia,
      'duracao_dias', extract(day from v_anterior.concluida_em - v_anterior.criada_em),
      'resumo', v_anterior.resumo_execucao -> 'demandas') end);

  update ocorrencias
     set status = case when v_encerradas > 0 then 'concluida_pendencias'::status_ocorrencia
                       else 'concluida'::status_ocorrencia end,
         concluida_em = now(), resumo_execucao = v_resumo, updated_by = current_pessoa_id()
   where id = p_ocorrencia_id;
end $$;

-- Fecho automático: última demanda fechou → ocorrência conclui sozinha (§4)
create or replace function fn_verificar_ocorrencia(p_ocorrencia_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from demandas
                 where ocorrencia_id = p_ocorrencia_id
                   and status not in ('concluida','encerrada')) then
    perform fn_concluir_ocorrencia_interna(p_ocorrencia_id, true);
  end if;
end $$;

-- Substitui a RPC pública da Sprint 01 (mesma assinatura)
create or replace function concluir_ocorrencia(p_ocorrencia_id uuid)
returns ocorrencias language plpgsql security definer set search_path = public as $$
declare o ocorrencias%rowtype;
begin
  select o2.* into o from ocorrencias o2
    join processos p on p.id = o2.processo_id
   where o2.id = p_ocorrencia_id and p.tenant_id = current_tenant_id();
  if o.id is null then raise exception 'Ocorrência não encontrada.'; end if;
  if o.status <> 'em_andamento' then raise exception 'Ocorrência já finalizada.'; end if;
  perform fn_concluir_ocorrencia_interna(p_ocorrencia_id, false);
  select * into o from ocorrencias where id = p_ocorrencia_id; return o;
end $$;

-- gerar_ocorrencia agora CRIA AS DEMANDAS da recorrência (RN-03/04/05)
create or replace function gerar_ocorrencia(p_id uuid, p_competencia text)
returns ocorrencias language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; o ocorrencias%rowtype; r record; v_resp uuid; v_dem uuid;
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

  for r in select * from processo_recorrencia
            where processo_id = p_id and archived_at is null order by ordem
  loop
    -- RN-04: responsável padrão indisponível → dono do processo
    select pe.id into v_resp from pessoas pe
     where pe.id = r.responsavel_padrao_id and pe.ativa;
    v_resp := coalesce(v_resp, p.dono_id);

    insert into demandas (tenant_id, area_id, titulo, tipo, processo_id, ocorrencia_id,
                          recorrencia_id, criador_id, responsavel_id, validador_id,
                          exige_validacao, prazo, objetivo_negocio)
    values (p.tenant_id, p.area_id,
            r.titulo_modelo || ' — ' || p_competencia,
            'rotina', p_id, o.id, r.id,
            coalesce(current_pessoa_id(), p.dono_id), v_resp, p.dono_id,
            r.exige_validacao,
            fn_add_dias_uteis(current_date, coalesce(r.dia_util_gatilho, 1) + r.prazo_dias),
            p.nome)
    returning id into v_dem;

    -- Herança do checklist-modelo do Como Executar (RN-03)
    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_dem, a.ordem, a.titulo
      from processo_artefatos a
     where a.processo_id = p_id and a.tipo = 'checklist_item' and a.archived_at is null;

    -- Dono do processo acompanha (observador)
    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (v_dem, p.dono_id, 'dono_processo') on conflict do nothing;
  end loop;

  return o;
end $$;

grant execute on function iniciar_demanda, bloquear_demanda, desbloquear_demanda,
  enviar_para_validacao, concluir_demanda, validar_demanda, encerrar_demanda,
  reabrir_demanda, delegar_demanda, apontar_tempo, fn_pode_editar_demanda,
  fn_atual_e_gestor, fn_add_dias_uteis to authenticated;

-- ---------- RLS ----------
alter table demandas enable row level security;
alter table demanda_observadores enable row level security;
alter table demanda_checklist enable row level security;
alter table demanda_comentarios enable row level security;
alter table demanda_bloqueios enable row level security;
alter table demanda_tempos enable row level security;
alter table demanda_favoritos enable row level security;

-- Leitura ≠ edição (decisão validada): todo o tenant lê; só responsável/criador/gestor edita
create policy sel_demandas on demandas for select
  using (tenant_id = current_tenant_id());
create policy ins_demandas on demandas for insert
  with check (tenant_id = current_tenant_id() and criador_id = current_pessoa_id());
create policy upd_demandas on demandas for update
  using (fn_pode_editar_demanda(id))
  with check (tenant_id = current_tenant_id());

create policy sel_obs on demanda_observadores for select
  using (exists (select 1 from demandas d where d.id = demanda_id and d.tenant_id = current_tenant_id()));
create policy ins_obs on demanda_observadores for insert
  with check (fn_pode_editar_demanda(demanda_id));
create policy del_obs on demanda_observadores for delete
  using (fn_pode_editar_demanda(demanda_id) or pessoa_id = current_pessoa_id());

create policy sel_check on demanda_checklist for select
  using (exists (select 1 from demandas d where d.id = demanda_id and d.tenant_id = current_tenant_id()));
create policy ins_check on demanda_checklist for insert
  with check (fn_pode_editar_demanda(demanda_id));
create policy upd_check on demanda_checklist for update
  using (fn_pode_editar_demanda(demanda_id));

create policy sel_coment on demanda_comentarios for select
  using (exists (select 1 from demandas d where d.id = demanda_id and d.tenant_id = current_tenant_id()));
create policy ins_coment on demanda_comentarios for insert
  with check (autor_id = current_pessoa_id()
              and exists (select 1 from demandas d where d.id = demanda_id and d.tenant_id = current_tenant_id()));

create policy sel_bloq on demanda_bloqueios for select
  using (exists (select 1 from demandas d where d.id = demanda_id and d.tenant_id = current_tenant_id()));
-- inserts de bloqueio só via RPC (security definer)

create policy sel_tempos on demanda_tempos for select
  using (exists (select 1 from demandas d where d.id = demanda_id and d.tenant_id = current_tenant_id()));
-- inserts de tempo só via RPC

create policy all_fav on demanda_favoritos
  using (pessoa_id = current_pessoa_id())
  with check (pessoa_id = current_pessoa_id()
              and exists (select 1 from demandas d where d.id = demanda_id and d.tenant_id = current_tenant_id()));

-- ---------- BI ----------
create or replace view bi.vw_demandas as
  select d.id, t.nome as empresa, a.nome as area, d.titulo, d.tipo::text as tipo,
         d.status::text as status, d.prioridade::text as prioridade, d.valor::text as valor,
         d.complexidade::text as complexidade,
         pr.nome as processo, o.competencia,
         resp.nome as responsavel, cri.nome as criador,
         d.prazo, d.iniciada_em, d.concluida_em,
         d.motivo_conclusao::text as motivo_conclusao,
         d.motivo_encerramento::text as motivo_encerramento,
         d.retrabalho, d.tempo_estimado_h,
         (select coalesce(sum(horas),0) from demanda_tempos t2 where t2.demanda_id = d.id) as horas_apontadas,
         d.criado_em
  from demandas d
  join tenants t on t.id = d.tenant_id
  join areas a on a.id = d.area_id
  join pessoas resp on resp.id = d.responsavel_id
  join pessoas cri on cri.id = d.criador_id
  left join processos pr on pr.id = d.processo_id
  left join ocorrencias o on o.id = d.ocorrencia_id;

create or replace view bi.vw_bloqueios as
  select b.id, d.titulo as demanda, pr.nome as processo, b.causa::text as causa,
         b.descricao, b.pedir_ajuda, b.inicio, b.fim,
         round(extract(epoch from coalesce(b.fim, now()) - b.inicio)/3600, 1) as duracao_horas
  from demanda_bloqueios b
  join demandas d on d.id = b.demanda_id
  left join processos pr on pr.id = d.processo_id;

grant select on all tables in schema bi to authenticated;

-- Endurecimento herdado da verificação da Sprint 01
revoke execute on function fn_checar_rn01(uuid) from anon;
