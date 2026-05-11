const PROMPTIT_FONT_URL = 'fonts/PretendardVariable.woff2';

export const PROMPTIT_FONT_FAMILY = [
  '"Pretendard Variable"',
  'Pretendard',
  '-apple-system',
  'BlinkMacSystemFont',
  'system-ui',
  'Roboto',
  '"Helvetica Neue"',
  '"Segoe UI"',
  '"Apple SD Gothic Neo"',
  '"Noto Sans KR"',
  '"Malgun Gothic"',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
  '"Segoe UI Symbol"',
  'sans-serif',
].join(', ');

export function getPromptitFontStyles(): string {
  const fontUrl = chrome.runtime.getURL(PROMPTIT_FONT_URL);

  return `
    @font-face {
      font-family: "Pretendard Variable";
      font-weight: 45 920;
      font-style: normal;
      font-display: swap;
      src: url("${fontUrl}") format("woff2-variations");
    }

    :host {
      --promptit-font-family: ${PROMPTIT_FONT_FAMILY};
    }
  `;
}
