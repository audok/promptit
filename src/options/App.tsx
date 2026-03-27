import { startTransition, useEffect, useState } from 'react';

import { isStarterPrompt, type PromptItem } from '../prompt/schema';
import { getPrompts } from '../prompt/storage';

type LoadState = 'loading' | 'ready' | 'error';

export default function App() {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;

    void getPrompts()
      .then((nextPrompts) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setPrompts(nextPrompts);
          setLoadState('ready');
        });
      })
      .catch((error) => {
        console.error('[promptit] Failed to load prompts in options page.', error);

        if (!cancelled) {
          startTransition(() => {
            setLoadState('error');
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const userPrompts = prompts.filter((prompt) => !isStarterPrompt(prompt));

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-12">
        <section className="grid gap-6 rounded-[32px] border border-white/70 bg-white/75 p-8 shadow-[0_28px_70px_rgba(66,53,49,0.10)] backdrop-blur md:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">
              Promptit Sprint 1
            </p>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
                프롬프트 관리는 Sprint 2에서 제공됩니다.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-stone-600">
                지금은 ChatGPT 입력창에서 <span className="font-semibold">/ </span>
                를 입력해 Promptit 팝업을 호출하고, 저장된 프롬프트를 삽입하는
                핵심 흐름만 먼저 안정화한 상태입니다.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="저장된 프롬프트" value={`${userPrompts.length}`} />
              <MetricCard
                label="스타터 항목"
                value={userPrompts.length > 0 ? '숨김' : '노출 중'}
              />
              <MetricCard
                label="상태"
                value={loadState === 'error' ? '오류' : '준비됨'}
              />
            </div>
          </div>
          <aside className="rounded-[28px] bg-stone-900 p-6 text-stone-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">
              Next Up
            </p>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-stone-300">
              <li>Prompt CRUD UI</li>
              <li>3열 키보드 탐색</li>
              <li>복사 액션과 토스트</li>
              <li>라이트/다크 테마 확장</li>
            </ul>
          </aside>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-[0_18px_42px_rgba(66,53,49,0.06)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Storage Snapshot
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-900">
                  현재 저장 상태
                </h2>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                {loadState}
              </span>
            </div>

            <div className="mt-5 rounded-[22px] bg-stone-50 p-4">
              {loadState === 'loading' ? (
                <p className="text-sm text-stone-600">저장소를 불러오는 중입니다.</p>
              ) : null}
              {loadState === 'error' ? (
                <p className="text-sm text-rose-600">
                  저장소를 읽지 못했습니다. 확장 프로그램을 다시 열어 확인해보세요.
                </p>
              ) : null}
              {loadState === 'ready' ? (
                <div className="space-y-3">
                  {prompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      className="rounded-2xl border border-stone-200 bg-white px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-stone-900">
                            {prompt.title}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">
                            {isStarterPrompt(prompt)
                              ? 'Starter CTA'
                              : `sortOrder ${prompt.sortOrder}`}
                          </p>
                        </div>
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                          {isStarterPrompt(prompt) ? 'system' : 'user'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </article>

          <article className="rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,#fef8f5,#f7eee8)] p-6 shadow-[0_18px_42px_rgba(66,53,49,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Current Flow
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              Sprint 1 동작 방식
            </h2>
            <ol className="mt-5 space-y-4 text-sm leading-6 text-stone-700">
              <li>1. ChatGPT 입력창에서 <span className="font-semibold">/ </span> 입력</li>
              <li>2. 약 100ms 뒤 Promptit 팝업 오픈</li>
              <li>3. 마우스로 항목 선택 또는 Enter로 현재 항목 실행</li>
              <li>4. 스타터 항목은 설정 페이지로 이동</li>
            </ol>
          </article>
        </section>
      </div>
    </main>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] bg-stone-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
        {props.label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
        {props.value}
      </p>
    </div>
  );
}
