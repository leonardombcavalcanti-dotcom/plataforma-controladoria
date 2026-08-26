// Ausências ativas — usadas para saber quem responde por uma demanda em cada data.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface AusenciaAtiva {
  id: string; pessoa_id: string; substituto_id: string | null;
  inicio: string; fim: string;
}

export function useAusenciasAtivas() {
  return useQuery({
    queryKey: ['ausencias-ativas'],
    staleTime: 60_000,
    queryFn: async (): Promise<AusenciaAtiva[]> => {
      const { data, error } = await supabase
        .from('ausencias').select('id, pessoa_id, substituto_id, inicio, fim')
        .eq('ativa', true).not('substituto_id', 'is', null);
      if (error) return [];       // tabela pode não existir em bases antigas
      return (data ?? []) as AusenciaAtiva[];
    },
  });
}

// Quem responde pela demanda naquela data: titular, ou o substituto se a data cai na ausência.
export function responsavelNaData(
  d: { responsavel_id: string | null; substituindo_id: string | null },
  data: string,
  ausencias: AusenciaAtiva[],
): string | null {
  const titular = d.substituindo_id ?? d.responsavel_id;
  if (!titular) return d.responsavel_id;
  const a = ausencias.find((x) => x.pessoa_id === titular && x.inicio <= data && x.fim >= data);
  return a?.substituto_id ?? titular;
}
