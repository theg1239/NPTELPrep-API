import { getUserApiKeys } from "@/actions/api-key";
import { getUserApiUsage } from "@/actions/usage";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { TuiButton, TuiPanel, TuiTable, TuiProgress } from "@/components/tui/components";
import { db } from "@/lib/db";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const apiKeys = await getUserApiKeys();
  const usageData = await getUserApiUsage();
  
  const user = session?.user?.email ? await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      _count: {
        select: {
          apiKeys: true
        }
      }
    }
  }) : null;
  
  const activeKeys = apiKeys.filter(key => !key.isRevoked);
  const totalDailyQuota = activeKeys.reduce((sum, key) => sum + key.rateLimit, 0);
  
  const today = new Date().toISOString().split('T')[0];
  const todayUsage = usageData.dailyUsage.find(day => day.date === today)?.count || 0;
  const remainingQuota = Math.max(0, totalDailyQuota - todayUsage);
  const usagePercentage = totalDailyQuota > 0 ? Math.round((todayUsage / totalDailyQuota) * 100) : 0;

  const keyRows = apiKeys.slice(0, 3).map(key => [
    <span key={`name-${key.id}`} className="text-tui-cyan">{key.name}</span>,
    <span key={`created-${key.id}`}>{new Date(key.createdAt).toLocaleDateString()}</span>,
    <span key={`status-${key.id}`} className={key.isRevoked ? "text-tui-red" : "text-tui-green"}>
      {key.isRevoked ? "REVOKED" : "ACTIVE"}
    </span>,
    <TuiButton 
      key={`actions-${key.id}`}
      href={`/dashboard/keys/${key.id}`}
      variant="secondary"
      size="sm"
    >
      View
    </TuiButton>
  ]);

  return (
    <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
      <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">dashboard.js</span>
          <span className="text-tui-gray ml-2">[+]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>
      
      {/* <pre className="text-tui-green mb-3 text-center leading-tight text-xs">
        {ASCII_LOGO}
      </pre> */}
      
      <div className="flex justify-right mb-4">
        <pre className="inline-block text-tui-white px-3 py-1 text-sm">
          Welcome back, {session?.user?.name || "User"}
        </pre>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <TuiPanel title="System Status" color="cyan" collapsible>
          <div className="space-y-2 px-2 py-2 text-sm">
            <div className="flex justify-between">
              <span>API Status:</span>
              <span className="text-tui-green">[ONLINE]</span>
            </div>
            <div className="flex justify-between">
              <span>Server Load:</span>
              <TuiProgress value={Math.floor(Math.random() * 30)} max={100} color="blue" size="sm" />
            </div>
            <div className="flex justify-between">
              <span>Database:</span>
              <span className="text-tui-green">[CONNECTED]</span>
            </div>
            <div className="flex justify-between">
              <span>Success Rate:</span>
              <TuiProgress 
                value={parseInt(usageData.successRate.replace('%', ''), 10)} 
                max={100} 
                color="magenta" 
                size="sm" 
              />
            </div>
          </div>
        </TuiPanel>
        
        <TuiPanel title="Usage Overview" color="green" collapsible>
          <div className="space-y-2 px-2 py-2 text-sm">
            <div className="flex justify-between">
              <span>Total Requests:</span>
              <span className="text-tui-cyan">{usageData.totalRequests.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Today's Usage:</span>
              <span className="text-tui-yellow">{todayUsage.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Daily Quota:</span>
              <span className="text-tui-green">{remainingQuota.toLocaleString()} / {totalDailyQuota.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Usage:</span>
              <TuiProgress value={usagePercentage} max={100} color="yellow" size="sm" />
            </div>
          </div>
        </TuiPanel>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <TuiPanel title="Recent API Keys" color="blue">
          <div className="px-1 py-2">
            {apiKeys.length > 0 ? (
              <>
                <TuiTable
                  headers={["Name", "Created", "Status", "Actions"]}
                  rows={keyRows}
                  keyboardNav
                />
                {/* <div className="flex justify-end mt-2">
                  <TuiButton 
                    href="/dashboard/keys" 
                    variant="primary"
                    shortcut="k"
                    size="sm"
                  >
                    View All Keys
                  </TuiButton>
                  <TuiButton 
                    href="/dashboard/keys/new" 
                    variant="success"
                    className="ml-2"
                    size="sm"
                  >
                    New Key
                  </TuiButton>
                </div> */}
              </>
            ) : (
              <div className="border border-tui-blue p-3 text-center">
                <p className="text-tui-gray text-sm">No API keys found</p>
                <TuiButton 
                  href="/dashboard/keys/new" 
                  variant="success"
                  className="mt-2"
                  size="sm"
                >
                  Create Your First API Key
                </TuiButton>
              </div>
            )}
          </div>
        </TuiPanel>
        
        <TuiPanel title="Top Endpoints" color="yellow">
          <div className="px-1 py-2">
            {usageData.topEndpoints.length > 0 ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-tui-gray">
                    <th className="px-2 py-1 text-left text-tui-yellow">Endpoint</th>
                    <th className="px-2 py-1 text-right text-tui-yellow">Requests</th>
                    <th className="px-2 py-1 text-left text-tui-yellow">Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {usageData.topEndpoints.map((endpoint, i) => {
                    const percentage = Math.round((endpoint.count / usageData.totalRequests) * 100) || 0;
                    return (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="px-2 py-1 text-tui-cyan">{endpoint.name}</td>
                        <td className="px-2 py-1 text-right">{endpoint.count}</td>
                        <td className="px-2 py-1">
                          <div className="flex items-center">
                            <div className="w-12 bg-tui-black mr-2">
                              <div 
                                className="bg-tui-blue h-1" 
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            <span>{percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-tui-gray text-center py-2 text-sm">
                No endpoint data available yet.
              </div>
            )}
            {/* <div className="flex justify-end mt-2">
              <TuiButton 
                href="/dashboard/usage" 
                variant="primary"
                shortcut="u"
                size="sm"
              >
                View All Usage
              </TuiButton>
            </div> */}
          </div>
        </TuiPanel>
      </div>
      
      <div className="mt-3 border-t border-tui-gray pt-2">
        <pre className="text-tui-gray text-xs">
    Press <span className="text-tui-cyan">Tab</span> to switch focus, <span className="text-tui-cyan">:</span> for command mode, <span className="text-tui-cyan">?</span> for help
        </pre>
      </div>
    </div>
  );
}