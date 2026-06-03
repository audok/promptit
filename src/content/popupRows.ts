import {
  EMPTY_STATE_LAUNCHER_ITEM_ID,
  isPromptLauncherItem,
  type LauncherItem,
} from './launcher-items';
import {
  translate,
  type Locale,
} from '../shared/i18n';
import type { PopupActiveCell } from './session';
import {
  renderCopyIcon,
  renderEmptyStateIcon,
  renderPushPinIcon,
} from './popupIcons';

export function createLauncherRow(
  item: LauncherItem,
  index: number,
  activeCell: PopupActiveCell | null,
  locale: Locale,
): HTMLElement {
  const isActiveRow = activeCell?.rowIndex === index;
  const isActiveTitleCell =
    activeCell?.rowIndex === index && activeCell.column === 'title';
  const isActivePinCell =
    isPromptLauncherItem(item) &&
    activeCell?.rowIndex === index &&
    activeCell.column === 'pin';
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
  row.setAttribute('role', 'listitem');

  const leadingButton = document.createElement('button');
  leadingButton.type = 'button';
  leadingButton.className = isPromptLauncherItem(item)
    ? `promptit-row-pin-button${isActivePinCell ? ' is-active-cell' : ''}${item.pinned ? ' is-pinned' : ''}`
    : 'promptit-row-leading-button';
  leadingButton.tabIndex = -1;

  if (!isPromptLauncherItem(item)) {
    leadingButton.disabled = true;
    leadingButton.setAttribute('aria-hidden', 'true');
  } else {
    leadingButton.dataset.action = 'pin';
    leadingButton.dataset.role = 'prompt-cell';
    leadingButton.dataset.rowIndex = String(index);
    leadingButton.dataset.column = 'pin';
    leadingButton.dataset.testid = 'promptit-pin-cell';
    leadingButton.ariaLabel = item.pinned
      ? translate(locale, 'content.popup.unpinAria', { title: item.title })
      : translate(locale, 'content.popup.pinAria', { title: item.title });
    leadingButton.setAttribute('aria-pressed', String(item.pinned));
  }

  const leadingBadge = document.createElement('span');
  leadingBadge.className = isPromptLauncherItem(item)
    ? 'promptit-row-action-badge promptit-row-pin-badge'
    : 'promptit-row-leading-badge';
  leadingBadge.innerHTML = isPromptLauncherItem(item)
    ? renderPushPinIcon(item.pinned)
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
    ? translate(locale, 'content.popup.insertAria', { title: item.title })
    : translate(locale, 'content.popup.emptyItemAria', {
        title: item.title,
        description: item.description,
      });

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
    copyButton.ariaLabel = translate(locale, 'content.popup.copyAria', {
      title: item.title,
    });
  }

  const copyBadge = document.createElement('span');
  copyBadge.className = 'promptit-row-action-badge promptit-row-copy-badge';
  copyBadge.innerHTML = renderCopyIcon();
  copyButton.append(copyBadge);

  row.append(leadingButton, titleButton, copyButton);
  return row;
}
