import { generateText, stepCountIs } from 'ai';
import type {
  AssistantModelMessage,
  ModelMessage,
  ToolModelMessage,
  ToolCallOptions,
} from '@ai-sdk/provider-utils';
import type {
  JSONValue,
  LanguageModelV2ToolResultOutput,
} from '@ai-sdk/provider';
import { z } from 'zod';
import { agentLogger } from './logger.js';
import { reviewerGoogleClient } from './googleClient.js';
import { config } from './config.js';
import {
  archiveChange,
  annotateChangeWithReview,
  ensureChangeQueues,
  listPendingChanges,
  type StagedChange,
  type ChangeDisposition,
} from './stagedChanges.js';
import { applyOperations, fetchReportedQuestions } from './dataSources.js';
import { reviewerTools } from './tools.js';
import {
  computeReviewerAnalysis,
  formatAnalysisForPrompt,
  prepareAnalysisForPersistence,
  type ReviewerAnalysis,
} from './reviewerAnalysis.js';
import {
  writeReviewerReport,
  type ReviewerOutcome as ReviewerOutcomeSummary,
} from './reviewerReportWriter.js';

const REVIEWER_OUTPUT_SCHEMA = z.object({
  decision: z.enum(['apply', 'reject']),
  summary: z.string(),
  notes: z.array(z.string()).optional(),
});

type ReviewerDecision = z.infer<typeof REVIEWER_OUTPUT_SCHEMA>;

const REVIEWER_SYSTEM_PROMPT = `
You are a senior NPTEL course data reviewer. Another agent has staged proposed quiz fixes, and you must validate them before any database changes are applied.

Your responsibilities:
- Confirm every quiz question remains pedagogically correct and free from boilerplate or administrative disclaimers (e.g., "As per our records you have not submitted this assignment."). Remove or reject changes that leave such extraneous text.
- Inspect all answer options for duplication, missing choices, or mismatched correct answers. The correct option must match the authoritative course material.
- Validate that the recommended fix resolves the original issue without creating regressions. When necessary, call the available tools to fetch the full course context and reported issues.
- Review each SQL statement. Ensure it targets the intended course/question and does not introduce unintended edits.
- Reject any proposal that still contains ambiguous text, incorrect answers, inconsistent numbering, or unsafe SQL.

Always call the tools when you need to inspect real data. Never fabricate knowledge.

When you approve fixes you MUST execute the \`applyChange\` tool exactly once with the validated operations before returning your final JSON. Never mark a change as applied unless the tool succeeds.

Respond with compact JSON:
{"decision":"apply|reject","summary":"<short rationale>","notes":["...optional context..."]}

Only approve when you are confident the fix is correct and safe, and only after \`applyChange\` succeeds.
`.trim();

const MAX_TOOL_ITERATIONS = 6;

const normalizeToJsonValue = (value: unknown): JSONValue => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeToJsonValue(entry)) as JSONValue;
  }

  if (typeof value === 'object') {
    const result: Record<string, JSONValue> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) {
        continue;
      }
      result[key] = normalizeToJsonValue(entry);
    }
    return result;
  }

  return String(value);
};

const collectToolOutput = async (output: unknown): Promise<unknown> => {
  if (!output) {
    return output;
  }

  if (typeof (output as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
    const collected: unknown[] = [];
    for await (const item of output as AsyncIterable<unknown>) {
      collected.push(item);
    }
    return collected;
  }

  return output;
};

const buildReviewPrompt = (
  change: StagedChange,
  analysis: ReviewerAnalysis,
  reports: Awaited<ReturnType<typeof fetchReportedQuestions>>
): string => {
  const courseDetail = analysis.courseDetail;

  const courseSummary = [
    `Course: ${courseDetail.course.course_code} — ${courseDetail.course.course_name}`,
    `Assignments: ${courseDetail.assignments.length}`,
    `Materials: ${courseDetail.materials?.length ?? 0}`,
  ].join('\n');

  const relatedReports = reports.filter(
    (report) => report.course_code.toLowerCase() === change.courseCode.toLowerCase()
  );

  const reportSummary =
    relatedReports.length === 0
      ? 'No open user reports for this course.'
      : relatedReports
          .slice(0, 5)
          .map(
            (report, index) =>
              `${index + 1}. "${report.reason}" reported by ${report.reported_by} at ${report.reported_at}`
          )
          .join('\n');

  const operationLines = change.operations.length
    ? change.operations
        .map((operation, index) => `${index + 1}. ${JSON.stringify(operation)}`)
        .join('\n')
    : 'No structured operations were provided.';

  const supportingNotes =
    change.supportingNotes.length > 0
      ? change.supportingNotes.map((note) => `- ${note}`).join('\n')
      : 'No supporting notes.';

  const analysisSummary = formatAnalysisForPrompt(analysis);

  return `
Review staged change file: ${change.fileName}
Created: ${change.createdAt}
Reporter: ${change.reporter ?? 'unspecified'}

Course snapshot:
${courseSummary}

Recent reports for this course:
${reportSummary}

Proposed issue summary:
${change.issueSummary}

Recommended fix narrative:
${change.recommendedFix}

Supporting notes:
${supportingNotes}

Structured operations (in order):
${operationLines}

Reviewer preflight analysis:
${analysisSummary}

Tasks:
- Investigate the live course data using tools (e.g., fetchCourseContext, reportList).
- Ensure question text contains no administrative boilerplate and options are correct.
- Verify the operations precisely resolve the issue without collateral changes.
- When confident, call the \`applyChange\` tool with the approved operations to commit the fix, then return your final JSON decision.
`.trim();
};

type ReviewerConversationResult = {
  text: string;
  toolExecutions: Array<{ toolName: string; toolCallId: string; output: unknown }>;
};

const runReviewerConversation = async (userPrompt: string): Promise<ReviewerConversationResult> => {
  const conversation: ModelMessage[] = [{ role: 'user', content: userPrompt }];
  const toolExecutions: Array<{ toolName: string; toolCallId: string; output: unknown }> = [];

  return reviewerGoogleClient.runWithModel(async (model) => {
    for (let step = 0; step < MAX_TOOL_ITERATIONS; step += 1) {
      const messagesForCall = [...conversation];
      const result = await generateText({
        model,
        system: REVIEWER_SYSTEM_PROMPT,
        messages: messagesForCall,
        tools: reviewerTools,
        stopWhen: [stepCountIs(MAX_TOOL_ITERATIONS)],
        prepareStep: async ({ stepNumber, steps }) => {
          const hasApplied = steps.some((step) =>
            step.toolCalls?.some((call) => call.toolName === 'applyChange')
          );

          if (hasApplied) {
            return {
              activeTools: ['fetchCourseContext', 'reportList'],
            };
          }

          if (stepNumber === 0) {
            return {
              activeTools: ['fetchCourseContext', 'reportList'],
            };
          }

          if (stepNumber >= 2) {
            return {
              activeTools: ['fetchCourseContext', 'reportList', 'applyChange'],
              toolChoice: { type: 'tool', toolName: 'applyChange' },
            };
          }

          return {
            activeTools: ['fetchCourseContext', 'reportList', 'applyChange'],
          };
        },
      });

      for (const call of result.toolCalls) {
        agentLogger.info({
          event: 'tool_call_emitted',
          agent: 'reviewer',
          tool: call.toolName,
          toolCallId: call.toolCallId,
          input: call.input,
        });
      }
      for (const toolResult of result.toolResults) {
        agentLogger.info({
          event: 'tool_result_received',
          agent: 'reviewer',
          tool: toolResult.toolName,
          toolCallId: toolResult.toolCallId,
          output: toolResult.output,
        });
        toolExecutions.push({
          toolName: toolResult.toolName,
          toolCallId: toolResult.toolCallId,
          output: toolResult.output,
        });
      }

      const assistantMessages = result.response.messages.filter(
        (message): message is AssistantModelMessage => message.role === 'assistant'
      );
      conversation.push(...assistantMessages);

      if (result.toolCalls.length === 0) {
        const finalText = result.text.trim();
        if (finalText.length === 0) {
          throw new Error('Reviewer model returned an empty response.');
        }
        return { text: finalText, toolExecutions };
      }

      for (const toolCall of result.toolCalls) {
        const tool = reviewerTools[
          toolCall.toolName as keyof typeof reviewerTools
        ];

        if (!tool || typeof tool.execute !== 'function') {
          throw new Error(`Reviewer requested unavailable tool ${toolCall.toolName}.`);
        }

        const executeFn = tool.execute as
          | ((input: unknown, options: ToolCallOptions) => Promise<unknown> | unknown)
          | undefined;

        if (!executeFn) {
          throw new Error(`Reviewer tool ${toolCall.toolName} is missing an execute function.`);
        }

        const toolOptions: ToolCallOptions = {
          toolCallId: toolCall.toolCallId,
          messages: messagesForCall,
        };

        let toolOutput: unknown;
        try {
          const executionResult = await executeFn(toolCall.input, toolOptions);
          toolOutput = await collectToolOutput(executionResult);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          agentLogger.error({
            event: 'tool_execution_error',
            agent: 'reviewer',
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            error: errorMessage,
          });
          const errorPayload = {
            success: false,
            error: errorMessage,
          };
          toolExecutions.push({
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output: errorPayload,
          });

          const errorResult: LanguageModelV2ToolResultOutput = {
            type: 'json',
            value: normalizeToJsonValue(errorPayload),
          };

          const errorMessageContent: ToolModelMessage = {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                output: errorResult,
              },
            ],
          };

          conversation.push(errorMessageContent);
          continue;
        }

        agentLogger.info({
          event: 'tool_executed_locally',
          agent: 'reviewer',
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
        });

        toolExecutions.push({
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: toolOutput,
        });

        const normalizedOutput = normalizeToJsonValue(toolOutput);
        const toolResult: LanguageModelV2ToolResultOutput =
          typeof toolOutput === 'string'
            ? { type: 'text', value: toolOutput }
            : { type: 'json', value: normalizedOutput };

        const toolMessage: ToolModelMessage = {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              output: toolResult,
            },
          ],
        };

        conversation.push(toolMessage);
      }
    }

    throw new Error(`Exceeded reviewer tool execution limit (${MAX_TOOL_ITERATIONS}).`);
  });
};

const parseReviewerResponse = (raw: string): ReviewerDecision => {
  const trimmed = raw.trim();
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeFenceMatch ? codeFenceMatch[1] : trimmed;

  try {
    return REVIEWER_OUTPUT_SCHEMA.parse(JSON.parse(candidate));
  } catch (error) {
    throw new Error(
      `Failed to parse reviewer response as JSON: ${(error as Error).message}. Raw response: ${trimmed}`
    );
  }
};

type ReviewOutcome = {
  disposition: ChangeDisposition;
  summary: string;
  notes: string[];
  toolExecutions: Array<{ toolName: string; toolCallId: string; output: unknown }>;
  analysis: ReviewerAnalysis;
  failureReason?: string;
};

const reviewChange = async (change: StagedChange): Promise<ReviewOutcome> => {
  agentLogger.info({
    event: 'review_start',
    agent: 'reviewer',
    file: change.fileName,
    courseCode: change.courseCode,
  });

  const [analysis, reports] = await Promise.all([
    computeReviewerAnalysis(change),
    fetchReportedQuestions(),
  ]);

  const userPrompt = buildReviewPrompt(change, analysis, reports);
  let reviewerOutput: ReviewerConversationResult | null = null;

  try {
    reviewerOutput = await runReviewerConversation(userPrompt);
    const parsed = parseReviewerResponse(reviewerOutput.text);

    const notes = parsed.notes ?? [];

    if (parsed.decision === 'apply') {
      if (change.operations.length === 0) {
        throw new Error('Reviewer approved change without any operations to apply.');
      }

      const appliedViaTool = reviewerOutput.toolExecutions.some(
        (execution) => execution.toolName === 'applyChange'
      );

      if (!appliedViaTool) {
        agentLogger.warn({
          event: 'review_apply_tool_missing',
          agent: 'reviewer',
          file: change.fileName,
          courseCode: change.courseCode,
        });
        try {
          const fallbackResult = await applyOperations(change.operations);
          agentLogger.info({
            event: 'review_apply_fallback_success',
            agent: 'reviewer',
            file: change.fileName,
            courseCode: change.courseCode,
            operationCount: fallbackResult.count,
          });
          reviewerOutput.toolExecutions.push({
            toolName: 'applyChange',
            toolCallId: 'auto-fallback',
            output: {
              operationsApplied: fallbackResult.count,
              results: fallbackResult.results,
              reviewer: 'auto-fallback',
            },
          });
        } catch (error) {
          const message = (error as Error).message;
          agentLogger.error({
            event: 'review_apply_fallback_failed',
            agent: 'reviewer',
            file: change.fileName,
            courseCode: change.courseCode,
            error: message,
          });
          throw new Error(
            `Failed to apply change via fallback applyChange: ${message}`
          );
        }
      }

      agentLogger.info({
        event: 'review_applied',
        agent: 'reviewer',
        file: change.fileName,
        courseCode: change.courseCode,
        operationCount: change.operations.length,
      });

      return {
        disposition: 'applied',
        summary: parsed.summary,
        notes,
        toolExecutions: reviewerOutput.toolExecutions,
        analysis,
      };
    }

    agentLogger.warn({
      event: 'review_rejected',
      agent: 'reviewer',
      file: change.fileName,
      courseCode: change.courseCode,
      summary: parsed.summary,
    });

    return {
      disposition: 'rejected',
      summary: parsed.summary,
      notes,
      toolExecutions: reviewerOutput.toolExecutions,
      analysis,
    };
  } catch (error) {
    const message = (error as Error).message;
    agentLogger.error({
      event: 'review_processing_error',
      agent: 'reviewer',
      file: change.fileName,
      courseCode: change.courseCode,
      error: message,
    });

    return {
      disposition: 'failed',
      summary: 'Reviewer processing error',
      notes: [],
      toolExecutions: reviewerOutput?.toolExecutions ?? [],
      analysis,
      failureReason: message,
    };
  }
};

export const runReviewerIteration = async (): Promise<void> => {
  await ensureChangeQueues();

  const pendingChanges = await listPendingChanges();

  if (pendingChanges.length === 0) {
    agentLogger.info({ event: 'review_queue_empty', agent: 'reviewer' });
    return;
  }

  for (const change of pendingChanges) {
    let outcome: ReviewOutcome;
    try {
      outcome = await reviewChange(change);
    } catch (error) {
      const message = (error as Error).message;
      agentLogger.error({
        event: 'review_processing_error',
        agent: 'reviewer',
        file: change.fileName,
        courseCode: change.courseCode,
        error: message,
      });
      await archiveChange(change, 'failed');
      continue;
    }

    const reviewedAt = new Date().toISOString();
    const persistedAnalysis = prepareAnalysisForPersistence(outcome.analysis);

    if (outcome.notes.length > 0) {
      outcome.notes.forEach((note, index) =>
        agentLogger.info({
          event: 'review_note',
          agent: 'reviewer',
          file: change.fileName,
          courseCode: change.courseCode,
          noteIndex: index + 1,
          note,
        })
      );
    }

    if (outcome.failureReason) {
      agentLogger.warn({
        event: 'review_failure_reason',
        agent: 'reviewer',
        file: change.fileName,
        courseCode: change.courseCode,
        reason: outcome.failureReason,
      });
    }

    try {
      await annotateChangeWithReview(change, {
        disposition: outcome.disposition,
        summary: outcome.summary,
        notes: outcome.notes,
        reviewedAt,
        failureReason: outcome.failureReason,
        toolExecutions: outcome.toolExecutions,
        analysis: persistedAnalysis,
      });
    } catch (error) {
      agentLogger.error({
        event: 'review_annotation_failed',
        agent: 'reviewer',
        file: change.fileName,
        courseCode: change.courseCode,
        error: (error as Error).message,
      });
    }

    try {
      await writeReviewerReport({
        change,
        analysis: persistedAnalysis,
        outcome: {
          disposition: outcome.disposition,
          summary: outcome.summary,
          notes: outcome.notes,
          failureReason: outcome.failureReason,
        } satisfies ReviewerOutcomeSummary,
        toolExecutions: outcome.toolExecutions,
      });
    } catch (error) {
      agentLogger.error({
        event: 'review_report_failed',
        agent: 'reviewer',
        file: change.fileName,
        courseCode: change.courseCode,
        error: (error as Error).message,
      });
    }

    if (outcome.disposition === 'failed') {
      agentLogger.error({
        event: 'review_disposition',
        agent: 'reviewer',
        file: change.fileName,
        courseCode: change.courseCode,
        disposition: outcome.disposition,
        summary: outcome.summary,
        failureReason: outcome.failureReason ?? null,
      });
    } else {
      agentLogger.info({
        event: 'review_disposition',
        agent: 'reviewer',
        file: change.fileName,
        courseCode: change.courseCode,
        disposition: outcome.disposition,
        summary: outcome.summary,
      });
    }

    await archiveChange(change, outcome.disposition);
  }
};

export const runReviewerLoop = async (): Promise<void> => {
  agentLogger.info({ event: 'loop_start', agent: 'reviewer' });
  while (true) {
    const iterationStart = Date.now();
    try {
      await runReviewerIteration();
    } catch (error) {
      agentLogger.error({
        event: 'iteration_failed',
        agent: 'reviewer',
        error: (error as Error).message,
      });
    }
    const elapsed = Date.now() - iterationStart;
    agentLogger.info({
      event: 'iteration_complete',
      agent: 'reviewer',
      durationMs: elapsed,
      sleepMs: config.reviewerLoopSleepMs,
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, config.reviewerLoopSleepMs);
    });
  }
};
