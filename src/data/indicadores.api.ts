// Indicadores da Fase 2 — o front só exibe; o cálculo mora no banco (0006).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

function lancar(e: { message: string } | null): void {
  if (e) throw new Error(e.message);
}

export interface ComponenteSaude {
  nome: string; pontos: number; peso: number; detalhe: string; rota: string;
}
export interface SaudeOperacional { score: number; componentes: ComponenteSaude[] }

export async function obterSaude(): Promise<SaudeOperacional | null> {
  const { data, error } = await supabase.rpc('fn_saude_operacional');
  lancar(error);
  return data as SaudeOperacional | null;
}

export interface ComponenteMaturidade {
  nome: string; pontos: number; peso: number; dica: string | null;
}
export interface IndicadoresProcesso {
  maturidade: { score: number; componentes: ComponenteMaturidade[] } | null;
  conformidade: {
    score: number | null;
    ocorrencias: {
      competencia: string; score: number; no_prazo: number;
      concluidas: number; retrabalho: number; duracao_dias: number;
    }[];
  };
  tempo_medio_dias: number | null;
}

export async function obterIndicadoresProcesso(id: string): Promise<IndicadoresProcesso | null> {
  const { data, error } = await supabase.rpc('fn_indicadores_processo', { p_id: id });
  lancar(error);
  return data as IndicadoresProcesso | null;
}

export const useSaude = () =>
  useQuery({ queryKey: ['saude-operacional'], queryFn: obterSaude, staleTime: 60_000 });
export const useIndicadoresProcesso = (id: string) =>
  useQuery({ queryKey: ['indicadores-processo', id], queryFn: () => obterIndicadoresProcesso(id), enabled: !!id });

// Semáforo da Constituição (Art. — §9.1): 🟢 ≥85 · 🟠 70–84 · 🔴 <70
export function semaforo(score: number): { emoji: string; rotulo: string; tom: 'saudavel' | 'atencao' | 'critico' } {
  if (score >= 85) return { emoji: '🟢', rotulo: 'Operação saudável', tom: 'saudavel' };
  if (score >= 70) return { emoji: '🟠', rotulo: 'Atenção', tom: 'atencao' };
  return { emoji: '🔴', rotulo: 'Crítico', tom: 'critico' };
}
