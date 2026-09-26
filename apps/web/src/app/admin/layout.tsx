import type { ReactNode } from "react";
import { RequireAuth } from "../../components/auth/RequireAuth";
import { AdminShell } from "../../components/layout/AdminShell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AdminShell>
        {children}
      </AdminShell>
    </RequireAuth>
  );
}
