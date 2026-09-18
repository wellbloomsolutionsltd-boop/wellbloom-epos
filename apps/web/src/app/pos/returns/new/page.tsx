"use client";

import {
  FormEvent,
  Suspense,
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  AuthSession,
  clearSession,
  getSession,
} from "../../../../lib/auth";

type ReturnStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED";

type RefundMethod =
  | "CASH"
  | "MPESA"
  | "CARD"
  | "BANK"
  | "INSURANCE"
  | "STORE_CREDIT"
  | "OTHER";

type SaleItem = {
  id: string;
  quantity: string;
  unitPrice: string;
  product: {
    id: string;
    name: string;
    sku: string;
  };
  returnItems: {
    quantity: string;
    return: {
      status: ReturnStatus;
    };
  }[];
};

type Sale = {
  id: string;
  saleNumber: string;
  receiptNumber: string;
  status: string;
  items: SaleItem[];
};

type SubmittedReturn = {
  returnNumber: string;
  status: ReturnStatus;
};

const refundMethods: RefundMethod[] = [
  "CASH",
  "MPESA",
  "CARD",
  "BANK",
  "INSURANCE",
  "STORE_CREDIT",
  "OTHER",
];

function alreadyReturned(item: SaleItem) {
  return item.returnItems
    .filter(
      (returnItem) =>
        returnItem.return.status === "COMPLETED" ||
        returnItem.return.status === "APPROVED",
    )
    .reduce(
      (total, returnItem) =>
        total + Number(returnItem.quantity),
      0,
    );
}

function NewReturnForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const saleId = searchParams.get("saleId");

  const [session, setSession] =
    useState<AuthSession | null>(null);
  const [sale, setSale] =
    useState<Sale | null>(null);
  const [quantities, setQuantities] =
    useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] =
    useState<RefundMethod>("CASH");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [submittedReturn, setSubmittedReturn] =
    useState<SubmittedReturn | null>(null);

  useEffect(() => {
    const storedSession = getSession();

    if (!storedSession) {
      router.replace("/login");
      return;
    }

    setSession(storedSession);
  }, [router]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (!saleId) {
      setMessage("A sale must be selected before requesting a return.");
      setLoading(false);
      return;
    }

    async function loadSale() {
      setLoading(true);
      setMessage("");

      try {
        const response = await fetch(
          `http://localhost:3001/sales/${encodeURIComponent(saleId ?? "")}`,
          {
            headers: {
              Authorization: `Bearer ${session?.accessToken}`,
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
          throw new Error(data.message ?? "Unable to load sale");
        }

        setSale(data);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load sale",
        );
      } finally {
        setLoading(false);
      }
    }

    loadSale();
  }, [router, saleId, session]);

  async function submitReturn(event: FormEvent) {
    event.preventDefault();

    if (!session || !sale) {
      return;
    }

    const items = sale.items
      .map((item) => ({
        saleItemId: item.id,
        quantity: Number(quantities[item.id] ?? 0),
      }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      setMessage("Enter a return quantity for at least one item.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("http://localhost:3001/returns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          saleId: sale.id,
          reason,
          refundMethod,
          items,
        }),
      });

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
            : data.message ?? "Unable to submit return request",
        );
      }

      setSubmittedReturn(data);
      setMessage("Return request submitted for manager approval.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit return request",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading sale...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4 lg:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Return Items
            </h1>
            <p className="text-gray-500">
              Submit a return request for manager approval.
            </p>
          </div>

          <Link
            href="/pos/sales"
            className="rounded-xl bg-black px-4 py-3 font-semibold text-white"
          >
            Sales History
          </Link>
        </div>

        {message && (
          <div className="mb-5 rounded-xl bg-blue-50 p-4 text-sm font-medium text-blue-800">
            {message}
          </div>
        )}

        {submittedReturn ? (
          <div className="rounded-2xl bg-white p-7 text-center shadow-sm">
            <p className="text-sm text-gray-500">Return Request</p>
            <h2 className="mt-1 text-2xl font-bold">
              {submittedReturn.returnNumber}
            </h2>
            <span className="mt-4 inline-block rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
              {submittedReturn.status}
            </span>
            <Link
              href="/pos/sales"
              className="mt-6 block rounded-xl bg-black px-4 py-3 font-bold text-white"
            >
              Back to Sales History
            </Link>
          </div>
        ) : sale ? (
          <form onSubmit={submitReturn} className="space-y-5">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Original Receipt
              </p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {sale.receiptNumber || sale.saleNumber}
              </p>
            </div>

            <div className="space-y-4">
              {sale.items.map((item) => {
                const returned = alreadyReturned(item);
                const available = Math.max(
                  0,
                  Number(item.quantity) - returned,
                );

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-white p-6 shadow-sm"
                  >
                    <h2 className="text-lg font-bold text-gray-900">
                      {item.product.name}
                    </h2>
                    <p className="text-sm text-gray-500">
                      SKU: {item.product.sku}
                    </p>

                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-gray-500">Sold</p>
                        <p className="font-bold">{item.quantity}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Already Returned</p>
                        <p className="font-bold">{returned}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Available To Return</p>
                        <p className="font-bold">{available}</p>
                      </div>
                    </div>

                    <label className="mt-5 block font-semibold">
                      Return Qty
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={available}
                      step="0.001"
                      disabled={available === 0}
                      value={quantities[item.id] ?? ""}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
                      placeholder={available === 0 ? "Fully returned" : "0"}
                    />
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <label className="block font-semibold">Reason</label>
              <textarea
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-2 min-h-28 w-full rounded-xl border border-gray-300 px-4 py-3"
                placeholder="Customer returned unopened product"
              />

              <label className="mt-5 block font-semibold">Refund</label>
              <select
                value={refundMethod}
                onChange={(event) =>
                  setRefundMethod(event.target.value as RefundMethod)
                }
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                {refundMethods.map((method) => (
                  <option key={method} value={method}>
                    {method.replaceAll("_", " ")}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={submitting || sale.status !== "COMPLETED"}
                className="mt-6 w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-bold text-white disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Return Request"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </main>
  );
}

export default function NewReturnPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-100">
          <p className="text-gray-500">Loading return form...</p>
        </main>
      }
    >
      <NewReturnForm />
    </Suspense>
  );
}
