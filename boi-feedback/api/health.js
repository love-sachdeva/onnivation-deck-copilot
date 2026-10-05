import { put, del } from '@vercel/blob';

export default async function handler(req, res) {
  const supplied = String(req.query?.key || '');
  if (!process.env.ADMIN_KEY || supplied !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false });
  }
  try {
    const path = `health/${Date.now()}.txt`;
    const blob = await put(path, 'ok', { access: 'private', contentType: 'text/plain' });
    await del(blob.url);
    return res.status(200).json({ ok: true, storage: 'private-blob' });
  } catch (error) {
    console.error('health_error', error);
    return res.status(500).json({ ok: false, error: 'storage check failed' });
  }
}