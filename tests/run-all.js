/* 전체 시험: node tests/run-all.js  (합성 데이터만 사용, 외부 연결 없음) */
const { spawnSync } = require('child_process'), path = require('path');
let failed = 0;
for (const t of ['test-gas.js', 'test-public.js']) {
  console.log(`\n=== ${t} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, t)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n전체 결과: ${failed}개 묶음 실패` : '\n전체 결과: 모두 통과');
process.exitCode = failed ? 1 : 0;
