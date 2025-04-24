import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { TuiPanel, TuiButton, TuiTable, TuiAlert } from "@/components/tui/components";
import { formatDistanceToNow } from "date-fns";

async function getAllApiKeys() {
  return db.apiKey.findMany({
    select: {
      id: true,
      name: true,
      isRevoked: true,
      createdAt: true,
      lastUsedAt: true,
      rateLimit: true,
      user: {
        select: {
          id: true,
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
      createdAt: 'desc'
    }
  });
}

export default async function AdminApiKeysPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  
  const apiKeys = await getAllApiKeys();
  
  const apiKeyRows = apiKeys.map(key => [
    <Link key={`name-${key.id}`} href={`/dashboard/admin/api-keys/${key.id}`}>
      <span className="text-tui-cyan hover:underline cursor-pointer">{key.name}</span>
    </Link>,
    <Link key={`user-${key.id}`} href={`/dashboard/admin/users/${key.user.id}`}>
      <span className="text-tui-yellow hover:underline cursor-pointer">
        {key.user.name || 'No name'} ({key.user.email})
      </span>
    </Link>,
    key.isRevoked ? 
      <span key={`status-${key.id}`} className="text-tui-red">Revoked</span> : 
      <span key={`status-${key.id}`} className="text-tui-green">Active</span>,
    key._count.usageRecords.toString(),
    formatDistanceToNow(new Date(key.createdAt), { addSuffix: true }),
    key.lastUsedAt ? 
      formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true }) : 
      'Never',
    <Link key={`view-${key.id}`} href={`/dashboard/admin/api-keys/${key.id}`}>
      <TuiButton variant="secondary" size="sm">View</TuiButton>
    </Link>
  ]);
  
  return (
    <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
      <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">admin-api-keys.js</span>
          <span className="text-tui-magenta ml-2">[admin]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>
      
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-tui-cyan text-lg font-mono">API Keys Management</h2>
        <Link href="/dashboard/admin">
          <TuiButton variant="secondary" size="sm">
            Back to Admin
          </TuiButton>
        </Link>
      </div>
      
      <TuiPanel title="All API Keys" color="cyan">
        <div className="px-1 py-2">
          {apiKeyRows.length > 0 ? (
            <TuiTable
              headers={["Name", "Owner", "Status", "Usage Count", "Created", "Last Used", "Actions"]}
              rows={apiKeyRows}
              keyboardNav
            />
          ) : (
            <div className="text-center py-4 text-tui-gray">
              No API keys found
            </div>
          )}
        </div>
      </TuiPanel>
      
      <div className="mt-3 border-t border-tui-gray pt-2">
        <pre className="text-tui-gray text-xs">
    Press <span className="text-tui-cyan">Tab</span> to switch focus, <span className="text-tui-cyan">j/k</span> to navigate keys
        </pre>
      </div>
    </div>
  );
} 