import {
  isPromptLauncherItem,
  type LauncherItem,
} from './launcher-items';
import {
  FALLBACK_LOCALE,
  type Locale,
} from '../shared/i18n';
import { type ResolvedTheme } from '../shared/theme';
import {
  isSameActiveCell,
  type PopupActiveCell,
} from './session';
import {
  cloneActiveCell,
  getTargetCell,
  parseActiveCellDataset,
} from './popupCells';
import { renderPopupShell } from './popupHtml';
import {
  keepElementVisibleWithinList,
  resolvePopupLayout,
} from './popupLayout';
import { createLauncherRow } from './popupRows';
import { IS_TEST_MODE } from './testControls';

type PopupOptions = {
  onSelect: (item: LauncherItem) => void;
  onCopy: (item: LauncherItem) => void;
  onTogglePinned: (item: LauncherItem) => void;
  onExit: () => void;
  onOpenOptions: () => void;
  onActiveCellChange: (activeCell: PopupActiveCell | null) => void;
};

type RenderState = {
  items: LauncherItem[];
  activeCell: PopupActiveCell | null;
  isBusy: boolean;
  locale: Locale;
  theme: ResolvedTheme;
};

export class PromptPopup {
  private host: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private activeCellAnnouncement = '';
  private state: RenderState = {
    items: [],
    activeCell: null,
    isBusy: false,
    locale: FALLBACK_LOCALE,
    theme: 'light',
  };

  constructor(private readonly options: PopupOptions) {}

  show(
    items: LauncherItem[],
    activeCell: PopupActiveCell | null,
    anchorRect: DOMRect,
    locale: Locale,
    theme: ResolvedTheme,
  ): void {
    this.state = {
      items,
      activeCell: cloneActiveCell(activeCell),
      isBusy: false,
      locale,
      theme,
    };
    this.activeCellAnnouncement = '';

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
    locale: Locale,
    theme: ResolvedTheme,
  ): void {
    if (!this.host) {
      this.show(items, activeCell, anchorRect, locale, theme);
      return;
    }

    this.state = {
      items,
      activeCell: cloneActiveCell(activeCell),
      isBusy: this.state.isBusy,
      locale,
      theme,
    };

    this.render();
    this.position(anchorRect);
  }

  reposition(anchorRect: DOMRect): void {
    if (!this.host || !this.shadowRoot) {
      return;
    }

    this.position(anchorRect);
  }

  destroy(): void {
    this.host?.remove();
    this.host = null;
    this.shadowRoot = null;
    this.activeCellAnnouncement = '';
    this.state = {
      items: [],
      activeCell: null,
      isBusy: false,
      locale: FALLBACK_LOCALE,
      theme: 'light',
    };
  }

  setTheme(theme: ResolvedTheme): void {
    this.state.theme = theme;
    const root = this.shadowRoot?.querySelector<HTMLElement>('.promptit-root');
    root?.setAttribute('data-promptit-theme', theme);
    if (root) {
      root.style.colorScheme = theme;
    }
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
    card?.setAttribute('aria-busy', String(isBusy));

    const buttons = this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button[data-action]');

    buttons?.forEach((button) => {
      button.disabled = isBusy;
    });
  }

  private mount(): void {
    this.host = document.createElement('div');
    this.host.setAttribute('data-promptit-popup-host', 'true');
    this.host.setAttribute('data-testid', 'promptit-popup-host');
    this.shadowRoot = this.host.attachShadow({
      mode: IS_TEST_MODE ? 'open' : 'closed',
    });
    document.documentElement.append(this.host);

    this.shadowRoot.addEventListener('pointerdown', (event) => {
      if (!event.isTrusted) {
        return;
      }

      event.preventDefault();
    });

    this.shadowRoot.addEventListener('pointermove', (event) => {
      if (!event.isTrusted) {
        return;
      }

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
      if (!event.isTrusted) {
        return;
      }

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

      if (action === 'pin') {
        this.options.onTogglePinned(selectedItem);
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

    const locale = this.state.locale;
    const savedCount = this.state.items.filter(isPromptLauncherItem).length;
    this.shadowRoot.innerHTML = renderPopupShell({
      isBusy: this.state.isBusy,
      locale,
      savedCount,
      theme: this.state.theme,
    });

    const list = this.shadowRoot.querySelector<HTMLElement>('[data-role="prompt-list"]');

    if (!list) {
      return;
    }

    const fragment = document.createDocumentFragment();

    this.state.items.forEach((item, index) => {
      fragment.append(createLauncherRow(
        item,
        index,
        this.state.activeCell,
        locale,
      ));
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
      const cellState = parseActiveCellDataset(cell.dataset);
      const isActive = isSameActiveCell(cellState, activeCell);

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

    this.updateActiveCellStatus(activeElement);

    const list = this.shadowRoot.querySelector<HTMLElement>('[data-role="prompt-list"]');

    if (activeElement && list) {
      keepElementVisibleWithinList(list, activeElement);
    }
  }

  private updateActiveCellStatus(activeElement: HTMLElement | null): void {
    const status = this.shadowRoot?.querySelector<HTMLElement>(
      '[data-role="active-cell-status"]',
    );

    if (!status) {
      return;
    }

    const nextAnnouncement =
      activeElement?.getAttribute('aria-label') ??
      activeElement?.textContent?.trim() ??
      '';

    if (
      nextAnnouncement === this.activeCellAnnouncement &&
      status.textContent === nextAnnouncement
    ) {
      return;
    }

    this.activeCellAnnouncement = nextAnnouncement;
    status.textContent = nextAnnouncement;
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
