import type { ReactNode } from "react";

import { RequireAuth } from "../../components/auth/RequireAuth";
import { PosLockProvider } from "../../components/pos/PosLockProvider";

export default function PosLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <PosLockProvider>{children}</PosLockProvider>
    </RequireAuth>
  );
}
