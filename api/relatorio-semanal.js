// Relatório semanal de desempenho — sexta ao fim do dia (cron da Vercel).
// Cada pessoa recebe o próprio resumo; cada gestor recebe o consolidado da equipe direta.
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

function metricas(demandas, pessoaId, inicioSemana) {
  const minhas = demandas.filter((d) => d.responsavel_id === pessoaId);
  const concluidas = minhas.filter((d) => d.status === 'concluida' && d.concluida_em && d.concluida_em >= inicioSemana);
  const noPrazo = concluidas.filter((d) => d.motivo_conclusao === 'no_prazo' || d.motivo_conclusao === 'antecipada').length;
  const leads = concluidas.map((d) => (new Date(d.concluida_em) - new Date(d.criado_em)) / 3600e3);
  const avals = concluidas.filter((d) => d.avaliacao_nota !== null);
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const abertas = minhas.filter((d) => ['aberta', 'em_execucao', 'bloqueada', 'em_validacao'].includes(d.status));
  return {
    concluidas: concluidas.length,
    sla: concluidas.length ? Math.round((noPrazo / concluidas.length) * 100) : null,
    leadH: leads.length ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length) : null,
    retrabalho: concluidas.reduce((s, d) => s + (d.retrabalho || 0), 0),
    nota: avals.length ? (avals.reduce((s, d) => s + d.avaliacao_nota, 0) / avals.length).toFixed(1) : null,
    abertas: abertas.length,
    atrasadas: abertas.filter((d) => d.prazo < hoje).length,
  };
}

const celula = (v) => `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${v}</td>`;
const linhaMetrica = (m) =>
  celula(m.concluidas) + celula(m.sla === null ? '—' : m.sla + '%') +
  celula(m.leadH === null ? '—' : m.leadH + 'h') + celula(m.retrabalho) +
  celula(m.nota === null ? '—' : '★ ' + m.nota) +
  celula(m.atrasadas > 0 ? `<span style="color:#b42318"><b>${m.atrasadas}</b></span>` : '0');
const cabecalhoTabela = (primeira) =>
  `<tr style="background:#f4f6f9"><th style="padding:6px 10px;text-align:left">${primeira}</th>` +
  ['Concluídas', 'SLA', 'Lead', 'Retrab.', 'Avaliação', 'Atrasadas']
    .map((h) => `<th style="padding:6px 10px">${h}</th>`).join('') + '</tr>';

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers['authorization'] !== `Bearer ${secreto}` && req.query?.secret !== secreto) {
    return res.status(401).json({ erro: 'não autorizado' });
  }
  try {
    const agora = new Date(Date.now() - 3 * 3600e3);
    const inicioSemana = new Date(agora);
    inicioSemana.setDate(agora.getDate() - ((agora.getDay() + 6) % 7)); // segunda-feira
    const inicioIso = inicioSemana.toISOString().slice(0, 10);

    const pessoas = await sb('pessoas?select=id,nome,email,gestor_id,perfil&ativa=is.true');
    const demandas = await sb(
      'demandas?select=id,titulo,status,prazo,criado_em,concluida_em,motivo_conclusao,retrabalho,avaliacao_nota,responsavel_id' +
      '&archived_at=is.null&status=not.in.(solicitada,rejeitada)');

    let enviados = 0;

    // 1) Relatório pessoal
    for (const p of pessoas) {
      if (!p.email) continue;
      const m = metricas(demandas, p.id, inicioIso);
      if (m.concluidas === 0 && m.abertas === 0) continue;
      const html = `
        <div style="font-family:Segoe UI,Arial,sans-serif;color:#1a2433;max-width:640px">
          <h2 style="color:#2456c4">📊 Seu desempenho na semana</h2>
          <p>Olá, ${p.nome.split(' ')[0]}. Resumo de ${inicioIso.split('-').reverse().join('/')} até hoje:</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px">
            ${cabecalhoTabela('Você')}
            <tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${p.nome}</td>${linhaMetrica(m)}</tr>
          </table>
          <p style="color:#5c6b80;font-size:13px;margin-top:10px">
            ${m.abertas} demanda(s) seguem ativas para a próxima semana${m.atrasadas ? ` — <b style="color:#b42318">${m.atrasadas} em atraso</b>` : ''}.
          </p>
          <p style="margin-top:12px"><a href="${APP_URL}/indicadores/desempenho"
             style="background:#2456c4;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
             Ver meus indicadores</a></p>
          <p style="color:#8b97a8;font-size:12px">Relatório automático semanal — leitura de desenvolvimento, nunca ranking.</p>
        </div>`;
      await enviarEmail(p.email, '📊 Seu desempenho da semana — Plataforma Controladoria', html);
      enviados++;
    }

    // 2) Relatório da equipe para cada gestor
    for (const g of pessoas) {
      if (!g.email) continue;
      const equipe = pessoas.filter((p) => p.gestor_id === g.id);
      if (equipe.length === 0) continue;
      const linhas = equipe.map((p) => {
        const m = metricas(demandas, p.id, inicioIso);
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${p.nome}</td>${linhaMetrica(m)}</tr>`;
      }).join('');
      const html = `
        <div style="font-family:Segoe UI,Arial,sans-serif;color:#1a2433;max-width:680px">
          <h2 style="color:#2456c4">👥 Desempenho da sua equipe na semana</h2>
          <p>Olá, ${g.nome.split(' ')[0]}. Consolidado da equipe direta desde ${inicioIso.split('-').reverse().join('/')}:</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px">
            ${cabecalhoTabela('Pessoa')}
            ${linhas}
          </table>
          <p style="margin-top:12px"><a href="${APP_URL}/indicadores/desempenho"
             style="background:#2456c4;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
             Abrir Indicadores</a></p>
          <p style="color:#8b97a8;font-size:12px">Relatório automático semanal — Plataforma Controladoria.</p>
        </div>`;
      await enviarEmail(g.email, '👥 Desempenho da equipe na semana — Plataforma Controladoria', html);
      enviados++;
    }

    return res.status(200).json({ ok: true, semana_desde: inicioIso, emails_enviados: enviados });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
}
