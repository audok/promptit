const VIEWPORT_MARGIN_PX = 12;
const ANCHOR_GAP_PX = 24;
const POPUP_MIN_WIDTH_PX = 320;
const LIST_ROW_HEIGHT_PX = 56;
const LIST_MAX_ROWS = 5;
const LIST_VERTICAL_PADDING_PX = 16;
const LIST_MAX_HEIGHT_PX = LIST_ROW_HEIGHT_PX * LIST_MAX_ROWS + LIST_VERTICAL_PADDING_PX;

export type PopupLayout = {
  left: number;
  top: number;
  placement: 'above' | 'below';
  listMaxHeight: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolvePopupLayout(
  host: HTMLDivElement,
  card: HTMLElement,
  list: HTMLElement,
  anchorRect: DOMRect,
): PopupLayout {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxAllowedWidth = Math.max(0, viewportWidth - VIEWPORT_MARGIN_PX * 2);
  const minAllowedWidth = Math.min(POPUP_MIN_WIDTH_PX, maxAllowedWidth);
  const popupWidth = clamp(anchorRect.width, minAllowedWidth, maxAllowedWidth);
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

export function keepElementVisibleWithinList(
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
