import { signIn } from "next-auth/react";
import { DEFAULT_LOGIN_REDIRECT } from "@/routes";
import { LoginSchema, RegisterSchema } from "@/schemas/auth";
import { getUserByEmail } from "@/data/user";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export type AuthResult = 
  | { error: string; success?: undefined }
  | { success: string; error?: undefined };

export async function login(formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const validatedFields = LoginSchema.safeParse({
    email,
    password,
  });

  if (!validatedFields.success) {
    return { error: "Invalid credentials" };
  }

  try {
    await signIn("credentials", {
      email: validatedFields.data.email,
      password: validatedFields.data.password,
      redirectTo: DEFAULT_LOGIN_REDIRECT,
    });

    return { success: "Logged in successfully!" };
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message || "Something went wrong" };
    }
    
    return { error: "Something went wrong" };
  }
}

export async function register(formData: FormData): Promise<AuthResult> {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const validatedFields = RegisterSchema.safeParse({
    name,
    email,
    password,
  });

  if (!validatedFields.success) {
    return { error: "Invalid fields" };
  }

  const { name: validatedName, email: validatedEmail, password: validatedPassword } = validatedFields.data;

  const existingUser = await getUserByEmail(validatedEmail);

  if (existingUser) {
    return { error: "Email already in use" };
  }

  const hashedPassword = await bcrypt.hash(validatedPassword, 10);

  await db.user.create({
    data: {
      name: validatedName,
      email: validatedEmail,
      password: hashedPassword,
    },
  });

  try {
    await signIn("credentials", {
      email: validatedEmail,
      password: validatedPassword,
      redirectTo: DEFAULT_LOGIN_REDIRECT,
    });
    return { success: "Account created successfully!" };
  } catch (error) {
    return { error: "Something went wrong during sign in" };
  }
}