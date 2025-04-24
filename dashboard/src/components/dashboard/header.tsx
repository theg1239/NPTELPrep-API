import { db } from "@/lib/db";
import { cache } from "react";
import { LogoutButton } from "@/components/dashboard/LogoutButton";

interface HeaderProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | undefined;
}

const getUserData = cache(async (userId: string) => {
  if (!userId) return null;
  
  return await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true
    }
  });
});

export async function Header({ user }: HeaderProps) {
  const freshUserData = user?.id ? await getUserData(user.id) : null;
  
  return (
    <header className="sticky top-0 z-20 bg-black border-b border-tui-blue">
      <div className="px-3 md:px-4">
        <div className="flex h-12 md:h-14 items-center justify-between">
          <div className="flex items-center">
            <span className="text-lg font-mono font-bold text-tui-green md:hidden">NPTEL API</span>
          </div>
          
          <div className="ml-4 flex items-center md:ml-6 gap-3">
            <div className="border border-tui-cyan bg-black/50 px-3 py-1 rounded-none text-tui-cyan text-xs font-mono">
              {freshUserData?.name || user?.name || user?.email || "User"} 
              {freshUserData?.role === "ADMIN" && (<span className="ml-2 text-tui-yellow">[admin]</span>)}
            </div>
            <LogoutButton />
          </div>
        </div>
      </div>
    </header>
  );
}