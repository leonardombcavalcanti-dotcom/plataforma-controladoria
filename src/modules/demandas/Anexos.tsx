// Anexos da demanda — a documentação da execução (V2).
// Upload no Storage privado + registro auditável; obrigatório quando configurado.
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { usePessoaAtual } from '../../data/queries';
import { fmtDataHora } from '../../domain/regras';
import { Carregando, EstadoVazio } from '../../components/ui';
import { useUi } from '../../store/ui';

export interface Anexo {
  id: string; demanda_id: string; nome: string; storage_path: string;
  tamanho_bytes: number | null; criado_por: string | null; criado_em: string;
  autor?: { id: string; nome: string } | null;
}

export async function listarAnexos(demandaId: string): Promise<Anexo[]> {
  const { data, error } = await supabase
    .from('demanda_anexos')
    .select('*, autor:pessoas!demanda_anexos_criado_por_fkey(id,nome)')
    .eq('demanda_id', demandaId).order('criado_em', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Anexo[];
}

export const useAnexos = (demandaId: string) =>
  useQuery({ queryKey: ['anexos', demandaId], queryFn: () => listarAnexos(demandaId), enabled: !!demandaId });

const fmtTamanho = (b: number | null) =>
  b === null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export function AnexosDemanda(props: { demandaId: string; podeEditar: boolean; obrigatorio: boolean }) {
  const { demandaId } = props;
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data: eu } = usePessoaAtual();
  const { data: anexos, isLoading } = useAnexos(demandaId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const invalidar = () => void qc.invalidateQueries({ queryKey: ['anexos', demandaId] });

  async function enviar(arquivo: File) {
    if (!eu) return;
    if (arquivo.size > 20 * 1048576) {
      toast('Arquivo acima de 20 MB — compacte antes de anexar.', 'erro');
      return;
    }
    setEnviando(true);
    try {
      // O Storage não aceita acentos/caracteres especiais na chave — o nome
      // original fica no registro (exibição); o caminho técnico é sanitizado.
      const nomeSeguro = arquivo.name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const caminho = `${demandaId}/${crypto.randomUUID()}-${nomeSeguro}`;
      const { error: e1 } = await supabase.storage.from('anexos').upload(caminho, arquivo);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase.from('demanda_anexos').insert({
        demanda_id: demandaId, nome: arquivo.name, storage_path: caminho,
        tamanho_bytes: arquivo.size, criado_por: eu.id,
      });
      if (e2) throw new Error(e2.message);
      invalidar();
      toast('Anexo adicionado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível anexar.', 'erro');
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function baixar(a: Anexo) {
    const { data, error } = await supabase.storage.from('anexos').createSignedUrl(a.storage_path, 3600);
    if (error || !data) { toast('Não foi possível gerar o link do arquivo.', 'erro'); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function remover(a: Anexo) {
    const { error } = await supabase.from('demanda_anexos').delete().eq('id', a.id);
    if (error) { toast(error.message, 'erro'); return; }
    await supabase.storage.from('anexos').remove([a.storage_path]);
    invalidar();
    toast('Anexo removido', 'ok');
  }

  if (isLoading) return <Carregando linhas={2} />;

  return (
    <div className="secao">
      {props.obrigatorio && (anexos ?? []).length === 0 && (
        <p className="check-risco" style={{ marginBottom: 10 }}>
          📎 Esta demanda exige anexo de documentação para ser concluída.
        </p>
      )}
      {(anexos ?? []).length === 0 ? (
        <EstadoVazio titulo="Nenhum documento anexado.">
          Anexe o resultado da execução — planilha, relatório, comprovante — e ele vira parte permanente do histórico.
        </EstadoVazio>
      ) : (
        <ul className="lista-limpa">
          {(anexos ?? []).map((a) => (
            <li key={a.id} className="linha" style={{ padding: '8px 0', borderBottom: '1px solid var(--borda)' }}>
              <span style={{ cursor: 'pointer', color: 'var(--cor-primaria)' }} onClick={() => void baixar(a)}>
                📄 {a.nome}
              </span>
              <span className="mudo">{fmtTamanho(a.tamanho_bytes)}</span>
              <div className="espaco" />
              <span className="mudo">{a.autor?.nome ?? '—'} · {fmtDataHora(a.criado_em)}</span>
              {props.podeEditar && (a.criado_por === eu?.id || eu?.perfil === 'gestor' || eu?.perfil === 'admin') && (
                <button className="btn mini" onClick={() => void remover(a)}>Remover</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {props.podeEditar && (
        <div className="linha" style={{ marginTop: 12 }}>
          <button className="btn primario mini" disabled={enviando} onClick={() => inputRef.current?.click()}>
            {enviando ? 'Enviando…' : '📎 Anexar arquivo'}
          </button>
          <span className="mudo">até 20 MB</span>
          <input ref={inputRef} type="file" style={{ display: 'none' }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} />
        </div>
      )}
    </div>
  );
}
