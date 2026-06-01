import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {
  defineConfig,
  type ConfigEnv,
  type ConfigPluginContext,
  type Plugin,
  type UserConfig,
} from 'vite';

import manifest from './manifest.config';

type ConfigResult = Omit<UserConfig, 'plugins'> | null | void;

function removeRolldownOptionsFromCrxContentScriptResult(
  result: ConfigResult,
): ConfigResult {
  if (!result?.build || !('rollupOptions' in result.build)) {
    return result;
  }

  const { rolldownOptions: _rolldownOptions, ...build } = result.build;

  return {
    ...result,
    build,
  };
}

function withCrxContentScriptConfigFix(plugin: Plugin): Plugin {
  if (plugin.name !== 'crx:content-scripts' || typeof plugin.config !== 'function') {
    return plugin;
  }

  const originalConfig = plugin.config;

  return {
    ...plugin,
    async config(
      this: ConfigPluginContext,
      config: UserConfig,
      env: ConfigEnv,
    ): Promise<ConfigResult> {
      const result = await originalConfig.call(this, config, env);
      return removeRolldownOptionsFromCrxContentScriptResult(result);
    },
  };
}

const crxPlugins = (crx({ manifest }) as Plugin[]).map(
  withCrxContentScriptConfigFix,
);

export default defineConfig({
  plugins: [react(), tailwindcss(), ...crxPlugins],
  build: {
    target: 'es2022',
    outDir: process.env.PROMPTIT_BUILD_OUT_DIR || 'dist',
  },
});
