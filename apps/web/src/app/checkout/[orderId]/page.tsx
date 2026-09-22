"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, getSession, type AuthSession } from "../../../lib/auth";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string;
  branch: { name: string };
  items: {
    id: string;
    quantity: string;
    lineTotal: string;
    product: { name: string };
  }[];
};

type PaymentMethod = "MPESA" | "CARD" | "BANK";

const api = "http://localhost:3001";

export default function CheckoutPaymentPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("MPESA");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [transactionNumber, setTransactionNumber] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    setSession(current);

    fetch(`${api}/orders/${params.orderId}`, {
      headers: { Authorization: `Bearer ${current.accessToken}` },
    })
      .then(async (response) => {
        const data = await response.json();
        if (response.status === 401) {
          clearSession();
          router.replace("/login");
          throw new Error("Your login session expired.");
        }
        if (!response.ok) throw new Error(data.message ?? "Unable to load order");
        setOrder(data);
      })
      .catch((error) => setMessage(error.message));
  }, [params.orderId, router]);

  useEffect(() => {
    if (!session || !transactionNumber) return;

    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      while (!cancelled && attempts < 60) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts += 1;
        const response = await fetch(
          `${api}/payments/${transactionNumber}/status`,
          { headers: { Authorization: `Bearer ${session.accessToken}` } },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Unable to check payment status");
        if (data.status === "SUCCEEDED") {
          setPendingVerification(false);
          setMessage("Payment confirmed. Your order is being prepared.");
          return;
        }
        if (["FAILED", "CANCELLED", "REQUIRES_REVIEW", "REFUNDED"].includes(data.status)) {
          setPendingVerification(false);
          setMessage(
            data.status === "REQUIRES_REVIEW"
              ? "Payment received and pending verification."
              : "Payment was not completed. Please try again or choose another method.",
          );
          return;
        }
      }
      if (!cancelled) {
        setPendingVerification(false);
        setMessage("Payment status is still pending. Please check again shortly.");
      }
    };

    poll().catch((error) => {
      if (!cancelled) {
        setPendingVerification(false);
        setMessage(error.message);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [session, transactionNumber]);

  async function startPayment() {
    if (!session || !order) return;
    setBusy(true);
    setMessage("");

    try {
      let data: any;
      let response: Response;
      if (method === "MPESA") {
        if (!phone.trim()) throw new Error("Enter your M-Pesa phone number.");
        response = await fetch(`${api}/payments/mpesa/stk-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ orderId: order.id, phone: phone.trim() }),
        });
        data = await response.json();
      } else if (method === "CARD") {
        response = await fetch(`${api}/payments/card`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ orderId: order.id }),
        });
        data = await response.json();
      } else {
        response = await fetch(`${api}/payments/bank`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ orderId: order.id, reference: reference.trim() || undefined }),
        });
        data = await response.json();
      }

      if (!response.ok) throw new Error(data.message ?? "Unable to start payment");

      if (method === "CARD") {
        if (!data.checkoutUrl) throw new Error("Card provider did not return a checkout URL.");
        window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
        setMessage("Complete payment in the secure card checkout window.");
      } else if (method === "BANK") {
        setPendingVerification(true);
        setMessage("PENDING VERIFICATION. Management will verify the transfer.");
        setTransactionNumber(data.transactionNumber);
      } else {
        setPendingVerification(true);
        setMessage("M-Pesa prompt sent. Waiting for confirmation...");
        setTransactionNumber(data.transactionNumber);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start payment");
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return <main className="min-h-screen bg-slate-950 p-8 text-white">{message || "Loading order..."}</main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">WELLBLOOM</p>
            <h1 className="mt-2 text-4xl font-semibold">Complete your payment</h1>
            <p className="mt-2 text-slate-400">{order.orderNumber} · {order.branch.name}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400">Amount due</p>
            <p className="text-3xl font-semibold">KES {Number(order.total).toLocaleString()}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Order</p>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between border-b border-slate-800 pb-3 text-sm">
                  <span>{item.product.name} × {item.quantity}</span>
                  <span>KES {Number(item.lineTotal).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-white p-6 text-slate-900">
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">Payment method</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["MPESA", "CARD", "BANK"] as PaymentMethod[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={pendingVerification}
                  onClick={() => setMethod(option)}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold ${method === option ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}
                >
                  {option === "MPESA" ? "M-Pesa" : option === "CARD" ? "Card" : "Bank Transfer"}
                </button>
              ))}
            </div>

            {method === "MPESA" && (
              <div className="mt-6">
                <label className="text-sm font-semibold">Phone</label>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0712 345678" disabled={pendingVerification} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
              </div>
            )}

            {method === "CARD" && <p className="mt-6 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">You will be redirected to the secure card provider checkout.</p>}

            {method === "BANK" && (
              <div className="mt-6 space-y-3 rounded-xl bg-slate-100 p-4 text-sm">
                <p className="font-semibold">Bank transfer instructions</p>
                <p>Use order reference: <strong>{order.orderNumber}</strong></p>
                <label className="block font-semibold">Transfer reference (optional)</label>
                <input value={reference} onChange={(event) => setReference(event.target.value)} disabled={pendingVerification} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
              </div>
            )}

            {message && <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}

            <button type="button" onClick={startPayment} disabled={busy || pendingVerification} className="mt-6 w-full rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {pendingVerification ? "Pending verification..." : method === "MPESA" ? "Send M-Pesa Prompt" : method === "CARD" ? "Pay Securely by Card" : "I've Made the Transfer"}
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
