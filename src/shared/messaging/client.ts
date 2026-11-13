import type { ExtRequest, ExtResponse } from '../types/messages';

/** Transport-agnostic client so tests can swap the runtime messaging out. */
export interface ExtClient {
  request(message: ExtRequest): Promise<ExtResponse>;
}

/** Real implementation over chrome.runtime messaging (side panel context). */
export function createRuntimeClient(): ExtClient {
  return {
    async request(message) {
      return (await chrome.runtime.sendMessage(message)) as ExtResponse;
    },
  };
}
