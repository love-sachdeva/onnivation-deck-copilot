import { list, get } from '@vercel/blob';

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default async function handler(req, res) {
  const supplied = String(req.query?.key || '');
  if (!process.env.ADMIN_KEY || supplied !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    // Latest submission per participant wins, so resubmissions replace earlier answers.
    const latest = new Map();
    let cursor;
    do {
      const page = await list({ prefix: 'responses/', limit: 1000, cursor });
      for (const blob of page.blobs) {
        const result = await get(blob.pathname, { access: 'private', useCache: false });
        if (!result || result.statusCode !== 200) continue;
        const text = await new Response(result.stream).text();
        const record = JSON.parse(text);
        const prev = latest.get(record.participant_id);
        if (!prev || String(record.received_at) > String(prev.received_at)) latest.set(record.participant_id, record);
      }
      cursor = page.cursor;
    } while (cursor);

    const rows = [];
    for (const record of latest.values()) {
      const sessions = Array.isArray(record.sessions) ? record.sessions : [];
      if (sessions.length === 0) {
        rows.push({
          participant_name: record.participant_name,
          participant_id: record.participant_id,
          submitted_at: record.submitted_at || record.received_at,
          session: '',
          decision: '',
          use_case: '',
          next_step: ''
        });
      } else {
        for (const s of sessions) rows.push({
          participant_name: record.participant_name,
          participant_id: record.participant_id,
          submitted_at: record.submitted_at || record.received_at,
          session: s.session_label || s.session_id,
          decision: s.signal || '',
          use_case: s.use_case || '',
          next_step: s.next_step || ''
        });
      }
    }

    if (String(req.query?.format || '').toLowerCase() === 'json') {
      return res.status(200).json({ rows });
    }

    const headers = ['participant_name','participant_id','submitted_at','session','decision','use_case','next_step'];
    const csv = [headers.join(','), ...rows.map(row => headers.map(h => csvEscape(row[h])).join(','))].join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="boi-ai-immersion-feedback.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    console.error('export_error', error);
    return res.status(500).json({ error: 'Could not export responses' });
  }
}