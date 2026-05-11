import type { BaseAdapter } from './base';
import { ChatGPTAdapter } from './chatgpt';
import { GeminiAdapter } from './gemini';

const adapters: BaseAdapter[] = [
  new ChatGPTAdapter(),
  new GeminiAdapter(),
];

export function resolveAdapterForUrl(url: string): BaseAdapter | null {
  return adapters.find((adapter) => adapter.canHandle(url)) ?? null;
}
