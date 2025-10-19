import { z } from 'zod';

const idSchema = z.union([
  z.string().regex(/^\d+$/),
  z.number().int().nonnegative(),
]);

export const changeOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update_question_text'),
    courseCode: z.string(),
    assignmentId: idSchema,
    questionId: idSchema,
    newText: z.string().min(1),
  }),
  z.object({
    type: z.literal('update_correct_option'),
    courseCode: z.string(),
    assignmentId: idSchema,
    questionId: idSchema,
    newCorrectOption: z.string().min(1),
  }),
  z.object({
    type: z.literal('upsert_option'),
    courseCode: z.string(),
    assignmentId: idSchema,
    questionId: idSchema,
    optionNumber: z.string().min(1),
    optionText: z.string().min(1),
  }),
  z.object({
    type: z.literal('delete_option'),
    courseCode: z.string(),
    assignmentId: idSchema,
    questionId: idSchema,
    optionNumber: z.string().min(1),
  }),
  z.object({
    type: z.literal('create_question'),
    courseCode: z.string(),
    assignmentId: idSchema,
    questionNumber: z.number().int().positive(),
    questionText: z.string().min(1),
    correctOption: z.string().min(1),
    options: z
      .array(
        z.object({
          optionNumber: z.string().min(1),
          optionText: z.string().min(1),
        })
      )
      .min(2),
  }),
  z.object({
    type: z.literal('delete_question'),
    courseCode: z.string(),
    assignmentId: idSchema,
    questionId: idSchema,
    ensureMinimumQuestions: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('set_question_number'),
    courseCode: z.string(),
    assignmentId: idSchema,
    questionId: idSchema,
    newQuestionNumber: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('update_assignment_title'),
    courseCode: z.string(),
    assignmentId: idSchema,
    newTitle: z.string().min(1),
  }),
  z.object({
    type: z.literal('update_assignment_week'),
    courseCode: z.string(),
    assignmentId: idSchema,
    newWeekNumber: z.number().int().nonnegative(),
  }),
]);

export type ChangeOperation = z.infer<typeof changeOperationSchema>;
