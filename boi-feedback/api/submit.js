import { put } from '@vercel/blob';

const allowedParticipants = new Set([
  "myles-o-grady","billy-o-connell","mark-spain","matt-elliott","ciaran-coyle",
  "john-feeney","gail-goldie","gavin-kelly","rhys-kyff","aine-mccleary",
  "susan-russell","sarah-mclaughlin","prag-sharma","fiona-fitton"
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !allowedParticipants.has(body.participant_id)) {
      return res.status(400).json({ error: 'Invalid participant' });
    }
    if (!body.submission_id || !Array.isArray(body.sessions)) {
      return res.status(400).json({ error: 'Invalid submission' });
    }
    const safeId = String(body.submission_id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
    const record = {
      ...body,
      received_at: new Date().toISOString(),
      source: 'boi-ai-immersion-feedback'
    };
    const pathname = `responses/${body.participant_id}/${safeId}.json`;
    await put(pathname, JSON.stringify(record, null, 2), {
      access: 'private',
      contentType: 'application/json',
      allowOverwrite: true
    });
    await sendToSheet(record);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('submission_error', error);
    return res.status(500).json({ error: 'Could not save response' });
  }
}
// Mirrors each submission into the Google Sheet via its Apps Script web app.
// Blob remains the source of truth, so a sheet failure is logged, not surfaced.
async function sendToSheet(record) {
  if (!process.env.SHEET_WEBHOOK_URL) return;
  try {
    const res = await fetch(process.env.SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ secret: process.env.SHEET_SECRET || '', record }),
      signal: AbortSignal.timeout(8000)
    });
    const text = await res.text();
    if (!res.ok || !text.includes('"ok":true')) console.error('sheet_error', res.status, text.slice(0, 200));
  } catch (error) {
    console.error('sheet_error', error);
  }
}
