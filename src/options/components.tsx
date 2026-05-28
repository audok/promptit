import { type ReactNode } from 'react';

import { getIntlLocale, type Locale } from '../shared/i18n';

export const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--promptit-options-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--promptit-options-focus-offset)]';

export function formatTimestamp(value: string, locale: Locale): string {
  return new Date(value).toLocaleString(getIntlLocale(locale), {
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

export function InsertionIndicator(props: { label: string }) {
  return (
    <div
      className="my-2 flex items-center gap-3 text-xs font-semibold text-[var(--promptit-options-text-body)]"
      aria-hidden="true"
    >
      <span className="h-0.5 flex-1 rounded-full bg-[var(--promptit-options-text-body)]" />
      <span className="rounded-full border border-[var(--promptit-options-border-strong)] bg-[var(--promptit-options-surface)] px-2 py-1">
        {props.label}
      </span>
      <span className="h-0.5 flex-1 rounded-full bg-[var(--promptit-options-text-body)]" />
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

export function MetricCard(props: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--promptit-options-border-80)] bg-[var(--promptit-options-surface-70)] px-6 py-6 shadow-[var(--promptit-options-shadow-card)]">
      <p className="text-sm font-medium text-[var(--promptit-options-text-muted)]">{props.label}</p>
      <p className="mt-3 text-2xl font-extrabold leading-none text-[var(--promptit-options-text-primary)]">
        {props.value}
      </p>
    </div>
  );
}

export function EmptyPanel(props: { message: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-[var(--promptit-options-border-strong)] bg-[var(--promptit-options-surface-muted)] px-4 py-6 text-sm leading-6 text-[var(--promptit-options-text-muted)]">
      {props.message}
    </div>
  );
}

export function MetaLine(props: {
  label: string;
  labelClassName?: string;
  value: string;
}) {
  return (
    <span
      className="grid min-w-0 gap-0 leading-4"
      data-testid="prompt-meta-line"
    >
      <span
        className={props.labelClassName ?? 'font-semibold'}
        data-testid="prompt-meta-label"
      >
        {props.label}
      </span>
      <span
        className="min-w-0 whitespace-normal break-words"
        data-testid="prompt-meta-value"
        title={props.value}
      >
        {props.value}
      </span>
    </span>
  );
}

export function Banner(props: {
  dismissLabel: string;
  dismissText: string;
  message: string;
  onDismiss: () => void;
  role: 'alert' | 'status';
  tone: 'danger' | 'success';
}) {
  const palette =
    props.tone === 'danger'
      ? 'mt-5 rounded-[18px] bg-[var(--promptit-options-danger-surface)] px-4 py-3 text-sm text-[var(--promptit-options-danger-text)]'
      : 'mt-5 rounded-[18px] bg-[var(--promptit-options-success-surface)] px-4 py-3 text-sm text-[var(--promptit-options-success-text)]';

  return (
    <div className={`${palette} flex items-start justify-between gap-3`} role={props.role}>
      <p className="leading-6">{props.message}</p>
      <button
        type="button"
        className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] hover:bg-[var(--promptit-options-dismiss-hover)] ${BUTTON_FOCUS_CLASS}`}
        onClick={props.onDismiss}
        aria-label={props.dismissLabel}
      >
        {props.dismissText}
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
        <span className="text-sm font-bold leading-5 text-[var(--promptit-options-text-primary)]">
          {props.label}
        </span>
        <span id={`${props.inputId}-hint`} className="text-[11px] text-[var(--promptit-options-text-subtle)]">
          {props.hint}
        </span>
      </label>
      <div className="mt-3">{props.children}</div>
      {props.error ? (
        <p id={`${props.inputId}-error`} className="mt-2 text-sm text-[var(--promptit-options-danger-text)]">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
