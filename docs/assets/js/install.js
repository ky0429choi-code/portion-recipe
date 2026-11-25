/**
 * 휴대폰 설치 안내.
 * - Android Chrome/삼성 인터넷: 브라우저가 설치 가능하다고 알려 주면(beforeinstallprompt) [앱 설치] 버튼 표시
 * - iPhone Safari: 설치 버튼 기능이 없으므로 '공유 → 홈 화면에 추가' 안내 표시
 * - 이미 앱으로 실행 중이면 아무것도 표시하지 않음
 * 로그인 정보는 캐시에 저장하지 않으므로 서비스워커를 쓰지 않는다.
 */
import { $$, flash } from './util.js';

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let deferred = null;

export function initInstall() {
  if (standalone()) return;
  if (isIOS()) $$('.ios-hint').forEach((el) => { el.hidden = false; });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $$('.install-btn').forEach((b) => { b.hidden = false; });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    $$('.install-btn').forEach((b) => { b.hidden = true; });
    flash('홈 화면에 설치했어요.');
  });
  $$('.install-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!deferred) { flash('브라우저 메뉴(⋮)에서 “앱 설치” 또는 “홈 화면에 추가”를 눌러 주세요.'); return; }
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      $$('.install-btn').forEach((x) => { x.hidden = true; });
    });
  });
}
