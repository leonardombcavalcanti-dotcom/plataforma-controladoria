import { useEffect, useState } from 'react';
import type { Processo } from '../../../domain/tipos';
import { useAreas, usePessoas, useSalvarProcesso } from '../../../data/queries';

// Aba Visão Geral — campos NÃO governados, com salvamento explícito.
export function AbaVisaoGeral(props: { processo: Processo }) {
  const { processo: p } = props;
  const { data: pessoas } = usePessoas();
  const { data: areas } = useAreas();
  const salvar = useSalvarProcesso(p.id);

  const [form, setForm] = useState({
    nome: p.nome,
    objetivo: p.objetivo,
    descricao: p.descricao ?? '',
    dono_id: p.dono_id,
    substituto_id: p.substituto_id ?? '',
    area_id: p.area_id,
    entradas: p.entradas.join('\n'),
    saidas: p.saidas.join('\n'),
    criterio_inicio: p.criterio_inicio ?? '',
    criterio_encerramento: p.criterio_encerramento ?? '',
  });

  useEffect(() => {
    setForm({
      nome: p.nome, objetivo: p.objetivo, descricao: p.descricao ?? '',
      dono_id: p.dono_id, substituto_id: p.substituto_id ?? '', area_id: p.area_id,
      entradas: p.entradas.join('\n'), saidas: p.saidas.join('\n'),
      criterio_inicio: p.criterio_inicio ?? '', criterio_encerramento: p.criterio_encerramento ?? '',
    });
  }, [p]);

  const somenteLeitura = p.status === 'arquivado';

  function gravar() {
    salvar.mutate({
      nome: form.nome.trim(),
      objetivo: form.objetivo.trim(),
      descricao: form.descricao.trim() || null,
      dono_id: form.dono_id,
      substituto_id: form.substituto_id || null,
      area_id: form.area_id,
      entradas: form.entradas.split('\n').map((s) => s.trim()).filter(Boolean),
      saidas: form.saidas.split('\n').map((s) => s.trim()).filter(Boolean),
      criterio_inicio: form.criterio_inicio.trim() || null,
      criterio_encerramento: form.criterio_encerramento.trim() || null,
    });
  }

  const campo = <K extends keyof typeof form>(k: K) => ({
    value: form[k],
    disabled: somenteLeitura,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <div>
      <div className="secao">
        <h3>Identificação</h3>
        <label className="campo"><span>Nome</span><input type="text" {...campo('nome')} /></label>
        <label className="campo"><span>Objetivo</span><textarea {...campo('objetivo')} /></label>
        <label className="campo"><span>Descrição</span><textarea {...campo('descricao')} /></label>
        <div className="grade" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="campo">
            <span>Área</span>
            <select {...campo('area_id')}>
              {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Dono do Processo (RN-06)</span>
            <select {...campo('dono_id')}>
              {(pessoas ?? []).map((pe) => <option key={pe.id} value={pe.id}>{pe.nome}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Substituto do dono</span>
            <select {...campo('substituto_id')}>
              <option value="">—</option>
              {(pessoas ?? []).map((pe) => <option key={pe.id} value={pe.id}>{pe.nome}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="secao">
        <h3>Fronteiras do processo</h3>
        <div className="grade" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="campo"><span>Entradas (uma por linha)</span><textarea {...campo('entradas')} /></label>
          <label className="campo"><span>Saídas (uma por linha)</span><textarea {...campo('saidas')} /></label>
          <label className="campo"><span>Critério de início</span><input type="text" {...campo('criterio_inicio')} /></label>
          <label className="campo"><span>Critério de encerramento</span><input type="text" {...campo('criterio_encerramento')} /></label>
        </div>
      </div>

      {!somenteLeitura && (
        <div className="linha">
          <div className="espaco" />
          <button className="btn primario" disabled={salvar.isPending} onClick={gravar}>
            {salvar.isPending ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      )}
    </div>
  );
}
