"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { AuthUser, useAuth } from "../auth/AuthProvider";
import { Badge } from "../ui/Badge";

export function AppHeader({ user, onMenu }: { user: AuthUser; onMenu: () => void }) {
  const router = useRouter();
  const { logout: endSession } = useAuth();
  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase();

  async function logout() {
    await endSession();
    router.replace("/login");
  }

  return (
    <header className="app-header">
      <div className="app-header__title">
        <button className="menu-button" onClick={onMenu} aria-label="Open navigation">
          <span /><span /><span />
        </button>
        <Image
          src="/branding/wellbloom-icon.svg"
          alt=""
          width={34}
          height={34}
          className="header-brand-icon"
        />
        <div>
          <h1>{user.tenant.name}</h1>
          <p>{user.branch?.name ?? "All branches"}</p>
        </div>
      </div>

      <div className="app-header__actions">
        <Badge tone="success" dot>System online</Badge>
        <button className="header-icon-button" aria-label="Notifications">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
        </button>
        <div className="user-menu">
          <span className="user-avatar">{initials || "WB"}</span>
          <span className="user-menu__copy"><strong>{user.firstName} {user.lastName}</strong><small>{user.role.replaceAll("_", " ")}</small></span>
          <button onClick={logout} title="Sign out" aria-label="Sign out">↗</button>
        </div>
      </div>
    </header>
  );
}
