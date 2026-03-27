import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Promptit',
  version: '0.0.1',
  description: 'Load saved prompts into ChatGPT with a slash trigger.',
  permissions: ['storage'],
  host_permissions: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  action: {
    default_title: 'Promptit',
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
      matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
    },
  ],
});
