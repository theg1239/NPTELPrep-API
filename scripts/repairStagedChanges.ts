import { promises as fs } from 'node:fs';
import path from 'node:path';
import { changeOperationSchema, type ChangeOperation } from '../agent/src/operations.js';

const changesRoot = path.resolve(process.cwd(), 'agent', 'changes');

type RawChange = {
  createdAt?: string;
  courseCode?: string;
  issueSummary?: string;
  recommendedFix?: string;
  operations?: ChangeOperation[];
  supportingNotes?: string[];
  reporter?: string;
};

const normalizeId = (value: string | number): string =>
  typeof value === 'string' ? value : Math.trunc(value).toString();

const normalizeOperation = (operation: ChangeOperation): ChangeOperation => {
  switch (operation.type) {
    case 'update_question_text':
      return {
        ...operation,
        assignmentId: normalizeId(operation.assignmentId),
        questionId: normalizeId(operation.questionId),
      };
    case 'update_correct_option':
      return {
        ...operation,
        assignmentId: normalizeId(operation.assignmentId),
        questionId: normalizeId(operation.questionId),
        newCorrectOption: operation.newCorrectOption.toUpperCase(),
      };
    case 'upsert_option':
      return {
        ...operation,
        assignmentId: normalizeId(operation.assignmentId),
        questionId: normalizeId(operation.questionId),
        optionNumber: operation.optionNumber.toUpperCase(),
      };
    case 'delete_option':
      return {
        ...operation,
        assignmentId: normalizeId(operation.assignmentId),
        questionId: normalizeId(operation.questionId),
        optionNumber: operation.optionNumber.toUpperCase(),
      };
    case 'create_question':
      return {
        ...operation,
        assignmentId: normalizeId(operation.assignmentId),
        correctOption: operation.correctOption.toUpperCase(),
        options: operation.options.map((opt) => ({
          optionNumber: opt.optionNumber.toUpperCase(),
          optionText: opt.optionText,
        })),
      };
    case 'delete_question':
      return {
        ...operation,
        assignmentId: normalizeId(operation.assignmentId),
        questionId: normalizeId(operation.questionId),
      };
    case 'set_question_number':
      return {
        ...operation,
        assignmentId: normalizeId(operation.assignmentId),
        questionId: normalizeId(operation.questionId),
      };
    case 'update_assignment_title':
      return {
        ...operation,
        assignmentId: normalizeId(operation.assignmentId),
      };
    case 'update_assignment_week':
      return {
        ...operation,
        assignmentId: normalizeId(operation.assignmentId),
      };
    default:
      return operation;
  }
};

const matchStringField = (source: string, key: string): string | undefined => {
  const regex = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 'i');
  const match = source.match(regex);
  return match ? match[1] : undefined;
};

const matchArraySegment = (source: string, key: string): string | undefined => {
  const keyIndex = source.indexOf(`"${key}"`);
  if (keyIndex === -1) {
    return undefined;
  }
  const startBracket = source.indexOf('[', keyIndex);
  if (startBracket === -1) {
    return undefined;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startBracket; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startBracket, i + 1);
      }
    }
  }
  return undefined;
};

const parseSupportingNotes = (segment?: string): string[] => {
  if (!segment) {
    return [];
  }
  try {
    const parsed = JSON.parse(segment);
    return Array.isArray(parsed)
      ? parsed.map((note) => (typeof note === 'string' ? note : JSON.stringify(note)))
      : [];
  } catch {
    return [];
  }
};

const extractOperations = (segment: string): ChangeOperation[] => {
  const trimmed = segment.trim();
  if (!trimmed.startsWith('[')) {
    return [];
  }
  const content = trimmed.slice(1, trimmed.length - 1);
  const operations: ChangeOperation[] = [];
  let i = 0;
  let extra = '';

  const appendExtraToLast = () => {
    if (extra.trim().length > 0 && operations.length > 0) {
      const last = operations[operations.length - 1];
      if ('newText' in last && typeof last.newText === 'string') {
        (last as Extract<ChangeOperation, { newText: string }>).newText += extra;
      }
    }
    extra = '';
  };

  while (i < content.length) {
    const char = content[i];
    if (char === '{') {
      appendExtraToLast();
      let depth = 0;
      let inString = false;
      let escaped = false;
      const start = i;
      for (; i < content.length; i += 1) {
        const current = content[i];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (current === '\\') {
            escaped = true;
          } else if (current === '"') {
            inString = false;
          }
        } else if (current === '"') {
          inString = true;
        } else if (current === '{') {
          depth += 1;
        } else if (current === '}') {
          depth -= 1;
          if (depth === 0) {
            const slice = content.slice(start, i + 1);
            try {
              const parsed = JSON.parse(slice);
              const validated = changeOperationSchema.parse(parsed);
              operations.push(validated);
            } catch (error) {
              console.warn('Skipping malformed operation:', (error as Error).message, slice);
            }
            i += 1;
            break;
          }
        }
      }
      extra = '';
    } else if (char === ',') {
      appendExtraToLast();
      i += 1;
    } else {
      extra += char;
      i += 1;
    }
  }

  appendExtraToLast();
  return operations;
};

const repairMalformedChange = (raw: string): RawChange | null => {
  const createdAt = matchStringField(raw, 'createdAt');
  const courseCode = matchStringField(raw, 'courseCode');
  const issueSummary = matchStringField(raw, 'issueSummary');
  const recommendedFix = matchStringField(raw, 'recommendedFix');
  const reporter = matchStringField(raw, 'reporter') ?? 'gpt-agent';
  const operationsSegment = matchArraySegment(raw, 'operations');
  if (!operationsSegment) {
    return null;
  }

  const operations = extractOperations(operationsSegment).map(normalizeOperation);
  if (operations.length === 0) {
    return null;
  }

  const supportingNotes = parseSupportingNotes(matchArraySegment(raw, 'supportingNotes'));

  return {
    createdAt,
    courseCode,
    issueSummary,
    recommendedFix,
    operations,
    supportingNotes,
    reporter,
  };
};

const sanitizeParsedChange = (value: any): RawChange | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const operationsSource = Array.isArray(value.operations) ? value.operations : [];
  const operations: ChangeOperation[] = [];
  for (const entry of operationsSource) {
    try {
      const validated = changeOperationSchema.parse(entry);
      operations.push(normalizeOperation(validated));
    } catch (error) {
      console.warn('Skipping invalid operation:', (error as Error).message);
    }
  }
  if (operations.length === 0) {
    return null;
  }
  const supportingNotes = Array.isArray(value.supportingNotes)
    ? value.supportingNotes.map((note: unknown) =>
        typeof note === 'string' ? note : JSON.stringify(note)
      )
    : [];

  return {
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    courseCode: typeof value.courseCode === 'string' ? value.courseCode : undefined,
    issueSummary: typeof value.issueSummary === 'string' ? value.issueSummary : undefined,
    recommendedFix:
      typeof value.recommendedFix === 'string' ? value.recommendedFix : undefined,
    operations,
    supportingNotes,
    reporter: typeof value.reporter === 'string' ? value.reporter : 'gpt-agent',
  };
};

const writeSanitizedChange = async (filePath: string, change: RawChange): Promise<void> => {
  if (
    !change.courseCode ||
    !change.issueSummary ||
    !change.recommendedFix ||
    !change.operations ||
    change.operations.length === 0
  ) {
    console.warn(`Skipping ${filePath}; missing required fields.`);
    return;
  }

  const payload = {
    createdAt: change.createdAt ?? new Date().toISOString(),
    courseCode: change.courseCode,
    issueSummary: change.issueSummary,
    recommendedFix: change.recommendedFix,
    operations: change.operations,
    supportingNotes: change.supportingNotes ?? [],
    reporter: change.reporter ?? 'gpt-agent',
  };

  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
};

const collectJsonFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files;
};

const repairFile = async (filePath: string): Promise<void> => {
  const raw = await fs.readFile(filePath, 'utf-8');
  let parsed: RawChange | null = null;

  try {
    const jsonValue = JSON.parse(raw);
    parsed = sanitizeParsedChange(jsonValue);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    parsed = repairMalformedChange(raw);
  }

  if (!parsed) {
    console.warn(`Unable to repair ${filePath}`);
    return;
  }

  await writeSanitizedChange(filePath, parsed);
  console.log(`Repaired ${path.relative(changesRoot, filePath)}`);
};

const main = async (): Promise<void> => {
  const files = await collectJsonFiles(changesRoot);
  for (const file of files) {
    await repairFile(file);
  }
  console.log('Repair completed.');
};

main().catch((error) => {
  console.error('Repair failed:', error);
  process.exit(1);
});
