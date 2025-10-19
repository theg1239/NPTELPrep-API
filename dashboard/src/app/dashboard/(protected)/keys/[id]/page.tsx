import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { revokeApiKey } from "@/actions/api-key";
import { TuiButton, TuiPanel, TuiAlert, TuiProgress } from "@/components/tui/components";

async function getApiKeyDetails(id: string, userId: string) {
  return await db.apiKey.findUnique({
    where: { id, userId },
    include: {
      usageRecords: {
        orderBy: { timestamp: "desc" },
        take: 10,
      },
      _count: { select: { usageRecords: true } },
    },
  });
}

export default async function ApiKeyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/login");

  const apiKey = await getApiKeyDetails(id, session.user.id);
  if (!apiKey) redirect("/dashboard/keys");

  const maskedKey =
    apiKey.key.substring(0, 8) + "..." + apiKey.key.slice(-4);
    
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayUsage = apiKey.usageRecords.filter(
    record => new Date(record.timestamp) >= today
  ).length;
  
  const usagePercentage = Math.min(100, Math.round((todayUsage / apiKey.rateLimit) * 100));

  return (
    <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
      <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">api-key-details.js</span>
          <span className="text-tui-gray ml-2">[+]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>
      
      <div className="flex items-center justify-between mb-3">
        <div className="text-tui-white text-lg font-bold">{apiKey.name}</div>
        <div className="flex gap-2">
          <TuiButton 
            href="/dashboard/keys"
            variant="secondary"
            size="sm"
          >
            Back
          </TuiButton>
          {!apiKey.isRevoked && (
            <form
              action={async () => {
                "use server";
                await revokeApiKey(id);
                redirect("/dashboard/keys");
              }}
            >
              <TuiButton
                variant="destructive"
                size="sm"
                type="submit"
              >
                Revoke Key
              </TuiButton>
            </form>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <TuiPanel title="API Key Details" color="cyan">
          <div className="px-2 py-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-tui-gray">API Key:</span>
              <span className="text-tui-white font-mono">{maskedKey}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-tui-gray">Status:</span>
              <span className={apiKey.isRevoked ? "text-tui-red" : "text-tui-green"}>
                {apiKey.isRevoked ? "REVOKED" : "ACTIVE"}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-tui-gray">Created:</span>
              <span className="text-tui-white">
                {new Date(apiKey.createdAt).toLocaleDateString()}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-tui-gray">Rate Limit:</span>
              <span className="text-tui-yellow">
                {apiKey.rateLimit} requests/day
              </span>
            </div>
            
            {apiKey.expiresAt && (
              <div className="flex justify-between">
                <span className="text-tui-gray">Expires:</span>
                <span className="text-tui-white">
                  {new Date(apiKey.expiresAt).toLocaleDateString()}
                </span>
              </div>
            )}
            
            {apiKey.lastUsedAt && (
              <div className="flex justify-between">
                <span className="text-tui-gray">Last Used:</span>
                <span className="text-tui-white">
                  {new Date(apiKey.lastUsedAt).toLocaleDateString()}
                </span>
              </div>
            )}
            
            <div className="flex justify-between">
              <span className="text-tui-gray">Today's Usage:</span>
              <div className="w-1/2">
                <TuiProgress 
                  value={usagePercentage} 
                  max={100} 
                  color={usagePercentage > 80 ? "red" : usagePercentage > 50 ? "yellow" : "green"}
                  size="sm"
                />
              </div>
            </div>
          </div>
        </TuiPanel>
        
        <TuiPanel title="Usage Statistics" color="green">
          <div className="px-2 py-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-tui-gray">Total Requests:</span>
              <span className="text-tui-cyan font-bold">{apiKey._count.usageRecords}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-tui-gray">Today's Requests:</span>
              <span className="text-tui-yellow">{todayUsage} / {apiKey.rateLimit}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-tui-gray">Remaining:</span>
              <span className="text-tui-green">{Math.max(0, apiKey.rateLimit - todayUsage)}</span>
            </div>
            
            <div className="mt-2">
              <div className="border-b border-tui-gray pb-1 text-tui-gray">Recent Activity</div>
              
              {apiKey.usageRecords.length > 0 ? (
                <table className="w-full text-xs mt-1">
                  <thead>
                    <tr className="border-b border-tui-gray">
                      <th className="px-2 py-1 text-left text-tui-blue">Endpoint</th>
                      <th className="px-2 py-1 text-right text-tui-blue">Time</th>
                      <th className="px-2 py-1 text-right text-tui-blue">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKey.usageRecords.slice(0, 5).map((record) => (
                      <tr key={record.id} className="border-b border-gray-800">
                        <td className="px-2 py-1 text-tui-cyan font-mono truncate max-w-[120px]">
                          {record.endpoint}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {new Date(record.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <span className={record.success ? "text-tui-green" : "text-tui-red"}>
                            {record.success ? "SUCCESS" : "FAILED"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-tui-gray text-center py-2">
                  No activity recorded yet.
                </div>
              )}
            </div>
          </div>
        </TuiPanel>
      </div>
      
      <TuiPanel title="Usage Instructions" color="blue" collapsible>
        <div className="px-2 py-2 space-y-2 text-sm">
          <div>
            <div className="text-xs text-tui-gray mb-1">Authentication Header</div>
            <pre className="bg-black border border-tui-gray px-2 py-1 text-xs font-mono overflow-x-auto">
              Authorization: Bearer {apiKey.key}
            </pre>
          </div>
          
          <div>
            <div className="text-xs text-tui-gray mb-1">Example Request</div>
            <pre className="bg-black border border-tui-gray px-2 py-1 text-xs font-mono overflow-x-auto">
{`fetch('https://nptelprep.in/api/courses', {
  headers: {
    'Authorization': 'Bearer ${apiKey.key}',
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => console.log(data));`}
            </pre>
          </div>
          
          <TuiAlert
            type="warning"
            message="Never share your API key in public repositories or client-side code."
            className="mt-2"
          />
        </div>
      </TuiPanel>
      
      <div className="mt-3 border-t border-tui-gray pt-2">
        <pre className="text-tui-gray text-xs">
    Press <span className="text-tui-cyan">Tab</span> to switch focus, <span className="text-tui-cyan">:</span> for command mode, <span className="text-tui-cyan">b</span> to go back
        </pre>
      </div>
    </div>
  );
}
