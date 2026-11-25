/**
 * 공개 폴더(docs/ = GitHub Pages) 유출 검사. 실행: node tests/test-public.js
 * 공개되면 안 되는 것: 스프레드시트 ID, 이메일, 비밀값 형태, 실데이터 파일, 인라인 스크립트.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'docs');
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.svg', '.png', '.ico', '.webmanifest', '.txt', '.md']);

function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])); }

const RULES = [
  ['구글 스프레드시트 주소', /docs\.google\.com\/spreadsheets/i],
  ['스프레드시트/스크립트 ID로 보이는 긴 식별자', /\b1[A-Za-z0-9_-]{40,}\b/],
  ['GAS 배포 주소(설정 파일 외)', /script\.google\.com\/macros\/s\//i, (f) => !f.endsWith(path.join('js', 'config.js'))],
  ['이메일 주소', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['비밀값 키워드', /(api[_-]?key|secret|client_secret|refresh_token|OWNER_EMAIL|SHEET_ID)\s*[:=]/i],
  ['인라인 스크립트', /<script(?![^>]*\bsrc=)[^>]*>/i, (f) => f.endsWith('.html')],
  ['인라인 style 속성', /\sstyle\s*=\s*["']/i, (f) => f.endsWith('.html') || f.endsWith('.js')],
  ['eval/new Function', /\beval\s*\(|new\s+Function\s*\(/]
];

const problems = [];
const files = walk(ROOT);
for (const f of files) {
  const rel = path.relative(ROOT, f);
  if (!ALLOWED_EXT.has(path.extname(f).toLowerCase())) { problems.push(`${rel}: 공개 폴더에 허용되지 않는 파일 형식`); continue; }
  if (path.extname(f).toLowerCase() === '.png') continue; // 아이콘 이미지는 문자열 검사 제외
  if (/실데이터|회사자료|\.xlsx$|\.csv$/i.test(rel)) problems.push(`${rel}: 실데이터로 보이는 파일명`);
  const text = fs.readFileSync(f, 'utf8');
  for (const [name, re, applies] of RULES) {
    if (applies && !applies(f)) continue;
    const m = text.match(re);
    if (m) problems.push(`${rel}: ${name} → "${m[0].slice(0, 40)}"`);
  }
}

const cfg = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'config.js'), 'utf8');
const api = (cfg.match(/API_URL:\s*'([^']*)'/) || [])[1];
if (api === undefined) problems.push('config.js: API_URL 항목을 찾을 수 없음');
else if (api && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(api)) problems.push('config.js: API_URL은 비우거나 GAS /exec 주소여야 함');

if (problems.length) { problems.forEach((p) => console.log('FAIL  ' + p)); console.log(`\n공개 폴더 검사: ${problems.length}건 문제 (${files.length}개 파일)`); process.exitCode = 1; }
else console.log(`PASS  공개 폴더 검사: ${files.length}개 파일, 민감 정보·인라인 스크립트 없음 (API_URL ${api ? '설정됨' : '비어 있음 → 시연 모드'})`);
