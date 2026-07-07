import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCriarDemanda } from '../../data/demandas.queries';
import { usePessoaAtual, usePessoas, useProcessos } from '../../data/queries';
import * as apiProc from '../../data/api';
import {
  type ComplexidadeDemanda, type PrioridadeDemanda, type TipoDemanda, type ValorDemanda,
  COMPLEXIDADE, PRIORIDADE, TIPO_DEMANDA, VALOR,
} from '../../domain/demandas';
import { EstadoVazio } from '../../components/ui';

export function NovaDemanda(props: { solicitacao?: boolean }) {
  const solicitacao = props.solicitacao ?? false;
  const nav = useNavigate();
  const { data: eu } = usePessoaAtual();
  const { data: pessoas } = usePessoas();
  const { data: processos } = useProcessos();
  const criar = useCriarDemanda();

  const [titulo, setTitulo] = useState('');
  const [processoId, setProcessoId] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const [prazo, setPrazo] = useState('');
  const [recorrencia, setRecorrencia] = useState('');
  const [peso, setPeso] = useState('');
  const [tipo, setTipo] = useState<TipoDemanda>(solicitacao ? 'solicitacao' : 'rotina');
  const [prioridade, setPrioridade] = useState<PrioridadeDemanda>('media');
  const [maisDetalhes, setMaisDetalhes] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<ValorDemanda>('medio');
  const [complexidade, setComplexidade] = useState<ComplexidadeDemanda | ''>('');
  const [objetivo, setObjetivo] = useState('');
  const [estimadoH, setEstimadoH] = useState('');
  const [exigeValidacao, setExigeValidacao] = useState(false);

  const ativos = useMemo(
    () => (processos ?? []).filter((p) => ['ativo', 'em_revisao'].includes(p.status)),
    [processos],
  );
  const processoSel = ativos.find((p) => p.id === processoId) ?? null;

  function selecionarProcesso(id: string) {
    setProcessoId(id);
    const p = ativos.find((x) => x.id === id);
    if (p) {
      if (!solicitacao && !responsavelId && p.dono_id) setResponsavelId(p.dono_id);
      if (!objetivo) setObjetivo(p.nome);
      if (!solicitacao) setTipo('rotina');
    }
  }

  async function salvar() {
    if (!eu) return;
    let checklist: string[] = [];
    if (processoSel) {
      const artefatos = await apiProc.listarArtefatos(processoSel.id);
      checklist = artefatos.filter((a) => a.tipo === 'checklist_item').map((a) => a.titulo);
    }
    criar.mutate(
      {
        input: {
          tenant_id: eu.tenant_id,
          area_id: processoSel?.area_id ?? eu.area_id ?? '',
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          tipo, prioridade, valor,
          complexidade: complexidade || null,
          objetivo_negocio: objetivo.trim() || null,
          processo_id: processoId || null,
          criador_id: eu.id,
          responsavel_id: solicitacao ? null : responsavelId,
          status: solicitacao ? 'solicitada' : 'aberta',
          exige_validacao: exigeValidacao,
          prazo,
          recorrencia: (recorrencia || null) as 'diaria' | 'semanal' | 'mensal' | 'anual' | null,
          peso: peso ? Number(peso) : null,
          tempo_estimado_h: estimadoH ? Number(estimadoH) : null,
        },
        checklist,
      },
      { onSuccess: (d) => nav(solicitacao ? '/demandas/solicitacoes' : `/demandas/minhas/${d.id}`) },
    );
  }

  const pode = titulo.trim() && prazo && (solicitacao || responsavelId) && !criar.isPending;

  const ehGestor = eu?.perfil === 'gestor' || eu?.perfil === 'admin';
  if (eu && !ehGestor && !solicitacao) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <EstadoVazio titulo="Criação direta é decisão de gestor."
          acao={<button className="btn primario" onClick={() => nav('/demandas/solicitar')}>Fazer solicitação</button>}>
          Seu perfil registra solicitações — o gestor aprova e a demanda nasce com todo o histórico preservado.
        </EstadoVazio>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>{solicitacao ? 'Nova solicitação' : 'Nova demanda'}</h1>
      {solicitacao && (
        <p className="suave" style={{ marginBottom: 12 }}>
          Sua sugestão vai para a fila de aprovação do seu gestor — se aprovada, vira demanda com todo o histórico preservado.
        </p>
      )}
      <div className="cartao">
        <label className="campo">
          <span>Título *</span>
          <input autoFocus type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)}
                 placeholder="Ex.: Análise de glosas julho/2026" />
        </label>

        <label className="campo">
          <span>Processo {solicitacao ? '(opcional)' : '(selecionou → herda checklist, responsável sugerido e validação)'}</span>
          <select value={processoId} onChange={(e) => selecionarProcesso(e.target.value)}>
            <option value="">— Avulsa (sem processo)</option>
            {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>

        <div className="grade" style={{ gridTemplateColumns: solicitacao ? '1fr 1fr' : '1fr 1fr 1fr' }}>
          {!solicitacao && (
            <label className="campo">
              <span>Responsável *</span>
              <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
                <option value="">Selecione…</option>
                {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
          )}
          <label className="campo">
            <span>{solicitacao ? 'Prazo desejado *' : 'Prazo *'}</span>
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </label>
          <label className="campo">
            <span>{solicitacao ? 'Peso sugerido (1–10)' : 'Peso (1–10)'}</span>
            <input type="number" min={1} max={10} value={peso}
                   onChange={(e) => setPeso(e.target.value)}
                   placeholder="esforço" />
          </label>
          <label className="campo">
            <span>Recorrência</span>
            <select value={recorrencia} onChange={(e) => setRecorrencia(e.target.value)}>
              <option value="">Não se repete</option>
              <option value="diaria">Diária (seg–sex)</option>
              <option value="semanal">Semanal (mesmo dia da semana)</option>
              <option value="mensal">Mensal (mesmo dia do mês)</option>
              <option value="anual">Anual</option>
            </select>
          </label>
          <label className="campo">
            <span>Tipo *</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDemanda)}>
              {Object.entries(TIPO_DEMANDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>

        <label className="campo">
          <span>Prioridade</span>
          <div className="linha">
            {(Object.entries(PRIORIDADE) as [PrioridadeDemanda, { rotulo: string }][]).map(([k, v]) => (
              <button key={k} type="button" className={`btn mini ${prioridade === k ? 'primario' : ''}`}
                      onClick={() => setPrioridade(k)}>{v.rotulo}</button>
            ))}
          </div>
        </label>

        {!maisDetalhes ? (
          <button className="btn mini" onClick={() => setMaisDetalhes(true)}>▸ Mais detalhes (opcional)</button>
        ) : (
          <>
            <hr className="divisor" />
            <label className="campo">
              <span>Descrição / justificativa</span>
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </label>
            <div className="grade" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <label className="campo">
                <span>Valor (impacto)</span>
                <select value={valor} onChange={(e) => setValor(e.target.value as ValorDemanda)}>
                  {Object.entries(VALOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="campo">
                <span>Complexidade</span>
                <select value={complexidade} onChange={(e) => setComplexidade(e.target.value as ComplexidadeDemanda | '')}>
                  <option value="">—</option>
                  {Object.entries(COMPLEXIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="campo">
                <span>Tempo estimado (h)</span>
                <input type="number" min={0.5} step={0.5} value={estimadoH}
                       onChange={(e) => setEstimadoH(e.target.value)} />
              </label>
            </div>
            <label className="campo">
              <span>Objetivo de negócio</span>
              <input type="text" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
                     placeholder="Ex.: Fechamento Contábil, Compliance, Melhoria de Processo…" />
            </label>
            {!solicitacao && (
              <label className="linha" style={{ cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={exigeValidacao}
                       onChange={(e) => setExigeValidacao(e.target.checked)} />
                <span>Exige validação ao concluir (validador: você)</span>
              </label>
            )}
          </>
        )}

        <div className="linha" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => nav(solicitacao ? '/demandas/solicitacoes' : '/demandas/inbox')}>
            Cancelar
          </button>
          <div className="espaco" />
          <button className="btn primario" disabled={!pode} onClick={() => void salvar()}>
            {criar.isPending ? 'Enviando…' : solicitacao ? 'Enviar solicitação' : 'Criar demanda'}
          </button>
        </div>
      </div>
    </div>
  );
}
