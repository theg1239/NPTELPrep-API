"use server"

import { db } from "@/lib/db";
import { ApiKeySchema } from "@/schemas/auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

export type ApiKeyResult = 
  | { error: string; success?: undefined; key?: undefined }
  | { success: string; key: string; error?: undefined };

export type RevokeKeyResult = 
  | { error: string; success?: undefined }
  | { success: string; error?: undefined };

export async function createApiKey(formData: FormData): Promise<ApiKeyResult> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return { error: "Unauthorized" };
    }

    const name = formData.get("name") as string;
    const rateLimitStr = formData.get("rateLimit") as string;
    const rateLimit = parseInt(rateLimitStr, 10);
    const expiresAtStr = formData.get("expiresAt") as string;
    
    const validatedFields = ApiKeySchema.safeParse({
      name,
      rateLimit,
      expiresAt: expiresAtStr ? new Date(expiresAtStr) : undefined,
    });

    if (!validatedFields.success) {
      return { error: "Invalid fields" };
    }

    const apiKey = `${nanoid(32)}`;

    await db.apiKey.create({
      data: {
        name: validatedFields.data.name,
        key: apiKey,
        rateLimit: validatedFields.data.rateLimit,
        expiresAt: validatedFields.data.expiresAt,
        userId: session.user.id,
      },
    });

    revalidatePath("/dashboard/keys");
    
    return { success: "API key created successfully", key: apiKey };
  } catch (error) {
    return { error: "Something went wrong" };
  }
}

export async function revokeApiKey(keyId: string): Promise<RevokeKeyResult> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return { error: "Unauthorized" };
    }

    const existingKey = await db.apiKey.findFirst({
      where: {
        id: keyId,
        userId: session.user.id,
      },
    });

    if (!existingKey) {
      return { error: "API key not found" };
    }

    await db.apiKey.update({
      where: { id: keyId },
      data: { isRevoked: true },
    });

    revalidatePath("/dashboard/keys");
    revalidatePath(`/dashboard/keys/${keyId}`);
    
    return { success: "API key revoked successfully" };
  } catch (error) {
    return { error: "Something went wrong" };
  }
}

export async function trackApiKeyUsage(apiKey: string, endpoint: string, success: boolean = true, ipAddress?: string, userAgent?: string) {
  try {
    const key = await db.apiKey.findUnique({
      where: { key: apiKey }
    });

    if (!key || key.isRevoked) {
      return false;
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      await db.apiKey.update({
        where: { id: key.id },
        data: { isRevoked: true }
      });
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usageCount = await db.apiUsage.count({
      where: {
        apiKeyId: key.id,
        timestamp: {
          gte: today
        }
      }
    });

    if (usageCount >= key.rateLimit) {
      await db.apiUsage.create({
        data: {
          apiKeyId: key.id,
          endpoint,
          success: false,
          ipAddress,
          userAgent
        }
      });
      return false;
    }

    await db.apiUsage.create({
      data: {
        apiKeyId: key.id,
        endpoint,
        success,
        ipAddress,
        userAgent
      }
    });

    await db.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() }
    });

    return true;
  } catch (error) {
    console.error("Error tracking API key usage:", error);
    return false;
  }
}

export async function getUserApiKeys() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return [];
    }

    const apiKeys = await db.apiKey.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return apiKeys;
  } catch (error) {
    return [];
  }
}