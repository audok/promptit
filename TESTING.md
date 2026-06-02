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
- `pnpm test:e2e`는 test-mode bundle을 `dist-test/`에 만들고 `PROMPTIT_EXTENSION_PATH=dist-test`로 Playwright를 실행한다.
- 실제 ChatGPT/Gemini smoke는 외부 사이트 상태에 의존하므로 포함하지 않는다.

### 결정적 E2E
```bash
pnpm test:e2e
```

- 로컬 fixture 기반 Playwright 회귀 테스트다.
- test-mode `dist-test/`를 빌드하고 ChatGPT/Gemini fixture, popup, options, storage, manifest/i18n, security rendering, responsive/scale 경로를 반복 가능하게 검증한다.
- Playwright는 `PROMPTIT_EXTENSION_PATH=dist-test`로 test-mode extension bundle을 로드한다.
- `/ ` trigger는 일반 trusted keyboard/input 경로로 검증한다.
- IME 관련 자동화는 조합 중 popup open과 popup keyboard command를 막는 경계를 검증한다. `/ ` trigger 자체는 IME 조합 확정에 의존하지 않는다.
- fixture 테스트 목록은 필요할 때 `pnpm exec playwright test --list`로 확인한다.
- 실행 후 확장을 수동 로드하거나 패키징하려면 production `pnpm build && pnpm check:manifest` 또는 `pnpm test`를 다시 실행한다.

개별 fixture spec을 직접 실행할 때는 script가 대신 해 주는 준비를 수동으로 맞춘다.

```bash
pnpm build:test
PROMPTIT_EXTENSION_PATH=dist-test pnpm exec playwright test tests/e2e/slash-popup-ui.spec.ts
```

- `pnpm test:e2e`, `pnpm test:e2e:headed`, `pnpm test:e2e:ui`를 쓰면 위 준비가 script에 포함된다.
- 직접 `pnpm exec playwright test ...`만 실행하면 직전에 만든 production `dist/`를 잘못 로드하거나 localhost fixture match가 없는 manifest로 실패할 수 있다.
- `xvfb-run`을 붙여 focused browser spec을 script와 같은 조건으로 실행할 때도 먼저 `pnpm build:test`를 실행하고 `PROMPTIT_EXTENSION_PATH=dist-test`를 지정한다. 예: `xvfb-run -a env -u NO_COLOR TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 PROMPTIT_EXTENSION_PATH=dist-test pnpm exec playwright test tests/e2e/options-ordering.spec.ts`
- 로컬 fixture server는 port `4173`의 기존 프로세스를 재사용하지 않는다. 이미 `4173`이 사용 중이면 Playwright가 바로 실패한다. 이때는 `lsof -nP -iTCP:4173 -sTCP:LISTEN` 등으로 점유 프로세스를 확인하고, 이전 fixture server처럼 출처가 분명한 프로세스만 종료한 뒤 다시 실행한다. 알 수 없는 사용자 프로세스는 임의로 종료하지 않는다.

### 실사이트 Smoke: test-mode bundle
```bash
pnpm test:e2e:live
```

- 실제 `chatgpt.com`과 `gemini.google.com/app`에서 같은 10개 흐름을 test-mode `dist-test/`로 실행한다: popup open, saved prompt insert/copy, pin toggle/order persistence, trigger cleanup, prefix/multiline insert, empty/non-empty options open.
- fresh temporary Chromium profile을 쓰므로 사용자의 실제 로그인 브라우저 세션을 대표하지 않는다.
- 실패는 다른 E2E처럼 일반 Playwright 실패로 처리되며, output/artifacts에 live site/step context가 남는다.
- live smoke 목록은 필요할 때 `pnpm exec playwright test --config playwright.live.config.ts --list`로 확인한다.
- live smoke도 `dist-test/` test-mode bundle을 로드하고, 성공하면 script가 production `dist/`를 다시 빌드하고 manifest policy를 검사한다. 중간 실패로 script가 멈추면 `pnpm build && pnpm check:manifest`를 별도로 실행한다.
- insert 흐름은 prompt text가 composer 안에 계속 보이는지 자동 확인한다. prefix-preserving insert는 기존 prefix가 prompt text 앞에 남고, 그 사이에 `/ ` trigger가 남지 않았는지도 검증한다. 제출된 메시지를 안정적으로 읽는 selector는 아직 없으므로, 의도치 않은 submit이 없었다는 신뢰는 로그인된 수동 live checklist에서 확인한다.

### 실사이트 Smoke: production bundle
```bash
pnpm test:e2e:live:prod
```

- production `dist/`를 빌드하고 `check:manifest`를 통과한 뒤, 실제 사이트에서 `tests/live/live-prod-insert.spec.ts`만 실행한다.
- `PROMPTIT_EXTENSION_PATH=dist`로 production bundle을 로드하므로 closed shadow root와 production manifest 조건에 맞는 smoke다.
- 이 spec은 production bundle과 호환되도록 open shadow root 내부 assertion에 의존하지 않고, live composer에서 `/ `로 prompt를 선택해 prompt text가 composer에 보이는지와 popup host가 dismissal되어 count `0`이 되는지 확인한다.
- production manifest release policy는 spec 내부 assertion이 아니라 script gate인 `pnpm check:manifest`가 검증한다. `pnpm test:e2e:live:prod`와 `pnpm test` 모두 production build 후 이 gate를 실행한다.
- 외부 사이트 상태나 fresh profile 제약으로 실패할 수 있다. 실패 시 deterministic fixture 회귀를 약화하지 말고 artifact와 live site 상태를 기록한다.

### 보조 명령
```bash
pnpm typecheck
pnpm build
pnpm check:manifest
pnpm build:test
```

- `typecheck`: TypeScript 타입 오류를 검사한다.
- `build`: production extension bundle을 `dist/`에 만든다. ambient `VITE_PROMPTIT_TEST_MODE`가 있어도 script가 이를 unset한다.
- `check:manifest`: production manifest가 release policy를 만족하는지 검사한다.
- `build:test`: localhost fixture match가 포함된 test-mode bundle을 `dist-test/`에 만든다.

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
pnpm test:e2e:live:prod
```

그 다음 맨 아래의 수동 테스트 3개를 실행한다: 툴바 아이콘 클릭, 로그인된 ChatGPT/Gemini 전체 흐름, 실제 다운로드/파일 선택.

## build output 주의사항
- Production build output은 `dist/`이고 test-mode E2E build output은 `dist-test/`다.
- `pnpm build`는 `env -u VITE_PROMPTIT_TEST_MODE vite build`로 실행되어 ambient test-mode 환경변수를 release build에 반영하지 않는다.
- `pnpm build:test`, `pnpm test:e2e`, `pnpm test:e2e:headed`, `pnpm test:e2e:ui`, `pnpm test:e2e:live`는 `dist-test/`를 만든 뒤 `PROMPTIT_EXTENSION_PATH=dist-test`로 Playwright를 실행한다.
- `pnpm test:e2e:live:prod`는 production `dist/`를 만들고 `PROMPTIT_EXTENSION_PATH=dist`로 production-compatible live smoke만 실행한다.
- 같은 작업트리에서 production build와 E2E build를 병렬 실행하면 output directory는 분리되어 있지만, 의존성 설치나 Playwright artifact 같은 다른 공유 리소스 때문에 결과를 해석하기 어려울 수 있으므로 순차 실행을 권장한다.
- 확장을 수동 로드하거나 패키징할 때는 production `pnpm build`와 `pnpm check:manifest`를 완료한 `dist/`를 사용한다.

## 브라우저 프로세스 정리
브라우저/DevTools/Playwright를 사용한 뒤에는 호스트 프로세스 기준으로 테스트용 브라우저가 남았는지 확인한다.

```bash
pgrep -af '[c]hrome-devtools-mcp|[p]uppeteer_dev_chrome_profile|/opt/google/[c]hrome/chrome|[p]romptit-playwright|[X]vfb'
```

테스트용 프로세스가 남아 있으면 일반 사용자 Chrome이나 다른 작업의 MCP가 아닌지 확인한 뒤 종료한다.

## 빠른 체크리스트
- [ ] `pnpm test`
- [ ] `pnpm test:e2e:live`
- [ ] `pnpm test:e2e:live:prod`
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
