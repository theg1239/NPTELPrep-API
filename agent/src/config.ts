import { z } from 'zod';

const envSchema = z.object({
  NPTEL_API_URL: z
    .string()
    .url()
    .default('https://api.nptelprep.in'),
  GOOGLE_API_KEYS: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  AGENT_LOOP_SLEEP_MS: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().positive().optional()),
  REVIEWER_LOOP_SLEEP_MS: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().positive().optional()),
  REVIEWER_MAX_BATCH: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().int().positive().optional()),
  AGENT_MODEL: z.string().optional(),
  REVIEWER_MODEL: z.string().optional(),
  AGENT_CHANGES_DIR: z.string().optional(),
  REVIEWER_REPORTS_DIR: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

const env = parsed.data;

const googleApiKeysSource =
  env.GOOGLE_API_KEYS ?? env.GOOGLE_API_KEY ?? '';

const googleApiKeys = googleApiKeysSource
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean);

if (googleApiKeys.length === 0) {
  throw new Error(
    'Missing Gemini API keys. Please set GOOGLE_API_KEYS (comma-separated) or GOOGLE_API_KEY.'
  );
}

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set for the agent to query reported questions.');
}

export const config = {
  apiBaseUrl: env.NPTEL_API_URL,
  googleApiKeys,
  databaseUrl: env.DATABASE_URL,
  loopSleepMs: env.AGENT_LOOP_SLEEP_MS ?? 300_000,
  reviewerLoopSleepMs: env.REVIEWER_LOOP_SLEEP_MS ?? 300_000,
  reviewerMaxBatch: env.REVIEWER_MAX_BATCH ?? 5,
  agentModel: env.AGENT_MODEL ?? 'gemini-2.5-flash',
  reviewerModel: env.REVIEWER_MODEL ?? 'gemini-2.5-flash',
  changesDir: env.AGENT_CHANGES_DIR ?? 'agent/changes',
  reviewerReportsDir: env.REVIEWER_REPORTS_DIR ?? 'agent/reviewer-reports',
} as const;

export type Config = typeof config;
