// Regras de exibição do domínio. As regras de NEGÓCIO moram no banco (RPCs).
import type { Periodicidade, StatusOcorrencia, StatusProcesso, TipoArtefato } from './tipos';

export const STATUS_PROCESSO: Record<StatusProcesso, { rotulo: string; tom: 'neutro' | 'atencao' | 'saudavel' | 'critico' | 'info' }> = {
  rascunho:      { rotulo: 'Rascunho',      tom: 'neutro' },
  em_construcao: { rotulo: 'Em Construção', tom: 'info' },
  em_validacao:  { rotulo: 'Em Validação',  tom: 'atencao' },
  ativo:         { rotulo: 'Ativo',         tom: 'saudavel' },
  em_revisao:    { rotulo: 'Em Revisão',    tom: 'atencao' },
  obsoleto:      { rotulo: 'Obsoleto',      tom: 'critico' },
  arquivado:     { rotulo: 'Arquivado',     tom: 'neutro' },
};

export const PERIODICIDADE: Record<Periodicidade, string> = {
  diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal',
  trimestral: 'Trimestral', anual: 'Anual', sob_demanda: 'Sob demanda',
};

export const STATUS_OCORRENCIA: Record<StatusOcorrencia, { rotulo: string; tom: 'neutro' | 'atencao' | 'saudavel' | 'critico' | 'info' }> = {
  em_andamento:         { rotulo: 'Em andamento',            tom: 'info' },
  concluida:            { rotulo: 'Concluída',               tom: 'saudavel' },
  concluida_pendencias: { rotulo: 'Concluída com pendências', tom: 'atencao' },
  cancelada:            { rotulo: 'Cancelada',               tom: 'neutro' },
};

export const TIPO_ARTEFATO: Record<TipoArtefato, { rotulo: string; grupo: string }> = {
  fluxo_etapa:    { rotulo: 'Etapa do fluxo', grupo: 'Fluxo operacional' },
  procedimento:   { rotulo: 'Procedimento',   grupo: 'Procedimentos' },
  checklist_item: { rotulo: 'Item de checklist', grupo: 'Checklist-modelo' },
  template:       { rotulo: 'Template',       grupo: 'Templates' },
  arquivo:        { rotulo: 'Arquivo',        grupo: 'Arquivos' },
  video:          { rotulo: 'Vídeo',          grupo: 'Vídeos' },
  sql:            { rotulo: 'Consulta SQL',   grupo: 'Consultas SQL' },
  dashboard:      { rotulo: 'Dashboard',      grupo: 'Dashboards' },
  boa_pratica:    { rotulo: 'Boa prática',    grupo: 'Boas práticas' },
  risco:          { rotulo: 'Risco / contingência', grupo: 'Riscos e contingência' },
};

// Espelho do grafo de transições do banco (§3) — apenas para EXIBIR ações válidas.
// A validação real acontece na RPC transicionar_processo.
export const TRANSICOES: Record<StatusProcesso, { para: StatusProcesso; rotulo: string; exigeJustificativa: boolean }[]> = {
  rascunho:      [{ para: 'em_construcao', rotulo: 'Iniciar construção', exigeJustificativa: false }],
  em_construcao: [{ para: 'em_validacao', rotulo: 'Enviar para validação', exigeJustificativa: false }],
  em_validacao:  [
    { para: 'ativo', rotulo: 'Aprovar e ativar', exigeJustificativa: false },
    { para: 'em_construcao', rotulo: 'Devolver para ajustes', exigeJustificativa: true },
  ],
  ativo: [
    { para: 'em_revisao', rotulo: 'Iniciar revisão', exigeJustificativa: false },
    { para: 'obsoleto', rotulo: 'Tornar obsoleto', exigeJustificativa: true },
  ],
  em_revisao: [
    { para: 'ativo', rotulo: 'Concluir revisão', exigeJustificativa: false },
    { para: 'obsoleto', rotulo: 'Tornar obsoleto', exigeJustificativa: true },
  ],
  obsoleto: [
    { para: 'arquivado', rotulo: 'Arquivar definitivamente', exigeJustificativa: true },
    { para: 'em_validacao', rotulo: 'Reativar (revalidar)', exigeJustificativa: false },
  ],
  arquivado: [],
};

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Datas puras (AAAA-MM-DD) NUNCA passam por Date(): o parse UTC recuava 1 dia no fuso local.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m && iso.length === 10) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtCompetencia(c: string): string {
  const [ano, mes] = c.split('-');
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

// §7.4 — Saúde do Processo (subset do MVP: revisão em dia + última execução)
export function revisaoVencida(ultimaRevisao: string | null, periodicidade: Periodicidade): boolean {
  if (!ultimaRevisao) return true;
  const meses = periodicidade === 'diaria' ? 6 : 12;
  const limite = new Date(ultimaRevisao);
  limite.setMonth(limite.getMonth() + meses);
  return limite < new Date();
}
