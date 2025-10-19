import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { TuiPanel, TuiButton, TuiAlert, TuiProgress, TuiTable } from "@/components/tui/components";
import { formatDistanceToNow, format } from 'date-fns';

async function getApiKeyDetails(keyId: string) {
  const apiKey = await db.apiKey.findUnique({
    where: { id: keyId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      },
      usageRecords: {
        orderBy: { timestamp: 'desc' },
        take: 50,
      },
      _count: {
        select: {
          usageRecords: true
        }
      }
    }
  });
  
  return apiKey;
}

async function getTodayUsageStats(keyId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const totalRequests = await db.apiUsage.count({
    where: {
      apiKeyId: keyId,
      timestamp: {
        gte: today
      }
    }
  });
  
  const successfulRequests = await db.apiUsage.count({
    where: {
      apiKeyId: keyId,
      timestamp: {
        gte: today
      },
      success: true
    }
  });
  
  return {
    totalToday: totalRequests,
    successToday: successfulRequests
  };
}

export default async function ApiKeyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  
  const { id } = await params;
  const apiKey = await getApiKeyDetails(id);
  
  if (!apiKey) {
    return (
      <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
        <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-tui-blue mr-2">NORMAL</span>
            <span className="text-tui-white">key-details.js</span>
            <span className="text-tui-magenta ml-2">[admin]</span>
          </div>
          <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
        </div>
        
        <TuiAlert
          type="error"
          message="API key not found"
        />
        
        <div className="mt-4">
          <Link href="/dashboard/admin">
            <TuiButton variant="secondary" size="sm">
              Back to Admin Dashboard
            </TuiButton>
          </Link>
        </div>
      </div>
    );
  }
  
  const { totalToday, successToday } = await getTodayUsageStats(id);
  const todayUsagePercent = (totalToday / apiKey.rateLimit) * 100;
  
  const usageRows = apiKey.usageRecords.map(record => [
    format(new Date(record.timestamp), 'yyyy-MM-dd HH:mm:ss'),
    record.endpoint,
    record.success ? 
      <span key={`status-${record.id}`} className="text-tui-green">Success</span> : 
      <span key={`status-${record.id}`} className="text-tui-red">Failed</span>,
    record.ipAddress || "-",
    record.userAgent ? record.userAgent.substring(0, 30) + "..." : "-"
  ]);
  
  return (
    <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
      <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">key-details.js</span>
          <span className="text-tui-magenta ml-2">[admin]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>
      
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-tui-cyan text-lg font-mono">API Key Details</h2>
        <div className="flex space-x-2">
          <Link href={`/dashboard/admin/users/${apiKey.userId}`}>
            <TuiButton variant="secondary" size="sm">
              View Owner
            </TuiButton>
          </Link>
          <Link href="/dashboard/admin">
            <TuiButton variant="secondary" size="sm">
              Back to Admin
            </TuiButton>
          </Link>
        </div>
      </div>
      
      <TuiPanel title="Key Information" color="cyan">
        <div className="px-4 py-3 space-y-2">
          <div className="flex justify-between">
            <span className="text-tui-gray">Name:</span>
            <span className="text-tui-white">{apiKey.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">Owner:</span>
            <span className="text-tui-white">
              {apiKey.user.name || 'No name'} ({apiKey.user.email})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">Created:</span>
            <span className="text-tui-white">
              {new Date(apiKey.createdAt).toLocaleDateString()} 
              ({formatDistanceToNow(new Date(apiKey.createdAt), { addSuffix: true })})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">Status:</span>
            <span className={apiKey.isRevoked ? "text-tui-red" : "text-tui-green"}>
              {apiKey.isRevoked ? "Revoked" : "Active"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">Rate Limit:</span>
            <span className="text-tui-white">{apiKey.rateLimit} requests/day</span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">Expiration:</span>
            <span className="text-tui-white">
              {apiKey.expiresAt ? new Date(apiKey.expiresAt).toLocaleDateString() : "Never"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">Last Used:</span>
            <span className="text-tui-white">
              {apiKey.lastUsedAt ? formatDistanceToNow(new Date(apiKey.lastUsedAt), { addSuffix: true }) : "Never"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">Total Requests:</span>
            <span className="text-tui-white">{apiKey._count.usageRecords}</span>
          </div>
        </div>
      </TuiPanel>
      
      <div className="mt-4">
        <TuiPanel title="Daily Usage" color="blue">
          <div className="px-4 py-3">
            <div className="mb-2 flex justify-between">
              <span className="text-tui-gray">Today's Requests:</span>
              <span className="text-tui-white">{totalToday} / {apiKey.rateLimit}</span>
            </div>
            <TuiProgress 
              value={todayUsagePercent} 
              max={100} 
              color={todayUsagePercent > 80 ? "yellow" : todayUsagePercent > 95 ? "red" : "green"} 
              size="md"
              showLabel
            />
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-tui-gray">Success Rate Today:</span>
              <span className="text-tui-white">
                {totalToday > 0 ? `${Math.round((successToday / totalToday) * 100)}%` : "N/A"}
              </span>
            </div>
          </div>
        </TuiPanel>
      </div>
      
      <div className="mt-4">
        <TuiPanel title="Admin Actions" color="yellow">
          <div className="px-4 py-3 flex flex-wrap gap-2">
            <form action={async () => {
              'use server';
              await db.apiKey.update({
                where: { id },
                data: { isRevoked: !apiKey.isRevoked }
              });
            }}>
              <TuiButton type="submit" variant={apiKey.isRevoked ? "success" : "destructive"} size="sm">
                {apiKey.isRevoked ? "Reactivate Key" : "Revoke Key"}
              </TuiButton>
            </form>
            
            <form action={async () => {
              'use server';
              await db.apiUsage.deleteMany({
                where: { apiKeyId: id }
              });
            }}>
              <TuiButton type="submit" variant="destructive" size="sm">
                Clear Usage History
              </TuiButton>
            </form>
          </div>
        </TuiPanel>
      </div>
      
      <div className="mt-4">
        <TuiPanel title="Recent Usage Records" color="green">
          <div className="px-1 py-2">
            {usageRows.length > 0 ? (
              <TuiTable
                headers={["Timestamp", "Endpoint", "Status", "IP Address", "User Agent"]}
                rows={usageRows}
                keyboardNav
              />
            ) : (
              <div className="text-center py-4 text-tui-gray">
                No usage records found
              </div>
            )}
          </div>
        </TuiPanel>
      </div>
      
      <div className="mt-3 border-t border-tui-gray pt-2">
        <pre className="text-tui-gray text-xs">
    Press <span className="text-tui-cyan">Tab</span> to switch focus, <span className="text-tui-cyan">j/k</span> to navigate records
        </pre>
      </div>
    </div>
  );
} 