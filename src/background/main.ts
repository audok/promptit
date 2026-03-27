import {
  OPEN_OPTIONS_PAGE_MESSAGE,
  type PromptitRuntimeMessage,
} from '../runtime/messages';

function openOptionsPage(): void {
  void chrome.runtime.openOptionsPage();
}

chrome.action.onClicked.addListener(() => {
  openOptionsPage();
});

chrome.runtime.onMessage.addListener((message: PromptitRuntimeMessage) => {
  if (message?.type === OPEN_OPTIONS_PAGE_MESSAGE) {
    openOptionsPage();
  }
});
