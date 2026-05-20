import { type ReactNode } from 'react';

export const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

export function getDescribedBy(
  inputId: string,
  options: {
    hasError: boolean;
    includeConflictHint: boolean;
    conflictHintId: string;
  },
): string | undefined {
  const ids = [`${inputId}-hint`];

  if (options.hasError) {
    ids.push(`${inputId}-error`);
  }

  if (options.includeConflictHint) {
    ids.push(options.conflictHintId);
  }

  return ids.join(' ');
}

export function InsertionIndicator() {
  return (
    <div
      className="my-2 flex items-center gap-3 text-xs font-semibold text-stone-700"
      aria-hidden="true"
    >
      <span className="h-0.5 flex-1 rounded-full bg-stone-900" />
      <span className="rounded-full border border-stone-300 bg-white px-2 py-1">
        여기에 놓기
      </span>
      <span className="h-0.5 flex-1 rounded-full bg-stone-900" />
    </div>
  );
}

export function PinIcon(props: { filled: boolean }) {
  const pathData = props.filled
    ? 'M16 12l2 2v2h-5v6l-1 1-1-1v-6H6v-2l2-2V5H7V3h10v2h-1Z'
    : 'm16 12 2 2v2h-5v6l-1 1-1-1v-6H6v-2l2-2V5H7V3h10v2h-1Zm-7.15 2h6.3L14 12.85V5h-4v7.85ZM12 14Z';

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
      focusable="false"
    >
      <path d={pathData} fill="currentColor" />
    </svg>
  );
}

export function DragHandleIcon() {
  return (
    <svg
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
      focusable="false"
    >
      {[5, 9, 13].map((cy) => (
        <g key={cy}>
          <circle cx="6.5" cy={cy} r="1.35" fill="currentColor" />
          <circle cx="11.5" cy={cy} r="1.35" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

export function MetricCard(props: { label: string; value: string }) {
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

export function EmptyPanel(props: { message: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm leading-6 text-stone-600">
      {props.message}
    </div>
  );
}

export function MetaLine(props: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 font-semibold">{props.label}</span>
      <span className="min-w-0 truncate">{props.value}</span>
    </span>
  );
}

export function Banner(props: {
  message: string;
  onDismiss: () => void;
  role: 'alert' | 'status';
  tone: 'danger' | 'success';
}) {
  const palette =
    props.tone === 'danger'
      ? 'mt-5 rounded-[18px] bg-rose-50 px-4 py-3 text-sm text-rose-700'
      : 'mt-5 rounded-[18px] bg-emerald-50 px-4 py-3 text-sm text-emerald-700';

  return (
    <div className={`${palette} flex items-start justify-between gap-3`} role={props.role}>
      <p className="leading-6">{props.message}</p>
      <button
        type="button"
        className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] hover:bg-black/5 ${BUTTON_FOCUS_CLASS}`}
        onClick={props.onDismiss}
        aria-label="메시지 닫기"
      >
        닫기
      </button>
    </div>
  );
}

export function Field(props: {
  inputId: string;
  label: string;
  hint: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={props.inputId} className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
          {props.label}
        </span>
        <span id={`${props.inputId}-hint`} className="text-[11px] text-stone-500">
          {props.hint}
        </span>
      </label>
      <div className="mt-3">{props.children}</div>
      {props.error ? (
        <p id={`${props.inputId}-error`} className="mt-2 text-sm text-rose-600">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
