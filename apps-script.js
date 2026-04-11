// Google Apps Script — paste this into Extensions > Apps Script in your Google Sheet
// Then deploy: Deploy > New deployment > Web app > Anyone > Deploy
// Copy the web app URL into your dashboard config.js

const SHEET_NAME = 'Reviews';

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const body = JSON.parse(e.postData.contents);

  if (body.action === 'flag') {
    // Add a new review row
    const row = [
      body.detectionId || '',
      body.stationName || '',
      body.stationId || '',
      body.speciesName || '',
      body.speciesId || '',
      body.timestamp || '',
      body.audioUrl || '',
      body.startTime || 0,
      body.endTime || 0,
      body.score || 0,
      body.confidence || 0,
      'needs_review',
      body.reviewer || '',
      '',
      new Date().toISOString(),
      ''
    ];
    sheet.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ success: true, action: 'flag' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'review') {
    // Find the row by detectionId and update status
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol = headers.indexOf('detectionId');
    const statusCol = headers.indexOf('status');
    const correctionCol = headers.indexOf('correction');
    const reviewedAtCol = headers.indexOf('reviewedAt');
    const reviewerCol = headers.indexOf('reviewer');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(body.detectionId)) {
        sheet.getRange(i + 1, statusCol + 1).setValue(body.status);
        sheet.getRange(i + 1, correctionCol + 1).setValue(body.correction || '');
        sheet.getRange(i + 1, reviewedAtCol + 1).setValue(new Date().toISOString());
        if (body.reviewedBy) {
          // Don't overwrite the original flagger — store reviewer in correction notes
          const existing = sheet.getRange(i + 1, correctionCol + 1).getValue();
          const note = body.correction
            ? `${body.reviewedBy}: ${body.correction}`
            : existing;
          sheet.getRange(i + 1, correctionCol + 1).setValue(note);
        }
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, action: 'review' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
    .setMimeType(ContentService.MimeType.JSON);
}
