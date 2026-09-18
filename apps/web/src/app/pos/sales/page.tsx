"use client";

import { useEffect, useState } from "react";

import {
  useRouter,
} from "next/navigation";

import {
  clearSession,
  getSession,
} from "../../../lib/auth";

import Receipt from "../Receipt";

type Sale = {
  id: string;
  saleNumber: string;
  receiptNumber: string;
  subtotal: string;
  discount: string;
  total: string;
  change: string;
  status: string;
  createdAt: string;
  voidReason?: string | null;
  voidedAt?: string | null;
  voidedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  branch: {
    id: string;
    name: string;
    code: string;
  };
  cashier: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  items: {
    id: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    product: {
      id: string;
      name: string;
      sku: string;
      barcode: string | null;
    };
  }[];
  payments: {
    id: string;
    method: string;
    amount: string;
    reference?: string | null;
  }[];
};

type ApiSale = Omit<Sale, "discount" | "total" | "change"> & {
  discount?: string;
  discountAmount?: string;
  total?: string;
  totalAmount?: string;
  change?: string;
  amountPaid?: string;
  changeAmount?: string;
};

function money(value: string | number) {
  return Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeSale(sale: ApiSale): Sale {
  const total = String(sale.total ?? sale.totalAmount ?? 0);
  const paymentsTotal = sale.payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );

  return {
    ...sale,
    receiptNumber: sale.receiptNumber ?? sale.saleNumber,
    discount: String(sale.discount ?? sale.discountAmount ?? 0),
    total,
    change: String(
      sale.change ?? sale.changeAmount ?? paymentsTotal - Number(total),
    ),
  };
}

export default function SalesHistoryPage() {
  const router = useRouter();
  const session = getSession();

  const canVoid =
    session?.user.role === "MANAGER" ||
    session?.user.role === "TENANT_ADMIN" ||
    session?.user.role === "SUPER_ADMIN";

  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidMessage, setVoidMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadSales() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("http://localhost:3001/sales", {
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load sales history");
      }

      const data: ApiSale[] = await response.json();
      setSales(data.map(normalizeSale));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load sales",
      );
    } finally {
      setLoading(false);
    }
  }

  async function searchSales() {
    const term = search.trim();

    if (!term) {
      await loadSales();
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `http://localhost:3001/sales/search/${encodeURIComponent(term)}`,
        {
          headers: {
            Authorization: `Bearer ${session?.accessToken}`,
          },
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error("Unable to search sales");
      }

      const data: ApiSale[] = await response.json();
      setSales(data.map(normalizeSale));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function voidSale() {
    if (!session || !selectedSale) {
      return;
    }

    setVoiding(true);
    setVoidMessage("");

    try {
      const response = await fetch(
        `http://localhost:3001/sales/${selectedSale.id}/void`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({
            reason: voidReason,
          }),
        },
      );

      if (response.status === 401) {
        clearSession();
        router.replace("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : data.message ?? "Unable to void sale",
        );
      }

      const updatedSale = normalizeSale(data);

      setSales((currentSales) =>
        currentSales.map((sale) =>
          sale.id === updatedSale.id ? updatedSale : sale,
        ),
      );
      setSelectedSale(updatedSale);
      setShowVoidModal(false);
      setVoidReason("");
      setMessage(`Sale ${updatedSale.saleNumber} was voided.`);
    } catch (error) {
      setVoidMessage(
        error instanceof Error
          ? error.message
          : "Unable to void sale",
      );
    } finally {
      setVoiding(false);
    }
  }

  useEffect(() => {
    loadSales();
  }, []);

  return (
    <main className="min-h-screen bg-gray-100 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Sales History</h1>
          <p className="text-gray-500">
            View completed EPOS transactions and reprint receipts.
          </p>
        </div>

        <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") searchSales();
              }}
              placeholder="Search receipt or sale number..."
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
            <button
              type="button"
              onClick={searchSales}
              className="rounded-xl bg-black px-6 py-3 font-semibold text-white"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                loadSales();
              }}
              className="rounded-xl border border-gray-300 px-6 py-3 font-semibold"
            >
              Reset
            </button>
          </div>
        </div>

        {message && (
          <div className="mb-4 rounded-xl bg-red-50 p-4 text-red-600">
            {message}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50 text-left text-sm text-gray-500">
                <tr>
                  {[
                    "Receipt",
                    "Date",
                    "Branch",
                    "Cashier",
                    "Items",
                    "Payment",
                    "Total",
                    "Status",
                    "Action",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-gray-500">
                      Loading sales...
                    </td>
                  </tr>
                ) : sales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-gray-500">
                      No sales found.
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 font-semibold">
                        {sale.receiptNumber || sale.saleNumber}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {new Date(sale.createdAt).toLocaleString("en-KE")}
                      </td>
                      <td className="px-4 py-4">{sale.branch.name}</td>
                      <td className="px-4 py-4">
                        {sale.cashier
                          ? `${sale.cashier.firstName} ${sale.cashier.lastName}`
                          : "Legacy Sale"}
                      </td>
                      <td className="px-4 py-4">
                        {sale.items.reduce(
                          (total, item) => total + Number(item.quantity),
                          0,
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {sale.payments.map((payment) => payment.method).join(", ")}
                      </td>
                      <td className="px-4 py-4 font-bold">
                        KES {money(sale.total)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            sale.status === "VOIDED"
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => setSelectedSale(sale)}
                          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedSale && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="mx-auto my-6 max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between print:hidden">
              <div>
                <h2 className="text-2xl font-bold">Sale Details</h2>
                <p className="text-sm text-gray-500">
                  {selectedSale.receiptNumber || selectedSale.saleNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="rounded-lg border px-3 py-2"
              >
                Close
              </button>
            </div>

            <div className="mb-5 rounded-xl bg-gray-50 p-4 print:hidden">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">Branch</p>
                  <p className="font-semibold">{selectedSale.branch.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Date</p>
                  <p className="font-semibold">
                    {new Date(selectedSale.createdAt).toLocaleString("en-KE")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="font-semibold">{selectedSale.status}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="font-bold">KES {money(selectedSale.total)}</p>
                </div>
                {selectedSale.status === "VOIDED" && (
                  <>
                    <div>
                      <p className="text-xs text-gray-500">Voided by</p>
                      <p className="font-semibold">
                        {selectedSale.voidedBy
                          ? `${selectedSale.voidedBy.firstName} ${selectedSale.voidedBy.lastName}`
                          : "Unknown manager"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Void date</p>
                      <p className="font-semibold">
                        {selectedSale.voidedAt
                          ? new Date(selectedSale.voidedAt).toLocaleString(
                              "en-KE",
                            )
                          : "Not recorded"}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-gray-500">Reason</p>
                      <p className="font-semibold">
                        {selectedSale.voidReason ?? "No reason recorded"}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <Receipt sale={selectedSale} />

            <div className="mt-6 grid gap-3 print:hidden sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="rounded-xl border border-gray-300 px-4 py-3 font-semibold"
              >
                Close
              </button>
              {selectedSale.status === "COMPLETED" && (
                <button
                  type="button"
                  onClick={() => {
                    router.push(
                      `/pos/returns/new?saleId=${selectedSale.id}`,
                    );
                  }}
                  className="rounded-xl bg-red-600 px-4 py-3 font-bold text-white"
                >
                  Return Items
                </button>
              )}
              {canVoid && selectedSale.status === "COMPLETED" && (
                <button
                  type="button"
                  onClick={() => {
                    setVoidMessage("");
                    setShowVoidModal(true);
                  }}
                  className="rounded-xl bg-red-700 px-4 py-3 font-bold text-white"
                >
                  Void Sale
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-green-600 px-4 py-3 font-bold text-white"
              >
                Reprint Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {showVoidModal && selectedSale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900">Void Sale</h2>

            <p className="mt-2 text-sm text-gray-500">Receipt</p>
            <p className="font-bold">
              {selectedSale.receiptNumber || selectedSale.saleNumber}
            </p>

            <label className="mt-5 block font-semibold">Reason</label>
            <textarea
              required
              minLength={3}
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              className="mt-2 min-h-28 w-full rounded-xl border border-gray-300 px-4 py-3"
              placeholder="Incorrect duplicate transaction"
            />

            {voidMessage && (
              <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
                {voidMessage}
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={voiding}
                onClick={() => {
                  setShowVoidModal(false);
                  setVoidReason("");
                  setVoidMessage("");
                }}
                className="rounded-xl border border-gray-300 px-4 py-3 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={voiding || voidReason.trim().length < 3}
                onClick={voidSale}
                className="rounded-xl bg-red-700 px-4 py-3 font-bold text-white disabled:opacity-50"
              >
                {voiding ? "Voiding..." : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
