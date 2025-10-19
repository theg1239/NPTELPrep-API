"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

const changeOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("update_question_text"),
    courseCode: z.string(),
    assignmentId: z.number().int().positive(),
    questionId: z.number().int().positive(),
    newText: z.string().min(1),
  }),
  z.object({
    type: z.literal("update_correct_option"),
    courseCode: z.string(),
    assignmentId: z.number().int().positive(),
    questionId: z.number().int().positive(),
    newCorrectOption: z.string().min(1),
  }),
  z.object({
    type: z.literal("upsert_option"),
    courseCode: z.string(),
    assignmentId: z.number().int().positive(),
    questionId: z.number().int().positive(),
    optionNumber: z.string().min(1),
    optionText: z.string().min(1),
  }),
  z.object({
    type: z.literal("delete_option"),
    courseCode: z.string(),
    assignmentId: z.number().int().positive(),
    questionId: z.number().int().positive(),
    optionNumber: z.string().min(1),
  }),
]);

export type ChangeOperation = z.infer<typeof changeOperationSchema>;

type StagedChangePayload = {
  createdAt?: string;
  courseCode?: string;
  issueSummary?: string;
  recommendedFix?: string;
  sqlStatements?: unknown;
  operations?: unknown;
  supportingNotes?: unknown;
  reporter?: string;
};

export type StagedChange = {
  id: string;
  fileName: string;
  createdAt: string;
  courseCode: string;
  issueSummary: string;
  recommendedFix: string;
  operations: ChangeOperation[];
  legacySqlStatements: string[];
  supportingNotes: string[];
  reporter: string | null;
  filePath: string;
};

const resolveChangesDir = (): string => {
  const repoRoot = path.resolve(process.cwd(), "..");
  const configured = process.env.AGENT_CHANGES_DIR;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(repoRoot, configured);
  }
  return path.join(repoRoot, "agent", "changes");
};

const changesDir = resolveChangesDir();

const coerceStringArray = (value: unknown): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }
        if (entry === null || entry === undefined) {
          return "";
        }
        return String(entry).trim();
      })
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }

  return [String(value)];
};

const parseChange = (
  fileName: string,
  contents: string
): StagedChange | null => {
  try {
    const payload = JSON.parse(contents) as StagedChangePayload;
    if (!payload.courseCode || !payload.issueSummary || !payload.recommendedFix) {
      return null;
    }

    const createdAt =
      payload.createdAt && !Number.isNaN(Date.parse(payload.createdAt))
        ? new Date(payload.createdAt).toISOString()
        : new Date().toISOString();

    const id = `${createdAt}-${payload.courseCode}-${fileName}`;

    const operations: ChangeOperation[] = Array.isArray(payload.operations)
      ? payload.operations
          .map((operation) => {
            const parsed = changeOperationSchema.safeParse(operation);
            return parsed.success ? parsed.data : null;
          })
          .filter((operation): operation is ChangeOperation => operation !== null)
      : [];

    const legacySqlStatements = coerceStringArray(payload.sqlStatements);
    const supportingNotes = coerceStringArray(payload.supportingNotes);

    if (operations.length === 0 && legacySqlStatements.length > 0) {
      supportingNotes.push(
        "Legacy SQL detected without structured operations. Manual migration required."
      );
    }

    return {
      id,
      fileName,
      filePath: path.join(changesDir, fileName),
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

export async function getStagedChanges(): Promise<StagedChange[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(changesDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const changes = await Promise.all(
    entries
      .filter((name) => name.endsWith(".json"))
      .map(async (fileName) => {
        try {
          const contents = await fs.readFile(
            path.join(changesDir, fileName),
            "utf-8"
          );
          return parseChange(fileName, contents);
        } catch (error) {
          console.error(
            `Unable to read staged change file ${fileName}:`,
            error
          );
          return null;
        }
      })
  );

  return changes
    .filter((change): change is StagedChange => change !== null)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export async function getStagedChangeByFileName(
  fileName: string
): Promise<StagedChange | null> {
  try {
    const contents = await fs.readFile(path.join(changesDir, fileName), "utf-8");
    return parseChange(fileName, contents);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
