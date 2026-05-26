# Promptit Test Checklist

이 문서는 Promptit에서 검증해야 하는 동작과 현재 커버 상태를 정리한 상세 체크리스트입니다.

- 실행 순서와 운영 가이드는 [TESTING.md](TESTING.md)를 기준으로 본다.
- 이 문서는 `무엇을 검증하는지`와 `무엇이 아직 비어 있는지`를 추적하는 용도로 쓴다.

## 상태 기준

- `Automated`: 로컬 Playwright 회귀 테스트에서 반복 가능하게 검증됨
- `Live smoke`: 실제 `chatgpt.com`에서만 확인함
- `Skipped live`: 실제 사이트 자동화 후보가 있지만 외부 사이트 상태 때문에 release gate로 쓰지 않음
- `Manual`: 사람이 직접 확인해야 함
- `Gap`: 구현은 있지만 아직 반복 가능한 검증이 없음

## 1. 플랫폼과 초기화

- [x] content script runtime message로 옵션 페이지를 연다. `Automated` via `tests/e2e/platform.spec.ts`
- [x] malformed runtime message는 옵션 페이지를 열지 않고 무시한다. `Automated` via `tests/e2e/platform.spec.ts`
- [x] 지원하지 않는 URL에서는 Promptit이 초기화되지 않는다. `Automated` via `tests/e2e/platform.spec.ts`
- [x] test mode에서 지원하지 않는 localhost fixture에서는 Promptit이 초기화되지 않는다. `Automated` via `tests/e2e/platform.spec.ts`
- [x] 실제 `chatgpt.com`에서 Promptit이 초기화된다. `Live smoke` via `tests/live/live-chatgpt.spec.ts`
- [x] Gemini fixture에서 Promptit이 초기화된다. `Automated` via `tests/e2e/gemini-slash-popup.spec.ts`
- [x] 같은 페이지에서 중복 초기화 방지 가드가 명시적으로 검증된다. `Automated` via `tests/e2e/platform.spec.ts`
- [ ] 브라우저 툴바 Promptit 아이콘 클릭으로 옵션 페이지가 열린다. `Manual`

## 2. 입력 감지와 trigger

- [x] `contenteditable` composer에서 `/ ` 입력 시 팝업이 열린다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] `textarea` fallback composer에서 trigger text가 프롬프트 본문으로 치환된다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] `/`만 입력한 경우 팝업이 열리지 않는다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] selection이 collapsed가 아니면 팝업이 열리지 않는다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] IME 조합 중에는 기다리고 `compositionend` 후에만 연다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] IME 입력 중 팝업이 닫힌 뒤 composing state가 reset되어 다음 trigger가 열린다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] NBSP가 섞인 trigger도 `/ `로 정규화해 인식한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] `readonly` textarea는 무시한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] `disabled` textarea는 무시한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] Gemini `rich-textarea div.ql-editor[role="textbox"]` composer에서 `/ ` 입력 시 팝업이 열린다. `Automated` via `tests/e2e/gemini-slash-popup.spec.ts`
- [x] Gemini Quill `.ql-clipboard` contenteditable은 입력창으로 취급하지 않는다. `Automated` via `tests/e2e/gemini-slash-popup.spec.ts`
- [x] trigger resolution이 끝나기 전에 composer DOM이 제거되면 stale popup을 열지 않는다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 입력창 내부 자식 노드에서 이벤트가 올라와도 같은 composer로 안정적으로 resolve되는지 명시적으로 검증한다. `Automated` via `tests/e2e/slash-popup.spec.ts`, `tests/e2e/gemini-slash-popup.spec.ts`
- [x] 이미 열린 팝업 상태에서 입력창 DOM이 제거됐을 때 팝업이 정리되는지 명시적으로 검증한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] contenteditable block 경계를 넘어 `/ ` trigger를 만들면 팝업이 열리지 않는다. `Automated` via `tests/e2e/slash-popup.spec.ts`

## 3. 팝업 상호작용

- [x] 저장된 프롬프트 목록이 팝업에 표시된다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 팝업 목록은 metadata-only로 열리고 body read 실패 hook이 켜져도 제목 목록은 표시된다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 프롬프트 선택 시점에 최신 body를 읽어 insert한다. `Automated` via `tests/e2e/slash-popup.spec.ts`, `tests/e2e/gemini-slash-popup.spec.ts`
- [x] copy 액션 시점에 최신 body를 읽어 clipboard에 쓴다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 키보드로 활성 프롬프트를 insert할 수 있다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 키보드로 선택한 프롬프트를 copy할 수 있다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 키보드로 선택한 프롬프트를 pin/unpin할 수 있고 팝업이 열린 상태로 유지된다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] IME composing 중 `Enter`, `Escape`, `Backspace`가 popup command로 소비되지 않는다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] prompt body read가 pending인 busy 상태에서 외부 input event가 popup을 닫지 않고 final insert가 한 번만 이어진다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] `Escape`로 닫을 때 trigger text를 정리한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] `Backspace`로 닫을 때 trigger text를 정리한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 바깥 클릭으로 닫을 때 trigger text를 정리한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] blur로 닫을 때 trigger text를 정리한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] resize로 닫을 때 trigger text를 정리한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 팝업이 열린 상태에서 일반 타이핑을 계속하면 팝업이 닫히고 입력은 유지된다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 열린 팝업은 storage 변경을 즉시 반영한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 잘못된 storage 값은 팝업 렌더 전에 정규화된다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] empty state에서 옵션 페이지를 열 수 있다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] empty state -> options 흐름이 실제 `chatgpt.com`에서도 동작한다. `Live smoke` via `tests/live/live-chatgpt.spec.ts`
- [x] hover로 active cell이 바뀐다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] title click으로 프롬프트를 insert할 수 있다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] copy button click으로 프롬프트를 복사할 수 있다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] pin button click으로 프롬프트를 pin/unpin할 수 있고 저장된 pinned state와 팝업 정렬이 갱신된다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] pin/copy focus가 검은 badge border 없이 기존 active 배경/아이콘 색을 쓰고, pinned pin icon이 filled SVG path와 검정 fill로 표시되는지 검증된다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] contenteditable에서 multiline break를 보존하며 insert와 cleanup을 수행한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 항목이 많을 때 active row가 보이도록 리스트를 스크롤한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 정지한 포인터 아래로 리스트가 스크롤되더라도 키보드 active cell이 hover에 덮어써지지 않는다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 뷰포트 여유에 따라 팝업을 위 또는 아래에 배치한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] ChatGPT fixture에서 팝업 폭이 좁은 editor surface가 아니라 composer form wrapper 폭과 일치한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] Gemini에서 저장 프롬프트 insert가 `/ ` trigger를 치환한다. `Automated` via `tests/e2e/gemini-slash-popup.spec.ts`
- [x] Gemini popup이 Enter 선택을 처리할 때 host submit keydown으로 전파되지 않는다. `Automated` via `tests/e2e/gemini-slash-popup.spec.ts`
- [x] Gemini에서 `Escape`와 `Backspace`가 trigger text를 정리하고 팝업을 닫는다. `Automated` via `tests/e2e/gemini-slash-popup.spec.ts`
- [x] Gemini popup은 좁은 `ql-editor` 줄이 아니라 composer wrapper 기준으로 anchor된다. `Automated` via `tests/e2e/gemini-slash-popup.spec.ts`
- [x] window `scroll` 시 anchor 기준으로 팝업을 재배치하는지 명시적으로 검증한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] Arrow Up/Down/Left/Right의 전체 edge behavior를 명시적으로 검증한다. `Automated` via `tests/e2e/slash-popup.spec.ts`

## 4. 실패 복구와 toast

- [x] 옵션 페이지 열기 실패 시 error toast를 띄우고 팝업을 유지한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] insert 실패 시 error toast를 띄우고 입력 포커스를 복구한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] copy 실패 시 error toast를 띄우고 팝업을 유지한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] trigger 전 prompt storage read 실패 시 error toast를 띄우고 팝업을 열지 않는다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] 프롬프트 body read 실패 시 error toast를 띄우고 팝업과 입력 포커스를 유지한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] stale popup pin activation conflict 시 success toast를 띄우지 않고 외부 pinned state를 보존한다. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [x] trigger cleanup 실패 시 error toast를 띄우고 팝업을 다시 유지한다. `Automated` via `tests/e2e/slash-popup.spec.ts`

## 5. 옵션 페이지와 스토리지

- [x] 옵션 페이지가 정상적으로 열린다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 프롬프트를 생성할 수 있다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 프롬프트를 수정할 수 있다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 삭제 확인을 취소할 수 있다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 삭제 확인 후 실제로 삭제된다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 제목/내용 validation이 저장 대신 오류를 표시한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 새 일반 프롬프트는 visible order field 없이 현재 일반 목록 끝에 append된다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 옵션 페이지 목록은 내부 `normalOrder`/`pinnedOrder` 값을 노출하지 않고, create/edit form은 `정렬 순서` input을 노출하지 않는다. `Automated` via `tests/e2e/options.spec.ts`
- [x] production prompt body가 `chrome.storage.local`에 저장되지 않고 IndexedDB `promptBodies`에 저장된다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 정확히 `500 * 1024` UTF-8 bytes인 body는 저장되고, 1 byte 초과 body update는 truncation 없이 거부된다. `Automated` via `tests/e2e/options.spec.ts`
- [x] title/pinned 같은 metadata-only save는 `promptBodies.content`와 body timestamp를 변경하지 않는다. `Automated` via `tests/e2e/options.spec.ts`
- [x] body save는 `promptBodies.content`, `promptBodies.updatedAt`, `promptMetas.bodyUpdatedAt`, `promptMetas.charCount`를 갱신한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] pinned prompt가 normal prompt보다 먼저 정렬되고, unpin 시 기존 normal 위치로 돌아간다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 옵션 편집기 form은 pin checkbox를 노출하지 않고, 목록 pin button으로 pin/unpin하며 저장 state와 정렬을 갱신한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] drag handle keyboard controls로 일반 프롬프트를 일반 그룹 안에서 reorder하고 visible order와 stored meta order가 함께 바뀐다. `Automated` via `tests/e2e/options.spec.ts`
- [x] drag handle 점 6개 icon은 버튼 중앙에 정렬된다. `Automated` via `tests/e2e/options.spec.ts`
- [x] drag handle keyboard controls로 고정 프롬프트를 고정 그룹 안에서 reorder하고 visible order와 stored meta order가 함께 바뀐다. `Automated` via `tests/e2e/options.spec.ts`
- [x] drag handle keyboard movement가 고정/일반 그룹 경계를 넘으려 할 때 storage order가 바뀌지 않는다. `Automated` via `tests/e2e/options.spec.ts`
- [x] move prompt conflict가 발생하면 reorder success announcement를 표시하지 않고 storage record를 변경하지 않는다. `Automated` via `tests/e2e/options.spec.ts`
- [x] initial prompt load가 지연돼도 사용자가 입력한 draft form 값을 보존한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 편집 중인 항목이 외부에서 삭제되면 create mode로 돌아간다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 두 옵션 탭에서 같은 프롬프트를 stale save하면 conflict를 표시하고 최신 저장본으로 복구한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 두 옵션 탭에서 stale delete가 발생하면 conflict를 표시하고 최신 저장본을 유지한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] selected prompt body load 실패 시 dirty create draft를 유지한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] selected prompt body load 실패 시 edit save를 차단한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] storage read 실패 시 오류를 표시하고 기존 storage 값을 보존한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] initial prompt storage read 실패 시 load error를 표시하고 기존 prompt records를 보존한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 저장 실패 시 오류 메시지를 표시한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] 삭제 실패 시 오류 메시지를 표시한다. `Automated` via `tests/e2e/options.spec.ts`
- [x] `normalOrder`가 같은 경우 `createdAt`, `id` tie-break 정렬이 명시적으로 검증된다. `Automated` via `tests/e2e/options.spec.ts`
- [x] body stale save conflict가 `expectedBodyUpdatedAt` 기준으로 검증된다. `Automated` via `tests/e2e/options.spec.ts`

## 6. 실사이트 smoke

- [x] 실제 `chatgpt.com`에서 `/ ` 팝업이 열린다. `Live smoke` via `tests/live/live-chatgpt.spec.ts`
- [x] 실제 `chatgpt.com`에서 저장 프롬프트를 insert할 수 있다. `Live smoke` via `tests/live/live-chatgpt.spec.ts`
- [x] 실제 `chatgpt.com`에서 저장 프롬프트를 copy할 수 있다. `Live smoke` via `tests/live/live-chatgpt.spec.ts`
- [x] 실제 `chatgpt.com`에서 empty state -> options가 된다. `Live smoke` via `tests/live/live-chatgpt.spec.ts`
- [ ] 실제 public `gemini.google.com/app` no-submit smoke는 skip되어 있다. `Skipped live` via `tests/live/live-gemini.spec.ts`; 2026-05-07 자동화에서 Promptit 선택 후 텍스트가 composer가 아니라 page-level submitted state로 이동했고 composer readback은 빈 문자열이었다. Deterministic Gemini no-submit은 `tests/e2e/gemini-slash-popup.spec.ts`에서 검증한다.
- [ ] 로그인된 ChatGPT, Gemini 세션에서 전체 흐름을 반복 검증한다. `Manual`

## 7. 릴리스 체크용 빠른 체크리스트

- [x] `pnpm test` passed: `pnpm typecheck`, production build/manifest check, fixture-based `pnpm test:e2e`, and final production build/manifest check
- [x] fixture-based Playwright E2E passed with `117 passed`
- [x] options coverage includes prompt record storage, body size, failure, conflict, reorder, and hidden internal order field checks
- [x] slash popup and Gemini fixture coverage includes popup storage, pin, insert/copy, and host adapter flows
- [x] production manifest policy check rejects `host_permissions` and test-only localhost matches in `dist/manifest.json`
- [x] production/test manifest locale invariants are checked: `default_locale`, raw `__MSG_*__` placeholders, matching `_locales/ko` and `_locales/en` keys, and fixed `promptit` app name. `Automated` via `scripts/check-production-manifest.mjs` and `tests/e2e/platform.spec.ts`
- [x] 옵션 페이지 English override keeps fixed literals and Korean prompt data untranslated while localizing hero/list/editor/validation/save toast/confirm dialogs. `Automated` via `tests/e2e/options.spec.ts`
- [x] popup/content English override localizes popup chrome, aria labels, empty state, success/failure toasts, and preserves prompt insert/copy data unchanged. `Automated` via `tests/e2e/slash-popup.spec.ts`
- [ ] 실사이트 smoke 실행
- [ ] 브라우저 툴바 Promptit 아이콘 클릭
- [ ] 옵션 페이지 제목이 `Promptit Settings`인지 확인
- [ ] 로그인된 ChatGPT, Gemini 전체 흐름 수동 확인
