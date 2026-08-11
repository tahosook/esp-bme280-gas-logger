function doGet() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
    const apiToken = properties.getProperty('API_TOKEN');
    const sheetName = properties.getProperty('SHEET_NAME') || 'DATA';

    if (!spreadsheetId || !apiToken) {
      return readinessResponse_(false);
    }

    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
    return readinessResponse_(!!sheet);
  } catch (error) {
    console.error('not_ready');
    return readinessResponse_(false);
  }
}

function readinessResponse_(ready) {
  if (ready) {
    return jsonResponse_({ ok: true, ready: true });
  }
  return jsonResponse_({ ok: false, ready: false, error: 'not_ready' });
}

function jsonResponse_(body) {
  return ContentService
      .createTextOutput(JSON.stringify(body))
      .setMimeType(ContentService.MimeType.JSON);
}
