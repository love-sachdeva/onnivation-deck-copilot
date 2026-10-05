// Paste into Extensions → Apps Script of the responses Google Sheet.
// Set Script property SHEET_SECRET (Project Settings → Script properties) to the value from Vercel.

const HEADERS = [
  'received_at', 'submitted_at', 'participant_name', 'participant_id', 'participant_title',
  'session', 'decision', 'take_forward', 'use_case', 'next_step', 'submission_id'
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('SHEET_SECRET');
    if (!secret || body.secret !== secret) return json({ ok: false, error: 'unauthorized' });

    const r = body.record || {};
    const sheet = getSheet();
    const sessions = Array.isArray(r.sessions) && r.sessions.length ? r.sessions : [{}];
    const rows = sessions.map(s => [
      r.received_at || '', r.submitted_at || '', r.participant_name || '', r.participant_id || '',
      r.participant_title || '', s.session_label || s.session_id || '', s.signal || '',
      s.take_forward ? 'yes' : '', s.use_case || '', s.next_step || '', r.submission_id || ''
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    return json({ ok: true, rows: rows.length });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Responses') || ss.insertSheet('Responses');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
