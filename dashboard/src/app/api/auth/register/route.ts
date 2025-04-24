import { NextResponse } from "next/server";
import { RegisterSchema } from "@/schemas/auth";
import { getUserByEmail } from "@/data/user";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    const parsed = RegisterSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid fields" },
        { status: 400 }
      );
    }
    const { name: vName, email: vEmail, password: vPassword } = parsed.data;

    if (await getUserByEmail(vEmail)) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(vPassword, 10);
    await db.user.create({
      data: {
        name: vName,
        email: vEmail,
        password: hashedPassword,
      },
    });

    return NextResponse.json({ success: "Account created successfully!" });
  } catch (err) {
    console.error("Registration error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
