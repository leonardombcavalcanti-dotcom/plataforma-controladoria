// Import/Export de Processos em Excel — visualização e preenchimento em lote.
// Exporta 3 abas (Processos, Recorrencia, ComoExecutar); importa o mesmo formato.
// Importados nascem Rascunho/Em Construção — a ATIVAÇÃO continua sendo decisão de gestor.
import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAreas, usePessoaAtual, usePessoas, chaves } from '../../data/queries';
import * as api from '../../data/api';
import { PERIODICIDADE } from '../../domain/regras';
import type { Periodicidade, Processo } from '../../domain/tipos';
import { useUi } from '../../store/ui';

const PERIODICIDADE_INVERSA: Record<string, Periodicidade> = Object.fromEntries(
  Object.entries(PERIODICIDADE).map(([k, v]) => [v.toLowerCase(), k as Periodicidade]),
);

export function BarraExcel(props: { processos: Processo[] }) {
  const toast = useUi((s) => s.toast);
  const qc = useQueryClient();
  const { data: pessoas } = usePessoas();
  const { data: areas } = useAreas();
  const { data: eu } = usePessoaAtual();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);

  const nomeDe = (id: string | null | undefined) =>
    (pessoas ?? []).find((p) => p.id === id)?.nome ?? '';
  const areaDe = (id: string) => (areas ?? []).find((a) => a.id === id)?.nome ?? '';

  // ---------- EXPORTAR ----------
  async function exportar() {
    setOcupado(true);
    try {
      const ids = props.processos.map((p) => p.id);
      const [{ data: arts }, { data: recs }] = await Promise.all([
        supabase.from('processo_artefatos').select('*').in('processo_id', ids).is('archived_at', null).order('ordem'),
        supabase.from('processo_recorrencia').select('*').in('processo_id', ids).is('archived_at', null).order('ordem'),
      ]);
      const nomeProc = new Map(props.processos.map((p) => [p.id, p.nome]));

      const abaProcessos = props.processos.map((p) => ({
        'Nome': p.nome,
        'Objetivo': p.objetivo,
        'Descrição': p.descricao ?? '',
        'Área': areaDe(p.area_id),
        'Periodicidade': PERIODICIDADE[p.periodicidade],
        'Dono': nomeDe(p.dono_id),
        'Substituto': nomeDe(p.substituto_id),
        'Status': p.status,
        'Versão': p.versao,
        'Entradas': p.entradas.join('; '),
        'Saídas': p.saidas.join('; '),
        'Critério de início': p.criterio_inicio ?? '',
        'Critério de encerramento': p.criterio_encerramento ?? '',
        'Última revisão': p.ultima_revisao ?? '',
      }));
      const abaRecorrencia = (recs ?? []).map((r) => ({
        'Processo': nomeProc.get(r.processo_id) ?? '',
        'Título-modelo': r.titulo_modelo,
        'Descrição': r.descricao ?? '',
        'Responsável padrão': nomeDe(r.responsavel_padrao_id),
        'Prazo (AAAA-MM-DD)': r.prazo ?? '',
        'Recorrência': r.recorrencia ?? '',
        'Tipo': r.tipo ?? 'rotina',
        'Prioridade': r.prioridade ?? 'media',
        'Valor': r.valor ?? 'medio',
        'Complexidade': r.complexidade ?? '',
        'Peso (1-10)': r.peso ?? '',
        'Tempo estimado (h)': r.tempo_estimado_h ?? '',
        'Exige validação': r.exige_validacao ? 'Sim' : 'Não',
      }));
      const abaExecutar = (arts ?? []).map((a) => ({
        'Processo': nomeProc.get(a.processo_id) ?? '',
        'Tipo': a.tipo,
        'Título': a.titulo,
        'Conteúdo': a.conteudo ?? '',
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(abaProcessos), 'Processos');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(abaRecorrencia), 'Recorrencia');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(abaExecutar), 'ComoExecutar');
      XLSX.writeFile(wb, `processos-controladoria-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast('Excel exportado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível exportar.', 'erro');
    } finally {
      setOcupado(false);
    }
  }

  // ---------- MODELO ----------
  function baixarModelo() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      'Nome': 'Conciliação de Cartões', 'Objetivo': 'Garantir a conciliação das operadoras de cartão.',
      'Descrição': '', 'Área': 'Controladoria', 'Periodicidade': 'Mensal',
      'Dono': 'Leonardo', 'Substituto': '', 'Entradas': 'Extratos das operadoras; Razão',
      'Saídas': 'Conciliação assinada', 'Critério de início': '', 'Critério de encerramento': '',
    }]), 'Processos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      'Processo': 'Conciliação de Cartões', 'Título-modelo': 'Conciliar operadora X',
      'Responsável padrão': 'Leonardo', 'Prazo (AAAA-MM-DD)': '2026-08-05', 'Recorrência': 'mensal', 'Exige validação': 'Não',
    }]), 'Recorrencia');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      'Processo': 'Conciliação de Cartões', 'Tipo': 'checklist_item',
      'Título': 'Extratos importados', 'Conteúdo': '',
    }]), 'ComoExecutar');
    XLSX.writeFile(wb, 'modelo-processos.xlsx');
  }

  // ---------- IMPORTAR ----------
  async function importar(arquivo: File) {
    if (!eu) return;
    setOcupado(true);
    let criados = 0; let ignorados = 0; const erros: string[] = [];
    try {
      const wb = XLSX.read(await arquivo.arrayBuffer());
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Processos'] ?? {});
      const recs = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Recorrencia'] ?? {});
      const arts = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['ComoExecutar'] ?? {});
      if (linhas.length === 0) throw new Error('Aba "Processos" vazia ou ausente — use o modelo.');

      const existentes = new Set(props.processos.map((p) => p.nome.trim().toLowerCase()));
      const acharPessoa = (nome: unknown) =>
        (pessoas ?? []).find((p) => p.nome.trim().toLowerCase() === String(nome ?? '').trim().toLowerCase())?.id ?? null;
      const acharArea = (nome: unknown) =>
        (areas ?? []).find((a) => a.nome.trim().toLowerCase() === String(nome ?? '').trim().toLowerCase())?.id
        ?? eu.area_id ?? (areas ?? [])[0]?.id ?? '';

      for (const l of linhas) {
        const nome = String(l['Nome'] ?? '').trim();
        if (!nome) continue;
        if (existentes.has(nome.toLowerCase())) { ignorados++; continue; }
        const objetivo = String(l['Objetivo'] ?? '').trim();
        if (!objetivo) { erros.push(`${nome}: sem objetivo`); continue; }
        const periodicidade =
          PERIODICIDADE_INVERSA[String(l['Periodicidade'] ?? 'mensal').trim().toLowerCase()] ?? 'mensal';
        try {
          const novo = await api.criarProcesso({
            nome, objetivo,
            periodicidade,
            area_id: acharArea(l['Área']),
            dono_id: acharPessoa(l['Dono']) ?? eu.id,
            tenant_id: eu.tenant_id,
          });
          await api.salvarProcesso(novo.id, {
            descricao: String(l['Descrição'] ?? '').trim() || null,
            substituto_id: acharPessoa(l['Substituto']),
            entradas: String(l['Entradas'] ?? '').split(';').map((s) => s.trim()).filter(Boolean),
            saidas: String(l['Saídas'] ?? '').split(';').map((s) => s.trim()).filter(Boolean),
            criterio_inicio: String(l['Critério de início'] ?? '').trim() || null,
            criterio_encerramento: String(l['Critério de encerramento'] ?? '').trim() || null,
          });
          const chave = nome.toLowerCase();
          let ordem = 0;
          for (const a of arts) {
            if (String(a['Processo'] ?? '').trim().toLowerCase() !== chave) continue;
            await api.criarArtefato({
              processo_id: novo.id,
              tipo: (String(a['Tipo'] ?? 'checklist_item').trim() || 'checklist_item') as never,
              ordem: ++ordem,
              titulo: String(a['Título'] ?? '').trim(),
              conteudo: String(a['Conteúdo'] ?? '').trim() || null,
              storage_path: null,
            });
          }
          let ordemR = 0;
          for (const r of recs) {
            if (String(r['Processo'] ?? '').trim().toLowerCase() !== chave) continue;
            await api.criarRecorrencia({
              processo_id: novo.id,
              titulo_modelo: String(r['Título-modelo'] ?? '').trim(),
              descricao: String(r['Descrição'] ?? '').trim() || null,
              responsavel_padrao_id: acharPessoa(r['Responsável padrão']),
              dia_util_gatilho: null,
              prazo_dias: 2,
              prazo: (() => {
                const v = r['Prazo (AAAA-MM-DD)'];
                if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
                const s = String(v ?? '').trim();
                return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
              })(),
              recorrencia: (['diaria','semanal','mensal','anual'].includes(String(r['Recorrência'] ?? '').trim().toLowerCase())
                ? String(r['Recorrência']).trim().toLowerCase() : null) as never,
              tipo: (String(r['Tipo'] ?? 'rotina').trim() || 'rotina') as never,
              prioridade: (String(r['Prioridade'] ?? 'media').trim() || 'media') as never,
              valor: (String(r['Valor'] ?? 'medio').trim() || 'medio') as never,
              complexidade: (String(r['Complexidade'] ?? '').trim() || null) as never,
              peso: Number(r['Peso (1-10)']) >= 1 ? Number(r['Peso (1-10)']) : null,
              tempo_estimado_h: Number(r['Tempo estimado (h)']) > 0 ? Number(r['Tempo estimado (h)']) : null,
              objetivo_negocio: null,
              exige_validacao: /^s/i.test(String(r['Exige validação'] ?? '')),
              ordem: ++ordemR,
            });
          }
          await api.rpcTransicionar(novo.id, 'em_construcao');
          criados++;
          existentes.add(chave);
        } catch (e) {
          erros.push(`${nome}: ${e instanceof Error ? e.message : 'erro'}`);
        }
      }
      void qc.invalidateQueries({ queryKey: chaves.processos });
      toast(`Importação: ${criados} criado(s), ${ignorados} já existente(s)` +
        (erros.length ? ` · ${erros.length} erro(s): ${erros[0]}` : '') +
        (criados ? ' — revise e envie para validação do gestor' : ''),
        erros.length ? 'erro' : 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Arquivo inválido — use o modelo.', 'erro');
    } finally {
      setOcupado(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="linha">
      <button className="btn mini" disabled={ocupado || props.processos.length === 0} onClick={() => void exportar()}>
        ⬇ Exportar Excel
      </button>
      <button className="btn mini" disabled={ocupado} onClick={() => inputRef.current?.click()}>
        ⬆ Importar Excel
      </button>
      <button className="btn mini" onClick={baixarModelo}>Baixar modelo</button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
             onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f); }} />
      {ocupado && <span className="mudo">Processando…</span>}
    </div>
  );
}
