// Agenda por assinatura (iCalendar) — as demandas da pessoa no Calendário
// nativo do iPhone/Android/Outlook, incluindo o widget da tela de bloqueio.
// URL: /api/agenda.ics?p=<id-da-pessoa>  (o id é um UUID não-adivinhável)
const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL || 'https://plataforma-controladoria.vercel.app';

async function sb(caminho) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

const esc = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const dia = (iso) => iso.slice(0, 10).replace(/-/g, '');
const diaMais1 = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};

export default async function handler(req, res) {
  try {
    const pessoaId = String(req.query?.p ?? '');
    if (!/^[0-9a-f-]{36}$/.test(pessoaId)) {
      return res.status(400).send('Parâmetro p inválido.');
    }
    const pessoas = await sb(`pessoas?select=id,nome&id=eq.${pessoaId}&ativa=is.true`);
    if (!pessoas.length) return res.status(404).send('Pessoa não encontrada.');

    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const ini = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
    const fim = new Date(Date.now() + 60 * 86400e3).toISOString().slice(0, 10);
    const demandas = await sb(
      `demandas?select=id,titulo,status,prazo,motivo_conclusao,processo:processos(nome)` +
      `&responsavel_id=eq.${pessoaId}&archived_at=is.null` +
      `&status=in.(aberta,em_execucao,bloqueada,em_validacao,concluida)` +
      `&prazo=gte.${ini}&prazo=lte.${fim}`);

    const linhas = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Plataforma Controladoria//Agenda//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Controladoria — ${esc(pessoas[0].nome.split(' ')[0])}`,
      'X-WR-TIMEZONE:America/Fortaleza',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ];

    for (const d of demandas) {
      const atrasada = d.status !== 'concluida' && d.prazo < hoje;
      const marca = d.status === 'concluida' ? '✅'
        : atrasada ? '🔴' : d.status === 'bloqueada' ? '⛔' : '🔵';
      linhas.push(
        'BEGIN:VEVENT',
        `UID:${d.id}@plataforma-controladoria`,
        `DTSTAMP:${dia(hoje)}T090000Z`,
        `DTSTART;VALUE=DATE:${dia(d.prazo)}`,
        `DTEND;VALUE=DATE:${diaMais1(d.prazo)}`,
        `SUMMARY:${marca} ${esc(d.titulo)}`,
        `DESCRIPTION:${esc((d.processo?.nome ? `Processo: ${d.processo.nome}\n` : 'Avulsa\n') +
          `Status: ${d.status}${atrasada ? ' (ATRASADA)' : ''}\nAbrir: ${APP_URL}/demandas/inbox/${d.id}`)}`,
        `URL:${APP_URL}/demandas/inbox/${d.id}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    }
    linhas.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    return res.status(200).send(linhas.join('\r\n'));
  } catch (e) {
    return res.status(500).send(`Erro: ${e.message || e}`);
  }
}
