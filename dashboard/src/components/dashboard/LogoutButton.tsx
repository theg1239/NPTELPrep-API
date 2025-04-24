"use client";
import { signOut } from "next-auth/react";
import { TuiButton } from "@/components/tui/components";

export function LogoutButton() {
  return (
    <TuiButton
      variant="destructive"
      size="sm"
      onClick={() => signOut({ callbackUrl: "/auth/login" })}
      shortcut="q"
    >
      Log Out
    </TuiButton>
  );
}
