import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { TuiPanel, TuiButton, TuiTable, TuiAlert, TuiProgress } from "@/components/tui/components";
import AdminActionButtons from "./AdminActionButtons";

async function getUserDetails(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      apiKeys: {
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              usageRecords: true
            }
          },
          usageRecords: {
            take: 5,
            orderBy: { timestamp: 'desc' }
          }
        }
      },
      accounts: true,
      _count: {
        select: {
          apiKeys: true
        }
      }
    }
  });
  
  return user;
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  
  const { id } = await params;
  const user = await getUserDetails(id);
  
  if (!user) {
    return (
      <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
        <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-tui-blue mr-2">NORMAL</span>
            <span className="text-tui-white">user-details.js</span>
            <span className="text-tui-magenta ml-2">[admin]</span>
          </div>
          <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
        </div>
        
        <TuiAlert
          type="error"
          message="User not found"
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
  
  const createdDate = new Date(user.createdAt);
  const accountAge = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const apiKeyRows = user.apiKeys.map(apiKey => {
    const rateUsage = apiKey.usageRecords.filter(record => {
      const recordDate = new Date(record.timestamp);
      const today = new Date();
      return recordDate.getDate() === today.getDate() && 
             recordDate.getMonth() === today.getMonth() && 
             recordDate.getFullYear() === today.getFullYear();
    }).length;
    
    const usagePercentage = (rateUsage / apiKey.rateLimit) * 100;
    
    return [
      apiKey.name,
      new Date(apiKey.createdAt).toLocaleDateString(),
      <TuiProgress 
        key={`usage-${apiKey.id}`}
        value={usagePercentage} 
        max={100} 
        color={apiKey.isRevoked ? "red" : usagePercentage > 80 ? "yellow" : "green"} 
        size="sm"
      />,
      apiKey.isRevoked ? 
        <span key={`status-${apiKey.id}`} className="text-tui-red">Revoked</span> : 
        <span key={`status-${apiKey.id}`} className="text-tui-green">Active</span>,
      apiKey._count.usageRecords,
      <AdminActionButtons 
        key={`actions-${apiKey.id}`}
        apiKeyId={apiKey.id}
        isRevoked={apiKey.isRevoked}
      />
    ];
  });
  
  return (
    <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
      <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">user-details.js</span>
          <span className="text-tui-magenta ml-2">[admin]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>
      
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-tui-cyan text-lg font-mono">User Details</h2>
        <Link href="/dashboard/admin">
          <TuiButton variant="secondary" size="sm">
            Back to Admin
          </TuiButton>
        </Link>
      </div>
      
      <TuiPanel title="User Information" color="cyan">
        <div className="px-4 py-3 space-y-2">
          <div className="flex justify-between">
            <span className="text-tui-gray">Name:</span>
            <span className="text-tui-white">{user.name || 'No name'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">Email:</span>
            <span className="text-tui-white">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">Role:</span>
            <span className={user.role === "ADMIN" ? "text-tui-magenta" : "text-tui-white"}>
              {user.role}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">Account Created:</span>
            <span className="text-tui-white">
              {createdDate.toLocaleDateString()} ({accountAge} days ago)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">OAuth Providers:</span>
            <span className="text-tui-white">
              {user.accounts.length > 0 
                ? user.accounts.map(acc => acc.provider).join(', ') 
                : 'Email/Password'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-tui-gray">API Keys:</span>
            <span className="text-tui-white">{user._count.apiKeys} total</span>
          </div>
        </div>
      </TuiPanel>
      
      <div className="mt-4">
        <TuiPanel title="API Keys" color="green">
          <div className="px-1 py-2">
            {apiKeyRows.length > 0 ? (
              <TuiTable
                headers={["Name", "Created", "Usage Today", "Status", "Total Requests", "Actions"]}
                rows={apiKeyRows}
                keyboardNav
              />
            ) : (
              <div className="text-center py-4 text-tui-gray">
                This user has no API keys
              </div>
            )}
          </div>
        </TuiPanel>
      </div>
      
      <div className="mt-4">
        <TuiPanel title="Admin Actions" color="yellow">
          <div className="px-4 py-3 flex flex-wrap gap-2">
            <form action={async () => {
              'use server';
              await db.user.update({
                where: { id: id },
                data: { role: user.role === "ADMIN" ? "USER" : "ADMIN" }
              });
            }}>
              <TuiButton type="submit" variant={user.role === "ADMIN" ? "destructive" : "success"} size="sm">
                {user.role === "ADMIN" ? "Remove Admin Role" : "Make Admin"}
              </TuiButton>
            </form>
            
            {user.role !== "ADMIN" && (
              <form action={async () => {
                'use server';
                await db.apiKey.updateMany({
                  where: { userId: id },
                  data: { isRevoked: true }
                });
              }}>
                <TuiButton type="submit" variant="destructive" size="sm">
                  Revoke All API Keys
                </TuiButton>
              </form>
            )}
          </div>
        </TuiPanel>
      </div>
      
      <div className="mt-3 border-t border-tui-gray pt-2">
        <pre className="text-tui-gray text-xs">
    Press <span className="text-tui-cyan">Tab</span> to switch focus, <span className="text-tui-cyan">b</span> to go back
        </pre>
      </div>
    </div>
  );
} 