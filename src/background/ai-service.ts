import type { EnrichedFinding } from '../shared/types/ai';
import type { ScanFinding } from '../shared/types/scan';
import type { ErrorCode } from '../shared/types/messages';
import { LIMITS } from '../shared/validation/limits';
import { validateScanFinding } from '../shared/validation/scan';
import { originPatternFor } from '../ai/origin';
import type { AiError, AiProvider } from '../ai/provider';
import { ExtServiceError, type SettingsService } from './settings-service';
import type { SettingsStore } from '../storage/settings-store';

export interface HostPermissionChecker {
  contains(origins: string[]): Promise<boolean>;
}

function mapAiError(err: AiError): ErrorCode {
  switch (err.code) {
    case 'TIMEOUT':
      return 'AI_TIMEOUT';
    case 'INVALID_RESPONSE':
      return 'AI_RESPONSE_INVALID';
    default:
      return 'AI_REQUEST_FAILED';
  }
}

/**
 * Orchestrates the optional BYOK AI enrichment (plan T23–T25):
 * consent + configuration + key are all required, findings are runtime
 * validated and capped, the endpoint origin permission is double-checked,
 * and provider failures become typed errors — with the local scan results
 * always kept intact on the UI side.
 */
export class AiService {
  constructor(
    private readonly settings: SettingsService,
    private readonly store: SettingsStore,
    private readonly provider: AiProvider,
    private readonly permissions?: HostPermissionChecker,
  ) {}

  async enrichFindings(input: unknown): Promise<EnrichedFinding[]> {
    const snapshot = await this.settings.getSnapshot();
    if (snapshot.endpointUrl === null || snapshot.modelId === null) {
      throw new ExtServiceError(
        'AI_NOT_CONFIGURED',
        'Add an AI endpoint and model in Settings to use AI suggestions.',
      );
    }
    if (!snapshot.aiConsent) {
      throw new ExtServiceError(
        'CONSENT_REQUIRED',
        'Allow sending finding evidence to your AI endpoint in Settings first.',
      );
    }
    const key = await this.settings.resolveApiKey();
    if (key === null) {
      throw new ExtServiceError('AI_NOT_CONFIGURED', 'Add an API key in Settings first.');
    }

    const findings = this.validateFindings(input);

    const pattern = originPatternFor(snapshot.endpointUrl);
    if (pattern !== null && this.permissions !== undefined) {
      const granted = await this.permissions.contains([pattern]);
      if (!granted) {
        throw new ExtServiceError(
          'PERMISSION_DENIED',
          'Access to the endpoint origin was not granted. Allow it in the panel when prompted.',
        );
      }
    }

    try {
      return await this.provider.enrich(findings, {
        baseUrl: snapshot.endpointUrl,
        modelId: snapshot.modelId,
        apiKey: key.key,
        timeoutMs: LIMITS.aiTimeoutDefaultMs,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AiError') {
        throw new ExtServiceError(mapAiError(err as AiError), err.message);
      }
      throw new ExtServiceError('AI_REQUEST_FAILED', 'The AI request failed.');
    }
  }

  private validateFindings(input: unknown): ScanFinding[] {
    if (!Array.isArray(input)) {
      throw new ExtServiceError('BAD_MESSAGE', 'Findings must be an array.');
    }
    if (input.length > LIMITS.scanFindingsMax) {
      throw new ExtServiceError('BAD_MESSAGE', 'Too many findings in one request.');
    }
    const out: ScanFinding[] = [];
    for (const raw of input.slice(0, LIMITS.aiMaxFindingsPerRequest)) {
      const checked = validateScanFinding(raw);
      if (!checked.ok) {
        throw new ExtServiceError('BAD_MESSAGE', checked.error);
      }
      out.push(checked.value);
    }
    return out;
  }
}
