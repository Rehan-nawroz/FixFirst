import type { ErrorCode, ExtRequest, ExtResponse } from '../shared/types/messages';
import { validateExtRequest } from '../shared/validation/messages';
import { ExtServiceError, type SettingsService } from './settings-service';
import type { AiService } from './ai-service';
import type { PageScannerService } from './page-scanner';

/**
 * Central message router for the background service worker. Validates every
 * incoming message, dispatches to the settings/AI services, and always answers
 * with a typed ExtResponse — including for scanner requests, which in this
 * build are explicitly "not shipped yet" rather than silently ignored.
 */
export function createMessageRouter(
  service: SettingsService,
  ai: AiService,
  scanner: PageScannerService,
) {
  return {
    async handle(message: ExtRequest): Promise<ExtResponse> {
      switch (message.type) {
        case 'PING':
          return { ok: true, requestId: message.requestId };
        case 'GET_SETTINGS':
          return { ok: true, requestId: message.requestId, settings: await service.getSnapshot() };
        case 'SAVE_SETTINGS':
          return {
            ok: true,
            requestId: message.requestId,
            settings: await service.saveSettings({
              endpointUrl: message.endpointUrl,
              modelId: message.modelId,
              aiConsent: message.aiConsent,
            }),
          };
        case 'SET_API_KEY':
          return {
            ok: true,
            requestId: message.requestId,
            settings: await service.setApiKey(message.key, message.preference),
          };
        case 'CLEAR_API_KEY':
          return {
            ok: true,
            requestId: message.requestId,
            settings: await service.clearApiKey(),
          };
        case 'SCAN_ACTIVE_TAB':
          return {
            ok: true,
            requestId: message.requestId,
            scan: await scanner.scanActiveTab(),
          };
        case 'ENRICH_FINDINGS':
          return {
            ok: true,
            requestId: message.requestId,
            enrichments: await ai.enrichFindings(message.findings),
          };
      }
    },
  };
}

export function toExtError(err: unknown): { code: ErrorCode; message: string } {
  if (err instanceof ExtServiceError) {
    return { code: err.code, message: err.message };
  }
  // Never include raw error details here — they could carry request internals.
  return { code: 'INTERNAL', message: 'Something went wrong. Please try again.' };
}

type OnMessageRegistrar = {
  addListener: (
    callback: (
      message: unknown,
      sender: unknown,
      sendResponse: (response: ExtResponse) => void,
    ) => boolean | void,
  ) => void;
};

/**
 * Install the chrome.runtime.onMessage listener. The registrar keeps the
 * message channel open for the async reply; every reply is a validated
 * ExtResponse.
 */
export function installMessageListener(
  onMessage: OnMessageRegistrar,
  router: { handle(message: ExtRequest): Promise<ExtResponse> },
): void {
  onMessage.addListener(
    (
      raw: unknown,
      _sender: unknown,
      sendResponse: (response: ExtResponse) => void,
    ) => {
      void (async () => {
        const parsed = validateExtRequest(raw);
        if (!parsed.ok) {
          sendResponse({
            ok: false,
            requestId: null,
            error: { code: 'BAD_MESSAGE', message: parsed.error },
          });
          return;
        }
        try {
          sendResponse(await router.handle(parsed.value));
        } catch (err: unknown) {
          sendResponse({
            ok: false,
            requestId: parsed.value.requestId,
            error: toExtError(err),
          });
        }
      })();
      return true; // keep the message channel open for the async reply
    },
  );
}
