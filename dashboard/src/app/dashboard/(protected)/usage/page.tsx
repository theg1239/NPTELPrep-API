import { getUserApiUsage } from "@/actions/usage";
import { TuiButton, TuiPanel, TuiProgress, TuiStat } from "@/components/tui/components";

export default async function UsagePage() {
  const usageData = await getUserApiUsage();

  const countsByDate: Record<string, number> = {};
  usageData.dailyUsage.forEach(({ date, count }) => {
    const dayKey = new Date(date).toISOString().slice(0, 10);
    countsByDate[dayKey] = (countsByDate[dayKey] || 0) + count;
  });

  const today = new Date();
  const last7Days = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - idx));
    return d.toISOString().slice(0, 10);
  });

  const dailyUsage = last7Days.map(date => ({
    date,
    count: countsByDate[date] || 0
  }));

  const maxDailyCount = Math.max(...dailyUsage.map(d => d.count), 1);

  const generateBarChart = (value: number, max: number, width = 20) => {
    const barLength = Math.round((value / max) * width);
    return `[${"█".repeat(barLength)}${" ".repeat(width - barLength)}] ${value}`;
  };

  return (
    <div className="tui-content-mobile text-tui-white pb-12 md:pb-0">
      <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">usage-stats.js</span>
          <span className="text-tui-gray ml-2">[+]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>
      
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-tui-magenta text-lg font-bold">API Usage Statistics</h1>
      </div>
      
      <TuiPanel title="Usage Overview" color="blue">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
          <TuiStat 
            value={usageData.totalRequests.toLocaleString()}
            label="Total API Requests"
            icon="📊"
            color="cyan"
            size="lg"
          />
          
          <TuiStat 
            value={`${usageData.successRate}%`}
            label="Success Rate"
            icon="✓"
            color="green"
            size="lg"
            showBar={true}
            barValue={Number(usageData.successRate)}
            barMax={100}
          />
          
          <TuiStat 
            value={usageData.errors.toLocaleString()}
            label="Failed Requests"
            icon="❌"
            color="red"
            size="lg"
          />
        </div>
      </TuiPanel>
      
      <TuiPanel title="Daily Usage (Last 7 Days)" color="blue">
        <div className="px-3 py-3">
          {dailyUsage.length > 0 ? (
            <pre className="text-tui-white text-xs whitespace-pre font-mono">
              {dailyUsage.map(day =>
                `${new Date(day.date)
                  .toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                  .padEnd(16)} ${generateBarChart(day.count, maxDailyCount)}\n`
              ).join("")}
            </pre>
          ) : (
            <div className="text-tui-gray text-center py-4">
              No usage data available yet.
            </div>
          )}
        </div>
      </TuiPanel>
      
      <TuiPanel title="Top Endpoints" color="yellow">
        <div className="px-3 py-3">
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
                          <div className="w-24 bg-tui-black mr-2">
                            <div
                              className="bg-tui-blue h-1.5"
                              style={{ width: `${percentage}%` }}
                            />
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
            <div className="text-tui-gray text-center py-4">
              No endpoint data available yet.
            </div>
          )}
        </div>
      </TuiPanel>
      
      <div className="flex justify-end space-x-3 mt-3 mb-3">
        <TuiButton variant="secondary" disabled>
          Export Data
        </TuiButton>
        <TuiButton variant="primary" disabled>
          View Logs
        </TuiButton>
      </div>
      
      <div className="mt-3 border-t border-tui-gray pt-2">
        <pre className="text-tui-gray text-xs">
          Press <span className="text-tui-cyan">j/k</span> to scroll, <span className="text-tui-cyan">Tab</span> to switch focus
        </pre>
      </div>
    </div>
  );
}
