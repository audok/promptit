import {
  startTransition,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import {
  hasPromptDraftErrors,
  isStarterPrompt,
  normalizePromptDraft,
  validatePromptDraft,
  type PromptDraftErrors,
  type PromptItem,
} from '../prompt/schema';
import {
  createPrompt,
  deletePrompt,
  getUserPrompts,
  subscribeToPrompts,
  updatePrompt,
} from '../prompt/storage';

type LoadState = 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving';
type PromptFormState = {
  title: string;
  content: string;
  sortOrder: string;
};

function getNextSortOrder(prompts: PromptItem[]): number {
  if (prompts.length === 0) {
    return 0;
  }

  return Math.max(...prompts.map((prompt) => prompt.sortOrder)) + 1;
}

function createEmptyForm(sortOrder: number): PromptFormState {
  return {
    title: '',
    content: '',
    sortOrder: String(sortOrder),
  };
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function App() {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromptFormState>(() => createEmptyForm(0));
  const [errors, setErrors] = useState<PromptDraftErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const syncPrompts = (nextPrompts: PromptItem[]) => {
      const userPrompts = nextPrompts.filter((prompt) => !isStarterPrompt(prompt));

      if (cancelled) {
        return;
      }

      startTransition(() => {
        setPrompts(userPrompts);
        setLoadState('ready');
      });
    };

    void getUserPrompts()
      .then((nextPrompts) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setPrompts(nextPrompts);
          setLoadState('ready');
          setForm(createEmptyForm(getNextSortOrder(nextPrompts)));
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

    const unsubscribe = subscribeToPrompts(syncPrompts);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!editingId) {
      return;
    }

    const stillExists = prompts.some((prompt) => prompt.id === editingId);

    if (stillExists) {
      return;
    }

    setEditingId(null);
    setErrors({});
    setForm(createEmptyForm(getNextSortOrder(prompts)));
    setNotice('편집 중인 프롬프트가 삭제되어 새 프롬프트 작성 모드로 전환했습니다.');
  }, [editingId, prompts]);

  const activePrompt = editingId
    ? prompts.find((prompt) => prompt.id === editingId) ?? null
    : null;
  const isSaving = saveState === 'saving';
  const isEditing = activePrompt !== null;

  function resetToCreateMode(nextPrompts = prompts): void {
    setEditingId(null);
    setErrors({});
    setForm(createEmptyForm(getNextSortOrder(nextPrompts)));
  }

  function handleFieldChange(
    field: keyof PromptFormState,
    value: string,
  ): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
    setNotice(null);
    setSaveError(null);
  }

  function handleSelectPrompt(prompt: PromptItem): void {
    setEditingId(prompt.id);
    setForm({
      title: prompt.title,
      content: prompt.content,
      sortOrder: String(prompt.sortOrder),
    });
    setErrors({});
    setNotice(null);
    setSaveError(null);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setNotice(null);
    setSaveError(null);

    const draft = normalizePromptDraft({
      title: form.title,
      content: form.content,
      sortOrder: Number(form.sortOrder),
    });
    const nextErrors = validatePromptDraft(draft);

    if (hasPromptDraftErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSaveState('saving');

    try {
      if (editingId) {
        const updatedPrompt = await updatePrompt(editingId, draft);

        if (!updatedPrompt) {
          throw new Error('수정할 프롬프트를 찾지 못했습니다.');
        }

        startTransition(() => {
          setNotice('프롬프트를 업데이트했습니다.');
          setForm({
            title: updatedPrompt.title,
            content: updatedPrompt.content,
            sortOrder: String(updatedPrompt.sortOrder),
          });
        });
      } else {
        await createPrompt(draft);

        startTransition(() => {
          setNotice('프롬프트를 저장했습니다.');
          setForm(
            createEmptyForm(
              Math.max(getNextSortOrder(prompts), draft.sortOrder + 1),
            ),
          );
        });
      }
    } catch (error) {
      console.error('[promptit] Failed to save prompt.', error);
      setSaveError(
        error instanceof Error
          ? error.message
          : '프롬프트 저장 중 오류가 발생했습니다.',
      );
    } finally {
      setSaveState('idle');
    }
  }

  async function handleDelete(id: string): Promise<void> {
    const targetPrompt = prompts.find((prompt) => prompt.id === id);

    if (!targetPrompt) {
      return;
    }

    const shouldDelete = window.confirm(
      `"${targetPrompt.title}" 프롬프트를 삭제할까요?`,
    );

    if (!shouldDelete) {
      return;
    }

    setNotice(null);
    setSaveError(null);
    setSaveState('saving');

    try {
      const didDelete = await deletePrompt(id);

      if (!didDelete) {
        throw new Error('삭제할 프롬프트를 찾지 못했습니다.');
      }

      const remainingPrompts = prompts.filter((prompt) => prompt.id !== id);

      startTransition(() => {
        if (editingId === id) {
          resetToCreateMode(remainingPrompts);
        }
        setNotice('프롬프트를 삭제했습니다.');
      });
    } catch (error) {
      console.error('[promptit] Failed to delete prompt.', error);
      setSaveError(
        error instanceof Error
          ? error.message
          : '프롬프트 삭제 중 오류가 발생했습니다.',
      );
    } finally {
      setSaveState('idle');
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <section className="rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_28px_70px_rgba(66,53,49,0.10)] backdrop-blur">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">
                Promptit Sprint 2
              </p>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
                  프롬프트를 저장하고 바로 실행하세요.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-stone-600">
                  이 페이지에서 프롬프트를 만들고 수정하면 ChatGPT의 Promptit
                  팝업에 즉시 반영됩니다. 기본 정렬은{' '}
                  <span className="font-semibold">sortOrder</span> 오름차순입니다.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="저장된 프롬프트" value={`${prompts.length}`} />
              <MetricCard
                label="편집 모드"
                value={isEditing ? '수정 중' : '새로 작성'}
              />
              <MetricCard
                label="상태"
                value={loadState === 'error' ? '오류' : isSaving ? '저장 중' : '준비됨'}
              />
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-[0_18px_42px_rgba(66,53,49,0.06)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Prompt Library
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-900">
                  저장된 프롬프트
                </h2>
              </div>
              <button
                type="button"
                className="rounded-full border border-stone-300 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700 transition hover:border-stone-400 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  resetToCreateMode();
                  setNotice(null);
                  setSaveError(null);
                }}
                disabled={isSaving}
              >
                New Prompt
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {loadState === 'loading' ? (
                <EmptyPanel message="저장소를 불러오는 중입니다." />
              ) : null}

              {loadState === 'error' ? (
                <EmptyPanel message="저장소를 읽지 못했습니다. 확장 프로그램을 다시 열어 확인해보세요." />
              ) : null}

              {loadState === 'ready' && prompts.length === 0 ? (
                <EmptyPanel message="아직 저장된 프롬프트가 없습니다. 오른쪽 폼에서 첫 프롬프트를 추가하세요." />
              ) : null}

              {loadState === 'ready' && prompts.length > 0 ? (
                <div className="space-y-3">
                  {prompts.map((prompt) => {
                    const isActive = prompt.id === editingId;

                    return (
                      <div
                        key={prompt.id}
                        className={`rounded-[24px] border px-4 py-4 transition ${
                          isActive
                            ? 'border-stone-900 bg-stone-900 text-stone-50 shadow-[0_18px_34px_rgba(28,25,23,0.20)]'
                            : 'border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-300 hover:bg-stone-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            className="min-w-0 flex-1 cursor-pointer text-left"
                            onClick={() => {
                              handleSelectPrompt(prompt);
                            }}
                            disabled={isSaving}
                          >
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                              <span
                                className={
                                  isActive ? 'text-stone-300' : 'text-stone-500'
                                }
                              >
                                sortOrder {prompt.sortOrder}
                              </span>
                              <span
                                className={
                                  isActive ? 'text-stone-500' : 'text-stone-300'
                                }
                              >
                                •
                              </span>
                              <span
                                className={
                                  isActive ? 'text-stone-300' : 'text-stone-500'
                                }
                              >
                                updated {formatTimestamp(prompt.updatedAt)}
                              </span>
                            </div>
                            <p className="mt-3 text-lg font-semibold tracking-tight">
                              {prompt.title}
                            </p>
                            <p
                              className={`mt-2 line-clamp-3 text-sm leading-6 ${
                                isActive ? 'text-stone-300' : 'text-stone-600'
                              }`}
                            >
                              {prompt.content}
                            </p>
                          </button>

                          <button
                            type="button"
                            className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
                              isActive
                                ? 'bg-white/10 text-stone-200 hover:bg-white/15'
                                : 'bg-white text-stone-600 hover:bg-stone-200'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                            onClick={() => {
                              void handleDelete(prompt.id);
                            }}
                            disabled={isSaving}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </article>

          <article className="rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,#fef8f5,#f7eee8)] p-6 shadow-[0_18px_42px_rgba(66,53,49,0.06)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Editor
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-900">
                  {isEditing ? '프롬프트 수정' : '새 프롬프트 추가'}
                </h2>
              </div>
              {isEditing ? (
                <button
                  type="button"
                  className="rounded-full border border-stone-300 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700 transition hover:border-stone-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    resetToCreateMode();
                    setNotice(null);
                    setSaveError(null);
                  }}
                  disabled={isSaving}
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>

            <form className="mt-5 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
              <Field
                label="Title"
                error={errors.title}
                hint="1자 이상 40자 이하"
              >
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => {
                    handleFieldChange('title', event.target.value);
                  }}
                  className="w-full rounded-[18px] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                  placeholder="예: 회의록 정리"
                  maxLength={40}
                  disabled={isSaving}
                />
              </Field>

              <Field
                label="Content"
                error={errors.content}
                hint="실제로 삽입할 프롬프트 본문"
              >
                <textarea
                  value={form.content}
                  onChange={(event) => {
                    handleFieldChange('content', event.target.value);
                  }}
                  className="min-h-[220px] w-full rounded-[22px] border border-stone-200 bg-white px-4 py-4 text-sm leading-6 text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                  placeholder="프롬프트 내용을 입력하세요."
                  disabled={isSaving}
                />
              </Field>

              <Field
                label="Sort Order"
                error={errors.sortOrder}
                hint="작을수록 위에 노출됩니다."
              >
                <input
                  type="number"
                  step="1"
                  value={form.sortOrder}
                  onChange={(event) => {
                    handleFieldChange('sortOrder', event.target.value);
                  }}
                  className="w-full rounded-[18px] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                  disabled={isSaving}
                />
              </Field>

              {notice ? (
                <p className="rounded-[18px] bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {notice}
                </p>
              ) : null}

              {saveError ? (
                <p className="rounded-[18px] bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {saveError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-stone-900 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-500"
                  disabled={isSaving || loadState === 'error'}
                >
                  {isSaving ? 'Saving...' : isEditing ? 'Update Prompt' : 'Save Prompt'}
                </button>

                {isEditing ? (
                  <button
                    type="button"
                    className="rounded-full border border-stone-300 bg-white/70 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-stone-700 transition hover:border-stone-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      if (activePrompt) {
                        void handleDelete(activePrompt.id);
                      }
                    }}
                    disabled={isSaving || !activePrompt}
                  >
                    Delete Prompt
                  </button>
                ) : null}
              </div>
            </form>
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

function EmptyPanel(props: { message: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm leading-6 text-stone-600">
      {props.message}
    </div>
  );
}

function Field(props: {
  label: string;
  hint: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
          {props.label}
        </span>
        <span className="text-[11px] text-stone-500">{props.hint}</span>
      </div>
      <div className="mt-3">{props.children}</div>
      {props.error ? (
        <p className="mt-2 text-sm text-rose-600">{props.error}</p>
      ) : null}
    </label>
  );
}
