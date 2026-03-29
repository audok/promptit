import {
  EMPTY_STATE_LAUNCHER_ITEM_ID,
  isPromptLauncherItem,
  type LauncherItem,
} from './launcher-items';
import {
  isSameActiveCell,
  type ActiveCellColumn,
  type PopupActiveCell,
} from './session';
import popupStyles from './popup.css?inline';

type PopupOptions = {
  onSelect: (item: LauncherItem) => void;
  onCopy: (item: LauncherItem) => void;
  onExit: () => void;
  onOpenOptions: () => void;
  onActiveCellChange: (activeCell: PopupActiveCell | null) => void;
};

type RenderState = {
  items: LauncherItem[];
  activeCell: PopupActiveCell | null;
  isBusy: boolean;
};

const VIEWPORT_MARGIN_PX = 12;
const ANCHOR_GAP_PX = 24;
const LIST_ROW_HEIGHT_PX = 56;
const LIST_MAX_ROWS = 5;
const LIST_VERTICAL_PADDING_PX = 16;
const LIST_MAX_HEIGHT_PX = LIST_ROW_HEIGHT_PX * LIST_MAX_ROWS + LIST_VERTICAL_PADDING_PX;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
    items: LauncherItem[],
    activeCell: PopupActiveCell | null,
    anchorRect: DOMRect,
  ): void {
    this.state = {
      items,
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
    items: LauncherItem[],
    activeCell: PopupActiveCell | null,
    anchorRect: DOMRect,
  ): void {
    if (!this.host) {
      this.show(items, activeCell, anchorRect);
      return;
    }

    this.state = {
      items,
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
    this.host.setAttribute('data-testid', 'promptit-popup-host');
    this.shadowRoot = this.host.attachShadow({ mode: 'open' });
    document.documentElement.append(this.host);

    this.shadowRoot.addEventListener('pointerdown', (event) => {
      event.preventDefault();
    });

    this.shadowRoot.addEventListener('pointermove', (event) => {
      const nextActiveCell = getTargetCell(event.target);

      if (
        !nextActiveCell ||
        isSameActiveCell(nextActiveCell, this.state.activeCell)
      ) {
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

      if (!isPromptLauncherItem(selectedItem)) {
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

    const savedCount = this.state.items.filter(isPromptLauncherItem).length;
    const savedCountLabel = `${savedCount} saved`;

    this.shadowRoot.innerHTML = `
      <style>${popupStyles}</style>
      <div class="promptit-root">
        <section
          class="promptit-card${this.state.isBusy ? ' is-busy' : ''}"
          aria-label="Promptit prompt picker"
          data-testid="promptit-popup"
        >
          <header class="promptit-header">
            <div class="promptit-header-label">
              <span class="promptit-header-slash">/</span>
              <span class="promptit-header-text">prompt-it</span>
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
          <div
            class="promptit-list"
            data-role="prompt-list"
            data-testid="promptit-popup-list"
          ></div>
          <footer class="promptit-footer">
            <span class="promptit-footer-label">${savedCountLabel}</span>
            <button
              type="button"
              class="promptit-footer-button"
              data-action="open-options"
              aria-label="Open settings"
              tabindex="-1"
            >
              ${renderSettingsIcon()}
            </button>
          </footer>
        </section>
      </div>
    `;

    const list = this.shadowRoot.querySelector<HTMLElement>('[data-role="prompt-list"]');

    if (!list) {
      return;
    }

    const fragment = document.createDocumentFragment();

    this.state.items.forEach((item, index) => {
      fragment.append(createLauncherRow(item, index, this.state.activeCell));
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

    const card = this.shadowRoot.querySelector<HTMLElement>('.promptit-card');
    const list = this.shadowRoot.querySelector<HTMLElement>('[data-role="prompt-list"]');

    if (!card || !list) {
      return;
    }

    const layout = resolvePopupLayout(this.host, card, list, anchorRect);
    this.host.style.left = `${layout.left}px`;
    this.host.style.top = `${layout.top}px`;
  }
}

type PopupLayout = {
  left: number;
  top: number;
  placement: 'above' | 'below';
  listMaxHeight: number;
};

function resolvePopupLayout(
  host: HTMLDivElement,
  card: HTMLElement,
  list: HTMLElement,
  anchorRect: DOMRect,
): PopupLayout {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxAllowedWidth = Math.max(160, viewportWidth - VIEWPORT_MARGIN_PX * 2);
  const popupWidth = Math.min(anchorRect.width, maxAllowedWidth);
  const left = clamp(
    anchorRect.left,
    VIEWPORT_MARGIN_PX,
    Math.max(VIEWPORT_MARGIN_PX, viewportWidth - popupWidth - VIEWPORT_MARGIN_PX),
  );

  host.style.position = 'fixed';
  host.style.zIndex = '2147483646';
  host.style.width = `${popupWidth}px`;

  const measuredCardHeight = card.getBoundingClientRect().height;
  const measuredListHeight = list.getBoundingClientRect().height;
  const chromeHeight = Math.max(0, measuredCardHeight - measuredListHeight);
  const spaceAbove = Math.max(0, anchorRect.top - VIEWPORT_MARGIN_PX - ANCHOR_GAP_PX);
  const spaceBelow = Math.max(
    0,
    viewportHeight - anchorRect.bottom - VIEWPORT_MARGIN_PX - ANCHOR_GAP_PX,
  );
  const placement =
    spaceAbove >= measuredCardHeight
      ? 'above'
      : spaceBelow >= measuredCardHeight
        ? 'below'
        : spaceAbove >= spaceBelow
          ? 'above'
          : 'below';
  const availableSpace = placement === 'above' ? spaceAbove : spaceBelow;
  const listMaxHeight = clamp(
    availableSpace - chromeHeight,
    0,
    LIST_MAX_HEIGHT_PX,
  );
  list.style.setProperty('--promptit-list-max-height', `${listMaxHeight}px`);
  const measuredPopupHeight = card.getBoundingClientRect().height;
  const top =
    placement === 'above'
      ? clamp(
          anchorRect.top - measuredPopupHeight - ANCHOR_GAP_PX,
          VIEWPORT_MARGIN_PX,
          Math.max(
            VIEWPORT_MARGIN_PX,
            viewportHeight - measuredPopupHeight - VIEWPORT_MARGIN_PX,
          ),
        )
      : clamp(
          anchorRect.bottom + ANCHOR_GAP_PX,
          VIEWPORT_MARGIN_PX,
          Math.max(
            VIEWPORT_MARGIN_PX,
            viewportHeight - measuredPopupHeight - VIEWPORT_MARGIN_PX,
          ),
        );

  return {
    left,
    top,
    placement,
    listMaxHeight,
  };
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

function createLauncherRow(
  item: LauncherItem,
  index: number,
  activeCell: PopupActiveCell | null,
): HTMLElement {
  const isActiveRow = activeCell?.rowIndex === index;
  const isActiveTitleCell =
    activeCell?.rowIndex === index && activeCell.column === 'title';
  const isActiveCopyCell =
    isPromptLauncherItem(item) &&
    activeCell?.rowIndex === index &&
    activeCell.column === 'copy';

  const row = document.createElement('div');
  row.className = `promptit-row${isActiveRow ? ' is-active-row' : ''}${isActiveCopyCell ? ' is-copy-active' : ''}${!isPromptLauncherItem(item) ? ' is-empty-state' : ''}`;
  row.dataset.role = 'prompt-row';
  row.dataset.index = String(index);
  row.dataset.itemId = isPromptLauncherItem(item)
    ? item.id
    : EMPTY_STATE_LAUNCHER_ITEM_ID;
  row.dataset.itemKind = item.kind;
  row.dataset.testid = 'promptit-row';

  const leadingButton = document.createElement('button');
  leadingButton.type = 'button';
  leadingButton.className = 'promptit-row-leading-button';
  leadingButton.disabled = true;
  leadingButton.tabIndex = -1;
  leadingButton.setAttribute('aria-hidden', 'true');

  const leadingBadge = document.createElement('span');
  leadingBadge.className = 'promptit-row-leading-badge';
  leadingBadge.innerHTML = isPromptLauncherItem(item)
    ? renderPushPinIcon()
    : renderEmptyStateIcon();
  leadingButton.append(leadingBadge);

  const titleButton = document.createElement('button');
  titleButton.type = 'button';
  titleButton.className = `promptit-row-title-button${isActiveTitleCell ? ' is-active-cell' : ''}${!isPromptLauncherItem(item) ? ' is-empty-state' : ''}`;
  titleButton.dataset.action = isPromptLauncherItem(item) ? 'select' : 'open-options';
  titleButton.dataset.role = 'prompt-cell';
  titleButton.dataset.rowIndex = String(index);
  titleButton.dataset.column = 'title';
  titleButton.dataset.testid = 'promptit-title-cell';
  titleButton.tabIndex = -1;
  titleButton.ariaLabel = isPromptLauncherItem(item)
    ? `Insert prompt: ${item.title}`
    : `${item.title} ${item.description}`;

  const titleText = document.createElement('span');
  titleText.className = 'promptit-row-title';
  titleText.textContent = item.title;
  titleButton.append(titleText);

  if (!isPromptLauncherItem(item)) {
    const descriptionText = document.createElement('span');
    descriptionText.className = 'promptit-row-description';
    descriptionText.textContent = item.description;
    titleButton.append(descriptionText);
  }

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = `promptit-row-copy-button${isActiveCopyCell ? ' is-active-cell' : ''}`;
  copyButton.tabIndex = -1;

  if (!isPromptLauncherItem(item)) {
    copyButton.disabled = true;
    copyButton.setAttribute('aria-hidden', 'true');
    copyButton.classList.add('is-empty-state');
  } else {
    copyButton.dataset.action = 'copy';
    copyButton.dataset.role = 'prompt-cell';
    copyButton.dataset.rowIndex = String(index);
    copyButton.dataset.column = 'copy';
    copyButton.dataset.testid = 'promptit-copy-cell';
    copyButton.ariaLabel = `Copy prompt: ${item.title}`;
  }

  const copyBadge = document.createElement('span');
  copyBadge.className = 'promptit-row-copy-badge';
  copyBadge.innerHTML = renderCopyIcon();
  copyButton.append(copyBadge);

  row.append(leadingButton, titleButton, copyButton);
  return row;
}

function renderPushPinIcon(): string {
  return `
    <svg viewBox="0 0 24 24" class="promptit-icon" aria-hidden="true">
      <path d="m16 12 2 2v2h-5v6l-1 1-1-1v-6H6v-2l2-2V5H7V3h10v2h-1Zm-7.15 2h6.3L14 12.85V5h-4v7.85ZM12 14Z" fill="currentColor" />
    </svg>
  `;
}

function renderEmptyStateIcon(): string {
  return `
    <svg viewBox="0 0 24 24" class="promptit-icon" aria-hidden="true">
      <path d="M11 5h2v14h-2z" fill="currentColor" />
      <path d="M5 11h14v2H5z" fill="currentColor" />
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

function renderSettingsIcon(): string {
  return `
    <svg viewBox="0 -960 960 960" class="promptit-icon" aria-hidden="true">
      <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" fill="currentColor" />
    </svg>
  `;
}
