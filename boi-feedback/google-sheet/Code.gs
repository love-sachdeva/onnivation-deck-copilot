// Paste into Extensions → Apps Script of the responses Google Sheet.
// Set Script property SHEET_SECRET (Project Settings → Script properties) to the value from Vercel.
//
// The backend sends { secret, key, row } where row is { header: value }.
// One row per `key` value: a resubmission replaces that person's row.
// Columns are created from the row's keys, so the layout is controlled by the backend.

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('SHEET_SECRET');
    if (!secret || body.secret !== secret) return json({ ok: false, error: 'unauthorized' });

    const row = body.row || {};
    const sheet = getSheet();
    const headers = ensureHeaders(sheet, Object.keys(row));
    const values = headers.map(h => (h in row ? row[h] : ''));

    let target = sheet.getLastRow() + 1;
    const keyCol = headers.indexOf(body.key) + 1;
    if (keyCol > 0 && row[body.key] && sheet.getLastRow() > 1) {
      const keys = sheet.getRange(2, keyCol, sheet.getLastRow() - 1, 1).getValues();
      const i = keys.findIndex(k => String(k[0]) === String(row[body.key]));
      if (i >= 0) target = i + 2;
    }
    sheet.getRange(target, 1, 1, headers.length).setValues([values]).setVerticalAlignment('top').setWrap(true);
    return json({ ok: true, row: target });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('Responses') || ss.insertSheet('Responses');
}

// Returns the header row, appending any columns the row introduces.
function ensureHeaders(sheet, wanted) {
  const width = sheet.getLastColumn();
  const existing = width ? sheet.getRange(1, 1, 1, width).getValues()[0].filter(String) : [];
  const missing = wanted.filter(h => !existing.includes(h));
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, 1, 1, existing.length + missing.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return existing.concat(missing);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
