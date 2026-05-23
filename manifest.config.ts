import { defineManifest } from '@crxjs/vite-plugin';

const isTestMode = process.env.VITE_PROMPTIT_TEST_MODE === '1';
const defaultMatches = [
  'https://chatgpt.com/*',
  'https://gemini.google.com/*',
];
const testMatches = ['http://127.0.0.1:*/*', 'http://localhost:*/*'];
const contentScriptMatches = isTestMode
  ? [...defaultMatches, ...testMatches]
  : defaultMatches;

export default defineManifest({
  manifest_version: 3,
  name: 'promptit',
  version: '0.9.0',
  description:
    'promptit is a browser extension for ChatGPT and Gemini. Use slash+space to quickly access and insert saved prompts.',
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  permissions: ['storage'],
  web_accessible_resources: [
    {
      resources: ['fonts/PretendardVariable.woff2'],
      matches: contentScriptMatches,
    },
  ],
  action: {
    default_title: 'promptit',
    default_icon: {
      16: 'icons/icon16.png',
      24: 'icons/icon24.png',
      32: 'icons/icon32.png',
    },
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  content_scripts: [
    {
      matches: contentScriptMatches,
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
    },
  ],
});
