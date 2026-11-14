import { describe, expect, it } from 'vitest';
import { validateApiKey, validateEndpointUrl, validateModelId } from '../src/shared/validation/settings';
import { validateAiEnrichment, validateEnrichedFinding } from '../src/shared/validation/ai';
import { validateExtRequest } from '../src/shared/validation/messages';

describe('validateEndpointUrl', () => {
  it('accepts https URLs and strips query/hash', () => {
    const res = validateEndpointUrl('https://api.example.com/v1?foo=bar#frag');
    expect(res).toEqual({ ok: true, value: 'https://api.example.com/v1' });
  });

  it('normalizes empty input to null (no endpoint)', () => {
    expect(validateEndpointUrl('   ')).toEqual({ ok: true, value: null });
    expect(validateEndpointUrl(null)).toEqual({ ok: true, value: null });
  });

  it('rejects plain http except localhost', () => {
    expect(validateEndpointUrl('http://api.example.com/v1').ok).toBe(false);
    expect(validateEndpointUrl('http://localhost:11434/v1').ok).toBe(true);
    expect(validateEndpointUrl('http://127.0.0.1:8080/api').ok).toBe(true);
  });

  it('rejects non-http schemes and credential URLs', () => {
    expect(validateEndpointUrl('ftp://example.com').ok).toBe(false);
    expect(validateEndpointUrl('chrome-extension://abc').ok).toBe(false);
    expect(validateEndpointUrl('https://user:pass@example.com').ok).toBe(false);
    expect(validateEndpointUrl('not a url').ok).toBe(false);
  });
});

describe('validateModelId', () => {
  it('accepts common provider formats and normalizes empty to null', () => {
    for (const id of ['gpt-4o-mini', 'openai/gpt-oss-20b', 'claude-3-5-sonnet@20240620']) {
      expect(validateModelId(id).ok).toBe(true);
    }
    expect(validateModelId('')).toEqual({ ok: true, value: null });
  });

  it('rejects whitespace, control chars, and overlong ids', () => {
    expect(validateModelId('gpt 4').ok).toBe(false);
    expect(validateModelId('gpt\u00004').ok).toBe(false);
    expect(validateModelId('x'.repeat(201)).ok).toBe(false);
    expect(validateModelId('gpt; rm -rf').ok).toBe(false);
  });
});

describe('validateApiKey', () => {
  it('accepts bounded keys and rejects whitespace/control/overlong', () => {
    expect(validateApiKey('sk-abc123').ok).toBe(true);
    expect(validateApiKey('sk abc').ok).toBe(false);
    expect(validateApiKey('key\u0000').ok).toBe(false);
    expect(validateApiKey('k'.repeat(4097)).ok).toBe(false);
    expect(validateApiKey('').ok).toBe(false);
  });
});

describe('validateExtRequest', () => {
  it('accepts valid typed messages', () => {
    expect(validateExtRequest({ type: 'PING', requestId: 'r1' }).ok).toBe(true);
    expect(
      validateExtRequest({
        type: 'SAVE_SETTINGS',
        requestId: 'r1',
        endpointUrl: null,
        modelId: null,
        aiConsent: false,
      }).ok,
    ).toBe(true);
  });

  it('rejects unknown shapes and overlong fields', () => {
    expect(validateExtRequest(null).ok).toBe(false);
    expect(validateExtRequest({ type: 'NOPE', requestId: 'r' }).ok).toBe(false);
    expect(validateExtRequest({ type: 'PING' }).ok).toBe(false);
    expect(validateExtRequest({ type: 'ENRICH_FINDINGS', requestId: 'r', findings: [] }).ok).toBe(true);
    expect(
      validateExtRequest({ type: 'SET_API_KEY', requestId: 'r', key: 'k', preference: 'disk' }).ok,
    ).toBe(false);
  });
});

describe('AI enrichment validation', () => {
  const finding = {
    findingId: 'f1',
    explanation: 'x'.repeat(10),
    whyItMatters: 'y',
    suggestedFix: 'z',
  };

  it('accepts a valid enrichment and rejects unknown/duplicate IDs', () => {
    expect(validateAiEnrichment([finding], ['f1']).ok).toBe(true);
    expect(validateAiEnrichment([finding], ['f2']).ok).toBe(false);
    expect(validateAiEnrichment([finding, finding], ['f1']).ok).toBe(false);
  });

  it('enforces structure and size limits', () => {
    expect(validateEnrichedFinding({ findingId: 'f1' }).ok).toBe(false);
    expect(validateEnrichedFinding({ ...finding, explanation: 'x'.repeat(2001) }).ok).toBe(false);
    expect(validateEnrichedFinding({ ...finding, codeSnippet: 'c' }).ok).toBe(true);
  });
});
