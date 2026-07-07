import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAreas, useCriarProcesso, usePessoaAtual, usePessoas, useProcessos } from '../../data/queries';
import { PERIODICIDADE } from '../../domain/regras';
import type { Periodicidade } from '../../domain/tipos';
import * as api from '../../data/api';
import { useUi } from '../../store/ui';

// §9 do modelo congelado: criar processo nunca começa numa tela em branco.
// Passos: periodicidade → área → modelo/semelhante → dono.

interface Modelo {
  chave: string;
  nome: string;
  objetivo: string;
  periodicidade: Periodicidade;
  etapas: string[];
  checklist: string[];
}

const MODELOS: Modelo[] = [
  {
    chave: 'fechamento', nome: 'Fechamento Mensal', periodicidade: 'mensal',
    objetivo: 'Apurar e consolidar o resultado contábil-gerencial do mês com integridade e prazo.',
    etapas: ['Conciliar contas bancárias', 'Apurar provisões e competências', 'Consolidar DRE gerencial', 'Validação final'],
    checklist: ['Extratos importados e conferidos', 'Conciliações 100% concluídas', 'Provisões na competência', 'DRE sem divergência'],
  },
  {
    chave: 'forecast', nome: 'Forecast', periodicidade: 'mensal',
    objetivo: 'Projetar o resultado dos próximos meses com premissas revisadas e desvios explicados.',
    etapas: ['Atualizar premissas', 'Importar realizado', 'Analisar variações', 'Apresentar à diretoria'],
    checklist: ['Premissas revisadas', 'Desvios relevantes explicados'],
  },
  {
    chave: 'conciliacao', nome: 'Conciliação Bancária', periodicidade: 'mensal',
    objetivo: 'Garantir que todos os saldos bancários estejam conciliados com o razão.',
    etapas: ['Importar extratos', 'Conciliar razão x extrato', 'Justificar pendências'],
    checklist: ['Todas as contas conciliadas', 'Pendências antigas justificadas'],
  },
];

export function Assistente() {
  const nav = useNavigate();
  const toast = useUi((s) => s.toast);
  const { data: areas } = useAreas();
  const { data: pessoas } = usePessoas();
  const { data: pessoaAtual } = usePessoaAtual();
  const { data: existentes } = useProcessos();
  const criar = useCriarProcesso();

  const [passo, setPasso] = useState(1);
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal');
  const [areaId, setAreaId] = useState('');
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [donoId, setDonoId] = useState('');

  const semelhantes = (existentes ?? []).filter(
    (p) => nome.trim().length > 2 && p.nome.toLowerCase().includes(nome.trim().toLowerCase()),
  );

  async function concluir() {
    if (!pessoaAtual) return;
    try {
      const novo = await criar.mutateAsync({
        nome: nome.trim(),
        objetivo: objetivo.trim(),
        periodicidade,
        area_id: areaId,
        dono_id: donoId,
        tenant_id: pessoaAtual.tenant_id,
      });
      // Conteúdo do modelo → artefatos do "Como Executar"
      if (modelo) {
        for (const [i, etapa] of modelo.etapas.entries()) {
          await api.criarArtefato({ processo_id: novo.id, tipo: 'fluxo_etapa', ordem: i + 1, titulo: etapa, conteudo: null, storage_path: null });
        }
        for (const [i, item] of modelo.checklist.entries()) {
          await api.criarArtefato({ processo_id: novo.id, tipo: 'checklist_item', ordem: i + 1, titulo: item, conteudo: null, storage_path: null });
        }
      }
      // Dono definido → nasce Em Construção (§3: compromisso assumido)
      await api.rpcTransicionar(novo.id, 'em_construcao');
      toast('Processo criado — complete o método e a recorrência para ativá-lo', 'ok');
      nav(`/processos/${novo.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível criar o processo. Tente novamente.', 'erro');
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>Novo processo</h1>
      <p className="suave" style={{ marginBottom: 20 }}>Passo {passo} de 4</p>

      {passo === 1 && (
        <div className="cartao">
          <h2 style={{ marginBottom: 12 }}>Com que frequência este processo acontece?</h2>
          <div className="grade" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {Object.entries(PERIODICIDADE).map(([k, v]) => (
              <button key={k}
                className={`btn ${periodicidade === k ? 'primario' : ''}`}
                onClick={() => setPeriodicidade(k as Periodicidade)}>
                {v}
              </button>
            ))}
          </div>
          <div className="linha" style={{ marginTop: 18 }}>
            <div className="espaco" />
            <button className="btn primario" onClick={() => setPasso(2)}>Continuar</button>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="cartao">
          <h2 style={{ marginBottom: 12 }}>A qual área ele pertence?</h2>
          <div className="grade">
            {(areas ?? []).map((a) => (
              <button key={a.id} className={`btn ${areaId === a.id ? 'primario' : ''}`} onClick={() => setAreaId(a.id)}>
                {a.nome}
              </button>
            ))}
          </div>
          <div className="linha" style={{ marginTop: 18 }}>
            <button className="btn" onClick={() => setPasso(1)}>Voltar</button>
            <div className="espaco" />
            <button className="btn primario" disabled={!areaId} onClick={() => setPasso(3)}>Continuar</button>
          </div>
        </div>
      )}

      {passo === 3 && (
        <div className="cartao">
          <h2 style={{ marginBottom: 4 }}>Parecido com algum destes?</h2>
          <p className="suave" style={{ marginBottom: 12 }}>Modelos chegam com fluxo e checklist prontos para adaptar.</p>
          <div className="grade">
            {MODELOS.map((m) => (
              <div key={m.chave}
                className="cartao clicavel"
                style={modelo?.chave === m.chave ? { borderColor: 'var(--cor-primaria)' } : undefined}
                onClick={() => { setModelo(m); setNome(m.nome); setObjetivo(m.objetivo); setPeriodicidade(m.periodicidade); }}>
                <strong>{m.nome}</strong>
                <p className="mudo">{m.etapas.length} etapas · {m.checklist.length} itens de checklist</p>
              </div>
            ))}
            <div className="cartao clicavel"
              style={modelo === null && nome !== '' ? { borderColor: 'var(--cor-primaria)' } : undefined}
              onClick={() => { setModelo(null); setNome(''); setObjetivo(''); }}>
              <strong>Começar do zero</strong>
              <p className="mudo">Estrutura vazia guiada.</p>
            </div>
          </div>

          <hr className="divisor" />
          <label className="campo">
            <span>Nome do processo</span>
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Fechamento Mensal" />
          </label>
          {semelhantes.length > 0 && (
            <p className="check-risco" style={{ marginBottom: 10 }}>
              ⚠ Já existe processo parecido: {semelhantes.map((s) => s.nome).join(', ')}. Confira antes de duplicar.
            </p>
          )}
          <label className="campo">
            <span>Objetivo (por que este processo existe?)</span>
            <textarea value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
          </label>
          <div className="linha">
            <button className="btn" onClick={() => setPasso(2)}>Voltar</button>
            <div className="espaco" />
            <button className="btn primario" disabled={!nome.trim() || !objetivo.trim()} onClick={() => setPasso(4)}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {passo === 4 && (
        <div className="cartao">
          <h2 style={{ marginBottom: 12 }}>Quem é o Dono do Processo?</h2>
          <p className="suave" style={{ marginBottom: 12 }}>
            O dono governa o método, a recorrência e as melhorias (RN-06: todo processo tem exatamente um dono).
          </p>
          <label className="campo">
            <span>Dono</span>
            <select value={donoId} onChange={(e) => setDonoId(e.target.value)}>
              <option value="">Selecione…</option>
              {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}{p.cargo ? ` — ${p.cargo}` : ''}</option>)}
            </select>
          </label>
          <div className="linha">
            <button className="btn" onClick={() => setPasso(3)}>Voltar</button>
            <div className="espaco" />
            <button className="btn primario" disabled={!donoId || criar.isPending} onClick={() => void concluir()}>
              {criar.isPending ? 'Criando…' : 'Criar processo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
