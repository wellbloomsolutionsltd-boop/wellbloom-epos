"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  AuthSession,
  clearSession,
  getSession,
} from "../../../lib/auth";

type Shift = {
  id: string;
  shiftNumber: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  cashDifference: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
};

type EndOfDaySummary = {
  businessDate: string;
  branchId: string;
  grossSales: string;
  totalDiscount: string;
  totalReturns: string;
  netSales: string;
  cashTotal: string;
  mpesaTotal: string;
  cardTotal: string;
  bankTotal: string;
  insuranceTotal: string;
  otherTotal: string;
  transactionCount: number;
  shiftCount: number;
  openShiftCount: number;
  totalCashVariance: string;
  shifts: Shift[];
};

type EndOfDay = {
  id: string;
  businessDate: string;
  status: "OPEN" | "CLOSED";
  totalSales: string;
  netSales: string;
  transactionCount: number;
  shiftCount: number;
  totalCashVariance: string;
  closedAt: string | null;
  closedBy: {
    firstName: string;
    lastName: string;
    role: string;
  } | null;
};

function money(value: string | number | null) {
  return Number(value ?? 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function EndOfDayPage() {
  const router = useRouter();
  const [session] = useState<AuthSession | null>(() => getSession());
  const [summary, setSummary] = useState<EndOfDaySummary | null>(null);
  const [history, setHistory] = useState<EndOfDay[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function request(url: string, options: RequestInit = {}) {
    if (!session) {
      router.replace("/login");
      throw new Error("Login required");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        ...(options.headers ?? {}),
      },
      cache: "no-store",
    });

    if (response.status === 401) {
      clearSession();
      router.replace("/login");
      throw new Error("Your session expired");
    }

    return response;
  }

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const [summaryResponse, historyResponse] = await Promise.all([
        request("http://localhost:3001/end-of-day/current"),
        request("http://localhost:3001/end-of-day/history"),
      ]);

      if (!summaryResponse.ok) {
        const data = await summaryResponse.json().catch(() => null);
        throw new Error(data?.message ?? "Unable to load End of Day summary");
      }

      if (!historyResponse.ok) {
        throw new Error("Unable to load End of Day history");
      }

      setSummary(await summaryResponse.json());
      setHistory(await historyResponse.json());
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load End of Day",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function closeEndOfDay(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setMessage("");

    try {
      const response = await request("http://localhost:3001/end-of-day/close", {
        method: "POST",
        body: JSON.stringify({ notes }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : data.message ?? "Unable to close End of Day",
        );
      }

      setNotes("");
      setMessage("End of Day closed successfully.");
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to close End of Day",
      );
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        Loading End of Day...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Management Console
            </p>
            <h1 className="text-3xl font-bold text-gray-900">End of Day</h1>
            <p className="text-gray-500">
              {session?.user.branch?.name ?? "No branch assigned"}
            </p>
          </div>
          <Link
            href="/pos"
            className="rounded-xl bg-black px-4 py-3 text-center font-semibold text-white"
          >
            POS
          </Link>
        </header>

        {message && (
          <div className="mb-5 rounded-xl bg-blue-50 p-4 text-sm font-medium text-blue-900">
            {message}
          </div>
        )}

        {summary && (
          <>
            <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Gross Sales</p>
                <p className="mt-1 text-2xl font-bold">KES {money(summary.grossSales)}</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Net Sales</p>
                <p className="mt-1 text-2xl font-bold">KES {money(summary.netSales)}</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Transactions</p>
                <p className="mt-1 text-2xl font-bold">{summary.transactionCount}</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Open Shifts</p>
                <p className="mt-1 text-2xl font-bold">{summary.openShiftCount}</p>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">Today&apos;s Shifts</h2>
                <div className="mt-4 divide-y">
                  {summary.shifts.map((shift) => (
                    <div key={shift.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">{shift.shiftNumber}</p>
                        <p className="text-sm text-gray-500">
                          {shift.user.firstName} {shift.user.lastName}
                        </p>
                      </div>
                      <span className={shift.status === "OPEN" ? "rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700" : "rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700"}>
                        {shift.status}
                      </span>
                    </div>
                  ))}
                  {summary.shifts.length === 0 && (
                    <p className="py-4 text-sm text-gray-500">No shifts recorded today.</p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">Close End of Day</h2>
                <p className="mt-2 text-sm text-gray-500">
                  All cashier shifts must be closed before the branch day can be closed.
                </p>
                <form onSubmit={closeEndOfDay} className="mt-5 space-y-4">
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Notes (optional)"
                    rows={4}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  />
                  <button
                    type="submit"
                    disabled={working || summary.openShiftCount > 0}
                    className="w-full rounded-xl bg-black px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {working ? "Closing..." : "Close End of Day"}
                  </button>
                </form>
              </section>
            </div>
          </>
        )}

        <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">End of Day History</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-3">Business Date</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Net Sales</th>
                  <th className="px-3 py-3">Transactions</th>
                  <th className="px-3 py-3">Closed By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((day) => (
                  <tr key={day.id}>
                    <td className="px-3 py-3">{new Date(day.businessDate).toLocaleDateString("en-KE")}</td>
                    <td className="px-3 py-3">{day.status}</td>
                    <td className="px-3 py-3">KES {money(day.netSales)}</td>
                    <td className="px-3 py-3">{day.transactionCount}</td>
                    <td className="px-3 py-3">
                      {day.closedBy ? `${day.closedBy.firstName} ${day.closedBy.lastName}` : "-"}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                      No End of Day records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
