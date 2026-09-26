"use client";

import { ReactNode, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) {
    return null;
  }

  return (
    <div className="admin-shell">
      <AppSidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        role={user.role}
      />
      <div className="admin-shell__workspace">
        <AppHeader user={user} onMenu={() => setMenuOpen(true)} />
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
