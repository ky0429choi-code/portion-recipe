/** 시트 접근은 이 파일에만 작성한다. 화면은 시트 헤더·열 순서를 알지 못한다. */
function db_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw apiError_('CONFIG_ERROR', '서버 설정(SHEET_ID)이 완료되지 않았습니다.');
  return SpreadsheetApp.openById(id);
}

function sheet_(db, name) {
  var sh = db.getSheetByName(name);
  if (!sh) throw apiError_('CONFIG_ERROR', name + ' 탭이 없습니다. 관리자에게 문의하세요.');
  return sh;
}

function isFilledRow_(row) { return row.some(function (v) { return v !== '' && v !== null; }); }

/**
 * 탭 전체를 객체 배열로 읽는다. 각 행에 실제 시트 행 번호(_row)를 붙인다.
 * limit: 업무 데이터는 MAX_ROWS, 계정·세션은 0(전체).
 */
function readTable_(db, name, limit) {
  var max = limit === undefined ? MAX_ROWS : limit;
  var sh = sheet_(db, name);
  var grid = sh.getDataRange().getValues();
  if (!grid.length) return { name: name, sheet: sh, headers: [], rows: [] };
  var headers = grid[0].map(function (x) { return str_(x).trim(); });
  (REQUIRED_HEADERS[name] || []).forEach(function (key) {
    if (headers.indexOf(key) === -1) throw apiError_('CONFIG_ERROR', name + ' 필수 열 누락: ' + key);
  });
  var rows = [];
  for (var i = 1; i < grid.length; i++) {
    if (max && rows.length >= max) break;
    if (!isFilledRow_(grid[i])) continue;
    var obj = { _row: i + 1 };
    for (var j = 0; j < headers.length; j++) if (headers[j]) obj[headers[j]] = grid[i][j];
    rows.push(obj);
  }
  return { name: name, sheet: sh, headers: headers, rows: rows };
}

/** 계정·세션 행이 바뀌면 해당 캐시를 지워 즉시 반영되게 한다. */
function invalidateRowCache_(table, rowObj, patch) {
  if (table.name === DB_TAB.users) {
    cacheDel_('usr:' + normId_(rowObj.userId));
    if (patch && patch.userId) cacheDel_('usr:' + normId_(patch.userId));
  } else if (table.name === DB_TAB.sessions) {
    cacheDel_('ses:' + str_(rowObj.tokenHash));
  }
}

function readRows_(db, name, limit) { return readTable_(db, name, limit).rows; }

/** 지정한 행에서 patch에 있는 열만 바꾼다. 모르는 열은 그대로 둔다. */
function updateRow_(table, rowObj, patch) {
  var width = table.headers.length;
  var range = table.sheet.getRange(rowObj._row, 1, 1, width);
  var values = range.getValues()[0].slice();
  invalidateRowCache_(table, rowObj, patch);
  Object.keys(patch).forEach(function (key) {
    var idx = table.headers.indexOf(key);
    if (idx >= 0) { values[idx] = safeCell_(patch[key]); rowObj[key] = patch[key]; }
  });
  range.setValues([values]);
}

function appendMapped_(db, name, obj) {
  var sh = sheet_(db, name);
  var keys = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(keys.map(function (k) { return safeCell_(obj[str_(k).trim()]); }));
}

function conf_(db, key) {
  var r = readRows_(db, DB_TAB.config).filter(function (x) { return str_(x.key) === key; })[0];
  return r ? str_(r.value) : '';
}

function audit_(db, actor, action, entityId, summary) {
  appendMapped_(db, DB_TAB.audit, {
    id: Utilities.getUuid(), createdAt: new Date(), actor: str_(actor).slice(0, 64),
    action: action, entityId: str_(entityId), summary: str_(summary)
  });
}

/** 관리자 설정용: 탭이 없을 때만 만들고 헤더를 쓴다. */
function ensureTab_(db, name, headers) {
  var sh = db.getSheetByName(name);
  if (sh) return { sheet: sh, created: false };
  sh = db.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  return { sheet: sh, created: true };
}
