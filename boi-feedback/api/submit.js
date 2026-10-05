import { put } from '@vercel/blob';
import { waitUntil } from '@vercel/functions';

const allowedParticipants = new Set([
  "myles-o-grady","billy-o-connell","mark-spain","matt-elliott","ciaran-coyle",
  "john-feeney","gail-goldie","gavin-kelly","rhys-kyff","aine-mccleary",
  "susan-russell","sarah-mclaughlin","prag-sharma","fiona-fitton"
]);

const NEXT_STEP_LABELS = {
  'use-case-discussion': 'Focussed Use Case Discussion',
  'product-evaluation': 'Deeper Product Evaluation',
  'poc-discussion': 'POC Discussion'
};

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
    // The response is safely in Blob; the sheet copy finishes after we reply.
    waitUntil(sendToSheet(record));
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('submission_error', error);
    return res.status(500).json({ error: 'Could not save response' });
  }
}

// One row per participant. Keys become sheet headers, in this order.
function toSheetRow(r) {
  const sessions = Array.isArray(r.sessions) ? r.sessions : [];
  const labelsFor = signal => sessions.filter(s => s.signal === signal).map(s => s.session_label).join(', ');
  const details = sessions
    .filter(s => s.signal === 'forward')
    .map(s => {
      const parts = [s.session_label];
      if (s.use_case) parts.push(`Use case: ${s.use_case}`);
      if (s.next_step) parts.push(`Next step: ${NEXT_STEP_LABELS[s.next_step] || s.next_step}`);
      return parts.join(' — ');
    })
    .join('\n');
  return {
    'Submitted at': r.submitted_at || r.received_at || '',
    'Name': r.participant_name || '',
    'Title': r.participant_title || '',
    'Take forward': labelsFor('forward'),
    'Interesting': labelsFor('interesting'),
    'Not now': labelsFor('not-now'),
    'Take forward details': details,
    'Participant ID': r.participant_id || '',
    'Submission ID': r.submission_id || ''
  };
}

// Mirrors each submission into the Google Sheet via its Apps Script web app.
// Blob remains the source of truth, so a sheet failure is logged, not surfaced.
async function sendToSheet(record) {
  if (!process.env.SHEET_WEBHOOK_URL) return;
  try {
    const res = await fetch(process.env.SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      // `record` keeps older Apps Script versions working; current ones use `key` + `row`.
      body: JSON.stringify({ secret: process.env.SHEET_SECRET || '', key: 'Participant ID', row: toSheetRow(record), record }),
      signal: AbortSignal.timeout(15000)
    });
    const text = await res.text();
    if (!res.ok || !text.includes('"ok":true')) console.error('sheet_error', res.status, text.slice(0, 200));
  } catch (error) {
    console.error('sheet_error', error);
  }
}
