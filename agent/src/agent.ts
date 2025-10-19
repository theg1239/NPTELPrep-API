import { generateText, stepCountIs } from 'ai';
import type {
  AssistantModelMessage,
  ModelMessage,
  ToolCallOptions,
  ToolModelMessage,
} from '@ai-sdk/provider-utils';
import type {
  JSONValue,
  LanguageModelV2ToolResultOutput,
} from '@ai-sdk/provider';
import { z } from 'zod';
import pRetry from 'p-retry';
import { agentLogger } from './logger.js';
import {
  fetchCourses,
  fetchReportedQuestions,
  type CourseSummary,
  type ReportedQuestion,
} from './dataSources.js';
import { agentTools } from './tools.js';
import { agentGoogleClient } from './googleClient.js';
import { config } from './config.js';

type WorkItem = {
  courseCode: string;
  summary?: CourseSummary;
  reports: ReportedQuestion[];
  priority: 'reported' | 'routine';
  firstReportedAt?: Date;
};

const AGENT_OUTPUT_SCHEMA = z.object({
  status: z.enum(['no-issues-found', 'issues-detected', 'not-applicable']),
  summary: z.string(),
  nextSteps: z.array(z.string()).optional(),
});

const SYSTEM_PROMPT = `
You are a quality assurance agent responsible for validating the correctness of NPTEL course data before it reaches students.

For each course you investigate:
- Call \`fetchCourseContext\` to load the full course, assignment, and question data. Read every affected question, its options, and the stored correct option.
- Call \`reportList\` to review user reported issues for this course. Address reported items first, but also scan adjacent questions for related inconsistencies.
- Inspect question text for boilerplate or administrative chatter (e.g., "As per our records you have not submitted this assignment."). If present, recommend a cleaned question that keeps only the pedagogical content.
- Verify option completeness and uniqueness: ensure labels (A/B/C/...) are present, no duplicate option text, and no missing choices. Confirm the recorded correct option matches the authoritative content.
- Cross-check week numbers, assignment titles, and question numbering so staged fixes keep the quiz structure coherent.
- When you have high confidence in a fix, call \`stageChange\` with a precise issue summary, a recommended fix that explains the correction, and a list of structured operations (e.g., \`update_question_text\`, \`update_correct_option\`, \`upsert_option\`, \`delete_option\`). Describe every affected question/option explicitly.
- When you have high confidence in a fix, call \`stageChange\` with a precise issue summary, a recommended fix that explains the correction, and a list of structured operations (e.g., \`update_question_text\`, \`update_correct_option\`, \`upsert_option\`, \`delete_option\`, \`create_question\`, \`delete_question\`, \`set_question_number\`, \`update_assignment_title\`, \`update_assignment_week\`). Describe every affected question/option explicitly and include the final desired state—avoid sequences that create a question and then immediately patch it again.
- Example payload for \`stageChange\`:
  {
    "courseCode": "123456",
    "issueSummary": "Duplicate option in Week 4 Question 1",
    "recommendedFix": "Remove duplicate option D, clean the prompt, and ensure numbering stays contiguous.",
    "operations": [
      {"type":"update_question_text","courseCode":"123456","assignmentId":1001,"questionId":5001,"newText":"Corrected question text"},
      {"type":"delete_option","courseCode":"123456","assignmentId":1001,"questionId":5001,"optionNumber":"D"},
      {"type":"update_correct_option","courseCode":"123456","assignmentId":1001,"questionId":5001,"newCorrectOption":"B"},
      {"type":"set_question_number","courseCode":"123456","assignmentId":1001,"questionId":5002,"newQuestionNumber":2}
    ]
  }
- Never attempt to execute SQL or modify the database directly. Only emit structured operations via \`stageChange\`. If data cannot be verified confidently, return \"not-applicable\" or \"no-issues-found\" with rationale.

Always respond with a compact JSON object: {"status":"<no-issues-found|issues-detected|not-applicable>","summary":"...","nextSteps":["..."]}.
`.trim();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const groupReportsByCourse = (
  reports: ReportedQuestion[]
): Map<string, ReportedQuestion[]> => {
  const groups = new Map<string, ReportedQuestion[]>();
  for (const report of reports) {
    const list = groups.get(report.course_code) ?? [];
    list.push(report);
    groups.set(report.course_code, list);
  }

  return groups;
};

const buildWorkQueue = async (): Promise<WorkItem[]> => {
  const [courses, reports] = await Promise.all([
    fetchCourses(),
    fetchReportedQuestions(),
  ]);

  const reportsByCourse = groupReportsByCourse(reports);
  const courseMap = new Map(
    courses.map((course) => [course.course_code, course])
  );
  const queue: WorkItem[] = [];

  for (const [courseCode, courseReports] of reportsByCourse.entries()) {
    const sortedReports = [...courseReports].sort((a, b) =>
      a.reported_at.localeCompare(b.reported_at)
    );
    queue.push({
      courseCode,
      summary: courseMap.get(courseCode),
      reports: sortedReports,
      priority: 'reported',
      firstReportedAt: new Date(sortedReports[0]?.reported_at ?? Date.now()),
    });
  }

  const reportedCourses = new Set(reportsByCourse.keys());

  for (const course of courses) {
    if (reportedCourses.has(course.course_code)) {
      continue;
    }
    queue.push({
      courseCode: course.course_code,
      summary: course,
      reports: [],
      priority: 'routine',
    });
  }

  return queue.sort((a, b) => {
    if (a.priority === b.priority) {
      if (a.priority === 'reported' && a.firstReportedAt && b.firstReportedAt) {
        return a.firstReportedAt.getTime() - b.firstReportedAt.getTime();
      }
      return (a.summary?.course_name ?? '').localeCompare(
        b.summary?.course_name ?? ''
      );
    }

    return a.priority === 'reported' ? -1 : 1;
  });
};

const formatReportSummary = (reports: ReportedQuestion[]): string => {
  if (reports.length === 0) {
    return 'No outstanding reports for this course.';
  }

  const lines = reports.map(
    (report, index) =>
      `${index + 1}. Reported by ${report.reported_by} on ${report.reported_at}: ${report.reason}`
  );

  return ['Reported Issues:', ...lines].join('\n');
};

const buildUserPrompt = (item: WorkItem): string => {
  const courseLine = item.summary
    ? `${item.summary.course_code} — ${item.summary.course_name}`
    : item.courseCode;

  const metadata = item.summary
    ? `Request count: ${item.summary.request_count ?? 'n/a'}`
    : 'Course metadata unavailable.';

  return `
Validate course: ${courseLine}

Operational context:
${metadata}

${formatReportSummary(item.reports)}

Investigation goals:
- Confirm quiz question text, options, and correct option match the authoritative source.
- Explain discrepancies clearly.
- Stage fixes via the \`stageChange\` tool for each concrete issue.

Respond using the structured format defined in the system prompt.
`.trim();
};

const parseAgentResponse = (
  raw: string
): z.infer<typeof AGENT_OUTPUT_SCHEMA> => {
  const trimmed = raw.trim();
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeFenceMatch ? codeFenceMatch[1] : trimmed;

  try {
    const parsed = JSON.parse(candidate);
    return AGENT_OUTPUT_SCHEMA.parse(parsed);
  } catch (error) {
    throw new Error(
      `Failed to parse agent response as JSON: ${(error as Error).message}. Raw response: ${trimmed}`
    );
  }
};

const MAX_TOOL_ITERATIONS = 6;

const normalizeToJsonValue = (value: unknown): JSONValue => {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
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

const executeAgentForCourse = async (
  item: WorkItem
): Promise<z.infer<typeof AGENT_OUTPUT_SCHEMA>> => {
  const conversation: ModelMessage[] = [
    { role: 'user', content: buildUserPrompt(item) },
  ];

  return agentGoogleClient.runWithModel(async (model) => {
    for (let step = 0; step < MAX_TOOL_ITERATIONS; step += 1) {
      const messagesForCall = [...conversation];
      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: messagesForCall,
        tools: agentTools,
        stopWhen: [stepCountIs(MAX_TOOL_ITERATIONS)],
        prepareStep: async ({ stepNumber, steps }) => {
          const stageChangeCalled = steps.some((step) =>
            step.toolCalls?.some((call) => call.toolName === 'stageChange')
          );

          if (stageChangeCalled) {
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
              activeTools: ['fetchCourseContext', 'reportList', 'stageChange'],
              toolChoice: { type: 'tool', toolName: 'stageChange' },
            };
          }

          return {
            activeTools: ['fetchCourseContext', 'reportList', 'stageChange'],
          };
        },
      });

      for (const call of result.toolCalls) {
        agentLogger.info({
          event: 'tool_call_emitted',
          agent: 'qa',
          tool: call.toolName,
          toolCallId: call.toolCallId,
          input: call.input,
        });
      }

      for (const toolResult of result.toolResults) {
        agentLogger.info({
          event: 'tool_result_received',
          agent: 'qa',
          tool: toolResult.toolName,
          toolCallId: toolResult.toolCallId,
          output: toolResult.output,
        });
      }

      const assistantMessages = result.response.messages.filter(
        (message): message is AssistantModelMessage =>
          message.role === 'assistant'
      );
      conversation.push(...assistantMessages);

      if (result.toolCalls.length === 0) {
        const finalText = result.text.trim();
        if (finalText.length === 0) {
          throw new Error('Model returned an empty response.');
        }
        return parseAgentResponse(finalText);
      }

      for (const toolCall of result.toolCalls) {
        const tool = agentTools[
          toolCall.toolName as keyof typeof agentTools
        ];

        if (!tool || typeof tool.execute !== 'function') {
          throw new Error(
            `Requested tool ${toolCall.toolName} is unavailable.`
          );
        }

        const executeFn =
          tool.execute as
            | ((input: unknown, options: ToolCallOptions) => Promise<unknown> | unknown)
            | undefined;

        if (!executeFn) {
          throw new Error(`Tool ${toolCall.toolName} is missing an execute function.`);
        }

        const toolOptions: ToolCallOptions = {
          toolCallId: toolCall.toolCallId,
          messages: messagesForCall,
        };

        const executionResult = await executeFn(toolCall.input, toolOptions);
        const toolOutput = await collectToolOutput(executionResult);

        agentLogger.info({
          event: 'tool_executed_locally',
          agent: 'qa',
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
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

    throw new Error(
      `Exceeded maximum tool execution steps (${MAX_TOOL_ITERATIONS}).`
    );
  });
};

const processCourse = async (item: WorkItem): Promise<void> => {
  agentLogger.info({
    event: 'course_analysis_start',
    agent: 'qa',
    courseCode: item.courseCode,
    priority: item.priority,
    reportCount: item.reports.length,
  });

  const output = await executeAgentForCourse(item);
  agentLogger.info({
    event: 'course_analysis_complete',
    agent: 'qa',
    courseCode: item.courseCode,
    status: output.status,
    summary: output.summary,
  });

  if (output.nextSteps && output.nextSteps.length > 0) {
    for (const [index, step] of output.nextSteps.entries()) {
      agentLogger.info({
        event: 'course_followup',
        agent: 'qa',
        courseCode: item.courseCode,
        stepNumber: index + 1,
        step,
      });
    }
  }
};

const processCourseWithRetry = async (item: WorkItem): Promise<void> => {
  await pRetry(
    async () => {
      await processCourse(item);
    },
    {
      retries: 2,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        agentLogger.warn({
          event: 'course_retry',
          agent: 'qa',
          courseCode: item.courseCode,
          attemptNumber,
          retriesLeft,
          error: error.message,
        });
      },
    }
  );
};

export const runAgentIteration = async (): Promise<void> => {
  const queue = await buildWorkQueue();
  agentLogger.info({
    event: 'iteration_queue_ready',
    agent: 'qa',
    queueLength: queue.length,
  });

  for (const item of queue) {
    try {
      await processCourseWithRetry(item);
    } catch (error) {
      agentLogger.error({
        event: 'course_process_failed',
        agent: 'qa',
        courseCode: item.courseCode,
        error: (error as Error).message,
      });
    }
  }
};

export const runAgentLoop = async (): Promise<void> => {
  agentLogger.info({ event: 'loop_start', agent: 'qa' });
  while (true) {
    const iterationStart = Date.now();
    try {
      await runAgentIteration();
    } catch (error) {
      agentLogger.error({
        event: 'iteration_failed',
        agent: 'qa',
        error: (error as Error).message,
      });
    }

    const elapsed = Date.now() - iterationStart;
    agentLogger.info({
      event: 'iteration_complete',
      agent: 'qa',
      durationMs: elapsed,
      sleepMs: config.loopSleepMs,
    });
    await sleep(config.loopSleepMs);
  }
};
