import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { TuiButton, TuiPanel, TuiInput, TuiAlert, TuiForm, TuiProgress } from "@/components/tui/components";

async function getUserProfile() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    return null;
  }
  
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          apiKeys: true
        }
      }
    }
  });
  
  return user;
}

export default async function SettingsPage() {
  const user = await getUserProfile();
  
  if (!user) {
    return (
      <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
        <TuiAlert
          type="error"
          message="User not found. Please log in again."
        />
      </div>
    );
  }
  
  const accountAgeInDays = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  const lastLogin = new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toLocaleDateString();
  
  async function updateName(formData: FormData) {
    "use server";
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return;
    
    const name = formData.get("name") as string;
    
    await db.user.update({
      where: { email: session.user.email },
      data: { name }
    });
    
    revalidatePath("/dashboard/settings");
  }
  
  return (
    <div className="tui-content-mobile text-tui-white pb-10 md:pb-0">
      {/* NVIM-style title bar */}
      <div className="border-b border-tui-blue text-sm mb-3 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">settings.js</span>
          <span className="text-tui-gray ml-2">[+]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>

      <TuiPanel title="Account Information" color="cyan" className="mb-3">
        <div className="grid gap-2 px-2 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-tui-gray">Email:</span>
            <span className="text-tui-white">{user.email}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-tui-gray">Account Type:</span>
            <span className="flex items-center">
              <span className="text-tui-white">{user.role}</span>
              {user.role === "ADMIN" && (
                <span className="ml-2 text-tui-yellow">[admin]</span>
              )}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-tui-gray">Member Since:</span>
            <span className="text-tui-white">
              {new Date(user.createdAt).toLocaleDateString()} ({accountAgeInDays} days)
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-tui-gray">Last Login:</span>
            <span className="text-tui-white">{lastLogin}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-tui-gray">API Keys:</span>
            <span className="text-tui-green">{user._count.apiKeys} active</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-tui-gray">Account Usage:</span>
            <div className="w-1/2">
              <TuiProgress value={35} max={100} color="blue" size="sm" />
            </div>
          </div>
        </div>
      </TuiPanel>
      
      <TuiPanel title="Update Profile" color="blue" className="mb-3">
        <div className="px-2 py-2">
          <form action={updateName} className="space-y-3">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-xs text-tui-cyan">Display Name</label>
              <input 
                type="text" 
                id="name" 
                name="name" 
                defaultValue={user.name || ""}
                className="font-mono bg-transparent text-sm border border-tui-blue p-2 focus:outline-none focus:border-tui-cyan"
                placeholder="Enter your name"
              />
            </div>
            
            <TuiButton 
              type="submit" 
              variant="primary"
              size="sm"
            >
              Save Changes
            </TuiButton>
          </form>
        </div>
      </TuiPanel>
      
      <TuiPanel title="Danger Zone" color="red" collapsible>
        <div className="px-2 py-2 space-y-2">
          <TuiAlert
            type="error"
            message="Permanently delete your account and all data. This action cannot be undone."
          />
          <TuiButton 
            variant="destructive" 
            size="sm"
            disabled
          >
            Delete Account
          </TuiButton>
        </div>
      </TuiPanel>
      
      <div className="mt-3 border-t border-tui-gray pt-2">
        <pre className="text-tui-gray text-xs">
    Press <span className="text-tui-cyan">Tab</span> to switch focus, <span className="text-tui-cyan">:</span> for command mode
        </pre>
      </div>
    </div>
  );
}
