// Relatório diário de pendências — enviado por e-mail a quem tem demanda atrasada.
// Agendado pelo cron da Vercel (vercel.json). Roda no servidor com a service_role.
const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REMETENTE = process.env.EMAIL_REMETENTE || 'onboarding@resend.dev';
const APP_URL = process.env.APP_URL || 'https://plataforma-controladoria.vercel.app';

async function sb(caminho) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

async function enviarEmail(para, assunto, html) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: `Plataforma Controladoria <${REMETENTE}>`, to: [para], subject: assunto, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

const fmt = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  const qs = req.query?.secret;
  if (secreto && auth !== `Bearer ${secreto}` && qs !== secreto) {
    return res.status(401).json({ erro: 'não autorizado' });
  }
  try {
    // Sincroniza férias/ausências do dia (aplica quem entrou, devolve quem voltou)
    await fetch(`${URL_BASE}/rest/v1/rpc/sincronizar_ausencias_global`, {
      method: 'POST',
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => { /* não bloqueia o relatório */ });

    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // America/Fortaleza
    const pessoas = await sb('pessoas?select=id,nome,email&ativa=is.true');
    const atrasadas = await sb(
      `demandas?select=id,titulo,prazo,responsavel_id,processo:processos(nome)` +
      `&status=in.(aberta,em_execucao,bloqueada,em_validacao)&prazo=lt.${hoje}&archived_at=is.null`);

    let enviados = 0; const detalhe = [];
    for (const p of pessoas) {
      if (!p.email) continue;
      const minhas = atrasadas.filter((d) => d.responsavel_id === p.id);
      if (minhas.length === 0) continue;

      const linhas = minhas
        .sort((a, b) => (a.prazo < b.prazo ? -1 : 1))
        .map((d) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${d.titulo}</td>` +
          `<td style="padding:6px 10px;border-bottom:1px solid #eee">${d.processo?.nome ?? 'Avulsa'}</td>` +
          `<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b42318"><b>${fmt(d.prazo)}</b></td></tr>`)
        .join('');

      const html = `
        <div style="font-family:Segoe UI,Arial,sans-serif;color:#1a2433;max-width:640px">
          <h2 style="color:#b42318">⏰ Você tem ${minhas.length} demanda(s) em atraso</h2>
          <p>Bom dia, ${p.nome.split(' ')[0]}. Estas demandas passaram do prazo:</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px">
            <tr style="background:#f4f6f9"><th style="padding:6px 10px;text-align:left">Demanda</th>
              <th style="padding:6px 10px;text-align:left">Processo</th>
              <th style="padding:6px 10px;text-align:left">Prazo</th></tr>
            ${linhas}
          </table>
          <p style="margin-top:16px"><a href="${APP_URL}/demandas/inbox"
             style="background:#2456c4;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
             Abrir meu Inbox</a></p>
          <p style="color:#8b97a8;font-size:12px">Relatório automático diário — Plataforma Controladoria.</p>
        </div>`;
      await enviarEmail(p.email, `⏰ ${minhas.length} demanda(s) em atraso — Plataforma Controladoria`, html);
      enviados++;
      detalhe.push({ para: p.nome, atrasadas: minhas.length });
    }
    return res.status(200).json({ ok: true, data: hoje, emails_enviados: enviados, detalhe });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
}
