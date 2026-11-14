import type { ScanResult } from '../shared/types/scan';
import { validateScanResult } from '../shared/validation/scan';
import { ExtServiceError } from './settings-service';

export interface ActiveTabInfo {
  id: number;
  url: string;
}

export interface PageScanDependencies {
  getActiveTab(): Promise<ActiveTabInfo | null>;
  executeScanner(tabId: number): Promise<unknown>;
}

const RESTRICTED_SCHEMES = new Set(['chrome:', 'chrome-extension:', 'edge:', 'about:', 'devtools:', 'view-source:']);

/**
 * User-triggered page scanner orchestration. It only gets the active tab after
 * Analyze, rejects browser-owned pages, executes the bundled WXT unlisted
 * script in that tab, and validates the complete returned data before it can
 * cross into the side panel or AI pipeline.
 */
export class PageScannerService {
  constructor(private readonly deps: PageScanDependencies) {}

  async scanActiveTab(): Promise<ScanResult> {
    const tab = await this.deps.getActiveTab();
    if (tab === null) {
      throw new ExtServiceError('UNSUPPORTED_PAGE', 'No active browser tab is available to scan.');
    }
    let url: URL;
    try {
      url = new URL(tab.url);
    } catch {
      throw new ExtServiceError('UNSUPPORTED_PAGE', 'This browser page cannot be scanned.');
    }
    if (RESTRICTED_SCHEMES.has(url.protocol) || !['http:', 'https:'].includes(url.protocol)) {
      throw new ExtServiceError(
        'UNSUPPORTED_PAGE',
        'This page cannot be scanned. Browser settings, extension pages, and local files are not supported.',
      );
    }

    let raw: unknown;
    try {
      raw = await this.deps.executeScanner(tab.id);
    } catch {
      throw new ExtServiceError(
        'PERMISSION_DENIED',
        'Could not access this page. Reload it, then click Analyze again to grant temporary access.',
      );
    }
    const checked = validateScanResult(raw);
    if (!checked.ok) {
      throw new ExtServiceError('SCAN_FAILED', 'The scanner returned an invalid result. Reload the page and try again.');
    }
    // Ensure injected output is for the tab we requested (page may have navigated
    // during injection). Compare origin only; no URL path is retained.
    if (checked.value.pageOrigin !== url.origin) {
      throw new ExtServiceError('SCAN_FAILED', 'The page changed during the scan. Please scan again.');
    }
    return checked.value;
  }
}

/** Create the Chrome APIs used by PageScannerService. */
export function createChromePageScanDependencies(): PageScanDependencies {
  return {
    async getActiveTab() {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id === undefined || typeof tab.url !== 'string') return null;
      return { id: tab.id, url: tab.url };
    },
    async executeScanner(tabId) {
      // Inject the bundled WXT unlisted-script into the tab's isolated world.
      // File injections do not return their top-level value, so WXT's configured
      // globalName exposes the scan promise to a second, tiny function injection.
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['scanner.js'],
        world: 'ISOLATED',
      });
      const injections = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'ISOLATED',
        func: async () => {
          const scan = (globalThis as typeof globalThis & {
            fixfirstAxeScan?: Promise<unknown>;
          }).fixfirstAxeScan;
          if (!scan) throw new Error('scanner-result-missing');
          return await scan;
        },
      });
      if (injections.length !== 1) return null;
      return injections[0]?.result;
    },
  };
}
