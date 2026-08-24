// Férias / ausências com substituição temporária (Regime de Substituição · ADR-19).
// Ao registrar, as demandas ativas passam ao substituto; ao encerrar, voltam ao titular.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { usePessoas } from '../../data/queries';
import { chavesDemandas } from '../../data/demandas.queries';
import { fmtData } from '../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import { useUi } from '../../store/ui';

type TipoAusencia = 'ferias' | 'licenca' | 'afastamento' | 'viagem' | 'outro';
const TIPOS: Record<TipoAusencia, string> = {
  ferias: '🏖 Férias', licenca: 'Licença', afastamento: 'Afastamento',
  viagem: 'Viagem', outro: 'Outro',
};

interface Ausencia {
  id: string; pessoa_id: string; substituto_id: string | null; tipo: TipoAusencia;
  inicio: string; fim: string; observacao: string | null; ativa: boolean; aplicada: boolean;
  pessoa?: { nome: string } | null; substituto?: { nome: string } | null;
}

export function Ausencias() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data: pessoas } = usePessoas();
  const [pessoaId, setPessoaId] = useState('');
  const [substitutoId, setSubstitutoId] = useState('');
  const [tipo, setTipo] = useState<TipoAusencia>('ferias');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [obs, setObs] = useState('');

  const { data: ausencias, isLoading } = useQuery({
    queryKey: ['ausencias'],
    queryFn: async () => {
      // Aplica as que começaram hoje e devolve as que terminaram (idempotente)
      await supabase.rpc('sincronizar_ausencias');
      const { data, error } = await supabase.from('ausencias')
        .select('*, pessoa:pessoas!ausencias_pessoa_id_fkey(nome), substituto:pessoas!ausencias_substituto_id_fkey(nome)')
        .order('inicio', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Ausencia[];
    },
  });

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['ausencias'] });
    void qc.invalidateQueries({ queryKey: chavesDemandas.lista });
  };

  const registrar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('registrar_ausencia', {
        p_pessoa: pessoaId, p_substituto: substitutoId || null, p_tipo: tipo,
        p_inicio: inicio, p_fim: fim, p_observacao: obs.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidar();
      const hojeIso = new Date().toISOString().slice(0, 10);
      toast(inicio <= hojeIso
        ? 'Ausência registrada — demandas transferidas ao substituto'
        : `Ausência agendada — a transferência acontece em ${inicio.split('-').reverse().join('/')}`, 'ok');
      setPessoaId(''); setSubstitutoId(''); setInicio(''); setFim(''); setObs('');
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Não foi possível registrar.', 'erro'),
  });

  const encerrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('encerrar_ausencia', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { invalidar(); toast('Ausência encerrada — demandas devolvidas ao titular', 'ok'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'Não foi possível encerrar.', 'erro'),
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const pode = pessoaId && inicio && fim;

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="cartao secao">
        <h3 style={{ marginBottom: 10 }}>Registrar ausência</h3>
        <p className="suave" style={{ marginBottom: 12 }}>
          A transferência acontece <strong>no primeiro dia da ausência</strong> — até lá, nada muda.
          No retorno, as demandas voltam automaticamente ao titular. Toda ação do substituto fica
          registrada como tal.
        </p>
        <div className="grade" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="campo"><span>Quem se ausenta *</span>
            <select value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}>
              <option value="">Selecione…</option>
              {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select></label>
          <label className="campo"><span>Substituto (assume as demandas)</span>
            <select value={substitutoId} onChange={(e) => setSubstitutoId(e.target.value)}>
              <option value="">— sem substituto</option>
              {(pessoas ?? []).filter((p) => p.id !== pessoaId).map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select></label>
          <label className="campo"><span>Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAusencia)}>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <div className="grade" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="campo"><span>Início *</span>
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
            <label className="campo"><span>Retorno *</span>
              <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
          </div>
        </div>
        <label className="campo"><span>Observação</span>
          <input type="text" value={obs} onChange={(e) => setObs(e.target.value)}
                 placeholder="Ex.: férias aprovadas, 20 dias" /></label>
        <div className="linha">
          <div className="espaco" />
          <button className="btn primario" disabled={!pode || registrar.isPending}
                  onClick={() => registrar.mutate()}>
            {registrar.isPending ? 'Registrando…' : 'Registrar e transferir demandas'}
          </button>
        </div>
      </div>

      <div className="secao">
        <h3 style={{ marginBottom: 10 }}>Ausências</h3>
        {isLoading ? <Carregando linhas={2} /> : (ausencias ?? []).length === 0 ? (
          <EstadoVazio titulo="Nenhuma ausência registrada." />
        ) : (
          <div className="grade">
            {(ausencias ?? []).map((a) => {
              const emCurso = a.ativa && a.inicio <= hoje && a.fim >= hoje;
              const futura = a.ativa && a.inicio > hoje;
              return (
                <div key={a.id} className="cartao">
                  <div className="linha" style={{ flexWrap: 'wrap' }}>
                    <strong>{a.pessoa?.nome ?? '—'}</strong>
                    <Badge tom="neutro">{TIPOS[a.tipo]}</Badge>
                    {emCurso && <Badge tom="atencao">{a.aplicada ? 'Em curso · substituindo' : 'Em curso'}</Badge>}
                    {futura && <Badge tom="info">Agendada · transfere em {fmtData(a.inicio)}</Badge>}
                    {!a.ativa && <Badge tom="saudavel">Encerrada</Badge>}
                    <div className="espaco" />
                    <span className="mudo">{fmtData(a.inicio)} – {fmtData(a.fim)}</span>
                  </div>
                  <p className="mudo" style={{ marginTop: 4 }}>
                    {a.substituto?.nome ? `Substituto: ${a.substituto.nome}` : 'Sem substituto designado'}
                    {a.observacao ? ` · ${a.observacao}` : ''}
                  </p>
                  {a.ativa && (
                    <div className="linha" style={{ marginTop: 8 }}>
                      <div className="espaco" />
                      <button className="btn mini" disabled={encerrar.isPending}
                              onClick={() => encerrar.mutate(a.id)}>
                        {a.aplicada ? 'Encerrar e devolver demandas' : 'Cancelar ausência'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
