// Exclusão real de processo — admin, e somente SEM histórico de execução.
// Com histórico, o banco recusa e orienta: Obsoleto → Arquivado (rastreabilidade).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { usePessoaAtual } from '../../data/queries';
import { chaves } from '../../data/queries';
import { useUi } from '../../store/ui';
import type { Processo } from '../../domain/tipos';

export function ExcluirProcesso(props: { processo: Processo }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data: eu } = usePessoaAtual();
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (eu?.perfil !== 'admin') return null;

  async function excluir() {
    setExcluindo(true);
    const { error } = await supabase.rpc('excluir_processo', { p_id: props.processo.id });
    setExcluindo(false);
    setConfirmando(false);
    if (error) {
      toast(error.message, 'erro');
    } else {
      toast('Processo excluído', 'ok');
      void qc.invalidateQueries({ queryKey: chaves.processos });
      nav('/processos');
    }
  }

  return (
    <>
      <button className="btn mini perigo" onClick={() => setConfirmando(true)}>Excluir</button>
      {confirmando && (
        <div className="modal-fundo" onClick={() => setConfirmando(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Excluir "{props.processo.nome}" definitivamente?</h2>
            <p className="suave" style={{ marginTop: 8 }}>
              Ação irreversível. Só é possível para processos que nunca geraram ocorrências ou
              demandas — com histórico, o caminho é Tornar obsoleto → Arquivar.
            </p>
            <div className="acoes">
              <button className="btn" onClick={() => setConfirmando(false)}>Cancelar</button>
              <button className="btn perigo" disabled={excluindo} onClick={() => void excluir()}>
                {excluindo ? 'Excluindo…' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
