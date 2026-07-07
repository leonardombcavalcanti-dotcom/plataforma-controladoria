import { useState } from 'react';
import { TRANSICOES } from '../../domain/regras';
import type { Processo, StatusProcesso } from '../../domain/tipos';
import { usePessoaAtual, useTransicionar, usePublicarVersao } from '../../data/queries';
import { ModalJustificativa } from '../../components/ui';

// §3 do modelo congelado. A validação REAL é da RPC transicionar_processo —
// aqui apenas exibimos as ações possíveis e coletamos justificativa quando exigida.
export function CicloDeVida(props: { processo: Processo }) {
  const { processo } = props;
  const transicionar = useTransicionar(processo.id);
  const publicar = usePublicarVersao(processo.id);

  const { data: eu } = usePessoaAtual();
  const ehGestor = eu?.perfil === 'gestor' || eu?.perfil === 'admin';
  const [pendente, setPendente] = useState<{ para: StatusProcesso; rotulo: string } | null>(null);
  const [publicando, setPublicando] = useState(false);

  // Governança (Sprint 12): ativar/devolver/obsoletar/arquivar = gestor
  const soGestor = (para: StatusProcesso) =>
    ['ativo', 'obsoleto', 'arquivado'].includes(para) ||
    (processo.status === 'em_validacao' && para === 'em_construcao');
  const acoes = TRANSICOES[processo.status].filter((a) => ehGestor || !soGestor(a.para));

  function executar(para: StatusProcesso, rotulo: string, exigeJustificativa: boolean) {
    if (exigeJustificativa) {
      setPendente({ para, rotulo });
    } else {
      transicionar.mutate({ novo: para });
    }
  }

  return (
    <div className="linha" style={{ flexWrap: 'wrap' }}>
      {acoes.map((a) => (
        <button
          key={a.para}
          className={`btn mini ${a.para === 'ativo' ? 'primario' : ''} ${['obsoleto', 'arquivado'].includes(a.para) ? 'perigo' : ''}`}
          disabled={transicionar.isPending}
          onClick={() => executar(a.para, a.rotulo, a.exigeJustificativa)}
        >
          {a.rotulo}
        </button>
      ))}
      {processo.status === 'em_validacao' && !ehGestor && (
        <span className="mudo">Aguardando validação de um gestor.</span>
      )}
      {['ativo', 'em_revisao'].includes(processo.status) && (
        <button className="btn mini" disabled={publicar.isPending} onClick={() => setPublicando(true)}>
          Publicar nova versão
        </button>
      )}

      {pendente && (
        <ModalJustificativa
          titulo={pendente.rotulo}
          descricao="Esta transição fica registrada permanentemente na auditoria do processo."
          rotuloConfirmar={pendente.rotulo}
          exigeTexto
          destrutivo={['obsoleto', 'arquivado'].includes(pendente.para)}
          onCancelar={() => setPendente(null)}
          onConfirmar={(texto) => {
            transicionar.mutate({ novo: pendente.para, justificativa: texto });
            setPendente(null);
          }}
        />
      )}

      {publicando && (
        <ModalJustificativa
          titulo="Publicar nova versão"
          descricao="RN-08: toda versão nasce com motivo e snapshot completo da definição atual."
          rotuloConfirmar="Publicar versão"
          exigeTexto
          placeholder="O que mudou nesta versão?"
          onCancelar={() => setPublicando(false)}
          onConfirmar={(texto) => {
            publicar.mutate(texto);
            setPublicando(false);
          }}
        />
      )}
    </div>
  );
}
