import pkg from 'pg';
import { agentLogger } from '../logging/logger.js';
import { config } from '../config/index.js';
import type { ChangeOperation } from './operations.js';

const { Pool } = pkg;

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
});

const apiBase = config.apiBaseUrl.replace(/\/$/, '');

const defaultHeaders = {
  Accept: 'application/json',
};

export type CourseSummary = {
  course_code: string;
  course_name: string;
  request_count?: number;
  video_count?: number;
  transcript_count?: number;
};

export type AssignmentQuestion = {
  id?: string;
  question_number: number;
  question_text: string;
  correct_option: string;
  options?: Array<{
    option_number: string;
    option_text: string;
  }>;
  [key: string]: unknown;
};

export type Assignment = {
  id?: string;
  week_number: number;
  assignment_title: string;
  questions?: AssignmentQuestion[];
  [key: string]: unknown;
};

export type CourseDetail = {
  course: CourseSummary & Record<string, unknown>;
  assignments: Assignment[];
  materials?: Array<Record<string, unknown>>;
} & Record<string, unknown>;

export type ReportedQuestion = {
  id: number;
  course_code: string;
  question_text: string;
  reason: string;
  reported_by: string;
  reported_at: string;
};

type ReportedQuestionRow = Omit<ReportedQuestion, 'reported_at'> & {
  reported_at: string | Date;
};

type RawAssignmentOption = {
  option_number?: unknown;
  optionNumber?: unknown;
  number?: unknown;
  id?: unknown;
  option_text?: unknown;
  optionText?: unknown;
  text?: unknown;
  [key: string]: unknown;
};

type RawAssignmentQuestion = {
  id?: unknown;
  question_id?: unknown;
  questionId?: unknown;
  question_number?: unknown;
  questionNumber?: unknown;
  number?: unknown;
  question_text?: unknown;
  questionText?: unknown;
  correct_option?: unknown;
  correctOption?: unknown;
  options?: unknown;
  [key: string]: unknown;
};

type RawAssignment = {
  id?: unknown;
  assignment_id?: unknown;
  assignmentId?: unknown;
  week_number?: unknown;
  weekNumber?: unknown;
  assignment_title?: unknown;
  assignmentTitle?: unknown;
  title?: unknown;
  questions?: unknown;
  [key: string]: unknown;
};

type FlattenedCourseDetail = {
  course_code?: unknown;
  courseCode?: unknown;
  course_name?: unknown;
  courseName?: unknown;
  assignments?: unknown;
  materials?: unknown;
  request_count?: unknown;
  requestCount?: unknown;
  video_count?: unknown;
  videoCount?: unknown;
  transcript_count?: unknown;
  transcriptCount?: unknown;
  [key: string]: unknown;
};

type RawCourseDetailWithNestedCourse = {
  course?: Record<string, unknown>;
  assignments?: unknown;
  materials?: unknown;
  [key: string]: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const toStringSafe = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

const toIdString = (value: unknown, fallback?: number): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (fallback !== undefined) {
    return fallback.toString();
  }

  return undefined;
};

const normalizeOptionNumber = (value: unknown, fallbackIndex: number): string => {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  const numeric = toNumber(value);
  if (numeric !== undefined) {
    return String(numeric);
  }
  return String(fallbackIndex);
};

const normalizeOptions = (
  rawOptions: unknown
): AssignmentQuestion['options'] => {
  if (!Array.isArray(rawOptions)) {
    return undefined;
  }

  const normalized = rawOptions
    .map((rawOption, index) => {
      if (!isRecord(rawOption)) {
        return null;
      }

      const optionNumber = normalizeOptionNumber(
        rawOption.option_number ??
          rawOption.optionNumber ??
          rawOption.number ??
          rawOption.id,
        index + 1
      );
      const optionText = toStringSafe(
        rawOption.option_text ?? rawOption.optionText ?? rawOption.text ?? ''
      );

      return {
        option_number: optionNumber,
        option_text: optionText,
      };
    })
    .filter(
      (
        option
      ): option is {
        option_number: string;
        option_text: string;
      } => option !== null
    );

  return normalized.length > 0 ? normalized : undefined;
};

const normalizeAssignmentQuestion = (
  rawQuestion: Record<string, unknown>,
  index: number
): AssignmentQuestion => {
  const questionNumber =
    toNumber(
      rawQuestion.question_number ??
        rawQuestion.questionNumber ??
        rawQuestion.number
    ) ?? index + 1;

  const questionId = toIdString(
    rawQuestion.id ?? rawQuestion.question_id ?? rawQuestion.questionId,
    questionNumber
  );

  const questionText = toStringSafe(
    rawQuestion.question_text ?? rawQuestion.questionText ?? ''
  );
  const correctOption = toStringSafe(
    rawQuestion.correct_option ?? rawQuestion.correctOption ?? ''
  );

  const options = normalizeOptions(rawQuestion.options);

  const normalized: AssignmentQuestion = {
    id: questionId,
    question_number: questionNumber,
    question_text: questionText,
    correct_option: correctOption,
    ...(options ? { options } : {}),
  };

  const knownKeys = new Set([
    'id',
    'question_id',
    'questionId',
    'question_number',
    'questionNumber',
    'number',
    'question_text',
    'questionText',
    'correct_option',
    'correctOption',
    'options',
  ]);

  for (const [key, value] of Object.entries(rawQuestion)) {
    if (knownKeys.has(key)) {
      continue;
    }
    normalized[key] = value;
  }

  return normalized;
};

const normalizeQuestions = (rawQuestions: unknown): AssignmentQuestion[] => {
  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  return rawQuestions
    .map((rawQuestion, index) => {
      if (!isRecord(rawQuestion)) {
        return null;
      }
      return normalizeAssignmentQuestion(rawQuestion, index);
    })
    .filter((question): question is AssignmentQuestion => question !== null);
};

const normalizeAssignment = (
  rawAssignment: Record<string, unknown>,
  index: number
): Assignment => {
  const assignmentId = toIdString(
    rawAssignment.assignment_id ??
      rawAssignment.assignmentId ??
      rawAssignment.id,
    index + 1
  );

  const weekNumber =
    toNumber(rawAssignment.week_number ?? rawAssignment.weekNumber) ?? 0;

  const title = toStringSafe(
    rawAssignment.assignment_title ??
      rawAssignment.assignmentTitle ??
      rawAssignment.title ??
      ''
  );

  const questions = normalizeQuestions(rawAssignment.questions);

  const normalized: Assignment = {
    id: assignmentId,
    week_number: weekNumber,
    assignment_title: title,
    ...(questions.length > 0 ? { questions } : {}),
  };

  const knownKeys = new Set([
    'id',
    'assignment_id',
    'assignmentId',
    'week_number',
    'weekNumber',
    'assignment_title',
    'assignmentTitle',
    'title',
    'questions',
  ]);

  for (const [key, value] of Object.entries(rawAssignment)) {
    if (knownKeys.has(key)) {
      continue;
    }
    normalized[key] = value;
  }

  return normalized;
};

const normalizeAssignments = (rawAssignments: unknown): Assignment[] => {
  if (!Array.isArray(rawAssignments)) {
    return [];
  }

  return rawAssignments
    .map((rawAssignment, index) => {
      if (!isRecord(rawAssignment)) {
        return null;
      }
      return normalizeAssignment(rawAssignment, index);
    })
    .filter((assignment): assignment is Assignment => assignment !== null);
};

type AssignmentQuestionRow = {
  assignment_id: string;
  assignment_title: string;
  week_number: number | null;
  question_id: string | null;
  question_number: number | null;
};

const hydrateAssignmentIds = async (
  courseCode: string,
  assignments: Assignment[]
): Promise<void> => {
  if (assignments.length === 0) {
    return;
  }

  const rows = await pool.query<AssignmentQuestionRow>(
    `SELECT
       a.id::text            AS assignment_id,
       a.assignment_title    AS assignment_title,
       a.week_number         AS week_number,
       q.id::text            AS question_id,
       q.question_number     AS question_number
     FROM assignments a
     INNER JOIN courses c ON a.course_id = c.id
     LEFT JOIN questions q ON q.assignment_id = a.id
     WHERE c.course_code = $1`,
    [courseCode]
  );

  const assignmentMap = new Map<string, { id: string; questions: Map<number, string> }>();

  for (const row of rows.rows) {
    const key = `${row.assignment_title ?? ''}::${row.week_number ?? 'null'}`;
    if (!assignmentMap.has(key)) {
      assignmentMap.set(key, {
        id: row.assignment_id,
        questions: new Map<number, string>(),
      });
    }
    if (row.question_id && row.question_number !== null) {
      assignmentMap.get(key)?.questions.set(row.question_number, row.question_id);
    }
  }

  for (const assignment of assignments) {
    const key = `${assignment.assignment_title ?? ''}::${assignment.week_number ?? 'null'}`;
    const match = assignmentMap.get(key);
    if (match) {
      assignment.id = match.id;
      if (assignment.questions) {
        for (const question of assignment.questions) {
          const questionId = match.questions.get(question.question_number);
          if (questionId) {
            question.id = questionId;
          }
        }
      }
    }
  }
};

const normalizeCourseSummary = (
  rawCourse: Record<string, unknown>
): CourseSummary & Record<string, unknown> => {
  const courseCodeRaw =
    rawCourse.course_code ??
    rawCourse.courseCode ??
    rawCourse.code ??
    rawCourse.id;
  const courseNameRaw =
    rawCourse.course_name ?? rawCourse.courseName ?? rawCourse.name;

  const courseCode = toStringSafe(courseCodeRaw);
  const courseName = toStringSafe(courseNameRaw);

  if (!courseCode || !courseName) {
    throw new Error('Course payload is missing course_code or course_name.');
  }

  const summary: CourseSummary & Record<string, unknown> = {
    course_code: courseCode,
    course_name: courseName,
  };

  const requestCount =
    toNumber(rawCourse.request_count ?? rawCourse.requestCount);
  if (requestCount !== undefined) {
    summary.request_count = requestCount;
  }

  const videoCount = toNumber(rawCourse.video_count ?? rawCourse.videoCount);
  if (videoCount !== undefined) {
    summary.video_count = videoCount;
  }

  const transcriptCount = toNumber(
    rawCourse.transcript_count ?? rawCourse.transcriptCount
  );
  if (transcriptCount !== undefined) {
    summary.transcript_count = transcriptCount;
  }

  const excludedKeys = new Set([
    'course_code',
    'courseCode',
    'code',
    'id',
    'course_name',
    'courseName',
    'name',
    'request_count',
    'requestCount',
    'video_count',
    'videoCount',
    'transcript_count',
    'transcriptCount',
    'assignments',
    'materials',
  ]);

  for (const [key, value] of Object.entries(rawCourse)) {
    if (excludedKeys.has(key)) {
      continue;
    }
    summary[key] = value;
  }

  return summary;
};

const extractMaterials = (
  value: unknown
): Array<Record<string, unknown>> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter(isRecord) as Array<Record<string, unknown>>;
};

const normalizeNestedCourseDetail = (
  payload: RawCourseDetailWithNestedCourse
): CourseDetail => {
  if (!payload.course || !isRecord(payload.course)) {
    throw new Error('Course payload is missing nested course data.');
  }

  const course = normalizeCourseSummary(payload.course);
  const assignments = normalizeAssignments(payload.assignments);
  const materials = extractMaterials(payload.materials);

  const remainder: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'course' || key === 'assignments' || key === 'materials') {
      continue;
    }
    remainder[key] = value;
  }

  const detail: CourseDetail = {
    ...remainder,
    course,
    assignments,
  };

  if (materials) {
    detail.materials = materials;
  }

  return detail;
};

const normalizeFlattenedCourseDetail = (
  payload: FlattenedCourseDetail
): CourseDetail => {
  const course = normalizeCourseSummary(payload as Record<string, unknown>);
  const assignments = normalizeAssignments(payload.assignments);
  const materials = extractMaterials(payload.materials);

  const detail: CourseDetail = {
    course,
    assignments,
  };

  if (materials) {
    detail.materials = materials;
  }

  return detail;
};

const unwrapDataPayload = (value: unknown): unknown => {
  if (isRecord(value) && 'data' in value) {
    return (value as { data: unknown }).data;
  }
  return value;
};

const normalizeCourseDetailPayload = (
  raw: unknown,
  courseCode: string
): CourseDetail => {
  const payload = unwrapDataPayload(raw);

  if (isRecord(payload) && 'course' in payload) {
    return normalizeNestedCourseDetail(
      payload as RawCourseDetailWithNestedCourse
    );
  }

  if (
    isRecord(payload) &&
    ('course_code' in payload || 'courseCode' in payload)
  ) {
    return normalizeFlattenedCourseDetail(payload as FlattenedCourseDetail);
  }

  throw new Error(`Unexpected payload for course ${courseCode}.`);
};

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${apiBase}${path}`;
  const response = await fetch(url, { headers: defaultHeaders });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request to ${url} failed with ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

export async function fetchCourses(): Promise<CourseSummary[]> {
  const data = await fetchJson<{ courses?: CourseSummary[]; data?: CourseSummary[] }>('/courses');

  if (Array.isArray(data.courses)) {
    return data.courses;
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  throw new Error('Unexpected /courses response payload.');
}

export async function fetchCourseDetail(courseCode: string): Promise<CourseDetail> {
  const encodedCourse = encodeURIComponent(courseCode);
  const data = await fetchJson<unknown>(`/courses/${encodedCourse}`);
  const detail = normalizeCourseDetailPayload(data, courseCode);
  await hydrateAssignmentIds(courseCode, detail.assignments);
  return detail;
}

export async function fetchReportedQuestions(): Promise<ReportedQuestion[]> {
  const query = `
    SELECT
      id,
      course_code,
      question_text,
      reason,
      reported_by,
      reported_at
    FROM reported_questions
    ORDER BY reported_at ASC
  `;

  const result = await pool.query<ReportedQuestionRow>(query);
  return result.rows.map<ReportedQuestion>((row) => ({
    ...row,
    reported_at: row.reported_at instanceof Date ? row.reported_at.toISOString() : row.reported_at,
  }));
}

export async function closeDataSources(): Promise<void> {
  agentLogger.info('Shutting down database connection pool.');
  await pool.end();
}

const parseIdForDb = (value: string | number): bigint => {
  if (typeof value === 'string') {
    if (!/^[0-9]+$/.test(value)) {
      throw new Error(`Invalid identifier value: ${value}`);
    }
    return BigInt(value);
  }
  return BigInt(Math.trunc(value));
};

const ensureAssignmentBelongsToCourse = async (
  client: pkg.PoolClient,
  assignmentId: string,
  courseCode: string
): Promise<{ courseId: number }> => {
  const result = await client.query(
    `SELECT a.id, a.course_id AS course_id
     FROM assignments a
     INNER JOIN courses c ON a.course_id = c.id
     WHERE a.id = $1 AND c.course_code = $2`,
    [parseIdForDb(assignmentId), courseCode]
  );

  if (result.rowCount === 0) {
    throw new Error(
      `Assignment ${assignmentId} is not linked to course ${courseCode}.`
    );
  }

  return { courseId: result.rows[0].course_id as number };
};

const ensureQuestionBelongsToCourse = async (
  client: pkg.PoolClient,
  {
    questionId,
    assignmentId,
    courseCode,
  }: { questionId: string; assignmentId: string; courseCode: string }
): Promise<void> => {
  const result = await client.query(
    `SELECT q.id
     FROM questions q
     INNER JOIN assignments a ON q.assignment_id = a.id
     INNER JOIN courses c ON a.course_id = c.id
     WHERE q.id = $1 AND a.id = $2 AND c.course_code = $3`,
    [parseIdForDb(questionId), parseIdForDb(assignmentId), courseCode]
  );

  if (result.rowCount === 0) {
    throw new Error(
      `Question ${questionId} (assignment ${assignmentId}) is not linked to course ${courseCode}.`
    );
  }
};

const normalizeOptionLabel = (value: string): string => value.trim().toUpperCase();

const normalizeIdInput = (value: string | number): string =>
  typeof value === 'string' ? value : Math.trunc(value).toString();

const applyOperation = async (
  client: pkg.PoolClient,
  operation: ChangeOperation
): Promise<Record<string, unknown> | undefined> => {
  const assignmentId = 'assignmentId' in operation ? normalizeIdInput(operation.assignmentId) : undefined;
  const questionId = 'questionId' in operation ? normalizeIdInput(operation.questionId) : undefined;
  const assignmentIdDb = assignmentId ? parseIdForDb(assignmentId) : undefined;
  const questionIdDb = questionId ? parseIdForDb(questionId) : undefined;

  if (questionId && assignmentId) {
    await ensureQuestionBelongsToCourse(client, {
      questionId,
      assignmentId,
      courseCode: operation.courseCode,
    });
  }

  switch (operation.type) {
    case 'update_question_text': {
      const result = await client.query(
        `UPDATE questions
         SET question_text = $1
         WHERE id = $2`,
        [operation.newText, questionIdDb]
      );

      if (result.rowCount === 0) {
        throw new Error(`Failed to update question text for question ${questionId}.`);
      }
      return undefined;
    }
    case 'update_correct_option': {
      const newCorrectOption = normalizeOptionLabel(operation.newCorrectOption);
      const result = await client.query(
        `UPDATE questions
         SET correct_option = $1
         WHERE id = $2`,
        [newCorrectOption, questionIdDb]
      );

      if (result.rowCount === 0) {
        throw new Error(`Failed to update correct option for question ${questionId}.`);
      }
      return undefined;
    }
    case 'upsert_option': {
      await client.query(
        `INSERT INTO options (question_id, option_number, option_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (question_id, option_number)
         DO UPDATE SET option_text = EXCLUDED.option_text`,
        [
          questionIdDb,
          normalizeOptionLabel(operation.optionNumber),
          operation.optionText.trim(),
        ]
      );
      return undefined;
    }
    case 'delete_option': {
      const result = await client.query(
        `DELETE FROM options
         WHERE question_id = $1 AND option_number = $2`,
        [questionIdDb, normalizeOptionLabel(operation.optionNumber)]
      );

      if (result.rowCount === 0) {
        throw new Error(
          `Failed to delete option ${operation.optionNumber} for question ${questionId}.`
        );
      }
      return undefined;
    }
    case 'create_question': {
      const assignmentInfo = await ensureAssignmentBelongsToCourse(
        client,
        assignmentId!,
        operation.courseCode
      );

      const normalizedOptions = operation.options.map(({ optionNumber, optionText }) => ({
        optionNumber: normalizeOptionLabel(optionNumber),
        optionText: optionText.trim(),
      }));

      const correctOptionUpper = normalizeOptionLabel(operation.correctOption);
      if (!normalizedOptions.some((opt) => opt.optionNumber === correctOptionUpper)) {
        throw new Error(
          `Correct option ${operation.correctOption} not present in options array.`
        );
      }

      let questionInsert;
      try {
        questionInsert = await client.query(
          `INSERT INTO questions (assignment_id, question_number, question_text, correct_option)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [
            assignmentIdDb,
            operation.questionNumber,
            operation.questionText,
            correctOptionUpper,
          ]
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new Error(
            `Question number ${operation.questionNumber} already exists in assignment ${operation.assignmentId}.`
          );
        }
        throw error;
      }

      const newQuestionId = questionInsert.rows[0].id as number;

      for (const opt of normalizedOptions) {
        await client.query(
          `INSERT INTO options (question_id, option_number, option_text)
           VALUES ($1, $2, $3)
           ON CONFLICT (question_id, option_number)
           DO UPDATE SET option_text = EXCLUDED.option_text`,
          [newQuestionId, opt.optionNumber, opt.optionText]
        );
      }

      return { newQuestionId, courseId: assignmentInfo.courseId };
    }
    case 'delete_question': {
      if (operation.ensureMinimumQuestions && operation.ensureMinimumQuestions > 0) {
        const countResult = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM questions
           WHERE assignment_id = $1`,
          [assignmentIdDb]
        );
        const currentCount = countResult.rows[0].count as number;
        if (currentCount <= operation.ensureMinimumQuestions) {
          throw new Error(
            `Cannot delete question ${questionId}; minimum question count would be violated.`
          );
        }
      }

      // Remove dependent options first to satisfy foreign key constraints.
      await client.query(`DELETE FROM options WHERE question_id = $1`, [questionIdDb]);

      await client.query(`DELETE FROM questions WHERE id = $1`, [questionIdDb]);
      return undefined;
    }
    case 'set_question_number': {
      const result = await client.query(
        `UPDATE questions
         SET question_number = $1
         WHERE id = $2`,
        [operation.newQuestionNumber, questionIdDb]
      );

      if (result.rowCount === 0) {
        throw new Error(
          `Failed to update question number for question ${questionId}.`
        );
      }
      return undefined;
    }
    case 'update_assignment_title': {
      await ensureAssignmentBelongsToCourse(
        client,
        assignmentId!,
        operation.courseCode
      );
      const result = await client.query(
        `UPDATE assignments
         SET assignment_title = $1
         WHERE id = $2`,
        [operation.newTitle, assignmentIdDb]
      );
      if (result.rowCount === 0) {
        throw new Error(
          `Failed to update title for assignment ${assignmentId}.`
        );
      }
      return undefined;
    }
    case 'update_assignment_week': {
      await ensureAssignmentBelongsToCourse(
        client,
        assignmentId!,
        operation.courseCode
      );
      const result = await client.query(
        `UPDATE assignments
         SET week_number = $1
         WHERE id = $2`,
        [operation.newWeekNumber, assignmentIdDb]
      );
      if (result.rowCount === 0) {
        throw new Error(
          `Failed to update week number for assignment ${assignmentId}.`
        );
      }
      return undefined;
    }
    default:
      // Exhaustive check
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustive: never = operation;
      throw new Error(`Unsupported operation type ${(operation as { type: string }).type}.`);
  }
};

export async function applyOperations(operations: ChangeOperation[]): Promise<{
  count: number;
  results: Array<{ operation: ChangeOperation; metadata?: Record<string, unknown> }>;
}> {
  if (operations.length === 0) {
    return { count: 0, results: [] };
  }

  const client = await pool.connect();
  const results: Array<{ operation: ChangeOperation; metadata?: Record<string, unknown> }> = [];
  try {
    await client.query('BEGIN');
    for (const operation of operations) {
      const metadata = await applyOperation(client, operation);
      results.push({ operation, metadata });
    }
    await client.query('COMMIT');
    return { count: operations.length, results };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
