import type { ReactNode } from "react";

import { PosLockProvider } from "../../components/pos/PosLockProvider";

export default function PosLayout({ children }: { children: ReactNode }) {
  return <PosLockProvider>{children}</PosLockProvider>;
}
