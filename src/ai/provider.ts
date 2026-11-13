import type { ScanFinding } from '../shared/types/scan';
import type { EnrichedFinding } from '../shared/types/ai';

/** Provider-agnostic error carrying a coarse code (no request internals). */
export type AiErrorCode = 'NETWORK' | 'HTTP' | 'TIMEOUT' | 'INVALID_RESPONSE';

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly status: number | undefined;

  constructor(code: AiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
  }
}

export interface AiProviderConfig {
  /** Validated https (or localhost) base URL of the user's endpoint. */
  baseUrl: string;
  modelId: string;
  /** The user's key — used only in the Authorization header, never logged. */
  apiKey: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

/** Boundary behind which protocol details live (plan T20). */
export interface AiProvider {
  readonly name: string;
  enrich(findings: readonly ScanFinding[], config: AiProviderConfig): Promise<EnrichedFinding[]>;
}
