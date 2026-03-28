import { isStarterPrompt, type PromptItem } from '../prompt/schema';
import type { ActiveCellColumn, PopupActiveCell } from './session';
import popupStyles from './popup.css?inline';

export type PopupItemAction = 'insert' | 'open-options';

export type PopupRenderItem = PromptItem & {
  action: PopupItemAction;
};

type PopupOptions = {
  onSelect: (item: PopupRenderItem) => void;
  onCopy: (item: PopupRenderItem) => void;
  onExit: () => void;
  onOpenOptions: () => void;
  onActiveCellChange: (activeCell: PopupActiveCell | null) => void;
};

type RenderState = {
  items: PopupRenderItem[];
  activeCell: PopupActiveCell | null;
  isBusy: boolean;
};

const VIEWPORT_MARGIN_PX = 12;
const ANCHOR_GAP_PX = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toRenderItems(items: PromptItem[]): PopupRenderItem[] {
  return items.map((item) => ({
    ...item,
    action: isStarterPrompt(item) ? 'open-options' : 'insert',
  }));
}

function cloneActiveCell(
  activeCell: PopupActiveCell | null,
): PopupActiveCell | null {
  return activeCell ? { ...activeCell } : null;
}

function getTargetCell(target: EventTarget | null): PopupActiveCell | null {
  const element = target instanceof HTMLElement ? target : null;
  const cell = element?.closest<HTMLElement>('[data-role="prompt-cell"]');

  if (!cell) {
    return null;
  }

  const rowIndex = Number(cell.dataset.rowIndex);
  const column = cell.dataset.column as ActiveCellColumn | undefined;

  if (!Number.isFinite(rowIndex) || !column) {
    return null;
  }

  return {
    rowIndex,
    column,
  };
}

export class PromptPopup {
  private host: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private state: RenderState = {
    items: [],
    activeCell: null,
    isBusy: false,
  };

  constructor(private readonly options: PopupOptions) {}

  show(
    items: PromptItem[],
    activeCell: PopupActiveCell | null,
    anchorRect: DOMRect,
  ): void {
    this.state = {
      items: toRenderItems(items),
      activeCell: cloneActiveCell(activeCell),
      isBusy: false,
    };

    if (!this.host) {
      this.mount();
    }

    this.render();
    this.position(anchorRect);
  }

  update(
    items: PromptItem[],
    activeCell: PopupActiveCell | null,
    anchorRect: DOMRect,
  ): void {
    if (!this.host) {
      this.show(items, activeCell, anchorRect);
      return;
    }

    this.state = {
      items: toRenderItems(items),
      activeCell: cloneActiveCell(activeCell),
      isBusy: this.state.isBusy,
    };

    this.render();
    this.position(anchorRect);
  }

  destroy(): void {
    this.host?.remove();
    this.host = null;
    this.shadowRoot = null;
    this.state = {
      items: [],
      activeCell: null,
      isBusy: false,
    };
  }

  setActiveCell(activeCell: PopupActiveCell | null): void {
    if (!this.host) {
      return;
    }

    this.state.activeCell = cloneActiveCell(activeCell);
    this.applyActiveState();
  }

  containsEvent(event: Event): boolean {
    return this.host ? event.composedPath().includes(this.host) : false;
  }

  setBusy(isBusy: boolean): void {
    this.state.isBusy = isBusy;
    const card = this.shadowRoot?.querySelector<HTMLElement>('.promptit-card');
    card?.classList.toggle('is-busy', isBusy);

    const buttons = this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button[data-action]');

    buttons?.forEach((button) => {
      button.disabled = isBusy;
    });
  }

  private mount(): void {
    this.host = document.createElement('div');
    this.host.setAttribute('data-promptit-popup-host', 'true');
    this.shadowRoot = this.host.attachShadow({ mode: 'open' });
    document.documentElement.append(this.host);

    this.shadowRoot.addEventListener('pointerdown', (event) => {
      event.preventDefault();
    });

    this.shadowRoot.addEventListener('mouseover', (event) => {
      const nextActiveCell = getTargetCell(event.target);

      if (!nextActiveCell) {
        return;
      }

      this.options.onActiveCellChange(nextActiveCell);
      this.setActiveCell(nextActiveCell);
    });

    this.shadowRoot.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;

      if (!target) {
        return;
      }

      const nextActiveCell = getTargetCell(target);

      if (nextActiveCell) {
        this.options.onActiveCellChange(nextActiveCell);
        this.setActiveCell(nextActiveCell);
      }

      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;

      if (action === 'exit') {
        this.options.onExit();
        return;
      }

      if (action === 'open-options') {
        this.options.onOpenOptions();
        return;
      }

      const row = target.closest<HTMLElement>('[data-role="prompt-row"]');

      if (!row || row.dataset.index === undefined) {
        return;
      }

      const selectedItem = this.state.items[Number(row.dataset.index)];

      if (!selectedItem) {
        return;
      }

      if (action === 'copy') {
        this.options.onCopy(selectedItem);
        return;
      }

      if (action === 'select') {
        this.options.onSelect(selectedItem);
      }
    });
  }

  private render(): void {
    if (!this.shadowRoot) {
      return;
    }

    const savedCount = this.state.items.filter((item) => item.action === 'insert').length;
    const savedCountLabel = `${savedCount} saved`;

    this.shadowRoot.innerHTML = `
      <style>${popupStyles}</style>
      <div class="promptit-root">
        <section class="promptit-card${this.state.isBusy ? ' is-busy' : ''}" aria-label="Promptit prompt picker">
          <header class="promptit-header">
            <div class="promptit-header-label">
              <span class="promptit-header-slash">/</span>
              <span class="promptit-header-text">prompt</span>
            </div>
            <button
              type="button"
              class="promptit-header-action"
              data-action="exit"
              tabindex="-1"
            >
              Exit
            </button>
          </header>
          <div class="promptit-list" data-role="prompt-list"></div>
          <footer class="promptit-footer">
            <span class="promptit-footer-label">${savedCountLabel}</span>
            <div class="promptit-footer-actions">
              <span class="promptit-footer-icon" aria-hidden="true">
                ${renderChevronDownIcon()}
              </span>
              <button
                type="button"
                class="promptit-footer-button"
                data-action="open-options"
                aria-label="Open settings"
                tabindex="-1"
              >
                ${renderSettingsIcon()}
              </button>
            </div>
          </footer>
        </section>
      </div>
    `;

    const list = this.shadowRoot.querySelector<HTMLElement>('[data-role="prompt-list"]');

    if (!list) {
      return;
    }

    if (this.state.items.length === 0) {
      list.replaceChildren(createEmptyState());
      this.setBusy(this.state.isBusy);
      return;
    }

    const fragment = document.createDocumentFragment();

    this.state.items.forEach((item, index) => {
      fragment.append(
        createPromptRow(item, index, this.state.activeCell),
      );
    });

    list.replaceChildren(fragment);
    this.applyActiveState();
    this.setBusy(this.state.isBusy);
  }

  private applyActiveState(): void {
    if (!this.shadowRoot) {
      return;
    }

    const activeCell = this.state.activeCell;
    const rows = this.shadowRoot.querySelectorAll<HTMLElement>('[data-role="prompt-row"]');

    rows.forEach((row) => {
      const rowIndex = Number(row.dataset.index);
      row.classList.toggle('is-active-row', rowIndex === activeCell?.rowIndex);
    });

    const cells = this.shadowRoot.querySelectorAll<HTMLElement>('[data-role="prompt-cell"]');

    cells.forEach((cell) => {
      const rowIndex = Number(cell.dataset.rowIndex);
      const column = cell.dataset.column as ActiveCellColumn | undefined;
      const isActive =
        rowIndex === activeCell?.rowIndex && column === activeCell?.column;

      cell.classList.toggle('is-active-cell', isActive);

      if (isActive) {
        cell.setAttribute('aria-current', 'true');
      } else {
        cell.removeAttribute('aria-current');
      }
    });

    const activeElement = this.shadowRoot.querySelector<HTMLElement>(
      '[data-role="prompt-cell"].is-active-cell',
    );

    const list = this.shadowRoot.querySelector<HTMLElement>('[data-role="prompt-list"]');

    if (activeElement && list) {
      keepElementVisibleWithinList(list, activeElement);
    }
  }

  private position(anchorRect: DOMRect): void {
    if (!this.host || !this.shadowRoot) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const card = this.shadowRoot.querySelector<HTMLElement>('.promptit-card');

    if (!card) {
      return;
    }

    const maxAllowedWidth = Math.max(160, viewportWidth - VIEWPORT_MARGIN_PX * 2);
    const popupWidth = Math.min(anchorRect.width, maxAllowedWidth);
    this.host.style.position = 'fixed';
    this.host.style.zIndex = '2147483646';
    this.host.style.width = `${popupWidth}px`;

    const left = clamp(
      anchorRect.left,
      VIEWPORT_MARGIN_PX,
      viewportWidth - popupWidth - VIEWPORT_MARGIN_PX,
    );
    const measuredHeight = card.getBoundingClientRect().height;
    const spaceAbove = anchorRect.top - VIEWPORT_MARGIN_PX;
    const prefersAbove = spaceAbove >= measuredHeight + ANCHOR_GAP_PX;
    const top = prefersAbove
      ? anchorRect.top - measuredHeight - ANCHOR_GAP_PX
      : clamp(
          anchorRect.bottom + ANCHOR_GAP_PX,
          VIEWPORT_MARGIN_PX,
          viewportHeight - measuredHeight - VIEWPORT_MARGIN_PX,
        );

    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
  }
}

function keepElementVisibleWithinList(
  list: HTMLElement,
  element: HTMLElement,
): void {
  const listRect = list.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const topDelta = elementRect.top - listRect.top;
  const bottomDelta = elementRect.bottom - listRect.bottom;

  if (topDelta < 0) {
    list.scrollTop += topDelta;
    return;
  }

  if (bottomDelta > 0) {
    list.scrollTop += bottomDelta;
  }
}

function createPromptRow(
  item: PopupRenderItem,
  index: number,
  activeCell: PopupActiveCell | null,
): HTMLElement {
  const isActiveRow = activeCell?.rowIndex === index;
  const isActiveTitleCell =
    activeCell?.rowIndex === index && activeCell.column === 'title';
  const isActiveCopyCell =
    activeCell?.rowIndex === index && activeCell.column === 'copy';

  const row = document.createElement('div');
  row.className = `promptit-row${isActiveRow ? ' is-active-row' : ''}${isActiveCopyCell ? ' is-copy-active' : ''}`;
  row.dataset.role = 'prompt-row';
  row.dataset.index = String(index);

  const leadingButton = document.createElement('button');
  leadingButton.type = 'button';
  leadingButton.className = 'promptit-row-leading-button';
  leadingButton.disabled = true;
  leadingButton.tabIndex = -1;
  leadingButton.setAttribute('aria-hidden', 'true');

  const leadingBadge = document.createElement('span');
  leadingBadge.className = 'promptit-row-leading-badge';
  leadingBadge.innerHTML = renderPushPinIcon();
  leadingButton.append(leadingBadge);

  const titleButton = document.createElement('button');
  titleButton.type = 'button';
  titleButton.className = `promptit-row-title-button${isActiveTitleCell ? ' is-active-cell' : ''}`;
  titleButton.dataset.action = 'select';
  titleButton.dataset.role = 'prompt-cell';
  titleButton.dataset.rowIndex = String(index);
  titleButton.dataset.column = 'title';
  titleButton.tabIndex = -1;
  titleButton.ariaLabel =
    item.action === 'open-options'
      ? `Open settings: ${item.title}`
      : `Insert prompt: ${item.title}`;

  const titleText = document.createElement('span');
  titleText.className = 'promptit-row-title';
  titleText.textContent = item.title;
  titleButton.append(titleText);

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = `promptit-row-copy-button${isActiveCopyCell ? ' is-active-cell' : ''}`;
  copyButton.tabIndex = -1;

  if (item.action === 'open-options') {
    copyButton.disabled = true;
    copyButton.setAttribute('aria-hidden', 'true');
  } else {
    copyButton.dataset.action = 'copy';
    copyButton.dataset.role = 'prompt-cell';
    copyButton.dataset.rowIndex = String(index);
    copyButton.dataset.column = 'copy';
    copyButton.ariaLabel = `Copy prompt: ${item.title}`;
  }

  const copyBadge = document.createElement('span');
  copyBadge.className = 'promptit-row-copy-badge';
  copyBadge.innerHTML = renderCopyIcon();
  copyButton.append(copyBadge);

  row.append(leadingButton, titleButton, copyButton);
  return row;
}

function createEmptyState(): HTMLElement {
  const emptyState = document.createElement('div');
  emptyState.className = 'promptit-empty';

  const title = document.createElement('p');
  title.className = 'promptit-empty-title';
  title.textContent = '저장된 프롬프트가 없습니다.';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'promptit-settings-button';
  button.dataset.action = 'open-options';
  button.tabIndex = -1;
  button.textContent = '설정 열기';

  emptyState.append(title, button);
  return emptyState;
}

function renderPushPinIcon(): string {
  return `
    <svg viewBox="0 0 24 24" class="promptit-icon" aria-hidden="true">
      <path d="m16 12 2 2v2h-5v6l-1 1-1-1v-6H6v-2l2-2V5H7V3h10v2h-1Zm-7.15 2h6.3L14 12.85V5h-4v7.85ZM12 14Z" fill="currentColor" />
    </svg>
  `;
}

function renderCopyIcon(): string {
  return `
    <svg viewBox="0 -960 960 960" class="promptit-icon" aria-hidden="true">
      <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z" fill="currentColor" />
    </svg>
  `;
}

function renderChevronDownIcon(): string {
  return `
    <svg viewBox="0 -960 960 960" class="promptit-icon" aria-hidden="true">
      <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" fill="currentColor" />
    </svg>
  `;
}

function renderSettingsIcon(): string {
  return `
    <svg viewBox="0 -960 960 960" class="promptit-icon" aria-hidden="true">
      <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" fill="currentColor" />
    </svg>
  `;
}
