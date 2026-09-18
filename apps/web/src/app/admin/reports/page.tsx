"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  clearSession,
  getSession,
} from "../../../lib/auth";

type Dashboard = {
  summary: {
    grossSales: string;
    discounts: string;
    netSales: string;
    completedTransactions: number;
    averageTransaction: string;
    returns: string;
    returnCount: number;
    voidedSales: string;
    voidCount: number;
    cashVariance: string;
    customerLinkedSales: number;
    walkInSales: number;
  };
  payments: {
    cash: string;
    mpesa: string;
    card: string;
    bank: string;
    insurance: string;
    other: string;
  };
  shifts: {
    total: number;
    open: number;
    closed: number;
  };
  cashierSales: {
    cashierId: string;
    name: string;
    transactions: number;
    sales: string;
  }[];
  topProducts: {
    productId: string;
    name: string;
    quantity: string;
    revenue: string;
  }[];
};

function money(value: string | number) {
  return Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ReportsPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const session = getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      try {
        const response = await fetch(
          "http://localhost:3001/reports/dashboard/today",
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
            cache: "no-store",
          },
        );

        if (response.status === 401) {
          clearSession();
          router.replace("/login");
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message ?? "Unable to load dashboard");
        }

        setDashboard(data);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Unable to load reports",
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        Loading reports...
      </main>
    );
  }

  if (!dashboard) {
    return <main className="p-6 text-red-700">{message}</main>;
  }

  const paymentRows = [
    ["Cash", dashboard.payments.cash],
    ["M-Pesa", dashboard.payments.mpesa],
    ["Card", dashboard.payments.card],
    ["Bank", dashboard.payments.bank],
    ["Insurance", dashboard.payments.insurance],
    ["Other", dashboard.payments.other],
  ];

  return (
    <main className="min-h-screen bg-gray-100 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Management Console
            </p>
            <h1 className="text-3xl font-bold text-gray-900">
              Management Dashboard
            </h1>
            <p className="text-gray-500">Today&apos;s branch performance</p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Management navigation">
            <Link href="/admin/reports" className="rounded-xl bg-black px-4 py-2 font-semibold text-white">Reports</Link>
            <Link href="/admin/customers" className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold">Customers</Link>
            <Link href="/admin/end-of-day" className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold">End of Day</Link>
            <Link href="/pos" className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold">POS</Link>
          </nav>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Net Sales", `KES ${money(dashboard.summary.netSales)}`],
            ["Transactions", String(dashboard.summary.completedTransactions)],
            ["Average Basket", `KES ${money(dashboard.summary.averageTransaction)}`],
            ["Cash Variance", `KES ${money(dashboard.summary.cashVariance)}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">{label}</p>
              <p className="mt-2 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Payment Methods</h2>
            <div className="mt-5 space-y-3">
              {paymentRows.map(([label, value]) => (
                <div key={label} className="flex justify-between border-b py-2">
                  <span>{label}</span>
                  <strong>KES {money(value)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Adjustments</h2>
            <div className="mt-5 space-y-4">
              <div className="flex justify-between"><span>Discounts</span><strong>KES {money(dashboard.summary.discounts)}</strong></div>
              <div className="flex justify-between"><span>Returns</span><strong>KES {money(dashboard.summary.returns)}</strong></div>
              <div className="flex justify-between"><span>Voids</span><strong>KES {money(dashboard.summary.voidedSales)}</strong></div>
              <div className="flex justify-between"><span>Return Count</span><strong>{dashboard.summary.returnCount}</strong></div>
              <div className="flex justify-between"><span>Void Count</span><strong>{dashboard.summary.voidCount}</strong></div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Sales by Cashier</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left">
                <thead><tr className="border-b text-sm text-gray-500"><th className="py-3">Cashier</th><th>Transactions</th><th>Sales</th></tr></thead>
                <tbody>
                  {dashboard.cashierSales.map((cashier) => (
                    <tr key={cashier.cashierId} className="border-b"><td className="py-4 font-semibold">{cashier.name}</td><td>{cashier.transactions}</td><td className="font-bold">KES {money(cashier.sales)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Top Products</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left">
                <thead><tr className="border-b text-sm text-gray-500"><th className="py-3">Product</th><th>Qty</th><th>Revenue</th></tr></thead>
                <tbody>
                  {dashboard.topProducts.map((product) => (
                    <tr key={product.productId} className="border-b"><td className="py-4 font-semibold">{product.name}</td><td>{Number(product.quantity)}</td><td className="font-bold">KES {money(product.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Customer Sales</p><p className="mt-2 text-2xl font-bold">{dashboard.summary.customerLinkedSales}</p></div>
          <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Walk-in Sales</p><p className="mt-2 text-2xl font-bold">{dashboard.summary.walkInSales}</p></div>
          <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Open Shifts</p><p className="mt-2 text-2xl font-bold">{dashboard.shifts.open}</p></div>
        </div>
      </div>
    </main>
  );
}
