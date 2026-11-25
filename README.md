# 화성지역 인당량 가이드 v3 — GitHub Pages + GAS 계정 게이트

인당량·레시피 앱의 **본 프로젝트**입니다. (v2 `인당량_GAS_v2`는 백업·롤백용으로 보관)
GAS 프로젝트는 **기존 인당량 GAS 프로젝트 하나**를 v3 코드로 교체해 쓰고, 기존 `/exec` 주소를 유지합니다.

## 구조

```text
[GitHub Pages  docs/]            [GAS 웹앱  gas/]                     [Google Sheets 운영 DB]
 화면 틀(HTML·CSS·JS)만    →     ① 아이디/비밀번호 확인 → 토큰 발급   →  USERS    (계정·역할·사업장 범위)
 데이터 0건                      ② 매 요청 토큰·계정 상태 검사           SESSIONS (토큰 해시만)
 로그인 후 데이터 요청      ←     ③ 권한 범위 안의 데이터만 응답         PORTIONS / RECIPES / FEEDBACK / AUDIT_LOG
```

- GitHub(공개)에는 **화면 코드와 GAS 주소만** 올라갑니다. 주소가 알려져도 토큰 없이는 아무 데이터도 나오지 않습니다.
- 비밀번호는 PBKDF2(사용자별 솔트)로, 세션 토큰은 SHA-256 해시로만 시트에 저장됩니다.
- 5회 연속 실패 시 15분 잠금, 로그인 8시간 유지, 임시 비밀번호는 72시간 안에 첫 로그인 후 변경해야 합니다.
- 계정 정지(`status=DISABLED`)는 다음 요청부터 즉시 적용됩니다.

## 폴더

| 폴더 | 내용 | 공개 여부 |
|---|---|---|
| `docs/` | GitHub Pages 화면. `assets/js/config.js`의 `API_URL`만 배포 때 채움 | 공개 |
| `gas/` | GAS 서버 코드 (clasp로 업로드) | 저장소에 포함(비밀값 없음) |
| `tests/` | 합성 데이터 시험, 공개 폴더 유출 검사 | 저장소에 포함 |
| `tools/` | 로컬 미리보기 서버, GAS 배포 스크립트 | 저장소에 포함 |
| `guide/` | 배포 절차, 계정 관리, 확장 설계 | 저장소에 포함 |

## 자주 쓰는 명령

```powershell
node tests/run-all.js            # 전체 시험 (배포 전 필수)
node tools/dev-server.js         # 로컬 미리보기 http://localhost:5173 (합성 데이터, 계정: tests/fixtures/dev-users.json)
.\tools\deploy-gas.ps1 -Attach -ScriptId "…" -ExecUrl "…"   # (처음 한 번) 기존 GAS 프로젝트 연결 + 현재 코드 백업
.\tools\deploy-gas.ps1           # GAS 코드 업로드 (기존 프로젝트 파일을 v3로 교체)
.\tools\deploy-gas.ps1 -Deploy   # 업로드 + 기존 웹앱 주소를 새 버전으로 전환
```

## 절대 원칙

1. `docs/`에 실데이터·시트 ID·이메일·비밀번호를 넣지 않는다 (`tests/test-public.js`와 GitHub Actions가 검사).
2. 공식 수치는 서버(GAS)가 만든다. 화면은 표시용 식수 환산만 한다.
3. v2 원칙 유지: `ratioPct` 재계산 금지, 미연결 메뉴 임의 연결 금지, 기준 인분 없는 레시피 자동 환산 금지.
4. 관리자 기능(계정 발급 등)은 GAS 편집기에서만 실행한다. 웹 API로 열지 않는다.

## 문서

- [최종 설계도](guide/00_최종설계도.md) — 구조도, 로그인 흐름, 보안 설계, 운영 흐름
- [배포 절차](guide/01_배포절차.md) — 처음 배포, 이후 업데이트, 롤백
- [계정 관리](guide/02_계정관리.md) — 새 사람 등록, 비밀번호 지정, 정지, 관리자 복구
- [확장 설계](guide/03_확장설계.md) — 인사이트·운영현황 연결 계획, 남은 결정 사항
- [모바일 설치](guide/04_모바일설치.md) — Android·iPhone 홈 화면 설치
