import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import TuiShell from "@/components/tui/TuiShell";

const PUBLIC_DASHBOARD_PATHS = new Set([
  "/dashboard/changes",
]);

const normalizePath = (value: string): string => {
  if (value.length > 1 && value.endsWith("/")) {
    return value.slice(0, -1);
  }
  return value;
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionGuard>
      <TuiShell>{children}</TuiShell>
    </SessionGuard>
  );
}

async function SessionGuard({ children }: { children: React.ReactNode }) {
  const headerList = headers();
  let requestedPath = headerList.get("x-invoke-path") ?? "";
  if (!requestedPath) {
    const middlewareUrl = headerList.get("x-middleware-request-url");
    if (middlewareUrl) {
      try {
        requestedPath = new URL(middlewareUrl).pathname;
      } catch {
        requestedPath = "";
      }
    }
  }

  requestedPath = normalizePath(requestedPath || "/dashboard");

  if (!PUBLIC_DASHBOARD_PATHS.has(requestedPath)) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      redirect("/auth/login");
    }
  }

  return <>{children}</>;
}
