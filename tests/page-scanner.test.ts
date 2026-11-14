import { describe, expect, it, vi } from 'vitest';
import { PageScannerService, type ActiveTabInfo } from '../src/background/page-scanner';

function result(origin = 'https://example.test') {
  return {
    scanId: 'scan-1',
    startedAt: new Date().toISOString(),
    pageOrigin: origin,
    pageTitle: 'Fixture',
    summary: {
      counts: { critical: 1, serious: 0, moderate: 0, minor: 0, unknown: 0, needsReview: 0 },
      needsReviewCount: 0,
    },
    findings: [
      {
        id: 'image-alt:0',
        ruleId: 'image-alt',
        impact: 'critical',
        category: 'images',
        title: 'Images must have alternative text',
        summary: 'Missing alt text',
        wcagTags: ['wcag2a'],
        selector: 'img',
        snippet: '<img>',
        helpUrl: 'https://dequeuniversity.com/rules/axe/image-alt',
        needsReview: false,
      },
    ],
    incomplete: [],
    engineVersion: '4.14.0',
  };
}

function service(tab: ActiveTabInfo | null, output: unknown) {
  const getActiveTab = vi.fn().mockResolvedValue(tab);
  const executeScanner = vi.fn().mockResolvedValue(output);
  return { scanner: new PageScannerService({ getActiveTab, executeScanner }), getActiveTab, executeScanner };
}

describe('PageScannerService', () => {
  it('scans the active http(s) tab and validates the returned result', async () => {
    const { scanner, executeScanner } = service(
      { id: 5, url: 'https://example.test/path?secret=1' },
      result(),
    );
    const scan = await scanner.scanActiveTab();
    expect(scan.pageOrigin).toBe('https://example.test');
    expect(JSON.stringify(scan)).not.toContain('secret=1');
    expect(executeScanner).toHaveBeenCalledWith(5);
  });

  it('rejects restricted/internal and local-file pages before injection', async () => {
    for (const url of [
      'chrome://extensions',
      'chrome-extension://abc/page.html',
      'edge://settings',
      'file:///C:/private.html',
      'about:blank',
    ]) {
      const { scanner, executeScanner } = service({ id: 1, url }, result());
      await expect(scanner.scanActiveTab()).rejects.toMatchObject({ code: 'UNSUPPORTED_PAGE' });
      expect(executeScanner).not.toHaveBeenCalled();
    }
  });

  it('returns a helpful error when no active tab exists or injection is denied', async () => {
    const noTab = service(null, null);
    await expect(noTab.scanner.scanActiveTab()).rejects.toMatchObject({ code: 'UNSUPPORTED_PAGE' });

    const denied = new PageScannerService({
      getActiveTab: async () => ({ id: 3, url: 'https://example.test' }),
      executeScanner: async () => {
        throw new Error('browser internal details');
      },
    });
    await expect(denied.scanActiveTab()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(denied.scanActiveTab()).rejects.not.toThrow(/browser internal details/);
  });

  it('rejects malformed results and page-navigation races', async () => {
    const malformed = service({ id: 2, url: 'https://example.test' }, { findings: ['bad'] });
    await expect(malformed.scanner.scanActiveTab()).rejects.toMatchObject({ code: 'SCAN_FAILED' });

    const navigated = service({ id: 2, url: 'https://example.test/a' }, result('https://other.test'));
    await expect(navigated.scanner.scanActiveTab()).rejects.toMatchObject({ code: 'SCAN_FAILED' });
  });
});
