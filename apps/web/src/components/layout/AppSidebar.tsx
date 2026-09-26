"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { UserRole } from "../auth/AuthProvider";

type NavigationItem = {
  href: string;
  label: string;
  icon: string;
  roles: readonly UserRole[];
};

const leadership: readonly UserRole[] = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "MANAGER",
];

const reporting: readonly UserRole[] = [
  ...leadership,
  "ACCOUNTANT",
  "REPORT_VIEWER",
];

const navigation: readonly NavigationItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "grid", roles: reporting },
  { href: "/admin/sales", label: "Sales", icon: "cart", roles: reporting },
  {
    href: "/admin/products",
    label: "Products",
    icon: "grid",
    roles: [...leadership, "INVENTORY_MANAGER"],
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    icon: "chart",
    roles: [
      ...leadership,
      "PHARMACIST",
      "INVENTORY_MANAGER",
      "PROCUREMENT_OFFICER",
      "REPORT_VIEWER",
    ],
  },
  {
    href: "/admin/customers",
    label: "Customers",
    icon: "people",
    roles: [...leadership, "PHARMACIST", "ECOMMERCE_MANAGER"],
  },
  { href: "/admin/payments", label: "Payments", icon: "chart", roles: reporting },
  { href: "/admin/returns", label: "Returns & Voids", icon: "cart", roles: leadership },
  {
    href: "/admin/cash",
    label: "Cash Control",
    icon: "chart",
    roles: [...leadership, "ACCOUNTANT"],
  },
  { href: "/admin/shifts", label: "Shifts", icon: "moon", roles: leadership },
  { href: "/admin/end-of-day", label: "End of day", icon: "moon", roles: leadership },
  { href: "/admin/reports", label: "Reports", icon: "chart", roles: reporting },
  {
    href: "/admin/users",
    label: "Users",
    icon: "people",
    roles: ["SUPER_ADMIN", "TENANT_ADMIN"],
  },
  {
    href: "/admin/branches",
    label: "Branches",
    icon: "grid",
    roles: ["SUPER_ADMIN", "TENANT_ADMIN"],
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: "grid",
    roles: ["SUPER_ADMIN", "TENANT_ADMIN"],
  },
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    cart: <><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.8a2 2 0 0 0 1.9-1.4L21 8H7" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.7-3.2 2.5-5 5.5-5s4.8 1.8 5.5 5" /><circle cx="17" cy="9" r="2.3" /><path d="M16 14c2.7 0 4.2 1.6 4.7 4" /></>,
    chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
    moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

export function AppSidebar({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: UserRole;
}) {
  const pathname = usePathname();
  const visibleItems = navigation.filter(
    (item) => item.roles.includes(role),
  );

  return (
    <>
      <button
        className={`shell-scrim ${open ? "shell-scrim--visible" : ""}`}
        onClick={onClose}
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
      />
      <aside className={`app-sidebar ${open ? "app-sidebar--open" : ""}`}>
        <div className="app-sidebar__brand">
          <Image
            src="/branding/wellbloom-logo-light.svg"
            alt="Wellbloom"
            width={150}
            height={50}
            className="sidebar-brand-logo"
          />
          <small>Management Console</small>
        </div>

        <nav className="app-nav" aria-label="Primary navigation">
          <span className="app-nav__label">Management</span>
          {visibleItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-nav__item ${active ? "app-nav__item--active" : ""}`}
                onClick={onClose}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar__footer">
          <div className="system-status"><span />Local system online</div>
          <small>Version 1.0 · Secure workspace</small>
        </div>
      </aside>
    </>
  );
}
