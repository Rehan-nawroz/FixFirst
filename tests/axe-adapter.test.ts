import { afterEach, describe, expect, it } from 'vitest';
import { categoryForRule, runAxeScan, safeElementExcerpt, WCAG_TAGS } from '../src/scanner/axe-adapter';

afterEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
});

describe('axe scanner adapter (T11)', () => {
  it('uses the expected WCAG rule tags', () => {
    expect(WCAG_TAGS).toContain('wcag22aa');
    expect(WCAG_TAGS).toContain('wcag2a');
  });

  it('maps common axe rule IDs to report categories', () => {
    expect(categoryForRule('image-alt')).toBe('images');
    expect(categoryForRule('button-name')).toBe('controls');
    expect(categoryForRule('color-contrast')).toBe('contrast');
    expect(categoryForRule('html-has-lang')).toBe('document');
    expect(categoryForRule('landmark-one-main')).toBe('structure');
    expect(categoryForRule('made-up-rule')).toBe('other');
  });

  it('creates inert, minimal snippets and drops sensitive attributes/text', () => {
    const snippet = safeElementExcerpt(
      '<button class="secret" onclick="alert(1)" value="password" data-user="123" role="button" type="submit">private text</button>',
    );
    expect(snippet).toBe('<button role="button" type="submit">');
    expect(snippet).not.toContain('secret');
    expect(snippet).not.toContain('password');
    expect(snippet).not.toContain('private text');
    expect(snippet).not.toContain('onclick');
  });

  it('runs axe locally and returns bounded, origin-only results', async () => {
    document.title = 'Scanner fixture';
    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <h1>Audit fixture</h1>
      <img src="/banner.png">
      <button aria-label="">x</button>
      <input type="text">
    `;

    const result = await runAxeScan(document);
    expect(result.pageOrigin).toBe('http://localhost:3000');
    expect(result.pageTitle).toBe('Scanner fixture');
    expect(result.engineVersion).toMatch(/^4\./);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.length).toBeLessThanOrEqual(500);
    expect(result.findings.some((f) => f.ruleId === 'image-alt')).toBe(true);
    expect(result.findings.every((f) => f.selector.length <= 300)).toBe(true);
    expect(result.findings.every((f) => !f.snippet?.includes('src='))).toBe(true);
    expect(result.summary.counts.critical + result.summary.counts.serious).toBeGreaterThan(0);
  });
});
