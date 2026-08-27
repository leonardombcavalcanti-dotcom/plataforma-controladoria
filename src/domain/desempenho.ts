// ============================================================
// Nota de Desempenho — ranking de criticidade + score 0–100
//
// PESO EFETIVO de cada demanda (o "quanto ela vale"):
//   base = peso informado (1–10, padrão 5)
//   × multiplicadores de prioridade, valor e complexidade
// Assim, atrasar uma demanda crítica peso 10 dói muito mais
// que atrasar uma rotina simples peso 2.
//
// NOTA (0–100) = média ponderada pelo peso efetivo de:
//   SLA (40) · Pontualidade/atraso (20) · Qualidade/retrabalho (20) · Entrega ponderada (20)
// ============================================================
import type { Demanda } from './demandas';

export const MULT_PRIORIDADE: Record<string, number> = {
  baixa: 0.8, media: 1.0, alta: 1.3, critica: 1.6,
};
export const MULT_VALOR: Record<string, number> = {
  baixo: 0.85, medio: 1.0, alto: 1.25, critico: 1.5,
};
export const MULT_COMPLEXIDADE: Record<string, number> = {
  baixa: 0.85, media: 1.0, alta: 1.25, especialista: 1.5,
};

/**
 * Peso efetivo (criticidade) — permanece na escala 1–10 do peso informado.
 * Os multiplicadores de prioridade, valor e complexidade ajustam dentro da
 * escala (média deles ~1), e o resultado é limitado a 10.
 */
export function pesoEfetivo(d: Demanda): number {
  const base = d.peso ?? 5;
  const mp = MULT_PRIORIDADE[d.prioridade] ?? 1;
  const mv = MULT_VALOR[d.valor] ?? 1;
  const mc = d.complexidade ? (MULT_COMPLEXIDADE[d.complexidade] ?? 1) : 1;
  const fator = (mp + mv + mc) / 3;              // média dos ajustes, não produto
  return Math.round(Math.min(10, Math.max(1, base * fator)) * 10) / 10;
}

/** Dias de atraso na entrega (0 se entregou no prazo ou antes). */
export function diasAtraso(d: Demanda): number {
  if (!d.concluida_em) return 0;
  const entrega = new Date(d.concluida_em.slice(0, 10) + 'T12:00:00Z').getTime();
  const prazo = new Date(d.prazo + 'T12:00:00Z').getTime();
  return Math.max(0, Math.round((entrega - prazo) / 86400e3));
}

export interface NotaDesempenho {
  nota: number | null;              // 0–100
  amostraPequena: boolean;
  concluidas: number;
  pesoTotal: number;                // soma do peso efetivo entregue
  pesoMedio: number | null;
  componentes: { nome: string; valor: number; peso: number; detalhe: string }[];
}

const PESOS_NOTA = { sla: 40, atraso: 20, retrabalho: 20, entrega: 20 };

/**
 * Calcula a nota do recorte.
 * @param concluidas demandas concluídas do recorte
 * @param referenciaEntrega peso efetivo total esperado (ex.: melhor entrega do grupo)
 */
export function calcularNota(concluidas: Demanda[], referenciaEntrega?: number): NotaDesempenho {
  if (concluidas.length === 0) {
    return { nota: null, amostraPequena: true, concluidas: 0, pesoTotal: 0, pesoMedio: null, componentes: [] };
  }

  const pesos = concluidas.map(pesoEfetivo);
  const pesoTotal = pesos.reduce((a, b) => a + b, 0);
  const pesoMedio = Math.round((pesoTotal / concluidas.length) * 100) / 100;

  // 1) SLA ponderado — % do peso entregue no prazo
  const pesoNoPrazo = concluidas.reduce((s, d, i) =>
    s + (d.motivo_conclusao === 'no_prazo' || d.motivo_conclusao === 'antecipada' ? pesos[i] : 0), 0);
  const sla = pesoTotal > 0 ? (pesoNoPrazo / pesoTotal) * 100 : 100;

  // 2) Pontualidade — penaliza pelos dias de atraso, ponderados pelo peso
  //    (5 dias de atraso numa demanda zera a pontualidade dela)
  const penal = concluidas.reduce((s, d, i) =>
    s + Math.min(1, diasAtraso(d) / 5) * pesos[i], 0);
  const pontualidade = pesoTotal > 0 ? Math.max(0, (1 - penal / pesoTotal)) * 100 : 100;

  // 3) Qualidade — % do peso entregue sem retrabalho
  const pesoSemRetrabalho = concluidas.reduce((s, d, i) => s + (d.retrabalho === 0 ? pesos[i] : 0), 0);
  const qualidade = pesoTotal > 0 ? (pesoSemRetrabalho / pesoTotal) * 100 : 100;

  // 4) Entrega ponderada — volume de peso efetivo entregue vs. referência do grupo
  const ref = referenciaEntrega && referenciaEntrega > 0 ? referenciaEntrega : pesoTotal;
  const entrega = Math.min(100, (pesoTotal / ref) * 100);

  const nota = Math.round(
    (sla * PESOS_NOTA.sla + pontualidade * PESOS_NOTA.atraso +
     qualidade * PESOS_NOTA.retrabalho + entrega * PESOS_NOTA.entrega) / 100,
  );

  const comRetrabalho = concluidas.filter((d) => d.retrabalho > 0).length;
  const atrasadas = concluidas.filter((d) => diasAtraso(d) > 0);
  const mediaDiasAtraso = atrasadas.length
    ? Math.round((atrasadas.reduce((s, d) => s + diasAtraso(d), 0) / atrasadas.length) * 10) / 10 : 0;

  return {
    nota,
    amostraPequena: concluidas.length < 5,
    concluidas: concluidas.length,
    pesoTotal: Math.round(pesoTotal * 10) / 10,
    pesoMedio,
    componentes: [
      { nome: 'SLA ponderado', valor: Math.round(sla), peso: PESOS_NOTA.sla,
        detalhe: `${Math.round(pesoNoPrazo)} de ${Math.round(pesoTotal)} pontos de peso no prazo` },
      { nome: 'Pontualidade', valor: Math.round(pontualidade), peso: PESOS_NOTA.atraso,
        detalhe: atrasadas.length ? `${atrasadas.length} atraso(s), média ${mediaDiasAtraso} dia(s)` : 'sem atrasos' },
      { nome: 'Qualidade (sem retrabalho)', valor: Math.round(qualidade), peso: PESOS_NOTA.retrabalho,
        detalhe: comRetrabalho ? `${comRetrabalho} com retrabalho` : 'nenhum retrabalho' },
      { nome: 'Entrega ponderada', valor: Math.round(entrega), peso: PESOS_NOTA.entrega,
        detalhe: `${Math.round(pesoTotal)} pontos de peso entregues` },
    ],
  };
}

export function faixaNota(n: number): { rotulo: string; tom: 'saudavel' | 'info' | 'atencao' | 'critico' } {
  if (n >= 90) return { rotulo: 'Excelente', tom: 'saudavel' };
  if (n >= 75) return { rotulo: 'Bom', tom: 'info' };
  if (n >= 60) return { rotulo: 'Atenção', tom: 'atencao' };
  return { rotulo: 'Crítico', tom: 'critico' };
}
