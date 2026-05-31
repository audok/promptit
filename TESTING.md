# promptit Testing Guide

이 문서는 promptit의 테스트 실행 순서와 수동 테스트 절차를 정리한 운영 가이드입니다.
무엇을 커버하는지는 [TEST_CHECKLIST.md](TEST_CHECKLIST.md)에서 관리합니다.

## 문서 역할

- `TESTING.md`: 어떤 명령을 언제 실행하는지 정리한다.
- `TEST_CHECKLIST.md`: 어떤 동작이 자동화, live smoke, 수동 테스트로 커버되는지 추적한다.

## 테스트 명령

### 기본 게이트

```bash
pnpm test
```

- PR 전 기본 로컬 회귀 게이트다.
- 순서: `pnpm typecheck`, production `pnpm build`, `pnpm check:manifest`, `pnpm test:e2e`, 최종 production `pnpm build`, `pnpm check:manifest`.
- `pnpm test:e2e`는 test-mode manifest를 생성하므로 마지막 production build/check가 필요하다.
- 실제 ChatGPT/Gemini smoke는 외부 사이트 상태에 의존하므로 포함하지 않는다.

### 결정적 E2E

```bash
pnpm test:e2e
```

- 로컬 fixture 기반 Playwright 회귀 테스트다.
- test-mode `dist/`를 빌드하고 ChatGPT/Gemini fixture, popup, options, storage, manifest/i18n, security rendering, responsive/scale 경로를 반복 가능하게 검증한다.
- fixture 테스트 목록은 필요할 때 `pnpm exec playwright test --list`로 확인한다.
- 실행 후 확장을 수동 로드하거나 패키징하려면 `pnpm build && pnpm check:manifest` 또는 `pnpm test`를 다시 실행한다.

### 실사이트 Smoke

```bash
pnpm test:e2e:live
```

- 실제 `chatgpt.com`과 `gemini.google.com/app`에서 같은 10개 흐름을 실행한다: popup open, saved prompt insert/copy, pin toggle/order persistence, trigger cleanup, prefix/multiline insert, empty/non-empty options open.
- fresh temporary Chromium profile을 쓰므로 사용자의 실제 로그인 브라우저 세션을 대표하지 않는다.
- 실패는 다른 E2E처럼 일반 Playwright 실패로 처리되며, output/artifacts에 live site/step context가 남는다.
- live smoke 목록은 필요할 때 `pnpm exec playwright test --config playwright.live.config.ts --list`로 확인한다.
- 성공하면 script가 production `dist/`를 다시 빌드하고 manifest policy를 검사한다. 중간 실패로 script가 멈추면 `pnpm build && pnpm check:manifest`를 별도로 실행한다.

### 보조 명령

```bash
pnpm typecheck
pnpm build
pnpm check:manifest
pnpm build:test
```

- `typecheck`: TypeScript 타입 오류를 검사한다.
- `build`: production extension bundle을 만든다.
- `check:manifest`: production manifest가 release policy를 만족하는지 검사한다.
- `build:test`: localhost fixture match가 포함된 test-mode bundle을 만든다.

## 권장 실행 순서

### 구현 중

- 빠른 확인: 관련 spec 또는 `pnpm test:e2e`
- 타입/번들 경계 확인: `pnpm typecheck`, `pnpm build`, `pnpm check:manifest`
- 변경 범위가 크거나 release gate에 가까우면 `pnpm test`

### PR 전

```bash
pnpm test
```

### 릴리스 전

```bash
pnpm test
pnpm test:e2e:live
```

그 다음 맨 아래의 수동 테스트 3개를 실행한다: 툴바 아이콘 클릭, 로그인된 ChatGPT/Gemini 전체 흐름, 실제 다운로드/파일 선택.

## dist 주의사항

- `pnpm build`, `pnpm build:test`, `pnpm test:e2e`, `pnpm test:e2e:live`는 같은 `dist/`를 공유하므로 같은 작업트리에서 병렬 실행하지 않는다.
- fixture E2E 중 `dist/`가 production manifest로 바뀌면 localhost fixture가 content script match에서 빠져 `data-promptit-ready`가 붙지 않는 실패처럼 보일 수 있다.
- 그런 경우 제품 회귀로 판단하기 전에 `pnpm build:test` 후 실패한 E2E를 다시 실행한다.
- 확장을 수동 로드하거나 패키징할 때는 마지막 명령이 production `pnpm build`와 `pnpm check:manifest`를 완료한 상태여야 한다.

## 브라우저 프로세스 정리

브라우저/DevTools/Playwright를 사용한 뒤에는 호스트 프로세스 기준으로 테스트용 브라우저가 남았는지 확인한다.

```bash
pgrep -af '[c]hrome-devtools-mcp|[p]uppeteer_dev_chrome_profile|/opt/google/[c]hrome/chrome|[p]romptit-playwright|[X]vfb'
```

테스트용 프로세스가 남아 있으면 일반 사용자 Chrome이나 다른 작업의 MCP가 아닌지 확인한 뒤 종료한다.

## 빠른 체크리스트

- [ ] `pnpm test`
- [ ] `pnpm test:e2e:live`
- [ ] 테스트용 Chrome/MCP 프로세스 정리 확인
- [ ] 수동 테스트 3개 확인

## 수동 테스트

### 브라우저 툴바 아이콘 클릭

1. promptit 확장을 로드한 브라우저를 연다.
2. 브라우저 툴바에서 promptit 확장 아이콘을 클릭한다.
3. 옵션 페이지가 새 탭으로 열리거나 이미 열린 옵션 탭으로 포커스되는지 확인한다.
4. 옵션 페이지 제목이 `promptit Settings`인지 확인한다.

이 항목은 브라우저 툴바 UI를 Playwright가 안정적으로 제어하기 어렵기 때문에 수동으로 둔다.

### 로그인된 ChatGPT/Gemini 전체 흐름

1. promptit 확장을 로드한 브라우저에서 로그인된 ChatGPT와 Gemini 세션을 각각 연다.
2. 각 서비스의 composer에 포커스하고 `/ `를 입력한다.
3. promptit popup이 열리는지 확인한다.
4. 저장된 프롬프트 insert, copy, pin/unpin 흐름을 확인한다.
5. `/ ` trigger cleanup이 정상 동작하고 의도치 않게 prompt가 제출되지 않는지 확인한다.

이 항목은 계정 상태, 쿠키, 사이트 UI 변경, A/B 테스트의 영향을 받아 반복 가능한 release gate로 고정하기 어렵다.

### 백업/공유 실제 다운로드와 파일 선택

1. promptit 확장을 로드한 브라우저에서 옵션 페이지를 연다.
2. `백업/공유`에서 `백업`과 `프롬프트 전체 공유`가 실제 다운로드 폴더에 JSON 파일을 만드는지 확인한다.
3. 백업 JSON을 `복원`에 다시 선택했을 때 preview가 먼저 표시되고 confirm 후 데이터가 교체되는지 확인한다.
4. 공유 JSON을 `프롬프트 가져오기`에 선택했을 때 기존 프롬프트가 유지되고 새 프롬프트가 추가되는지 확인한다.

fixture E2E는 파일 shape와 file input flow를 검증하지만, 실제 다운로드 위치, OS 파일 선택기, 수동 로드된 확장 상태는 release 전 수동으로 확인한다.
