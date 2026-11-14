import { defineBackground } from 'wxt/utils/define-background';
import {
  createMessageRouter,
  installMessageListener,
} from '../src/background/message-handler';
import { SettingsService } from '../src/background/settings-service';
import { AiService } from '../src/background/ai-service';
import { CompatibleChatProvider } from '../src/ai/compatible-provider';
import { PageScannerService, createChromePageScanDependencies } from '../src/background/page-scanner';
import { createChromeLocalStorage, createSettingsStore } from '../src/storage/settings-store';

/**
 * MV3 background service worker. Owns settings + key lifecycle, the extension
 * message boundary, and the BYOK AI enrichment pipeline. Phase 2 will add
 * scan orchestration here.
 */
export default defineBackground(() => {
  // Open the side panel when the toolbar icon is clicked (user gesture).
  try {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    // Behavior is a nicety; the panel stays openable from the action menu.
  }

  const store = createSettingsStore(createChromeLocalStorage());
  const service = new SettingsService(store);
  const ai = new AiService(service, store, new CompatibleChatProvider(), {
    contains: (origins) => chrome.permissions.contains({ origins }),
  });
  const scanner = new PageScannerService(createChromePageScanDependencies());
  const router = createMessageRouter(service, ai, scanner);
  installMessageListener(chrome.runtime.onMessage, router);
});
