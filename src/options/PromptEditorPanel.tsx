import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
} from 'react';

import { type PromptMeta } from '../prompt/schema';
import {
  Banner,
  BUTTON_FOCUS_CLASS,
  Field,
  formatTimestamp,
  getDescribedBy,
} from './components';
import { type UsePromptEditorResult } from './usePromptEditor';

type PromptEditorPanelProps = {
  activePromptMeta: PromptMeta | null;
  alertMessage: UsePromptEditorResult['alertMessage'];
  bodyLoadState: UsePromptEditorResult['bodyLoadState'];
  clearAlertMessage: UsePromptEditorResult['clearAlertMessage'];
  clearNotice: UsePromptEditorResult['clearNotice'];
  conflictState: UsePromptEditorResult['conflictState'];
  editorDisabled: boolean;
  errors: UsePromptEditorResult['errors'];
  form: UsePromptEditorResult['form'];
  isEditing: boolean;
  isEditorLoading: boolean;
  isSaving: boolean;
  loadStateStatus: UsePromptEditorResult['loadState']['status'];
  notice: UsePromptEditorResult['notice'];
  onCancelEdit: () => void;
  onDeletePrompt: (prompt: PromptMeta) => Promise<void>;
  onSubmit: UsePromptEditorResult['submit'];
  updateField: UsePromptEditorResult['updateField'];
};

export function PromptEditorPanel(props: PromptEditorPanelProps) {
  const titleInputId = useId();
  const contentInputId = useId();
  const conflictHintId = useId();

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingInvalidFocusRef = useRef(false);

  useEffect(() => {
    if (!pendingInvalidFocusRef.current) {
      return;
    }

    if (props.errors.title) {
      titleInputRef.current?.focus();
      pendingInvalidFocusRef.current = false;
      return;
    }

    if (props.errors.content) {
      contentInputRef.current?.focus();
      pendingInvalidFocusRef.current = false;
      return;
    }

    if (!props.isSaving) {
      pendingInvalidFocusRef.current = false;
    }
  }, [props.errors, props.isSaving]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    pendingInvalidFocusRef.current = true;
    await props.onSubmit();
  }

  return (
    <article
      className="rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,#fef8f5,#f7eee8)] p-6 shadow-[0_18px_42px_rgba(66,53,49,0.06)]"
      aria-busy={props.isEditorLoading || props.isSaving}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            편집기
          </p>
          <h2 className="mt-2 text-xl font-semibold text-stone-900">
            {props.isEditing ? '프롬프트 수정' : '프롬프트 추가'}
          </h2>
        </div>
        {props.isEditing ? (
          <button
            type="button"
            className={`rounded-full border border-stone-300 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700 transition hover:border-stone-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
            onClick={props.onCancelEdit}
            disabled={props.isSaving}
          >
            편집 취소
          </button>
        ) : null}
      </div>

      {props.notice ? (
        <Banner
          tone="success"
          role="status"
          message={props.notice}
          onDismiss={props.clearNotice}
        />
      ) : null}

      {props.alertMessage ? (
        <Banner
          tone="danger"
          role="alert"
          message={props.alertMessage}
          onDismiss={props.clearAlertMessage}
        />
      ) : null}

      {props.conflictState.status === 'stale' ? (
        <div
          className="mt-5 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900"
          role="status"
          aria-live="polite"
          id={conflictHintId}
        >
          <p className="font-semibold">충돌 감지됨</p>
          <p className="mt-2 leading-6">{props.conflictState.message}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-amber-700">
            최신 저장본 {formatTimestamp(props.conflictState.currentPrompt.updatedAt)}
          </p>
        </div>
      ) : null}

      {props.bodyLoadState.status === 'loading' ? (
        <div
          className="mt-5 rounded-[20px] border border-stone-200 bg-white/70 px-4 py-4 text-sm text-stone-600"
          role="status"
          aria-live="polite"
        >
          선택한 프롬프트 본문을 불러오는 중입니다.
        </div>
      ) : null}

      {props.bodyLoadState.status === 'error' ? (
        <div
          className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900"
          role="status"
          aria-live="polite"
        >
          {props.bodyLoadState.message}
        </div>
      ) : null}

      <form
        className="mt-5 space-y-5"
        onSubmit={(event) => void handleSubmit(event)}
        aria-busy={props.isEditorLoading || props.isSaving}
      >
        <Field
          inputId={titleInputId}
          label="제목"
          error={props.errors.title}
          hint="1자 이상 40자 이하"
        >
          <input
            ref={titleInputRef}
            id={titleInputId}
            type="text"
            value={props.form.title}
            onChange={(event) => {
              props.updateField('title', event.target.value);
            }}
            className="w-full rounded-[18px] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
            placeholder="예: 회의록 정리"
            maxLength={40}
            disabled={props.editorDisabled}
            aria-invalid={Boolean(props.errors.title)}
            aria-describedby={getDescribedBy(titleInputId, {
              hasError: Boolean(props.errors.title),
              includeConflictHint: props.conflictState.status === 'stale',
              conflictHintId,
            })}
          />
        </Field>

        <Field
          inputId={contentInputId}
          label="본문"
          error={props.errors.content}
          hint="실제로 삽입할 프롬프트 본문"
        >
          <textarea
            ref={contentInputRef}
            id={contentInputId}
            value={props.form.content}
            onChange={(event) => {
              props.updateField('content', event.target.value);
            }}
            className="min-h-[220px] w-full rounded-[22px] border border-stone-200 bg-white px-4 py-4 text-sm leading-6 text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
            placeholder={
              props.isEditorLoading
                ? '본문을 불러오는 중입니다.'
                : '프롬프트를 입력하세요.'
            }
            disabled={props.editorDisabled}
            aria-invalid={Boolean(props.errors.content)}
            aria-describedby={getDescribedBy(contentInputId, {
              hasError: Boolean(props.errors.content),
              includeConflictHint: props.conflictState.status === 'stale',
              conflictHintId,
            })}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={`rounded-full bg-[#2f2f2f] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-stone-50 transition hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:bg-stone-500 ${BUTTON_FOCUS_CLASS}`}
            disabled={props.editorDisabled || props.loadStateStatus === 'error'}
          >
            {props.isSaving
              ? '저장 중...'
              : props.isEditorLoading
                ? '본문 불러오는 중'
                : props.isEditing
                  ? '프롬프트 수정'
                  : '프롬프트 추가'}
          </button>

          {props.isEditing ? (
            <button
              type="button"
              className={`rounded-full border border-rose-200 bg-rose-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
              onClick={() => {
                if (props.activePromptMeta) {
                  void props.onDeletePrompt(props.activePromptMeta);
                }
              }}
              disabled={
                props.isSaving || props.isEditorLoading || !props.activePromptMeta
              }
            >
              프롬프트 삭제
            </button>
          ) : null}
        </div>
      </form>
    </article>
  );
}
