import { describe, expect, it } from 'vitest';
import { validateScanFinding } from '../src/shared/validation/scan';

const VALID = {
  id: 'f1',
  ruleId: 'image-alt',
  impact: 'critical',
  category: 'images',
  title: 'Image missing alternative text',
  summary: 'An img element has no alt attribute.',
  wcagTags: ['wcag2a', '1.1.1'],
  selector: 'img:nth-of-type(2)',
  snippet: '<img src="hero.jpg">',
  helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
  needsReview: false,
};

describe('validateScanFinding', () => {
  it('accepts a well-formed finding', () => {
    expect(validateScanFinding(VALID)).toMatchObject({ ok: true });
  });

  it('rejects structural and bound violations', () => {
    expect(validateScanFinding(null).ok).toBe(false);
    expect(validateScanFinding({ ...VALID, impact: 'catastrophic' }).ok).toBe(false);
    expect(validateScanFinding({ ...VALID, category: 'vibes' }).ok).toBe(false);
    expect(validateScanFinding({ ...VALID, selector: 'x'.repeat(301) }).ok).toBe(false);
    expect(validateScanFinding({ ...VALID, summary: 's'.repeat(501) }).ok).toBe(false);
    expect(validateScanFinding({ ...VALID, helpUrl: 'http://insecure.test' }).ok).toBe(false);
    expect(validateScanFinding({ ...VALID, wcagTags: ['t'.repeat(64)] }).ok).toBe(false);
    expect(validateScanFinding({ ...VALID, snippet: undefined }).ok).toBe(false);
    expect(validateScanFinding({ ...VALID, needsReview: 'no' }).ok).toBe(false);
  });

  it('accepts null snippet/helpUrl and needsReview findings', () => {
    expect(
      validateScanFinding({ ...VALID, snippet: null, helpUrl: null, needsReview: true }),
    ).toMatchObject({ ok: true });
  });
});
