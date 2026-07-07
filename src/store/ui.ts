// Zustand — SOMENTE estado de interface (toasts). Nenhum dado operacional.
import { create } from 'zustand';

export interface Toast {
  id: number;
  texto: string;
  tom: 'ok' | 'erro' | 'info';
}

interface UiState {
  toasts: Toast[];
  toast: (texto: string, tom?: Toast['tom']) => void;
  fecharToast: (id: number) => void;
}

let seq = 1;

export const useUi = create<UiState>((set) => ({
  toasts: [],
  toast: (texto, tom = 'info') => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { id, texto, tom }] }));
    // Toast some sozinho (Constituição: 3s, nunca bloqueia)
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3000);
  },
  fecharToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
