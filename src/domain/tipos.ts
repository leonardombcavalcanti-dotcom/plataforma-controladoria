// Tipos do domínio — espelham o schema Supabase (migration 0001)
// Fonte de verdade: modelo-processos.md v1.1 (congelado)

export type StatusProcesso =
  | 'rascunho' | 'em_construcao' | 'em_validacao'
  | 'ativo' | 'em_revisao' | 'obsoleto' | 'arquivado';

export type Periodicidade =
  | 'diaria' | 'semanal' | 'mensal' | 'trimestral' | 'anual' | 'sob_demanda';

export type StatusOcorrencia =
  | 'em_andamento' | 'concluida' | 'concluida_pendencias' | 'cancelada';

export type TipoArtefato =
  | 'fluxo_etapa' | 'procedimento' | 'checklist_item' | 'template' | 'arquivo'
  | 'video' | 'sql' | 'dashboard' | 'boa_pratica' | 'risco';

export type PerfilAcesso = 'colaborador' | 'gestor' | 'executivo' | 'admin';

export interface Pessoa {
  id: string;
  tenant_id: string;
  nome: string;
  cargo: string | null;
  perfil: PerfilAcesso;
  gestor_id: string | null;
  area_id: string | null;
  ativa: boolean;
}

export interface Area {
  id: string;
  tenant_id: string;
  nome: string;
}

export interface Processo {
  id: string;
  tenant_id: string;
  area_id: string;
  macroprocesso_id: string | null;
  nome: string;
  objetivo: string;
  descricao: string | null;
  periodicidade: Periodicidade;
  dono_id: string;
  substituto_id: string | null;
  status: StatusProcesso;
  versao: number;
  entradas: string[];
  saidas: string[];
  criterio_inicio: string | null;
  criterio_encerramento: string | null;
  ultima_revisao: string | null;
  proxima_revisao: string | null;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  criado_em: string;
  atualizado_em: string;
  // joins opcionais
  dono?: Pick<Pessoa, 'id' | 'nome'> | null;
  area?: Pick<Area, 'id' | 'nome'> | null;
}

export interface Artefato {
  id: string;
  processo_id: string;
  tipo: TipoArtefato;
  ordem: number;
  titulo: string;
  conteudo: string | null;
  storage_path: string | null;
  archived_at: string | null;
}

export interface RecorrenciaItem {
  id: string;
  processo_id: string;
  titulo_modelo: string;
  descricao: string | null;
  responsavel_padrao_id: string | null;
  dia_util_gatilho: number | null;
  prazo_dias: number;
  tipo: import('./demandas').TipoDemanda;
  prioridade: import('./demandas').PrioridadeDemanda;
  valor: import('./demandas').ValorDemanda;
  complexidade: import('./demandas').ComplexidadeDemanda | null;
  objetivo_negocio: string | null;
  tempo_estimado_h: number | null;
  peso: number | null;
  prazo: string | null;
  recorrencia: import('./demandas').Demanda['recorrencia'];
  exige_validacao: boolean;
  ordem: number;
  archived_at: string | null;
}

export interface Relacao {
  id: string;
  origem_id: string;
  destino_id: string;
  tipo: 'alimenta' | 'relacionado';
}

export interface VersaoProcesso {
  id: string;
  processo_id: string;
  versao: number;
  snapshot: unknown;
  autor_id: string | null;
  motivo: string;
  criado_em: string;
  autor?: Pick<Pessoa, 'id' | 'nome'> | null;
}

export interface Ocorrencia {
  id: string;
  processo_id: string;
  competencia: string;
  versao_processo: number;
  status: StatusOcorrencia;
  criada_em: string;
  concluida_em: string | null;
  resumo_execucao: Record<string, unknown> | null;
}

export interface Evento {
  id: number;
  tenant_id: string;
  objeto_tipo: string;
  objeto_id: string;
  tipo: string;
  autor_id: string | null;
  dados: Record<string, unknown> | null;
  criado_em: string;
  autor?: Pick<Pessoa, 'id' | 'nome'> | null;
}

export interface NovoProcessoInput {
  nome: string;
  objetivo: string;
  descricao?: string;
  periodicidade: Periodicidade;
  area_id: string;
  dono_id: string;
  tenant_id: string;
}
