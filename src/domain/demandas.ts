// Domínio de Demandas — tipos espelhando as migrations 0002+0003 + regras de EXIBIÇÃO.
import type { Pessoa } from './tipos';

export type StatusDemanda =
  | 'solicitada' | 'aberta' | 'em_execucao' | 'bloqueada'
  | 'em_validacao' | 'concluida' | 'encerrada' | 'rejeitada';
export type MotivoConclusao = 'antecipada' | 'no_prazo' | 'com_atraso';
export type MotivoEncerramento = 'cancelada' | 'duplicada' | 'nao_aplicavel';
export type CausaBloqueio = 'pessoa' | 'area' | 'sistema' | 'fornecedor' | 'cliente' | 'outro';
export type TipoDemanda =
  | 'rotina' | 'projeto' | 'incidente' | 'solicitacao'
  | 'melhoria' | 'correcao' | 'analise' | 'aprovacao';
export type PrioridadeDemanda = 'baixa' | 'media' | 'alta' | 'critica';
export type ValorDemanda = 'baixo' | 'medio' | 'alto' | 'critico';
export type ComplexidadeDemanda = 'baixa' | 'media' | 'alta' | 'especialista';

export interface Demanda {
  id: string;
  tenant_id: string;
  area_id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoDemanda;
  prioridade: PrioridadeDemanda;
  valor: ValorDemanda;
  complexidade: ComplexidadeDemanda | null;
  objetivo_negocio: string | null;
  processo_id: string | null;
  ocorrencia_id: string | null;
  recorrencia_id: string | null;
  criador_id: string;
  responsavel_id: string | null;
  validador_id: string | null;
  aprovador_id: string | null;
  exige_validacao: boolean;
  status: StatusDemanda;
  prazo: string;
  iniciada_em: string | null;
  concluida_em: string | null;
  motivo_conclusao: MotivoConclusao | null;
  motivo_encerramento: MotivoEncerramento | null;
  justificativa_encerramento: string | null;
  devolvida: boolean;
  comentario_devolucao: string | null;
  motivo_rejeicao: string | null;
  tempo_estimado_h: number | null;
  peso: number | null;
  anexo_obrigatorio: boolean;
  retrabalho: number;
  recorrencia: 'diaria' | 'semanal' | 'mensal' | 'anual' | null;
  avaliacao_nota: number | null;
  avaliacao_comentario: string | null;
  avaliada_por: string | null;
  avaliada_em: string | null;
  comentario_lido_em: string | null;
  substituindo_id: string | null;
  criado_em: string;
  responsavel?: Pick<Pessoa, 'id' | 'nome'> | null;
  criador?: Pick<Pessoa, 'id' | 'nome'> | null;
  processo?: { id: string; nome: string } | null;
}

export interface ItemChecklist {
  id: string; demanda_id: string; ordem: number; texto: string;
  feito: boolean; feito_por: string | null; feito_em: string | null;
}
export interface ComentarioDemanda {
  id: string; demanda_id: string; autor_id: string; texto: string; criado_em: string;
  autor?: Pick<Pessoa, 'id' | 'nome'> | null;
}
export interface BloqueioDemanda {
  id: string; demanda_id: string; causa: CausaBloqueio; descricao: string;
  previsao_desbloqueio: string | null; pedir_ajuda: boolean;
  inicio: string; fim: string | null;
}
export interface TempoDemanda {
  id: string; demanda_id: string; pessoa_id: string; horas: number; data: string;
  comentario: string | null; pessoa?: Pick<Pessoa, 'id' | 'nome'> | null;
}
export interface ObservadorDemanda {
  demanda_id: string; pessoa_id: string; origem: string;
  pessoa?: Pick<Pessoa, 'id' | 'nome'> | null;
}

type Tom = 'neutro' | 'info' | 'saudavel' | 'atencao' | 'critico';

export const STATUS_DEMANDA: Record<StatusDemanda, { rotulo: string; tom: Tom }> = {
  solicitada:   { rotulo: 'Solicitada',    tom: 'neutro' },
  aberta:       { rotulo: 'Aberta',        tom: 'neutro' },
  em_execucao:  { rotulo: 'Em Execução',   tom: 'info' },
  bloqueada:    { rotulo: 'Bloqueada',     tom: 'critico' },
  em_validacao: { rotulo: 'Em Validação',  tom: 'atencao' },
  concluida:    { rotulo: 'Concluída',     tom: 'saudavel' },
  encerrada:    { rotulo: 'Encerrada',     tom: 'neutro' },
  rejeitada:    { rotulo: 'Rejeitada',     tom: 'neutro' },
};

export const MOTIVO_CONCLUSAO: Record<MotivoConclusao, string> = {
  antecipada: 'Antecipada', no_prazo: 'No prazo', com_atraso: 'Com atraso',
};
export const MOTIVO_ENCERRAMENTO: Record<MotivoEncerramento, string> = {
  cancelada: 'Cancelada', duplicada: 'Duplicada', nao_aplicavel: 'Não aplicável',
};
export const CAUSA_BLOQUEIO: Record<CausaBloqueio, string> = {
  pessoa: 'Aguardando pessoa', area: 'Aguardando outra área', sistema: 'Problema em sistema',
  fornecedor: 'Aguardando fornecedor', cliente: 'Aguardando cliente', outro: 'Outro',
};
export const TIPO_DEMANDA: Record<TipoDemanda, string> = {
  rotina: 'Rotina', projeto: 'Projeto', incidente: 'Incidente', solicitacao: 'Solicitação',
  melhoria: 'Melhoria', correcao: 'Correção', analise: 'Análise', aprovacao: 'Aprovação',
};
export const PRIORIDADE: Record<PrioridadeDemanda, { rotulo: string; tom: Tom }> = {
  baixa: { rotulo: 'Baixa', tom: 'neutro' }, media: { rotulo: 'Média', tom: 'info' },
  alta: { rotulo: 'Alta', tom: 'atencao' }, critica: { rotulo: 'Crítica', tom: 'critico' },
};
export const VALOR: Record<ValorDemanda, string> = {
  baixo: 'Baixo', medio: 'Médio', alto: 'Alto', critico: 'Crítico',
};
export const COMPLEXIDADE: Record<ComplexidadeDemanda, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', especialista: 'Especialista',
};

export const RECORRENCIA_DEMANDA: Record<'diaria' | 'semanal' | 'mensal' | 'anual', string> = {
  diaria: 'Diária (seg–sex)', semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual',
};

// Demanda que está com um substituto (titular ausente).
// Só vale para demandas ATIVAS: concluída/encerrada é entrega, não substituição.
export function ehSubstituicao(d: Demanda): boolean {
  return !!d.substituindo_id
    && !!d.responsavel_id
    && d.substituindo_id !== d.responsavel_id
    && !['concluida', 'encerrada', 'rejeitada'].includes(d.status);
}

export function demandaAtrasada(d: Demanda): boolean {
  if (['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status)) return false;
  return new Date(d.prazo + 'T23:59:59') < new Date();
}

export function prazoTom(d: Demanda): Tom {
  if (['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status)) return 'neutro';
  if (demandaAtrasada(d)) return 'critico';
  const hoje = new Date().toISOString().slice(0, 10);
  return d.prazo === hoje ? 'atencao' : 'neutro';
}

export function descreverEvento(tipo: string, dados: Record<string, unknown> | null, nomes: (id: unknown) => string): string {
  const d = dados ?? {};
  switch (tipo) {
    case 'criacao': return d['origem'] === 'ocorrencia' ? 'Criada pela ocorrência do processo' : 'Criada';
    case 'transicao': return `Status: ${String(d['de'])} → ${String(d['para'])}`;
    case 'delegacao': return `Delegada de ${nomes(d['de'])} para ${nomes(d['para'])}${d['mensagem'] ? ` — "${String(d['mensagem'])}"` : ''}`;
    case 'bloqueio': return `Bloqueada (${String(d['causa'])}): ${String(d['descricao'])}${d['pedir_ajuda'] ? ' · pediu ajuda ao gestor' : ''}`;
    case 'desbloqueio': return `Desbloqueada após ${String(d['duracao_horas'] ?? '?')}h`;
    case 'validacao_aprovada': return 'Validação aprovada';
    case 'validacao_reprovada': return `Validação reprovada — "${String(d['motivo'])}" (retrabalho +1)`;
    case 'conclusao': return `Concluída — ${MOTIVO_CONCLUSAO[d['motivo'] as MotivoConclusao] ?? String(d['motivo'])} (automático)`;
    case 'conclusao_com_pendencias': return `Concluída com ${String(d['itens_pendentes'])} item(ns) de checklist pendente(s)`;
    case 'encerramento': return `Encerrada sem execução — ${MOTIVO_ENCERRAMENTO[d['motivo'] as MotivoEncerramento] ?? String(d['motivo'])}: "${String(d['justificativa'])}"`;
    case 'reabertura': return `Reaberta — "${String(d['justificativa'])}"`;
    case 'tempo_apontado': return `Tempo apontado: ${String(d['horas'])}h em ${String(d['data'])}`;
    case 'solicitacao_aprovada': return `Solicitação aprovada — responsável: ${nomes(d['responsavel'])}, prazo ${String(d['prazo'])}`;
    case 'solicitacao_devolvida': return `Solicitação devolvida para ajuste — "${String(d['comentario'])}"`;
    case 'solicitacao_reenviada': return 'Solicitação reenviada para aprovação';
    case 'solicitacao_rejeitada': return `Solicitação rejeitada — "${String(d['motivo'])}"`;
    case 'avaliacao': return `Avaliada pelo gestor: ${'★'.repeat(Number(d['nota'] ?? 0))}${d['comentario'] ? ` — \"${String(d['comentario'])}\"` : ''}`;
    case 'recorrencia_gerada': return `Recorrência: próxima demanda criada para ${String(d['prazo'])}`;
    case 'substituicao_inicio': return `Assumida por substituição — de ${nomes(d['de'])} para ${nomes(d['para'])} (${String(d['motivo'] ?? 'ausência')}, até ${String(d['ate'] ?? '')})`;
    case 'substituicao_fim': return `Devolvida ao titular: ${nomes(d['devolvida_para'])}`;
    case 'edicao': return 'Campos editados';
    default: return tipo;
  }
}
