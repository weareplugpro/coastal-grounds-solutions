// Vercel serverless function: receives the free-estimate form and delivers it.
//
// Set at least one destination in Vercel > Project > Settings > Environment Variables:
//   LEAD_WEBHOOK_URL  - any webhook that accepts JSON (GoHighLevel inbound webhook, Zapier, Make, Slack, etc.)
//   RESEND_API_KEY + LEAD_EMAIL_TO  - email each lead via Resend (https://resend.com)
//   LEAD_EMAIL_FROM   - optional sender, e.g. "Website <leads@yourdomain.com>" (domain must be verified in Resend)
//
// If nothing is configured or every destination fails, the endpoint returns an error and the
// page automatically offers a pre-filled text message to (239) 887-8922, so no lead is lost.

const MAX = { name: 120, phone: 40, email: 160, town: 80, service: 120, message: 2000, page: 200 };

function clean(v, n) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
}
function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function toWebhook(url, lead) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
  if (!r.ok) throw new Error('webhook ' + r.status);
}

async function toEmail(key, to, from, lead) {
  const rows = [
    ['Name', lead.name], ['Phone', lead.phone], ['Email', lead.email], ['Town', lead.town],
    ['Service', lead.service], ['Message', lead.message], ['Page', lead.page], ['Received', lead.received_at],
  ].filter((r) => r[1]);
  const htmlBody = '<h2>New free estimate request</h2><table cellpadding="6">' +
    rows.map((r) => '<tr><td><strong>' + r[0] + '</strong></td><td>' + esc(r[1]).replace(/\n/g, '<br>') + '</td></tr>').join('') +
    '</table><p><a href="tel:' + esc(lead.phone.replace(/[^\d+]/g, '')) + '">Call ' + esc(lead.name) + '</a></p>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: from || 'Coastal Grounds Website <onboarding@resend.dev>',
      to: to.split(',').map((s) => s.trim()).filter(Boolean),
      reply_to: lead.email || undefined,
      subject: 'Estimate request: ' + lead.name + (lead.town ? ' (' + lead.town + ')' : ''),
      html: htmlBody,
      text: rows.map((r) => r[0] + ': ' + r[1]).join('\n'),
    }),
  });
  if (!r.ok) throw new Error('email ' + r.status);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // Spam traps: hidden honeypot field filled in, or the form submitted inhumanly fast.
  // Answer "ok" so bots don't learn anything, but deliver nothing.
  if (clean(body.company_website, 200) || Number(body.elapsed) < 2500) {
    return res.status(200).json({ ok: true });
  }

  const lead = {
    name: clean(body.name, MAX.name),
    phone: clean(body.phone, MAX.phone),
    email: clean(body.email, MAX.email),
    town: clean(body.town, MAX.town),
    service: clean(body.service, MAX.service),
    message: String(body.message == null ? '' : body.message).trim().slice(0, MAX.message),
    page: clean(body.page, MAX.page),
    source: 'website estimate form',
    received_at: new Date().toISOString(),
  };
  if (!lead.name || lead.phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ ok: false, error: 'invalid' });
  }

  const { LEAD_WEBHOOK_URL, RESEND_API_KEY, LEAD_EMAIL_TO, LEAD_EMAIL_FROM } = process.env;
  const jobs = [];
  if (LEAD_WEBHOOK_URL) jobs.push(toWebhook(LEAD_WEBHOOK_URL, lead));
  if (RESEND_API_KEY && LEAD_EMAIL_TO) jobs.push(toEmail(RESEND_API_KEY, LEAD_EMAIL_TO, LEAD_EMAIL_FROM, lead));
  if (!jobs.length) {
    console.error('Lead received but no destination configured', lead);
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  const results = await Promise.allSettled(jobs);
  results.filter((r) => r.status === 'rejected').forEach((r) => console.error('Lead delivery failed:', r.reason));
  if (results.some((r) => r.status === 'fulfilled')) return res.status(200).json({ ok: true });
  return res.status(502).json({ ok: false, error: 'delivery_failed' });
};
