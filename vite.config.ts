import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// __BUILD__: carimbo da versão publicada (data/hora do build) — exibido no app
// e usado pelo botão "Atualizar app".
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString()),
  },
});
