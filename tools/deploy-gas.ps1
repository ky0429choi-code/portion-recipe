# 인당량 v3 GAS 배포 도우미 (clasp 3.x) — 기존 GAS 프로젝트의 코드를 v3로 교체하고 기존 /exec 주소를 유지한다.
#
#   1) 연결(처음 한 번):  .\tools\deploy-gas.ps1 -Attach -ScriptId <스크립트ID> -ExecUrl <기존 /exec 주소>
#        → 현재 GAS 코드 전체를 backup\ 에 내려받아 보관(깃 제외) + 이 폴더를 그 프로젝트에 연결. 업로드는 하지 않음.
#   2) 코드 업로드:       .\tools\deploy-gas.ps1
#        → 시험 통과 시 GAS 프로젝트 파일을 v3로 교체(옛 Code.gs 등은 삭제됨).
#          기존 웹앱은 이전 '버전'에 고정되어 있어 이 단계에서는 사용자 화면이 바뀌지 않는다.
#   3) 웹앱 전환:         .\tools\deploy-gas.ps1 -Deploy
#        → 새 버전을 만들고 기존 배포(같은 /exec 주소)를 그 버전으로 갱신. 이때부터 v3로 동작.
param(
  [switch]$Attach, [string]$ScriptId = '', [string]$ExecUrl = '',
  [switch]$Deploy, [string]$Description = '',
  [switch]$Yes   # 첫 업로드 확인 질문을 건너뜀(비대화형 실행용). 백업이 있는 경우에만 동작
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$localFile = Join-Path $root 'tools/deploy.local.json'
function Save-Local($obj) { $obj | ConvertTo-Json | Set-Content $localFile -Encoding UTF8 }
function Read-Local { if (Test-Path $localFile) { Get-Content $localFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null } }

Push-Location $root
try {
  if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) { throw 'clasp가 없습니다: npm install -g @google/clasp' }

  # ---------- 1) 연결 + 현재 코드 백업 ----------
  if ($Attach) {
    if ($ScriptId -notmatch '^[A-Za-z0-9_-]{20,}$') { throw '-ScriptId 형식 확인 (편집기 → 프로젝트 설정 → 스크립트 ID. /exec 주소의 ID와 다름)' }
    $m = [regex]::Match($ExecUrl, '/macros/s/(AKfy[A-Za-z0-9_-]+)/exec')
    if (-not $m.Success) { throw '-ExecUrl 에 기존 웹앱 주소(https://script.google.com/macros/s/AKfy…/exec)를 넣으세요.' }
    $deploymentId = $m.Groups[1].Value
    if ($deploymentId -eq $ScriptId) { throw '스크립트 ID와 배포 ID가 같습니다. 스크립트 ID를 다시 확인하세요.' }

    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backup = Join-Path $root "backup/live_$stamp"
    New-Item -ItemType Directory -Force $backup | Out-Null
    Write-Host "1) 현재 GAS 코드 백업 → backup/live_$stamp"
    Push-Location $backup
    try {
      clasp clone-script $ScriptId --rootDir .
      if ($LASTEXITCODE -ne 0) { throw '백업(clone) 실패: clasp login 계정과 스크립트 소유 계정이 같은지 확인하세요.' }
      clasp list-deployments $ScriptId | Out-File 'DEPLOYMENTS.txt' -Encoding utf8
      clasp list-versions $ScriptId | Out-File 'VERSIONS.txt' -Encoding utf8
      Remove-Item '.clasp.json' -Force -ErrorAction SilentlyContinue
    } finally { Pop-Location }

    $deps = Get-Content (Join-Path $backup 'DEPLOYMENTS.txt') -Raw
    if ($deps -notmatch [regex]::Escape($deploymentId)) { throw "입력한 /exec 배포 ID가 이 프로젝트의 배포 목록에 없습니다. backup/live_$stamp/DEPLOYMENTS.txt 확인" }

    @{ scriptId = $ScriptId; rootDir = 'gas' } | ConvertTo-Json | Set-Content (Join-Path $root '.clasp.json') -Encoding UTF8
    Save-Local @{ scriptId = $ScriptId; deploymentId = $deploymentId; backup = "backup/live_$stamp"; firstPushDone = $false }
    Write-Host ''
    Write-Host "연결 완료. 백업 파일: $((Get-ChildItem $backup -File).Name -join ', ')"
    Write-Host '다음: 백업 내용을 확인한 뒤  .\tools\deploy-gas.ps1  로 코드 업로드'
    return
  }

  $local = Read-Local
  if (-not (Test-Path '.clasp.json') -or -not $local) { throw '먼저 -Attach 로 기존 GAS 프로젝트에 연결하세요.' }

  # ---------- 2) 시험 + 업로드 ----------
  Write-Host '시험 실행 (합성 데이터 · 공개 폴더 유출 검사)'
  node tests/run-all.js
  if ($LASTEXITCODE -ne 0) { throw '시험 실패. 업로드하지 않습니다.' }

  if (-not $local.firstPushDone) {
    Write-Host ''
    Write-Host '첫 업로드입니다. GAS 프로젝트의 기존 파일(Code.gs, Index.html 등)이 v3 파일로 교체됩니다.'
    Write-Host "백업 위치: $($local.backup)   (기존 웹앱은 이전 버전에 고정되어 있어 -Deploy 전까지 화면은 그대로)"
    if (-not (Test-Path (Join-Path $root $local.backup))) { throw "백업 폴더가 없습니다: $($local.backup). -Attach 를 다시 실행하세요." }
    if (-not $Yes -and (Read-Host '계속하려면 YES 입력') -ne 'YES') { throw '취소했습니다.' }
  }
  clasp push --force
  if ($LASTEXITCODE -ne 0) { throw '업로드 실패' }
  $local.firstPushDone = $true; Save-Local $local
  Write-Host '업로드 완료.'

  # ---------- 3) 웹앱 전환 ----------
  if ($Deploy) {
    $desc = if ($Description) { $Description } else { 'v3 ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') }
    Write-Host "기존 배포를 새 버전으로 갱신 (주소 유지): $($local.deploymentId)"
    clasp update-deployment $local.deploymentId -d $desc
    if ($LASTEXITCODE -ne 0) { throw '배포 갱신 실패' }
    Write-Host ''
    Write-Host '편집기 → 배포 → 배포 관리에서 이 배포가  실행: 나 / 액세스: 모든 사용자  인지 꼭 확인하세요.'
    Write-Host '(다르면 연필 아이콘 → 같은 버전으로 두고 두 항목만 바꿔 저장. 주소는 유지됩니다.)'
  } else {
    Write-Host '(웹앱 전환은 -Deploy. 그 전에 스크립트 속성 설정, setupV3, issueTempPasswords를 먼저 하세요.)'
  }
} finally { Pop-Location }
