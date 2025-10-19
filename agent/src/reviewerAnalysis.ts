import { fetchCourseDetail, type Assignment, type AssignmentQuestion, type CourseDetail } from './dataSources.js';
import type { ChangeOperation } from './operations.js';
import type { StagedChange } from './stagedChanges.js';

type OptionSnapshot = {
  optionNumber: string;
  optionText: string;
};

export type QuestionSnapshot = {
  questionId: string | null;
  questionNumber: number | null;
  questionText: string | null;
  correctOption: string | null;
  options: OptionSnapshot[];
};

export type QuestionDelta = {
  key: string;
  assignmentId: string | null;
  assignmentTitle: string | null;
  weekNumber: number | null;
  questionId: string | null;
  questionNumberBefore: number | null;
  questionNumberAfter: number | null;
  before: QuestionSnapshot | null;
  after: QuestionSnapshot | null;
  operations: ChangeOperation[];
  warnings: string[];
};

export type AssignmentDelta = {
  assignmentId: string | null;
  assignmentTitleBefore: string | null;
  assignmentTitleAfter: string | null;
  weekNumberBefore: number | null;
  weekNumberAfter: number | null;
  operations: ChangeOperation[];
  warnings: string[];
};

export type ReviewerAnalysis = {
  courseDetail: CourseDetail;
  questionDeltas: QuestionDelta[];
  assignmentDeltas: AssignmentDelta[];
  preflightIssues: string[];
};

const normalizeLabel = (label: string): string => label.trim().toUpperCase();

const cloneOptions = (options: AssignmentQuestion['options']): OptionSnapshot[] => {
  if (!options || options.length === 0) {
    return [];
  }

  return options.map((option) => ({
    optionNumber: option.option_number ?? '',
    optionText: option.option_text ?? '',
  }));
};

const cloneQuestionSnapshot = (question: AssignmentQuestion | undefined | null): QuestionSnapshot | null => {
  if (!question) {
    return null;
  }

  return {
    questionId: question.id ?? null,
    questionNumber:
      typeof question.question_number === 'number'
        ? question.question_number
        : Number(question.question_number ?? Number.NaN) || null,
    questionText: question.question_text ?? null,
    correctOption: question.correct_option ?? null,
    options: cloneOptions(question.options),
  };
};

const ensureOptionArray = (snapshot: QuestionSnapshot | null): QuestionSnapshot | null => {
  if (!snapshot) {
    return snapshot;
  }
  if (!snapshot.options) {
    snapshot.options = [];
  }
  return snapshot;
};

const normalizeAssignmentId = (assignment: Assignment | undefined | null): string | null => {
  if (!assignment) {
    return null;
  }
  if (typeof assignment.id === 'string') {
    return assignment.id;
  }
  if (typeof assignment.id === 'number') {
    return Math.trunc(assignment.id).toString();
  }
  return null;
};

const toKey = (value: string | number | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    if (value.trim().length === 0) {
      return null;
    }
    return value;
  }
  return Math.trunc(value).toString();
};

const maybeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

type AssignmentLookup = {
  byId: Map<string, Assignment>;
  list: Assignment[];
};

const buildAssignmentLookup = (course: CourseDetail): AssignmentLookup => {
  const byId = new Map<string, Assignment>();
  const list = course.assignments ?? [];

  for (const assignment of list) {
    const id = normalizeAssignmentId(assignment);
    if (id) {
      byId.set(id, assignment);
    }
  }

  return { byId, list };
};

type QuestionLookupValue = {
  assignment: Assignment;
  question: AssignmentQuestion;
};

type QuestionLookup = Map<string, QuestionLookupValue>;

const buildQuestionLookup = (assignments: Assignment[]): QuestionLookup => {
  const map: QuestionLookup = new Map();

  for (const assignment of assignments) {
    const assignmentId = normalizeAssignmentId(assignment);
    if (!assignment.questions) {
      continue;
    }

    for (const question of assignment.questions) {
      const questionId = toKey(question.id);
      if (questionId) {
        map.set(questionId, { assignment, question });
      }
      const questionNumber = maybeNumber(question.question_number);
      if (assignmentId && questionNumber !== null) {
        map.set(`${assignmentId}#${questionNumber}`, { assignment, question });
      }
    }
  }

  return map;
};

const getAssignmentForOperation = (
  operation: ChangeOperation,
  assignments: AssignmentLookup,
  preflightIssues: string[]
): Assignment | null => {
  const assignmentId =
    'assignmentId' in operation ? toKey(operation.assignmentId) : null;

  if (!assignmentId) {
    preflightIssues.push(
      `Operation ${operation.type} is missing assignmentId; cannot map to course data.`
    );
    return null;
  }

  const assignment = assignments.byId.get(assignmentId);
  if (!assignment) {
    preflightIssues.push(
      `Operation ${operation.type} references unknown assignment ${assignmentId}.`
    );
    return null;
  }

  return assignment;
};

const getQuestionForOperation = (
  operation: ChangeOperation,
  questionLookup: QuestionLookup,
  assignments: AssignmentLookup,
  preflightIssues: string[]
): QuestionLookupValue | null => {
  const assignment = getAssignmentForOperation(operation, assignments, preflightIssues);

  if (!assignment) {
    return null;
  }

  const assignmentId = normalizeAssignmentId(assignment);

  const questionId =
    'questionId' in operation ? toKey(operation.questionId) : null;
  if (questionId && questionLookup.has(questionId)) {
    return questionLookup.get(questionId) ?? null;
  }

  const questionNumber =
    'questionNumber' in operation ? maybeNumber(operation.questionNumber) : null;

  if (assignmentId && questionNumber !== null) {
    const fallbackKey = `${assignmentId}#${questionNumber}`;
    if (questionLookup.has(fallbackKey)) {
      return questionLookup.get(fallbackKey) ?? null;
    }
  }

  const operationLabel = questionId
    ? `questionId ${questionId}`
    : questionNumber !== null
      ? `questionNumber ${questionNumber}`
      : 'unknown question';

  preflightIssues.push(
    `Operation ${operation.type} could not be matched to existing question (${operationLabel}).`
  );
  return null;
};

const ensureQuestionDelta = (
  questionKey: string,
  question: AssignmentQuestion | null,
  assignment: Assignment | null,
  map: Map<string, QuestionDelta>
): QuestionDelta => {
  if (map.has(questionKey)) {
    return map.get(questionKey)!;
  }

  const beforeSnapshot = cloneQuestionSnapshot(question);
  const delta: QuestionDelta = {
    key: questionKey,
    assignmentId: normalizeAssignmentId(assignment),
    assignmentTitle: assignment?.assignment_title ?? null,
    weekNumber: maybeNumber(assignment?.week_number) ?? null,
    questionId: toKey(question?.id) ?? null,
    questionNumberBefore: maybeNumber(question?.question_number) ?? null,
    questionNumberAfter: maybeNumber(question?.question_number) ?? null,
    before: beforeSnapshot,
    after: beforeSnapshot ? JSON.parse(JSON.stringify(beforeSnapshot)) : null,
    operations: [],
    warnings: [],
  };

  map.set(questionKey, delta);
  return delta;
};

const ensureAssignmentDelta = (
  assignmentKey: string,
  assignment: Assignment | null,
  map: Map<string, AssignmentDelta>
): AssignmentDelta => {
  if (map.has(assignmentKey)) {
    return map.get(assignmentKey)!;
  }

  const id = normalizeAssignmentId(assignment);
  const weekNumber = maybeNumber(assignment?.week_number);
  const title = assignment?.assignment_title ?? null;

  const delta: AssignmentDelta = {
    assignmentId: id,
    assignmentTitleBefore: title,
    assignmentTitleAfter: title,
    weekNumberBefore: weekNumber,
    weekNumberAfter: weekNumber,
    operations: [],
    warnings: [],
  };

  map.set(assignmentKey, delta);
  return delta;
};

const sortOptions = (options: OptionSnapshot[]): OptionSnapshot[] =>
  [...options].sort((a, b) =>
    a.optionNumber.localeCompare(b.optionNumber, undefined, { numeric: true })
  );

export const computeReviewerAnalysis = async (
  change: StagedChange
): Promise<ReviewerAnalysis> => {
  const courseDetail = await fetchCourseDetail(change.courseCode);
  const assignments = buildAssignmentLookup(courseDetail);
  const questionLookup = buildQuestionLookup(assignments.list);

  const questionDeltaMap = new Map<string, QuestionDelta>();
  const assignmentDeltaMap = new Map<string, AssignmentDelta>();
  const preflightIssues: string[] = [];

  change.operations.forEach((operation, index) => {
    switch (operation.type) {
      case 'update_question_text':
      case 'update_correct_option':
      case 'upsert_option':
      case 'delete_option':
      case 'delete_question':
      case 'set_question_number': {
        const lookup = getQuestionForOperation(
          operation,
          questionLookup,
          assignments,
          preflightIssues
        );

        const assignment = lookup?.assignment ?? null;
        const question = lookup?.question ?? null;
        const questionId =
          'questionId' in operation
            ? toKey(operation.questionId) ??
              (assignment && question
                ? normalizeAssignmentId(assignment)
                : null)
            : null;

        const questionKey =
          questionId ??
          (assignment
            ? `${normalizeAssignmentId(assignment) ?? 'unknown'}::${
                question?.question_number ?? `op${index}`
              }`
            : `unmapped::${index}`);

        const delta = ensureQuestionDelta(
          questionKey,
          question,
          assignment,
          questionDeltaMap
        );
        delta.operations.push(operation);

        switch (operation.type) {
          case 'update_question_text': {
            if (!delta.after) {
              delta.after = {
                questionId: delta.questionId,
                questionNumber: delta.questionNumberAfter,
                questionText: operation.newText,
                correctOption: null,
                options: [],
              };
              delta.warnings.push(
                'Question text update targets unmapped question; after-state synthesized from operation.'
              );
            } else {
              delta.after.questionText = operation.newText;
            }
            break;
          }
          case 'update_correct_option': {
            if (!delta.after) {
              delta.after = {
                questionId: delta.questionId,
                questionNumber: delta.questionNumberAfter,
                questionText: null,
                correctOption: normalizeLabel(operation.newCorrectOption),
                options: [],
              };
              delta.warnings.push(
                'Correct option update targets unmapped question; after-state synthesized from operation.'
              );
            } else {
              delta.after.correctOption = normalizeLabel(
                operation.newCorrectOption
              );
            }
            break;
          }
          case 'upsert_option': {
            delta.after = ensureOptionArray(delta.after);
            if (!delta.after) {
              delta.after = {
                questionId: delta.questionId,
                questionNumber: delta.questionNumberAfter,
                questionText: null,
                correctOption: null,
                options: [],
              };
              delta.warnings.push(
                'Option upsert targets unmapped question; after-state synthesized from operation.'
              );
            }

            const normalizedNumber = normalizeLabel(operation.optionNumber);
            const updatedOptions = delta.after.options ?? [];
            const existing = updatedOptions.find(
              (opt) => normalizeLabel(opt.optionNumber) === normalizedNumber
            );
            if (existing) {
              existing.optionText = operation.optionText;
            } else {
              updatedOptions.push({
                optionNumber: normalizedNumber,
                optionText: operation.optionText,
              });
            }
            delta.after.options = sortOptions(updatedOptions);
            break;
          }
          case 'delete_option': {
            if (!delta.after) {
              delta.after = {
                questionId: delta.questionId,
                questionNumber: delta.questionNumberAfter,
                questionText: null,
                correctOption: null,
                options: [],
              };
            }
            const normalizedNumber = normalizeLabel(operation.optionNumber);
            delta.after.options = (delta.after.options ?? []).filter(
              (opt) => normalizeLabel(opt.optionNumber) !== normalizedNumber
            );
            break;
          }
          case 'delete_question': {
            delta.after = null;
            delta.questionNumberAfter = null;
            break;
          }
          case 'set_question_number': {
            delta.questionNumberAfter = operation.newQuestionNumber;
            if (delta.after) {
              delta.after.questionNumber = operation.newQuestionNumber;
            } else {
              delta.after = {
                questionId: delta.questionId,
                questionNumber: operation.newQuestionNumber,
                questionText: delta.before?.questionText ?? null,
                correctOption: delta.before?.correctOption ?? null,
                options: delta.before?.options
                  ? delta.before.options.map((opt) => ({
                      optionNumber: opt.optionNumber,
                      optionText: opt.optionText,
                    }))
                  : [],
              };
            }
            break;
          }
          default:
            break;
        }

        break;
      }
      case 'create_question': {
        const assignment = getAssignmentForOperation(
          operation,
          assignments,
          preflightIssues
        );
        const assignmentId = normalizeAssignmentId(assignment);

        const questionKey = `create:${assignmentId ?? 'unknown'}:${index}`;
        const delta = ensureQuestionDelta(
          questionKey,
          null,
          assignment,
          questionDeltaMap
        );
        delta.operations.push(operation);

        delta.before = null;
        delta.questionId = null;
        delta.questionNumberBefore = null;
        delta.questionNumberAfter = operation.questionNumber;
        delta.after = {
          questionId: null,
          questionNumber: operation.questionNumber,
          questionText: operation.questionText,
          correctOption: normalizeLabel(operation.correctOption),
          options: operation.options.map((opt) => ({
            optionNumber: normalizeLabel(opt.optionNumber),
            optionText: opt.optionText,
          })),
        };

        break;
      }
      case 'update_assignment_title':
      case 'update_assignment_week': {
        const assignment = getAssignmentForOperation(
          operation,
          assignments,
          preflightIssues
        );
        const assignmentId = normalizeAssignmentId(assignment) ?? `op-${index}`;
        const delta = ensureAssignmentDelta(
          assignmentId,
          assignment,
          assignmentDeltaMap
        );
        delta.operations.push(operation);

        if (operation.type === 'update_assignment_title') {
          delta.assignmentTitleAfter = operation.newTitle;
        } else if (operation.type === 'update_assignment_week') {
          delta.weekNumberAfter = operation.newWeekNumber;
        }
        break;
      }
      default: {
        const unexpectedType =
          (operation as { type?: string }).type ?? 'unknown';
        preflightIssues.push(
          `Encountered unsupported operation ${unexpectedType}.`
        );
      }
    }
  });

  // Sort question deltas by assignment/week/question number for consistent output
  const questionDeltas = [...questionDeltaMap.values()].sort((a, b) => {
    const weekA = a.weekNumber ?? Number.POSITIVE_INFINITY;
    const weekB = b.weekNumber ?? Number.POSITIVE_INFINITY;
    if (weekA !== weekB) {
      return weekA - weekB;
    }
    const titleCompare =
      (a.assignmentTitle ?? '').localeCompare(b.assignmentTitle ?? '');
    if (titleCompare !== 0) {
      return titleCompare;
    }
    const numA = a.questionNumberAfter ?? a.questionNumberBefore ?? Number.POSITIVE_INFINITY;
    const numB = b.questionNumberAfter ?? b.questionNumberBefore ?? Number.POSITIVE_INFINITY;
    return numA - numB;
  });

  const assignmentDeltas = [...assignmentDeltaMap.values()].sort((a, b) => {
    const weekA = a.weekNumberBefore ?? a.weekNumberAfter ?? Number.POSITIVE_INFINITY;
    const weekB = b.weekNumberBefore ?? b.weekNumberAfter ?? Number.POSITIVE_INFINITY;
    if (weekA !== weekB) {
      return weekA - weekB;
    }
    return (a.assignmentTitleBefore ?? '').localeCompare(
      b.assignmentTitleBefore ?? ''
    );
  });

  return {
    courseDetail,
    questionDeltas,
    assignmentDeltas,
    preflightIssues,
  };
};

const truncate = (value: string | null, max = 240): string => {
  if (!value) {
    return '';
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
};

export const formatAnalysisForPrompt = (analysis: ReviewerAnalysis): string => {
  const lines: string[] = [];

  if (analysis.assignmentDeltas.length > 0) {
    lines.push('Assignment adjustments:');
    analysis.assignmentDeltas.forEach((delta, index) => {
      lines.push(
        `${index + 1}. ${delta.assignmentTitleBefore ?? 'Untitled assignment'} (week ${
          delta.weekNumberBefore ?? 'n/a'
        }) → title: "${delta.assignmentTitleAfter ?? 'unchanged'}", week: ${delta.weekNumberAfter ?? 'unchanged'}`
      );
    });
    lines.push('');
  }

  if (analysis.questionDeltas.length > 0) {
    lines.push('Question snapshots:');
    analysis.questionDeltas.forEach((delta, index) => {
      const assignmentLabel = `${delta.assignmentTitle ?? 'Unknown assignment'} (week ${
        delta.weekNumber ?? 'n/a'
      })`;
      const beforeNumber =
        delta.questionNumberBefore ?? delta.before?.questionNumber ?? 'n/a';
      const afterNumber =
        delta.questionNumberAfter ?? delta.after?.questionNumber ?? 'n/a';
      lines.push(
        `${index + 1}. ${assignmentLabel}, question ${beforeNumber} → ${afterNumber}`
      );
      if (delta.before?.questionText) {
        lines.push(`   Before: ${truncate(delta.before.questionText)}`);
      }
      if (delta.after?.questionText && delta.after.questionText !== delta.before?.questionText) {
        lines.push(`   After: ${truncate(delta.after.questionText)}`);
      }
      if (
        delta.before?.correctOption &&
        delta.after?.correctOption &&
        delta.before.correctOption !== delta.after.correctOption
      ) {
        lines.push(
          `   Correct option: ${delta.before.correctOption} → ${delta.after.correctOption}`
        );
      }
      if (!delta.before?.correctOption && delta.after?.correctOption) {
        lines.push(`   Correct option set to ${delta.after.correctOption}`);
      }
      if (delta.after === null) {
        lines.push('   After: question deleted.');
      } else if (delta.before === null && delta.after) {
        lines.push('   After: question created with provided text/options.');
      }
    });
    lines.push('');
  }

  if (analysis.preflightIssues.length > 0) {
    lines.push('Preflight issues detected:');
    analysis.preflightIssues.slice(0, 5).forEach((issue, index) => {
      lines.push(` - ${issue}`);
    });
    if (analysis.preflightIssues.length > 5) {
      lines.push(
        `   (${analysis.preflightIssues.length - 5} additional issues truncated)`
      );
    }
  }

  if (lines.length === 0) {
    return 'No structural diffs computed for the staged operations.';
  }

  return lines.join('\n');
};

export type ReviewerPersistedAnalysis = {
  assignmentDeltas: AssignmentDelta[];
  questionDeltas: QuestionDelta[];
  preflightIssues: string[];
};

export const prepareAnalysisForPersistence = (
  analysis: ReviewerAnalysis
): ReviewerPersistedAnalysis => ({
  assignmentDeltas: analysis.assignmentDeltas,
  questionDeltas: analysis.questionDeltas,
  preflightIssues: analysis.preflightIssues,
});
