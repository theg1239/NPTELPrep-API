import { tool } from 'ai';
import { z } from 'zod';
import {
  fetchCourseDetail,
  fetchReportedQuestions,
  applyOperations,
} from './dataSources.js';
import { stageChange } from './changeStager.js';
import { changeOperationSchema } from './operations.js';

export const fetchCourseTool = tool({
  description:
    'Retrieve the full course context, including assignments and questions, for a course code.',
  inputSchema: z.object({
    courseCode: z
      .string()
      .describe('The unique course code to retrieve.'),
  }),
  async execute({ courseCode }) {
    const detail = await fetchCourseDetail(courseCode);

    const minimalAssignments = detail.assignments.map((assignment) => ({
      id: assignment.id ?? null,
      week_number: assignment.week_number,
      assignment_title: assignment.assignment_title,
      questions:
        assignment.questions?.map((question) => ({
          id: question.id ?? null,
          question_number: question.question_number,
          question_text: question.question_text,
          correct_option: question.correct_option,
          options: question.options?.map((option) => ({
            option_number: option.option_number,
            option_text: option.option_text,
          })),
        })) ?? [],
    }));

    return {
      course: {
        course_code: detail.course.course_code,
        course_name: detail.course.course_name,
      },
      assignments: minimalAssignments,
    };
  },
});

export const reportedQuestionsTool = tool({
  description:
    'List reported questions and their reasons, optionally filtered by course code.',
  inputSchema: z.object({
    courseCode: z
      .string()
      .optional()
      .describe('Optional course code to filter the reports by.'),
  }),
  async execute({ courseCode }) {
    const reports = await fetchReportedQuestions();
    if (!courseCode) {
      return reports;
    }
    return reports.filter(
      (report) => report.course_code.toLowerCase() === courseCode.toLowerCase()
    );
  },
});

export const stageChangeTool = tool({
  description:
    'Record structured proposed operations for later manual review. Supported operations include update_question_text, update_correct_option, upsert_option, delete_option, create_question, delete_question, set_question_number, update_assignment_title, and update_assignment_week.',
  inputSchema: z.object({
    courseCode: z.string().describe('Course code affected by the change.'),
    issueSummary: z
      .string()
      .describe('Short description of the issue that needs to be addressed.'),
    recommendedFix: z
      .string()
      .describe('Detailed explanation of the fix to be applied.'),
    operations: z
      .array(changeOperationSchema)
      .min(1)
      .describe('Concrete quiz data operations to propose. At least one required.'),
    supportingNotes: z
      .array(z.string())
      .optional()
      .describe('Additional notes or context for reviewers.'),
    reporter: z
      .string()
      .optional()
      .describe('Agent or reviewer name logging the change.'),
  }),
  async execute(input) {
    const path = await stageChange({
      courseCode: input.courseCode,
      issueSummary: input.issueSummary,
      recommendedFix: input.recommendedFix,
      operations: input.operations,
      supportingNotes: input.supportingNotes,
      reporter: input.reporter ?? 'gpt-agent',
    });

    return { stagedChangePath: path };
  },
});

export const agentTools = {
  fetchCourseContext: fetchCourseTool,
  reportList: reportedQuestionsTool,
  stageChange: stageChangeTool,
};

export type AgentTools = typeof agentTools;

export const applyChangeTool = tool({
  description:
    'Apply validated quiz data operations directly to the database in a transactional manner.',
  inputSchema: z.object({
    operations: z
      .array(changeOperationSchema)
      .min(1)
      .describe('Operations that have been reviewed and should be committed.'),
    reviewer: z
      .string()
      .optional()
      .describe('Reviewer identifier applying the change.'),
  }),
  async execute({ operations, reviewer }) {
    const applied = await applyOperations(operations);
    return {
      operationsApplied: applied.count,
      results: applied.results,
      reviewer: reviewer ?? 'reviewer-agent',
    };
  },
});

export const reviewerTools = {
  fetchCourseContext: fetchCourseTool,
  reportList: reportedQuestionsTool,
  applyChange: applyChangeTool,
};

export type ReviewerTools = typeof reviewerTools;
