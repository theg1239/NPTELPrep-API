import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { TuiPanel, TuiButton, TuiTable } from "@/components/tui/components";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

async function getUsageStats() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  
  const monthStart = new Date(now);
  monthStart.setMonth(now.getMonth() - 1);
  
  const totalUsage = await db.apiUsage.count();
  const todayUsage = await db.apiUsage.count({
    where: {
      timestamp: {
        gte: todayStart,
      },
    },
  });
  
  const weekUsage = await db.apiUsage.count({
    where: {
      timestamp: {
        gte: weekStart,
      },
    },
  });
  
  const monthUsage = await db.apiUsage.count({
    where: {
      timestamp: {
        gte: monthStart,
      },
    },
  });
  
  return {
    total: totalUsage,
    today: todayUsage,
    week: weekUsage,
    month: monthUsage,
  };
}

async function getRecentUsage(limit = 100) {
  return db.apiUsage.findMany({
    select: {
      id: true,
      endpoint: true,
      success: true,
      ipAddress: true,
      timestamp: true,
      apiKey: {
        select: {
          id: true,
          name: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: {
      timestamp: "desc",
    },
    take: limit,
  });
}

export default async function AdminUsagePage() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  
  const usageStats = await getUsageStats();
  const recentUsage = await getRecentUsage();
  
  const usageRows = recentUsage.map((usage: any) => [
    usage.endpoint,
    <span key={`ip-${usage.id}`} className="truncate max-w-xs">{usage.ipAddress || "-"}</span>,
    usage.success ? 
      <span key={`status-${usage.id}`} className="text-tui-green">Success</span> : 
      <span key={`status-${usage.id}`} className="text-tui-red">Failed</span>,
    <Link key={`key-${usage.id}`} href={`/dashboard/admin/api-keys/${usage.apiKey.id}`} className="text-tui-cyan hover:underline">
      {usage.apiKey.name}
    </Link>,
    <span key={`user-${usage.id}`} className="truncate max-w-xs">
      {usage.apiKey.user.name || usage.apiKey.user.email}
    </span>,
    formatDistanceToNow(new Date(usage.timestamp), { addSuffix: true })
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-mono">API Usage Statistics</h1>
        <Link href="/dashboard/admin">
          <TuiButton>← Back to Admin</TuiButton>
        </Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <TuiPanel title="Today's Usage" color="green">
          <div className="p-4">
            <div className="text-2xl text-tui-green font-mono">{usageStats.today}</div>
            <div className="text-sm text-tui-cyan">API requests</div>
          </div>
        </TuiPanel>
        
        <TuiPanel title="This Week" color="yellow">
          <div className="p-4">
            <div className="text-2xl text-tui-yellow font-mono">{usageStats.week}</div>
            <div className="text-sm text-tui-cyan">API requests</div>
          </div>
        </TuiPanel>
        
        <TuiPanel title="This Month" color="blue">
          <div className="p-4">
            <div className="text-2xl text-tui-blue font-mono">{usageStats.month}</div>
            <div className="text-sm text-tui-cyan">API requests</div>
          </div>
        </TuiPanel>
        
        <TuiPanel title="All Time" color="magenta">
          <div className="p-4">
            <div className="text-2xl text-tui-magenta font-mono">{usageStats.total}</div>
            <div className="text-sm text-tui-cyan">API requests</div>
          </div>
        </TuiPanel>
      </div>
      
      <TuiPanel title="Recent API Usage">
        <div className="p-4">
          {usageRows.length > 0 ? (
            <TuiTable
              headers={["Endpoint", "IP Address", "Status", "API Key", "User", "When"]}
              rows={usageRows}
              keyboardNav
            />
          ) : (
            <div className="text-center p-6 text-tui-disabled">No API usage data available</div>
          )}
        </div>
      </TuiPanel>
    </div>
  );
} 