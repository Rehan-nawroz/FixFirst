import type { ScanFinding } from '../shared/types/scan';
import type { EnrichedFinding } from '../shared/types/ai';
import { validateAiEnrichment } from '../shared/validation/ai';
import { boundedEnrichment } from '../shared/util';
import { LIMITS } from '../shared/validation/limits';
import { buildEnrichmentPrompt } from './prompt';
import { extractJsonArray } from './extract';
import { AiError, type AiProvider, type AiProviderConfig } from './provider';

/** Compose the full completions URL from the user's base URL. */
export function buildCompletionsUrl(baseUrl: string): string {
  const cleaned = baseUrl.replace(/\/+$/, '');
  return /\/chat\/completions$/.test(cleaned) ? cleaned : `${cleaned}/chat/completions`;
}

function readContent(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    throw new AiError('INVALID_RESPONSE', 'AI endpoint returned an unexpected response.');
  }
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AiError('INVALID_RESPONSE', 'AI endpoint response has no choices.');
  }
  const first: unknown = choices[0];
  if (typeof first !== 'object' || first === null) {
    throw new AiError('INVALID_RESPONSE', 'AI endpoint response choice is invalid.');
  }
  const message = (first as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) {
    throw new AiError('INVALID_RESPONSE', 'AI endpoint response message is invalid.');
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new AiError('INVALID_RESPONSE', 'AI endpoint response has no content.');
  }
  return content;
}

/**
 * Adapter for user-configured endpoints that speak the OpenAI-compatible
 * chat-completions shape (plan T20). Protocol knowledge is isolated here;
 * no default host, key, or model exists anywhere.
 */
export class CompatibleChatProvider implements AiProvider {
  readonly name = 'openai-compatible-chat';

  constructor(
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async enrich(findings: readonly ScanFinding[], config: AiProviderConfig): Promise<EnrichedFinding[]> {
    const prompt = buildEnrichmentPrompt(findings);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const onOuterAbort = (): void => controller.abort();
    config.signal?.addEventListener('abort', onOuterAbort, { once: true });

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(buildCompletionsUrl(config.baseUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.modelId,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            temperature: 0.2,
          }),
          signal: controller.signal,
        });
      } catch {
        if (config.signal?.aborted) {
          throw new AiError('NETWORK', 'AI request was cancelled.');
        }
        if (controller.signal.aborted) {
          throw new AiError('TIMEOUT', 'The AI endpoint took too long to respond.');
        }
        throw new AiError('NETWORK', 'Could not reach the AI endpoint.');
      }

      if (!response.ok) {
        // Message carries only the status code — never the response body,
        // headers, or the key.
        throw new AiError('HTTP', `The AI endpoint rejected the request (HTTP ${response.status}).`, response.status);
      }

      const text = await response.text();
      if (text.length > LIMITS.aiResponseMaxChars) {
        throw new AiError('INVALID_RESPONSE', 'AI endpoint response is too large.');
      }

      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new AiError('INVALID_RESPONSE', 'AI endpoint response is not valid JSON.');
      }
      const content = readContent(body);
      const parsed = extractJsonArray(content);
      const checked = validateAiEnrichment(parsed, findings.map((f) => f.id));
      if (!checked.ok) {
        throw new AiError('INVALID_RESPONSE', checked.error);
      }
      return checked.value.map(boundedEnrichment);
    } finally {
      clearTimeout(timer);
      config.signal?.removeEventListener('abort', onOuterAbort);
    }
  }
}
