import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { getAdminApiUsage } from "@/actions/usage";
import { TuiPanel, TuiButton, TuiTable, TuiStat, TuiProgress } from "@/components/tui/components";

// Define a user type that matches the structure we need
type UserWithApiKeys = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: Date;
  apiKeys: Array<{
    id: string;
    name: string;
    createdAt: Date;
    isRevoked: boolean;
    rateLimit: number;
    _count: {
      usageRecords: number;
    };
  }>;
};

// Admin-only server action to get all users with their API keys
async function getAllUsers() {
  const users = await db.user.findMany({
    include: {
      apiKeys: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          isRevoked: true,
          rateLimit: true,
          _count: {
            select: {
              usageRecords: true
            }
          }
        }
      },
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  return users;
}

// Admin-only server action to get API usage stats
async function getApiUsageStats() {
  const totalApiKeys = await db.apiKey.count();
  const activeApiKeys = await db.apiKey.count({
    where: { isRevoked: false }
  });
  const totalRequests = await db.apiUsage.count();
  
  // Get requests per day for the last 7 days
  const last7Days = new Date();
  last7Days.setDate(last7Days.getDate() - 7);
  
  const dailyStats = await db.apiUsage.groupBy({
    by: ['timestamp'],
    _count: {
      id: true
    },
    where: {
      timestamp: {
        gte: last7Days
      }
    },
    orderBy: {
      timestamp: 'asc'
    }
  });
  
  return {
    totalApiKeys,
    activeApiKeys,
    totalRequests,
    dailyStats
  };
}

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);
  
  // Check if user is admin
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  
  const users = await getAllUsers();
  const stats = await getApiUsageStats();

  // Create table rows for users
  const userRows = users.map((user: UserWithApiKeys) => [
    user.name || 'No name',
    user.email || 'No email',
    new Date(user.createdAt).toLocaleDateString(),
    `${user.apiKeys.length} keys`,
    <Link key={user.id} href={`/dashboard/admin/users/${user.id}`}>
      <TuiButton variant="secondary" size="sm">
        View
      </TuiButton>
    </Link>
  ]);
  
  return (
    <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
      {/* NVIM-style title bar */}
      <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">admin.js</span>
          <span className="text-tui-magenta ml-2">[admin]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>
      
      <pre className="text-tui-yellow mb-6 text-center text-xs leading-tight">
{`
 █████╗ ██████╗ ███╗   ███╗██╗███╗   ██╗    ██████╗  █████╗ ███╗   ██╗███████╗██╗     
██╔══██╗██╔══██╗████╗ ████║██║████╗  ██║    ██╔══██╗██╔══██╗████╗  ██║██╔════╝██║     
███████║██║  ██║██╔████╔██║██║██╔██╗ ██║    ██████╔╝███████║██╔██╗ ██║█████╗  ██║     
██╔══██║██║  ██║██║╚██╔╝██║██║██║╚██╗██║    ██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║     
██║  ██║██████╔╝██║ ╚═╝ ██║██║██║ ╚████║    ██║     ██║  ██║██║ ╚████║███████╗███████╗
╚═╝  ╚═╝╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝    ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝
`}
      </pre>
            
      <TuiPanel title="System Statistics" color="cyan">
        <div className="px-4 py-3 flex flex-wrap justify-between">
          <div className="mb-3 mr-6">
            <TuiStat 
              value={users.length} 
              label="Total Users" 
              color="cyan"
              size="md"
            />
          </div>
          <div className="mb-3 mr-6">
            <TuiStat 
              value={stats.totalApiKeys} 
              label={`API Keys (${stats.activeApiKeys} active)`} 
              color="green"
              size="md"
            />
          </div>
          <div className="mb-3 mr-6">
            <TuiStat 
              value={stats.totalRequests} 
              label="Total Requests" 
              color="blue"
              size="md"
            />
          </div>
          <div className="mb-3">
            <TuiStat 
              value="Healthy" 
              label="System Status" 
              color="green"
              size="md"
            />
          </div>
        </div>
      </TuiPanel>
      
      <div className="mt-4">
        <TuiPanel title="User Management" color="yellow">
          <div className="px-1 py-2">
            <TuiTable
              headers={["User", "Email", "Joined", "API Keys", "Actions"]}
              rows={userRows}
              keyboardNav
            />
          </div>
        </TuiPanel>
      </div>
      
      <div className="mt-3 border-t border-tui-gray pt-2">
        <pre className="text-tui-gray text-xs">
    Press <span className="text-tui-cyan">Tab</span> to switch focus, <span className="text-tui-cyan">j/k</span> to navigate table
        </pre>
      </div>
    </div>
  );
}