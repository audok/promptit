export type OptionsToastTone = 'success' | 'error' | 'info';

export type OptionsToastMessage = {
  id: number;
  message: string;
  tone: OptionsToastTone;
};

type OptionsToastProps = {
  toast: OptionsToastMessage | null;
};

export function OptionsToast(props: OptionsToastProps) {
  if (!props.toast) {
    return null;
  }

  const liveRegionProps =
    props.toast.tone === 'error'
      ? { role: 'alert' as const, 'aria-live': 'assertive' as const }
      : { role: 'status' as const, 'aria-live': 'polite' as const };
  const toneClass =
    props.toast.tone === 'error'
      ? 'border-[var(--promptit-options-toast-error-border)] bg-[var(--promptit-options-toast-error-background)] text-[var(--promptit-options-toast-error-text)]'
      : 'border-[var(--promptit-options-toast-success-border)] bg-[var(--promptit-options-toast-success-background)] text-[var(--promptit-options-toast-success-text)]';

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[2147483647] flex justify-center px-4"
      data-testid="options-toast"
    >
      <div
        key={props.toast.id}
        className={`max-w-[min(34rem,100%)] rounded-full border px-4 py-3 text-center text-sm font-medium leading-5 shadow-[var(--promptit-options-toast-shadow)] ${toneClass}`}
        aria-atomic="true"
        {...liveRegionProps}
      >
        {props.toast.message}
      </div>
    </div>
  );
}
