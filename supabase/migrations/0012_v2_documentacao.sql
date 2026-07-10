-- ============================================================
-- Migration 0012 — V2: documentação da execução (Sprint 16)
-- Anexos na conclusão · obrigatoriedade por demanda-modelo · prazo/peso só gestor
-- ============================================================

-- ---------- 1. ANEXOS DA DEMANDA ----------
alter table demandas add column anexo_obrigatorio boolean not null default false;
alter table processo_recorrencia add column anexo_obrigatorio boolean not null default false;

create table demanda_anexos (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demandas(id) on delete cascade,
  nome text not null,
  storage_path text not null,
  tamanho_bytes bigint,
  criado_por uuid references pessoas(id),
  criado_em timestamptz not null default now()
);
create index idx_anexos_demanda on demanda_anexos(demanda_id);

alter table demanda_anexos enable row level security;
create policy sel_anexos on demanda_anexos for select
  using (exists (select 1 from demandas d where d.id = demanda_id and d.tenant_id = current_tenant_id()));
create policy ins_anexos on demanda_anexos for insert
  with check (criado_por = current_pessoa_id() and fn_pode_editar_demanda(demanda_id));
create policy del_anexos on demanda_anexos for delete
  using (criado_por = current_pessoa_id() or fn_atual_e_gestor());

-- Bucket privado no Storage
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

create policy anexos_storage_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos');
create policy anexos_storage_sel on storage.objects for select to authenticated
  using (bucket_id = 'anexos');
create policy anexos_storage_del on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and owner = auth.uid());

-- ---------- 2. CONCLUSÃO EXIGE ANEXO (quando configurado) ----------
create or replace function fn_checar_anexo(p_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  select * into d from demandas where id = p_id;
  if d.anexo_obrigatorio
     and not exists (select 1 from demanda_anexos a where a.demanda_id = p_id) then
    raise exception 'Esta demanda exige anexo de documentação antes de concluir — anexe o resultado na aba Anexos.';
  end if;
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
  perform fn_checar_anexo(p_id);
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

-- Enviar para validação também exige a documentação (valida-se algo documentado)
create or replace function enviar_para_validacao(p_id uuid)
returns demandas language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype;
begin
  d := fn_obter_demanda(p_id);
  if not d.exige_validacao then raise exception 'Esta demanda não exige validação — conclua diretamente.'; end if;
  if d.status <> 'em_execucao' then raise exception 'Só demandas Em Execução vão para validação.'; end if;
  perform fn_checar_anexo(p_id);
  perform set_config('app.bypass_guard','on', true);
  update demandas set status = 'em_validacao' where id = p_id;
  perform set_config('app.bypass_guard','off', true);
  perform fn_evento_demanda(d, 'transicao', jsonb_build_object('de','em_execucao','para','em_validacao'));
  select * into d from demandas where id = p_id; return d;
end $$;

-- ---------- 3. HERANÇA DA OBRIGATORIEDADE (processo → demanda) ----------
create or replace function gerar_ocorrencia(p_id uuid, p_competencia text)
returns ocorrencias language plpgsql security definer set search_path = public as $$
declare p processos%rowtype; o ocorrencias%rowtype; r record; v_resp uuid; v_dem uuid; v_prazo date;
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

  perform set_config('app.bypass_guard','on', true);
  for r in select * from processo_recorrencia
            where processo_id = p_id and archived_at is null order by ordem
  loop
    select pe.id into v_resp from pessoas pe
     where pe.id = r.responsavel_padrao_id and pe.ativa;
    v_resp := coalesce(v_resp, p.dono_id);

    v_prazo := case
      when r.prazo is not null then greatest(fn_avancar_recorrencia(r.prazo, r.recorrencia), current_date)
      else fn_add_dias_uteis(current_date, coalesce(r.dia_util_gatilho, 1) + r.prazo_dias) end;

    insert into demandas (tenant_id, area_id, titulo, descricao, tipo, prioridade, valor,
                          complexidade, objetivo_negocio, tempo_estimado_h, peso, recorrencia,
                          anexo_obrigatorio,
                          processo_id, ocorrencia_id, recorrencia_id,
                          criador_id, responsavel_id, validador_id, exige_validacao, prazo)
    values (p.tenant_id, p.area_id,
            r.titulo_modelo || ' — ' || p_competencia,
            r.descricao, r.tipo, r.prioridade, r.valor,
            r.complexidade, coalesce(r.objetivo_negocio, p.nome), r.tempo_estimado_h, r.peso,
            r.recorrencia, r.anexo_obrigatorio,
            p_id, o.id, r.id,
            coalesce(current_pessoa_id(), p.dono_id), v_resp, p.dono_id,
            r.exige_validacao, v_prazo)
    returning id into v_dem;

    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_dem, a.ordem, a.titulo
      from processo_artefatos a
     where a.processo_id = p_id and a.tipo = 'checklist_item' and a.archived_at is null;

    insert into demanda_observadores (demanda_id, pessoa_id, origem)
    values (v_dem, p.dono_id, 'dono_processo') on conflict do nothing;
  end loop;
  perform set_config('app.bypass_guard','off', true);

  return o;
end $$;

-- Recorrência da demanda também propaga a obrigatoriedade
create or replace function fn_concluir_interna(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d demandas%rowtype; v_motivo motivo_conclusao; v_prazo date; v_nova uuid;
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

  if d.recorrencia is not null then
    v_prazo := case d.recorrencia
      when 'diaria'  then fn_add_dias_uteis(greatest(d.prazo, current_date), 1)
      when 'semanal' then greatest(d.prazo, current_date) + 7
      when 'mensal'  then (greatest(d.prazo, current_date) + interval '1 month')::date
      else                (greatest(d.prazo, current_date) + interval '1 year')::date end;

    perform set_config('app.bypass_guard','on', true);
    insert into demandas (tenant_id, area_id, titulo, descricao, tipo, prioridade, valor,
                          complexidade, objetivo_negocio, processo_id, criador_id,
                          responsavel_id, validador_id, exige_validacao, status, prazo,
                          tempo_estimado_h, peso, recorrencia, anexo_obrigatorio)
    values (d.tenant_id, d.area_id, d.titulo, d.descricao, d.tipo, d.prioridade, d.valor,
            d.complexidade, d.objetivo_negocio, d.processo_id, d.criador_id,
            d.responsavel_id, d.validador_id, d.exige_validacao, 'aberta', v_prazo,
            d.tempo_estimado_h, d.peso, d.recorrencia, d.anexo_obrigatorio)
    returning id into v_nova;
    perform set_config('app.bypass_guard','off', true);

    insert into demanda_checklist (demanda_id, ordem, texto)
    select v_nova, ordem, texto from demanda_checklist
     where demanda_id = d.id and archived_at is null;

    perform fn_evento_demanda(d, 'recorrencia_gerada',
      jsonb_build_object('proxima', v_nova, 'prazo', v_prazo));
  end if;
end $$;

-- ---------- 4. PRAZO E PESO: ajuste é decisão de gestor/admin ----------
create or replace function fn_guard_demandas()
returns trigger language plpgsql as $$
begin
  if (new.status is distinct from old.status
      or new.motivo_conclusao is distinct from old.motivo_conclusao
      or new.motivo_encerramento is distinct from old.motivo_encerramento
      or new.retrabalho is distinct from old.retrabalho
      or new.iniciada_em is distinct from old.iniciada_em
      or new.concluida_em is distinct from old.concluida_em
      or new.archived_at is distinct from old.archived_at
      or new.devolvida is distinct from old.devolvida
      or new.comentario_devolucao is distinct from old.comentario_devolucao
      or new.motivo_rejeicao is distinct from old.motivo_rejeicao
      or new.avaliacao_nota is distinct from old.avaliacao_nota
      or new.avaliacao_comentario is distinct from old.avaliacao_comentario
      or new.avaliada_por is distinct from old.avaliada_por
      or new.avaliada_em is distinct from old.avaliada_em)
     and coalesce(current_setting('app.bypass_guard', true), 'off') <> 'on' then
    raise exception 'Status, desfechos e avaliação da demanda mudam apenas pelas funções oficiais.';
  end if;
  if (new.prazo is distinct from old.prazo or new.peso is distinct from old.peso)
     and coalesce(current_setting('app.bypass_guard', true), 'off') <> 'on'
     and not fn_atual_e_gestor() then
    raise exception 'Ajuste de prazo e peso é decisão de gestor/admin.';
  end if;
  new.atualizado_em := now();
  new.updated_by := coalesce(current_pessoa_id(), new.updated_by);
  return new;
end $$;

grant execute on function fn_checar_anexo to authenticated;
