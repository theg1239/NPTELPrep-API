import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import type { ReviewerPersistedAnalysis } from '../reviewer/analysis.js';
import { changeOperationSchema, type ChangeOperation } from '../data/operations.js';

export type RawStagedChange = {
  createdAt?: string;
  courseCode?: string;
  issueSummary?: string;
  recommendedFix?: string;
  sqlStatements?: unknown;
  supportingNotes?: unknown;
  reporter?: string;
  operations?: unknown;
};

export type StagedChange = {
  fileName: string;
  filePath: string;
  createdAt: string;
  courseCode: string;
  issueSummary: string;
  recommendedFix: string;
  operations: ChangeOperation[];
  legacySqlStatements: string[];
  supportingNotes: string[];
  reporter: string | null;
};

export type ChangeDisposition = 'applied' | 'rejected' | 'failed';

const changesRoot = path.resolve(process.cwd(), config.changesDir);

const ensureDirectory = async (directory: string): Promise<void> => {
  await fs.mkdir(directory, { recursive: true });
};

const coerceStringArray = (value: unknown): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }
        if (entry === null || entry === undefined) {
          return '';
        }
        return String(entry).trim();
      })
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }

  return [String(value)];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseChangeFile = (fileName: string, contents: string): StagedChange | null => {
  try {
    const payload = JSON.parse(contents) as RawStagedChange;

    if (!payload.courseCode || !payload.issueSummary || !payload.recommendedFix) {
      return null;
    }

    const createdAt =
      payload.createdAt && !Number.isNaN(Date.parse(payload.createdAt))
        ? new Date(payload.createdAt).toISOString()
        : new Date().toISOString();

    const operations: ChangeOperation[] = Array.isArray(payload.operations)
      ? payload.operations
          .map((operation) => {
            const result = changeOperationSchema.safeParse(operation);
            return result.success ? result.data : null;
          })
          .filter((operation): operation is ChangeOperation => operation !== null)
      : [];

    const legacySqlStatements = coerceStringArray(payload.sqlStatements);
    const supportingNotes = coerceStringArray(payload.supportingNotes);

    if (operations.length === 0 && legacySqlStatements.length > 0) {
      supportingNotes.push(
        'Legacy entry: SQL statements present but no structured operations. Manual review required.'
      );
    }

    return {
      fileName,
      filePath: path.join(changesRoot, fileName),
      createdAt,
      courseCode: payload.courseCode,
      issueSummary: payload.issueSummary,
      recommendedFix: payload.recommendedFix,
      operations,
      legacySqlStatements,
      supportingNotes,
      reporter: payload.reporter ?? null,
    };
  } catch (error) {
    console.error(`Failed to parse staged change ${fileName}:`, error);
    return null;
  }
};

export const ensureChangeQueues = async (): Promise<void> => {
  await Promise.all(
    ['applied', 'rejected', 'failed'].map((name) =>
      ensureDirectory(path.join(changesRoot, name))
    )
  );
};

export const listPendingChanges = async (
  limit = config.reviewerMaxBatch
): Promise<StagedChange[]> => {
  await ensureDirectory(changesRoot);

  const entries = await fs.readdir(changesRoot, { withFileTypes: true });
  const pendingFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        entry.name !== '.DS_Store'
    )
    .map((entry) => entry.name);

  const changes = await Promise.all(
    pendingFiles.map(async (fileName) => {
      try {
        const contents = await fs.readFile(path.join(changesRoot, fileName), 'utf-8');
        return parseChangeFile(fileName, contents);
      } catch (error) {
        console.error(`Unable to read staged change file ${fileName}:`, error);
        return null;
      }
    })
  );

  return changes
    .filter((change): change is StagedChange => change !== null)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, limit);
};

export const archiveChange = async (
  change: StagedChange,
  disposition: ChangeDisposition
): Promise<void> => {
  const targetDir = path.join(changesRoot, disposition);
  await ensureDirectory(targetDir);
  const destination = path.join(targetDir, change.fileName);

  try {
    await fs.rename(change.filePath, destination);
  } catch (error) {
    const fallbackDestination = path.join(
      targetDir,
      `${Date.now()}-${change.fileName}`
    );
    await fs.rename(change.filePath, fallbackDestination);
  }
};

export type ReviewerAnnotation = {
  disposition: ChangeDisposition;
  summary: string;
  notes: string[];
  reviewedAt: string;
  failureReason?: string;
  toolExecutions: Array<{ toolName: string; toolCallId: string; output: unknown }>;
  analysis: ReviewerPersistedAnalysis;
};

export const annotateChangeWithReview = async (
  change: StagedChange,
  annotation: ReviewerAnnotation
): Promise<void> => {
  try {
    const contents = await fs.readFile(change.filePath, 'utf-8');
    const payload = JSON.parse(contents) as unknown;
    const data: Record<string, unknown> = isRecord(payload) ? { ...payload } : {};
    data.reviewer = {
      disposition: annotation.disposition,
      summary: annotation.summary,
      notes: annotation.notes,
      reviewedAt: annotation.reviewedAt,
      failureReason: annotation.failureReason ?? null,
      toolExecutions: annotation.toolExecutions,
      analysis: annotation.analysis,
    };
    await fs.writeFile(change.filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(
      `Failed to annotate staged change ${change.fileName} with reviewer outcome:`,
      error
    );
  }
};
