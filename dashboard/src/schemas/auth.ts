import * as z from "zod";

export const LoginSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address",
  }),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters long",
  }),
});

export const RegisterSchema = z.object({
  name: z.string().min(1, {
    message: "Name is required",
  }),
  email: z.string().email({
    message: "Please enter a valid email address",
  }),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters long",
  }),
});

export const ApiKeySchema = z.object({
  name: z.string().min(1, {
    message: "API key name is required",
  }),
  rateLimit: z.number().int().min(1, {
    message: "Rate limit must be at least 1",
  }).default(100),
  expiresAt: z.date().optional(),
});