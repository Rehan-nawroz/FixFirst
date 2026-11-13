import { defineBackground } from 'wxt/utils/define-background';
import {
  createMessageRouter,
  installMessageListener,
} from '../src/background/message-handler';
import { SettingsService } from '../src/background/settings-service';
import { createChromeLocalStorage, createSettingsStore } from '../src/storage/settings-store';

/**
 * MV3 background service worker. Owns settings + key lifecycle and the
 * extension message boundary. Phase 2 will add scan orchestration here.
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
  const router = createMessageRouter(service);
  installMessageListener(chrome.runtime.onMessage, router);
});
