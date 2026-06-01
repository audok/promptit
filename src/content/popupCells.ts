import type { ActiveCellColumn, PopupActiveCell } from './session';

export function cloneActiveCell(
  activeCell: PopupActiveCell | null,
): PopupActiveCell | null {
  return activeCell ? { ...activeCell } : null;
}

function parseActiveCellColumn(
  value: string | undefined,
): ActiveCellColumn | null {
  if (value === 'pin' || value === 'title' || value === 'copy') {
    return value;
  }

  return null;
}

export function parseActiveCellDataset(
  dataset: DOMStringMap,
): PopupActiveCell | null {
  const rowIndex = Number(dataset.rowIndex);
  const column = parseActiveCellColumn(dataset.column);

  if (!Number.isFinite(rowIndex) || !column) {
    return null;
  }

  return {
    rowIndex,
    column,
  };
}

export function getTargetCell(target: EventTarget | null): PopupActiveCell | null {
  const element = target instanceof HTMLElement ? target : null;
  const cell = element?.closest<HTMLElement>('[data-role="prompt-cell"]');

  if (!cell) {
    return null;
  }

  return parseActiveCellDataset(cell.dataset);
}
