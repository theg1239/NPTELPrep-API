"use server";

import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function getUserApiUsage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    return {
      totalRequests: 0,
      successRate: "0%",
      errors: 0,
      dailyUsage: [],
      topEndpoints: []
    };
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: {
      apiKeys: {
        select: {
          id: true
        }
      }
    }
  });

  if (!user) {
    return {
      totalRequests: 0,
      successRate: "0%",
      errors: 0,
      dailyUsage: [],
      topEndpoints: []
    };
  }

  const apiKeyIds = user.apiKeys.map(key => key.id);
  
  const totalRequests = await db.apiUsage.count({
    where: {
      apiKeyId: { in: apiKeyIds }
    }
  });

  const errors = await db.apiUsage.count({
    where: {
      apiKeyId: { in: apiKeyIds },
      success: false
    }
  });

  const successRate = totalRequests > 0 
    ? `${Math.round(((totalRequests - errors) / totalRequests) * 100)}%` 
    : "100%";

  const now = new Date();
  const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7));
  
  const dailyUsage = await db.apiUsage.groupBy({
    by: ['timestamp'],
    _count: {
      id: true
    },
    where: {
      apiKeyId: { in: apiKeyIds },
      timestamp: {
        gte: sevenDaysAgo
      }
    },
    orderBy: {
      timestamp: 'asc'
    }
  });

  const formattedDailyUsage = dailyUsage.map(day => ({
    date: day.timestamp.toISOString().split('T')[0],
    count: day._count.id
  }));

  const topEndpoints = await db.apiUsage.groupBy({
    by: ['endpoint'],
    _count: {
      id: true
    },
    where: {
      apiKeyId: { in: apiKeyIds }
    },
    orderBy: {
      _count: {
        id: 'desc'
      }
    },
    take: 5
  });

  const formattedTopEndpoints = topEndpoints.map(endpoint => ({
    name: endpoint.endpoint,
    count: endpoint._count.id
  }));

  return {
    totalRequests,
    successRate,
    errors,
    dailyUsage: formattedDailyUsage,
    topEndpoints: formattedTopEndpoints
  };
}

export async function getAdminApiUsage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error("Not authenticated");
  }
  
  const user = await db.user.findUnique({
    where: { email: session.user.email }
  });
  
  if (user?.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  
  const totalRequests = await db.apiUsage.count();
  
  const errors = await db.apiUsage.count({
    where: {
      success: false
    }
  });
  
  const successRate = totalRequests > 0 
    ? `${Math.round(((totalRequests - errors) / totalRequests) * 100)}%` 
    : "100%";
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
  
  const dailyUsage = await db.apiUsage.groupBy({
    by: ['timestamp'],
    _count: {
      id: true
    },
    where: {
      timestamp: {
        gte: thirtyDaysAgo
      }
    },
    orderBy: {
      timestamp: 'asc'
    }
  });
  
  const formattedDailyUsage = dailyUsage.map(day => ({
    date: day.timestamp.toISOString().split('T')[0],
    count: day._count.id
  }));
  
  const topEndpoints = await db.apiUsage.groupBy({
    by: ['endpoint'],
    _count: {
      id: true
    },
    orderBy: {
      _count: {
        id: 'desc'
      }
    },
    take: 5
  });
  
  const formattedTopEndpoints = topEndpoints.map(endpoint => ({
    name: endpoint.endpoint,
    count: endpoint._count.id
  }));
  
  const topUsers = await db.apiKey.findMany({
    select: {
      id: true,
      name: true,
      user: {
        select: {
          name: true,
          email: true
        }
      },
      _count: {
        select: {
          usageRecords: true
        }
      }
    },
    orderBy: {
      usageRecords: {
        _count: 'desc'
      }
    },
    take: 5
  });
  
  return {
    totalRequests,
    successRate,
    errors,
    dailyUsage: formattedDailyUsage,
    topEndpoints: formattedTopEndpoints,
    topUsers: topUsers.map(key => ({
      keyName: key.name,
      userName: key.user.name || key.user.email,
      count: key._count.usageRecords
    }))
  };
}
