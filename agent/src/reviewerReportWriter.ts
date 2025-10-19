import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { agentLogger } from './logger.js';
import type { ChangeDisposition, StagedChange } from './stagedChanges.js';
import type { ReviewerPersistedAnalysis, QuestionSnapshot } from './reviewerAnalysis.js';

type ToolExecutionRecord = {
  toolName: string;
  toolCallId: string;
  output: unknown;
};

export type ReviewerOutcome = {
  disposition: ChangeDisposition | 'failed';
  summary: string;
  notes: string[];
  failureReason?: string | null;
};

export type ReviewerReportPayload = {
  change: StagedChange;
  analysis: ReviewerPersistedAnalysis;
  outcome: ReviewerOutcome;
  toolExecutions: ToolExecutionRecord[];
};

const sanitize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const formatOptions = (snapshot: QuestionSnapshot | null): string => {
  if (!snapshot || !snapshot.options || snapshot.options.length === 0) {
    return '  (no options recorded)\n';
  }

  return snapshot.options
    .map(
      (option) =>
        `  - ${option.optionNumber ?? ''}. ${option.optionText ?? '(blank option text)'}`
    )
    .join('\n');
};

const formatQuestionSnapshot = (
  label: string,
  snapshot: QuestionSnapshot | null
): string => {
  if (!snapshot) {
    return `${label}: (not present)\n`;
  }

  const parts: string[] = [];
  parts.push(`${label}:`);
  parts.push(`  Text: ${snapshot.questionText ?? '(missing question text)'}`);
  if (snapshot.correctOption) {
    parts.push(`  Correct: ${snapshot.correctOption}`);
  }
  parts.push(formatOptions(snapshot));
  return parts.join('\n');
};

const formatQuestionDelta = (
  index: number,
  delta: ReviewerPersistedAnalysis['questionDeltas'][number]
): string => {
  const heading = `### ${index + 1}. ${delta.assignmentTitle ?? 'Unknown assignment'} (week ${
    delta.weekNumber ?? 'n/a'
  })`;
  const meta: string[] = [];
  if (delta.questionId) {
    meta.push(`Question ID: ${delta.questionId}`);
  }
  if (delta.questionNumberBefore !== null || delta.questionNumberAfter !== null) {
    meta.push(
      `Question number: ${delta.questionNumberBefore ?? 'n/a'} → ${delta.questionNumberAfter ?? 'n/a'}`
    );
  }

  const body: string[] = [];
  body.push(formatQuestionSnapshot('Before', delta.before));
  if (delta.after === null) {
    body.push('After: question deleted.');
  } else {
    body.push(formatQuestionSnapshot('After', delta.after));
  }

  if (delta.operations.length > 0) {
    body.push('Operations:');
    delta.operations.forEach((operation, opIndex) => {
      body.push(`  ${opIndex + 1}. ${operation.type}`);
      const detailEntries = Object.entries(operation)
        .filter(([key]) => key !== 'type')
        .map(([key, value]) => `     ${key}: ${JSON.stringify(value)}`);
      detailEntries.forEach((entry) => body.push(entry));
    });
  }

  if (delta.warnings.length > 0) {
    body.push('Warnings:');
    delta.warnings.forEach((warning) => body.push(`  - ${warning}`));
  }

  return [heading, ...(meta.length > 0 ? meta : []), ...body].join('\n');
};

const formatAssignmentDelta = (
  index: number,
  delta: ReviewerPersistedAnalysis['assignmentDeltas'][number]
): string => {
  const heading = `### ${index + 1}. Assignment ${delta.assignmentId ?? '(unknown id)'}`;
  const lines: string[] = [heading];
  lines.push(
    `Title: ${delta.assignmentTitleBefore ?? 'n/a'} → ${delta.assignmentTitleAfter ?? 'n/a'}`
  );
  lines.push(
    `Week: ${delta.weekNumberBefore ?? 'n/a'} → ${delta.weekNumberAfter ?? 'n/a'}`
  );
  if (delta.operations.length > 0) {
    lines.push('Operations:');
    delta.operations.forEach((operation, opIndex) => {
      lines.push(`  ${opIndex + 1}. ${operation.type}`);
      const details = Object.entries(operation)
        .filter(([key]) => key !== 'type')
        .map(([key, value]) => `     ${key}: ${JSON.stringify(value)}`);
      details.forEach((entry) => lines.push(entry));
    });
  }
  if (delta.warnings.length > 0) {
    lines.push('Warnings:');
    delta.warnings.forEach((warning) => lines.push(`  - ${warning}`));
  }
  return lines.join('\n');
};

const summarizeToolExecution = (tool: ToolExecutionRecord): string => {
  const lines: string[] = [];
  lines.push(`- ${tool.toolName} (call ${tool.toolCallId})`);
  if (tool.output === undefined) {
    lines.push('  Output: undefined');
    return lines.join('\n');
  }

  try {
    const serialized =
      typeof tool.output === 'string'
        ? tool.output
        : JSON.stringify(tool.output, null, 2);
    const trimmed =
      serialized.length > 1200
        ? `${serialized.slice(0, 1200)}…`
        : serialized;
    const indented = trimmed
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    lines.push('  Output:');
    lines.push(indented);
  } catch {
    lines.push(`  Output: ${String(tool.output)}`);
  }
  return lines.join('\n');
};

export const writeReviewerReport = async (
  payload: ReviewerReportPayload
): Promise<string> => {
  const reportsDir = path.resolve(process.cwd(), config.reviewerReportsDir);
  await fs.mkdir(reportsDir, { recursive: true });

  const reviewedAt = new Date().toISOString();
  const baseName = payload.change.fileName.replace(/\.json$/i, '');
  const slug = sanitize(`${payload.outcome.disposition}-${baseName}`);
  const fileName = `${reviewedAt.replace(/[:.]/g, '-')}-${slug || 'review'}.md`;
  const filePath = path.join(reportsDir, fileName);

  const headerLines = [
    `# Reviewer Report`,
    ``,
    `- Change file: ${payload.change.fileName}`,
    `- Course: ${payload.change.courseCode}`,
    `- Created at: ${payload.change.createdAt}`,
    `- Reviewed at: ${reviewedAt}`,
    `- Disposition: ${payload.outcome.disposition}`,
    `- Summary: ${payload.outcome.summary || 'n/a'}`,
  ];

  if (payload.outcome.failureReason) {
    headerLines.push(`- Failure reason: ${payload.outcome.failureReason}`);
  }

  const sections: string[] = [];
  sections.push(headerLines.join('\n'));

  sections.push(`## Issue Summary\n\n${payload.change.issueSummary}`);
  sections.push(`## Recommended Fix\n\n${payload.change.recommendedFix}`);

  if (payload.change.supportingNotes.length > 0) {
    sections.push(
      `## Supporting Notes\n\n${payload.change.supportingNotes
        .map((note) => `- ${note}`)
        .join('\n')}`
    );
  }

  if (payload.analysis.preflightIssues.length > 0) {
    sections.push(
      `## Preflight Issues\n\n${payload.analysis.preflightIssues
        .map((issue) => `- ${issue}`)
        .join('\n')}`
    );
  }

  if (payload.analysis.assignmentDeltas.length > 0) {
    sections.push(
      `## Assignment Changes\n\n${payload.analysis.assignmentDeltas
        .map((delta, index) => formatAssignmentDelta(index, delta))
        .join('\n\n')}`
    );
  }

  if (payload.analysis.questionDeltas.length > 0) {
    sections.push(
      `## Question Changes\n\n${payload.analysis.questionDeltas
        .map((delta, index) => formatQuestionDelta(index, delta))
        .join('\n\n')}`
    );
  }

  if (payload.outcome.notes.length > 0) {
    sections.push(
      `## Reviewer Notes\n\n${payload.outcome.notes
        .map((note) => `- ${note}`)
        .join('\n')}`
    );
  }

  if (payload.toolExecutions.length > 0) {
    sections.push(
      `## Tool Executions\n\n${payload.toolExecutions
        .map((tool) => summarizeToolExecution(tool))
        .join('\n')}`
    );
  }

  const content = sections.join('\n\n');
  await fs.writeFile(filePath, `${content}\n`, 'utf-8');

  agentLogger.info({
    event: 'review_report_written',
    agent: 'reviewer',
    path: filePath,
  });

  return filePath;
};
