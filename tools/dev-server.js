/**
 * 로컬 미리보기 서버 — 합성 데이터 + GAS 모의 실행. 실제 시트·GAS에 연결하지 않는다.
 * 실행: node tools/dev-server.js  → http://localhost:5173
 * 로컬 시험 계정은 tests/fixtures/dev-users.json (합성 전용, 실제 계정 아님)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { createGasEnv, syntheticTabs, seedUser } = require('../tests/gas-sim');

const PORT = Number(process.env.PORT || 5173);
const DOCS = path.join(__dirname, '..', 'docs');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const env = createGasEnv({ tabs: syntheticTabs(), props: { SHEET_ID: 'LOCAL_SYNTHETIC' } });
env.run('setupV3');
env.tabs.USERS.splice(1); // setupV3 기본 관리자 대신 fixture 계정 사용
const users = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'dev-users.json'), 'utf8'));
users.forEach((u) => seedUser(env, u));

const devConfig = "export const CONFIG = Object.freeze({ API_URL: '/api', REQUEST_TIMEOUT_MS: 25000 });\n";

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 50000) req.destroy(); });
    req.on('end', () => {
      const out = env.run('doPost', { postData: { contents: body } }).getContent();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(out);
    });
    return;
  }
  // DEMO=1 이면 실제 config.js(API_URL 비어 있음)를 그대로 내보내 공개 시연 모드를 확인한다.
  if (url.pathname === '/assets/js/config.js' && !process.env.DEMO) { res.writeHead(200, { 'Content-Type': MIME['.js'] }); res.end(devConfig); return; }
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(DOCS, rel));
  if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`로컬 미리보기: http://localhost:${PORT}  (합성 데이터 · 계정은 tests/fixtures/dev-users.json)`));
