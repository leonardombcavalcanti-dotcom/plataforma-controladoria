# Relatórios por e-mail — guia de configuração

Dois relatórios automáticos foram adicionados (rodam na Vercel, sem servidor seu):

| Relatório | Quando | Quem recebe |
|---|---|---|
| ⏰ Pendências (demandas em atraso) | Dias úteis, 8h (Fortaleza) | Cada pessoa com demanda atrasada |
| 📊 Desempenho semanal | Sexta, 18h | Cada pessoa (o próprio resumo) + cada gestor (consolidado da equipe direta) |

Para funcionarem, siga as 4 etapas abaixo (≈15 min, uma única vez).

---

## ETAPA 1 — Migration + e-mails das pessoas (3 min)

1. No Supabase **SQL Editor**, execute `supabase/migrations/0013_email_pessoas.sql`
   (cria o campo e-mail e preenche automaticamente para quem já tem login vinculado).
2. Na plataforma: **Administração → Pessoas & Acessos** → abra cada pessoa e confira/preencha
   o campo **E-mail** (novos aprovados pela solicitação de acesso já entram com e-mail).
   *Sem e-mail preenchido, a pessoa simplesmente não recebe relatório.*

## ETAPA 2 — Conta no Resend, o serviço de envio (5 min)

1. Crie conta gratuita em **https://resend.com** (100 e-mails/dia — suficiente).
2. Menu **API Keys → Create API Key** → nome `plataforma-controladoria` → **copie a chave** (`re_...`).
3. **Remetente:**
   - **Teste imediato:** sem configurar nada, o Resend só entrega para o e-mail da SUA conta
     (remetente `onboarding@resend.dev`). Bom para validar o fluxo.
   - **Produção (equipe toda):** menu **Domains → Add Domain** → `asalocadora.com.br` →
     o Resend mostra 3 registros DNS (TXT/MX) para quem administra o domínio criar.
     Verificado o domínio, você pode usar um remetente como `plataforma@asalocadora.com.br`.

## ETAPA 3 — Variáveis na Vercel (4 min)

Vercel → seu projeto → **Settings → Environment Variables** → adicione:

| Name | Value | Onde pegar |
|---|---|---|
| `RESEND_API_KEY` | `re_...` | Etapa 2 |
| `EMAIL_REMETENTE` | `plataforma@asalocadora.com.br` (ou `onboarding@resend.dev` no teste) | Etapa 2 |
| `SUPABASE_URL` | `https://vxnxzhvgmipozanbaveg.supabase.co` | já conhecida |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ Supabase → Settings → API → **service_role** | ver aviso abaixo |
| `APP_URL` | o link oficial da sua plataforma na Vercel | — |
| `CRON_SECRET` | invente uma senha longa (ex.: 30 caracteres aleatórios) | — |

⚠️ **A `service_role` é a chave mestra do banco** (os relatórios precisam dela para ler
todos os dados no servidor). Ela fica SÓ aqui — sem o prefixo `VITE_`, nunca vai para o
navegador. Jamais a coloque no `.env` do projeto nem em qualquer arquivo commitado.
O `CRON_SECRET` protege as rotas: a Vercel o envia automaticamente ao chamar os crons,
e chamadas sem ele são recusadas.

## ETAPA 4 — Publicar e testar (3 min)

1. Suba as novidades (na pasta do projeto):
   ```powershell
   git add -A
   git commit -m "v2.1.0 - relatorios por email (pendencias diarias + desempenho semanal)"
   git push
   ```
2. Espere o deploy ficar **Ready** na Vercel.
3. **Teste manual imediato** (sem esperar o horário): abra no navegador, trocando o segredo:
   - `https://SEU-APP.vercel.app/api/relatorio-pendencias?secret=SEU_CRON_SECRET`
   - `https://SEU-APP.vercel.app/api/relatorio-semanal?secret=SEU_CRON_SECRET`

   ✅ A resposta é um JSON com `"ok": true` e `emails_enviados: N` — e os e-mails chegam.
   (Se estiver no modo teste do Resend, só chegará ao e-mail da sua conta Resend.)

## Como conferir os agendamentos

Vercel → projeto → **Settings → Cron Jobs**: devem aparecer os dois crons
(`relatorio-pendencias` dias úteis 11:00 UTC = 8h Fortaleza; `relatorio-semanal` sexta 21:00 UTC = 18h).
*Nota do plano Hobby: a Vercel executa cada cron uma vez ao dia com tolerância de horário
(pode disparar alguns minutos após o agendado) — suficiente para relatórios.*

## Problemas comuns

- `emails_enviados: 0` → ninguém tem e-mail preenchido, ou ninguém tem atraso (bom sinal!).
- Erro `Resend 403/422` → remetente não verificado: use `onboarding@resend.dev` para testar
  ou conclua a verificação do domínio.
- Erro `Supabase 401` → `SUPABASE_SERVICE_ROLE_KEY` errada; confira e faça **Redeploy**
  (variável nova só vale após novo deploy).
