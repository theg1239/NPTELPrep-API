  // import { getServerSession } from "next-auth/next";
  // import { authOptions } from "@/auth";
  // import { redirect } from "next/navigation";
  // import { db } from "@/lib/db";
  // import { TuiPanel, TuiInput, TuiButton, TuiSwitch, TuiAlert } from "@/components/tui/components";
  // import { useState } from "react";
  // import Link from "next/link";

  // async function getSystemSettings() {
  //   return {
  //     rateLimit: {
  //       defaultLimit: 100,
  //       maxLimit: 1000,
  //       enabled: true
  //     },
  //     security: {
  //       requireEmail: true,
  //       maxFailedLogins: 5,
  //       lockoutDuration: 30 
  //     },
  //     features: {
  //       registrationEnabled: true,
  //       apiKeyExpirationEnabled: true,
  //       usageTrackingEnabled: true
  //     },
  //     maintenance: {
  //       maintenanceMode: false,
  //       maintenanceMessage: "System is undergoing scheduled maintenance. Please try again later."
  //     }
  //   };
  // }

  // async function getSystemStatus() {
  //   const userCount = await db.user.count();
  //   const apiKeyCount = await db.apiKey.count();
  //   const usageCount = await db.apiUsage.count();
    
  //   const dbSizeEstimate = (
  //     userCount * 2 + // ~2KB per user
  //     apiKeyCount * 1 + // ~1KB per API key
  //     usageCount * 0.2 // ~0.2KB per usage record
  //   ) / 1024; // Convert to MB
    
  //   return {
  //     database: {
  //       userCount,
  //       apiKeyCount,
  //       usageCount,
  //       dbSizeEstimate: dbSizeEstimate.toFixed(2)
  //     },
  //     system: {
  //       nodeVersion: process.version,
  //       uptime: Math.floor(process.uptime() / 3600),
  //       environment: process.env.NODE_ENV || 'development'
  //     }
  //   };
  // }

  // export default async function AdminSettingsPage() {
  //   const session = await getServerSession(authOptions);
    
  //   if (!session || session.user.role !== "ADMIN") {
  //     redirect("/dashboard");
  //   }
    
  //   const settings = await getSystemSettings();
  //   const systemStatus = await getSystemStatus();
    
  //   return (
  //     <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
  //       <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
  //         <div className="flex items-center">
  //           <span className="text-tui-blue mr-2">NORMAL</span>
  //           <span className="text-tui-white">admin-settings.js</span>
  //           <span className="text-tui-magenta ml-2">[admin]</span>
  //         </div>
  //         <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
  //       </div>
        
  //       <div className="flex justify-between items-center mb-4">
  //         <h2 className="text-tui-cyan text-lg font-mono">System Settings</h2>
  //         <Link href="/dashboard/admin">
  //           <TuiButton variant="secondary" size="sm">
  //             Back to Admin
  //           </TuiButton>
  //         </Link>
  //       </div>
        
  //       <TuiPanel title="System Information" color="cyan">
  //         <div className="px-4 py-3 space-y-2">
  //           <div className="flex justify-between">
  //             <span className="text-tui-gray">Node.js Version:</span>
  //             <span className="text-tui-white">{systemStatus.system.nodeVersion}</span>
  //           </div>
  //           <div className="flex justify-between">
  //             <span className="text-tui-gray">Environment:</span>
  //             <span className="text-tui-white">{systemStatus.system.environment}</span>
  //           </div>
  //           <div className="flex justify-between">
  //             <span className="text-tui-gray">Uptime:</span>
  //             <span className="text-tui-white">{systemStatus.system.uptime} hours</span>
  //           </div>
  //           <div className="flex justify-between">
  //             <span className="text-tui-gray">Database Size:</span>
  //             <span className="text-tui-white">~{systemStatus.database.dbSizeEstimate} MB</span>
  //           </div>
  //           <div className="flex justify-between">
  //             <span className="text-tui-gray">Total Users:</span>
  //             <span className="text-tui-white">{systemStatus.database.userCount}</span>
  //           </div>
  //           <div className="flex justify-between">
  //             <span className="text-tui-gray">Total API Keys:</span>
  //             <span className="text-tui-white">{systemStatus.database.apiKeyCount}</span>
  //           </div>
  //           <div className="flex justify-between">
  //             <span className="text-tui-gray">Total Usage Records:</span>
  //             <span className="text-tui-white">{systemStatus.database.usageCount}</span>
  //           </div>
  //         </div>
  //       </TuiPanel>
        
  //       <div className="mt-4">
  //         <RateLimitSettingsWrapper initialSettings={settings.rateLimit} />
  //       </div>
        
  //       <div className="mt-4">
  //         <SecuritySettingsWrapper initialSettings={settings.security} />
  //       </div>
        
  //       <div className="mt-4">
  //         <FeatureSettingsWrapper initialSettings={settings.features} />
  //       </div>
        
  //       <div className="mt-4">
  //         <MaintenanceSettingsWrapper initialSettings={settings.maintenance} />
  //       </div>
        
  //       <div className="mt-4">
  //         <TuiPanel title="System Actions" color="red">
  //           <div className="px-4 py-3 flex flex-wrap gap-2">
  //             <form action={async () => {
  //               'use server';
  //               // todo
  //             }}>
  //               <TuiButton type="submit" variant="destructive" size="sm">
  //                 Flush Cache
  //               </TuiButton>
  //             </form>
              
  //             <form action={async () => {
  //               'use server';
  //               // todo
  //             }}>
  //               <TuiButton type="submit" variant="destructive" size="sm">
  //                 Prune Old Logs
  //               </TuiButton>
  //             </form>
              
  //             <form action={async () => {
  //               'use server';
  //               // todo
  //             }}>
  //               <TuiButton type="submit" variant="destructive" size="sm">
  //                 Reset Rate Limits
  //               </TuiButton>
  //             </form>
  //           </div>
  //         </TuiPanel>
  //       </div>
        
  //       <div className="mt-3 border-t border-tui-gray pt-2">
  //         <pre className="text-tui-gray text-xs">
  //     Press <span className="text-tui-cyan">Tab</span> to switch focus, <span className="text-tui-cyan">:save</span> to save settings
  //         </pre>
  //       </div>
  //     </div>
  //   );
  // }

  // function RateLimitSettingsWrapper({ initialSettings }: { initialSettings: any }) {
  //   return <RateLimitSettings initialSettings={initialSettings} />;
  // }

  // function SecuritySettingsWrapper({ initialSettings }: { initialSettings: any }) {
  //   return <SecuritySettings initialSettings={initialSettings} />;
  // }

  // function FeatureSettingsWrapper({ initialSettings }: { initialSettings: any }) {
  //   return <FeatureSettings initialSettings={initialSettings} />;
  // }

  // function MaintenanceSettingsWrapper({ initialSettings }: { initialSettings: any }) {
  //   return <MaintenanceSettings initialSettings={initialSettings} />;
  // }

  // "use client";

  // function RateLimitSettings({ initialSettings }: { initialSettings: any }) {
  //   const [settings, setSettings] = useState(initialSettings);
  //   const [status, setStatus] = useState<{ type: 'success' | 'error' | 'none', message: string }>({ type: 'none', message: '' });
    
  //   const handleSave = async () => {
  //     try {
  //       setStatus({ type: 'success', message: 'Rate limit settings saved successfully' });
  //       setTimeout(() => setStatus({ type: 'none', message: '' }), 3000);
  //     } catch (error) {
  //       setStatus({ type: 'error', message: 'Failed to save settings' });
  //     }
  //   };
    
  //   return (
  //     <TuiPanel title="Rate Limiting" color="green">
  //       <div className="px-4 py-3 space-y-3">
  //         {status.type !== 'none' && (
  //           <TuiAlert 
  //             type={status.type} 
  //             message={status.message} 
  //             onClose={() => setStatus({ type: 'none', message: '' })}
  //           />
  //         )}
          
  //         <div className="flex items-center justify-between">
  //           <label className="text-tui-white text-sm">Rate Limiting Enabled:</label>
  //           <TuiSwitch
  //             checked={settings.enabled}
  //             onChange={(checked) => setSettings({ ...settings, enabled: checked })}
  //           />
  //         </div>
          
  //         <div className="space-y-1">
  //           <label className="text-tui-white text-sm">Default Rate Limit (per day):</label>
  //           <TuiInput
  //             value={settings.defaultLimit.toString()}
  //             onChange={(value) => setSettings({ ...settings, defaultLimit: parseInt(value) || 0 })}
  //             type="number"
  //           />
  //         </div>
          
  //         <div className="space-y-1">
  //           <label className="text-tui-white text-sm">Maximum Rate Limit (per day):</label>
  //           <TuiInput
  //             value={settings.maxLimit.toString()}
  //             onChange={(value) => setSettings({ ...settings, maxLimit: parseInt(value) || 0 })}
  //             type="number"
  //           />
  //         </div>
          
  //         <div className="flex justify-end">
  //           <TuiButton onClick={handleSave} variant="primary" size="sm">
  //             Save Rate Limit Settings
  //           </TuiButton>
  //         </div>
  //       </div>
  //     </TuiPanel>
  //   );
  // }

  // function SecuritySettings({ initialSettings }: { initialSettings: any }) {
  //   const [settings, setSettings] = useState(initialSettings);
  //   const [status, setStatus] = useState<{ type: 'success' | 'error' | 'none', message: string }>({ type: 'none', message: '' });
    
  //   const handleSave = async () => {
  //     try {
  //       // todo
  //       setStatus({ type: 'success', message: 'Security settings saved successfully' });
  //       setTimeout(() => setStatus({ type: 'none', message: '' }), 3000);
  //     } catch (error) {
  //       setStatus({ type: 'error', message: 'Failed to save settings' });
  //     }
  //   };
    
  //   return (
  //     <TuiPanel title="Security Settings" color="magenta">
  //       <div className="px-4 py-3 space-y-3">
  //         {status.type !== 'none' && (
  //           <TuiAlert 
  //             type={status.type} 
  //             message={status.message} 
  //             onClose={() => setStatus({ type: 'none', message: '' })}
  //           />
  //         )}
          
  //         <div className="flex items-center justify-between">
  //           <label className="text-tui-white text-sm">Require Email Verification:</label>
  //           <TuiSwitch
  //             checked={settings.requireEmail}
  //             onChange={(checked) => setSettings({ ...settings, requireEmail: checked })}
  //           />
  //         </div>
          
  //         <div className="space-y-1">
  //           <label className="text-tui-white text-sm">Max Failed Login Attempts:</label>
  //           <TuiInput
  //             value={settings.maxFailedLogins.toString()}
  //             onChange={(value) => setSettings({ ...settings, maxFailedLogins: parseInt(value) || 0 })}
  //             type="number"
  //           />
  //         </div>
          
  //         <div className="space-y-1">
  //           <label className="text-tui-white text-sm">Account Lockout Duration (minutes):</label>
  //           <TuiInput
  //             value={settings.lockoutDuration.toString()}
  //             onChange={(value) => setSettings({ ...settings, lockoutDuration: parseInt(value) || 0 })}
  //             type="number"
  //           />
  //         </div>
          
  //         <div className="flex justify-end">
  //           <TuiButton onClick={handleSave} variant="primary" size="sm">
  //             Save Security Settings
  //           </TuiButton>
  //         </div>
  //       </div>
  //     </TuiPanel>
  //   );
  // }

  // function FeatureSettings({ initialSettings }: { initialSettings: any }) {
  //   const [settings, setSettings] = useState(initialSettings);
  //   const [status, setStatus] = useState<{ type: 'success' | 'error' | 'none', message: string }>({ type: 'none', message: '' });
    
  //   const handleSave = async () => {
  //     try {
  //       // todo
  //       setStatus({ type: 'success', message: 'Feature settings saved successfully' });
  //       setTimeout(() => setStatus({ type: 'none', message: '' }), 3000);
  //     } catch (error) {
  //       setStatus({ type: 'error', message: 'Failed to save settings' });
  //     }
  //   };
    
  //   return (
  //     <TuiPanel title="Feature Toggles" color="blue">
  //       <div className="px-4 py-3 space-y-3">
  //         {status.type !== 'none' && (
  //           <TuiAlert 
  //             type={status.type} 
  //             message={status.message} 
  //             onClose={() => setStatus({ type: 'none', message: '' })}
  //           />
  //         )}
          
  //         <div className="flex items-center justify-between">
  //           <label className="text-tui-white text-sm">User Registration Enabled:</label>
  //           <TuiSwitch
  //             checked={settings.registrationEnabled}
  //             onChange={(checked) => setSettings({ ...settings, registrationEnabled: checked })}
  //           />
  //         </div>
          
  //         <div className="flex items-center justify-between">
  //           <label className="text-tui-white text-sm">API Key Expiration Enabled:</label>
  //           <TuiSwitch
  //             checked={settings.apiKeyExpirationEnabled}
  //             onChange={(checked) => setSettings({ ...settings, apiKeyExpirationEnabled: checked })}
  //           />
  //         </div>
          
  //         <div className="flex items-center justify-between">
  //           <label className="text-tui-white text-sm">Usage Tracking Enabled:</label>
  //           <TuiSwitch
  //             checked={settings.usageTrackingEnabled}
  //             onChange={(checked) => setSettings({ ...settings, usageTrackingEnabled: checked })}
  //           />
  //         </div>
          
  //         <div className="flex justify-end">
  //           <TuiButton onClick={handleSave} variant="primary" size="sm">
  //             Save Feature Settings
  //           </TuiButton>
  //         </div>
  //       </div>
  //     </TuiPanel>
  //   );
  // }

  // function MaintenanceSettings({ initialSettings }: { initialSettings: any }) {
  //   const [settings, setSettings] = useState(initialSettings);
  //   const [status, setStatus] = useState<{ type: 'success' | 'error' | 'none', message: string }>({ type: 'none', message: '' });
    
  //   const handleSave = async () => {
  //     try {
  //       // todo
  //       setStatus({ type: 'success', message: 'Maintenance settings saved successfully' });
  //       setTimeout(() => setStatus({ type: 'none', message: '' }), 3000);
  //     } catch (error) {
  //       setStatus({ type: 'error', message: 'Failed to save settings' });
  //     }
  //   };
    
  //   return (
  //     <TuiPanel title="Maintenance Mode" color="yellow">
  //       <div className="px-4 py-3 space-y-3">
  //         {status.type !== 'none' && (
  //           <TuiAlert 
  //             type={status.type} 
  //             message={status.message} 
  //             onClose={() => setStatus({ type: 'none', message: '' })}
  //           />
  //         )}
          
  //         <div className="flex items-center justify-between">
  //           <label className="text-tui-white text-sm">Maintenance Mode:</label>
  //           <TuiSwitch
  //             checked={settings.maintenanceMode}
  //             onChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
  //           />
  //         </div>
          
  //         <div className="space-y-1">
  //           <label className="text-tui-white text-sm">Maintenance Message:</label>
  //           <TuiInput
  //             value={settings.maintenanceMessage}
  //             onChange={(value) => setSettings({ ...settings, maintenanceMessage: value })}
  //           />
  //         </div>
          
  //         <div className="flex justify-end">
  //           <TuiButton 
  //             onClick={handleSave} 
  //             variant={settings.maintenanceMode ? "destructive" : "primary"} 
  //             size="sm"
  //           >
  //             {settings.maintenanceMode ? "Apply Maintenance Mode" : "Save Settings"}
  //           </TuiButton>
  //         </div>
  //       </div>
  //     </TuiPanel>
  //   );
  // } 