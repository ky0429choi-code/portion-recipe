'use strict';
const appUrl='https://script.google.com/macros/s/AKfycbxr31or_O6mPO4ayOQy7bmCZmaOEnLTxJCYZDEGmjfN2yD6BCA6c9js9dFJxBtaZXII/exec';
const frame=document.querySelector('#app');
const status=document.querySelector('#status');
const offline=document.querySelector('#offline');
const install=document.querySelector('#install');
let installPrompt=null;
let connectionTimer=null;
document.querySelector('#open').href=appUrl;
function connect(){
 clearTimeout(connectionTimer);
 offline.hidden=navigator.onLine;
 frame.hidden=!navigator.onLine;
 if(!navigator.onLine){frame.removeAttribute('src');status.textContent='오프라인';return;}
 status.textContent='로그인 화면에 연결 중입니다.';
 frame.src=appUrl;
 connectionTimer=setTimeout(()=>{status.textContent='연결이 지연되면 새로고침하거나 브라우저에서 열기를 선택해 주세요.';},15000);
}
frame.addEventListener('load',()=>{clearTimeout(connectionTimer);if(navigator.onLine&&frame.hasAttribute('src'))status.textContent='아이디와 비밀번호로 로그인해 주세요.';});
document.querySelector('#reload').addEventListener('click',connect);
document.querySelector('#retry').addEventListener('click',connect);
window.addEventListener('online',connect);
window.addEventListener('offline',connect);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;install.hidden=false;});
install.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;install.hidden=true;});
window.addEventListener('appinstalled',()=>{install.hidden=true;installPrompt=null;});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{status.textContent='앱 설치 준비에 실패했습니다. 새로고침해 주세요.';});
connect();
