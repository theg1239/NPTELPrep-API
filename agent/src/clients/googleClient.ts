import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { agentLogger } from '../logging/logger.js';
import { config } from '../config/index.js';

type ModelRunner<T> = (model: LanguageModel) => Promise<T>;

const RATE_LIMIT_STATUS_CODES = new Set([429, 503]);

const isRateLimitError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeStatus = (error as { status?: number }).status;
  const maybeResponseStatus = (error as { response?: { status?: number } }).response?.status;
  const maybeCauseStatus = (error as { cause?: { status?: number } }).cause?.status;

  const statuses = [maybeStatus, maybeResponseStatus, maybeCauseStatus].filter(
    (value): value is number => typeof value === 'number'
  );

  if (statuses.some((code) => RATE_LIMIT_STATUS_CODES.has(code))) {
    return true;
  }

  const message = (error as { message?: string }).message ?? '';
  return /rate limit|quota|429/i.test(message);
};

export class MultiKeyGoogleClient {
  private currentKeyIndex = 0;

  constructor(
    private readonly apiKeys: string[],
    private readonly modelName: string
  ) {
    if (apiKeys.length === 0) {
      throw new Error('MultiKeyGoogleClient requires at least one API key.');
    }
  }

  async runWithModel<T>(runner: ModelRunner<T>, attempt = 0): Promise<T> {
    const totalKeys = this.apiKeys.length;

    if (attempt >= totalKeys) {
      throw new Error('All Gemini API keys are exhausted due to rate limits.');
    }

    const keyIndex = (this.currentKeyIndex + attempt) % totalKeys;
    const apiKey = this.apiKeys[keyIndex];
    const google = createGoogleGenerativeAI({ apiKey });
    const model = google(this.modelName);

    try {
      const result = await runner(model);
      this.currentKeyIndex = keyIndex;
      return result;
    } catch (error) {
      if (isRateLimitError(error)) {
        agentLogger.warn({
          event: 'model_rate_limited',
          keyIndex,
          model: this.modelName,
        });
        return this.runWithModel(runner, attempt + 1);
      }

      throw error;
    }
  }
}

export const agentGoogleClient = new MultiKeyGoogleClient(
  config.googleApiKeys,
  config.agentModel
);

export const reviewerGoogleClient = new MultiKeyGoogleClient(
  config.googleApiKeys,
  config.reviewerModel
);
