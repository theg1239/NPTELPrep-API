import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { agentLogger } from './logger.js';
import type { ChangeOperation } from './operations.js';

export type StageChangePayload = {
  courseCode: string;
  issueSummary: string;
  recommendedFix: string;
  operations: ChangeOperation[];
  supportingNotes?: string[];
  reporter?: string;
};

const sanitize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export async function ensureChangesDirectory(): Promise<string> {
  const absoluteDir = path.resolve(process.cwd(), config.changesDir);
  await fs.mkdir(absoluteDir, { recursive: true });
  return absoluteDir;
}

export async function stageChange(payload: StageChangePayload): Promise<string> {
  if (!payload.operations || payload.operations.length === 0) {
    throw new Error('stageChange requires at least one operation.');
  }

  const directory = await ensureChangesDirectory();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = sanitize(`${payload.courseCode}-${payload.issueSummary}`);
  const filename = `${timestamp}-${slug || 'change'}.json`;
  const filepath = path.join(directory, filename);

  const record = {
    createdAt: new Date().toISOString(),
    ...payload,
  };

  await fs.writeFile(filepath, JSON.stringify(record, null, 2), 'utf-8');

  agentLogger.info({
    event: 'change_staged',
    path: filepath,
    courseCode: payload.courseCode,
    operationCount: payload.operations.length,
  });
  return filepath;
}
