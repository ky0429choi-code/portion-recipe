/**
 * 정리용 서비스워커 — 예전 앱(iframe 래퍼)이 남긴 오프라인 캐시를 지우고 스스로 등록 해제한다.
 * 브라우저가 예전 sw.js의 갱신을 확인할 때 이 파일을 받아 한 번 실행된다. v3는 서비스워커를 새로 등록하지 않는다.
 * (로그인 데이터는 캐시에 남기지 않는다는 원칙)
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('portion-recipe-shell-')).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
