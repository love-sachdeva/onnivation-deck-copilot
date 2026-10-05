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
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('submission_error', error);
    return res.status(500).json({ error: 'Could not save response' });
  }
}