// Dados da Central de Trabalho — somente leitura sobre o que as Sprints 1–3 semearam.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { CausaBloqueio } from '../domain/demandas';

function lancar(e: { message: string } | null): void {
  if (e) throw new Error(e.message);
}

export interface BloqueioAtivo {
  id: string;
  causa: CausaBloqueio;
  descricao: string;
  previsao_desbloqueio: string | null;
  pedir_ajuda: boolean;
  inicio: string;
  demanda: {
    id: string;
    titulo: string;
    status: string;
    responsavel: { nome: string } | null;
  } | null;
}

export async function listarBloqueiosAtivos(): Promise<BloqueioAtivo[]> {
  const { data, error } = await supabase
    .from('demanda_bloqueios')
    .select('id, causa, descricao, previsao_desbloqueio, pedir_ajuda, inicio,' +
      ' demanda:demandas(id, titulo, status, responsavel:pessoas!demandas_responsavel_id_fkey(nome))')
    .is('fim', null)
    .order('inicio', { ascending: false });
  lancar(error);
  const lista = (data ?? []) as unknown as BloqueioAtivo[];
  return lista.filter((b) => b.demanda?.status === 'bloqueada');
}

export interface OcorrenciaAberta {
  id: string;
  competencia: string;
  criada_em: string;
  processo: { id: string; nome: string; dono_id: string } | null;
}

export async function listarOcorrenciasAbertas(): Promise<OcorrenciaAberta[]> {
  const { data, error } = await supabase
    .from('ocorrencias')
    .select('id, competencia, criada_em, processo:processos(id, nome, dono_id)')
    .eq('status', 'em_andamento')
    .order('competencia', { ascending: false });
  lancar(error);
  return (data ?? []) as unknown as OcorrenciaAberta[];
}

export const useBloqueiosAtivos = () =>
  useQuery({ queryKey: ['bloqueios-ativos'], queryFn: listarBloqueiosAtivos });
export const useOcorrenciasAbertas = () =>
  useQuery({ queryKey: ['ocorrencias-abertas'], queryFn: listarOcorrenciasAbertas });
