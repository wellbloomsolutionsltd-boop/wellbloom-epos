"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  AuthSession,
  clearSession,
  getSession,
} from "../../lib/auth";

import Receipt from "./Receipt";

type InventoryRecord = {
  id: string;
  quantity: string;
  branch: {
    id: string;
    name: string;
    code: string;
  };
};

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sellingPrice: string;
  costPrice: string | null;
  isActive: boolean;
  inventory: InventoryRecord[];
};

type CartItem = {
  product: Product;
  quantity: number;
};

type CompletedSale = {
  id: string;
  saleNumber: string;
  receiptNumber: string;
  subtotal: string;
  discount: string;
  total: string;
  change: string;
  createdAt: string;

  branch: {
    id: string;
    name: string;
    code: string;
  };

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

export default function PosPage() {
  const router = useRouter();

  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [currentShift, setCurrentShift] = useState<{
    id: string;
    shiftNumber: string;
    openingCash: string;
  } | null>(null);

  const [checkingShift, setCheckingShift] = useState(true);

  const [barcode, setBarcode] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "MPESA" | "CARD"
  >("CASH");
  const [amountTendered, setAmountTendered] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [completedSale, setCompletedSale] =
    useState<CompletedSale | null>(null);

  useEffect(() => {
    const storedSession = getSession();

    if (!storedSession) {
      router.replace("/login");
      return;
    }

    setSession(storedSession);
    setCheckingAuth(false);
  }, [router]);

  useEffect(() => {
    if (!session) {
      return;
    }

    async function checkShift() {
      try {
        const response = await fetch(
          "http://localhost:3001/shifts/current",
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
          },
        );

        if (response.status === 401) {
          clearSession();
          router.replace("/login");
          return;
        }

        const responseText = await response.text();
        const data = responseText
          ? JSON.parse(responseText)
          : null;

        setCurrentShift(data);
      } finally {
        setCheckingShift(false);
      }
    }

    checkShift();
  }, [session, router]);

  async function handleBarcodeSubmit(event: FormEvent) {
    event.preventDefault();

    const cleanedBarcode = barcode.trim();

    if (!cleanedBarcode) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `http://localhost:3001/products/barcode/${cleanedBarcode}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Product not found");
      }

      const product: Product = await response.json();

      addProductToCart(product);

      setBarcode("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to find product",
      );
    } finally {
      setLoading(false);
    }
  }

  async function completeSale() {
    if (cart.length === 0) {
      return;
    }

    const paymentAmount = Number(amountTendered);

    if (!paymentAmount || paymentAmount < subtotal) {
      setMessage("Amount tendered is less than the sale total.");
      return;
    }

    setPaymentLoading(true);
    setMessage("");

    try {
      const response = await fetch("http://localhost:3001/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
          payments: [
            {
              method: paymentMethod,
              amount: paymentAmount,
            },
          ],
          discount: 0,
        }),
      });

      if (response.status === 401) {
        clearSession();
        router.replace("/login");

        throw new Error(
          "Your login session expired. Please sign in again.",
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to complete sale");
      }

      setCompletedSale({
        id: data.sale.id,
        saleNumber: data.sale.saleNumber,
        receiptNumber:
          data.sale.receiptNumber ?? data.sale.saleNumber,
        subtotal: String(data.sale.subtotal),
        discount: String(
          data.sale.discount ?? data.sale.discountAmount ?? 0,
        ),
        total: String(data.sale.total ?? data.sale.totalAmount),
        change: String(data.change),
        createdAt: data.sale.createdAt,
        branch: data.sale.branch,
        items: data.sale.items,
        payments: data.sale.payments,
      });

      setCart([]);
      setAmountTendered("");
      setShowPayment(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Sale failed",
      );
    } finally {
      setPaymentLoading(false);
    }
  }

  function addProductToCart(product: Product) {
    setCart((currentCart) => {
      const existingItem = currentCart.find(
        (item) => item.product.id === product.id,
      );

      if (existingItem) {
        return currentCart.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item,
        );
      }

      return [
        ...currentCart,
        {
          product,
          quantity: 1,
        },
      ];
    });
  }

  function increaseQuantity(productId: string) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              quantity: item.quantity + 1,
            }
          : item,
      ),
    );
  }

  function decreaseQuantity(productId: string) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.product.id === productId
            ? {
                ...item,
                quantity: item.quantity - 1,
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function removeItem(productId: string) {
    setCart((currentCart) =>
      currentCart.filter(
        (item) => item.product.id !== productId,
      ),
    );
  }

  function getAvailableStock(product: Product) {
    return product.inventory.reduce(
      (total, record) =>
        total + Number(record.quantity),
      0,
    );
  }

  const subtotal = useMemo(() => {
    return cart.reduce((total, item) => {
      const price = Number(item.product.sellingPrice);

      return total + price * item.quantity;
    }, 0);
  }, [cart]);

  const totalItems = useMemo(() => {
    return cart.reduce(
      (total, item) => total + item.quantity,
      0,
    );
  }, [cart]);

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading EPOS...</p>
      </main>
    );
  }

  if (!session) {
    return null;
  }

  if (checkingShift) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        Checking cashier shift...
      </main>
    );
  }

  if (!currentShift) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-xl">
          <h1 className="text-2xl font-bold">No Open Shift</h1>

          <p className="mt-3 text-gray-500">
            You need to open your cashier shift before processing sales.
          </p>

          <Link
            href="/pos/shift"
            className="mt-6 block rounded-xl bg-green-600 px-4 py-4 font-bold text-white"
          >
            Open Shift
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              WELLBLOOM EPOS
            </h1>

            <p className="text-sm text-gray-500">
              {session.user.branch?.name ?? "No branch assigned"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white px-4 py-2 shadow-sm">
                <p className="text-xs text-gray-500">Logged in as</p>

                <p className="font-semibold text-gray-900">
                  {session.user.firstName} {" "}
                  {session.user.lastName}
                </p>

                <p className="text-xs text-gray-500">
                  {session.user.role}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  clearSession();
                  router.replace("/login");
                }}
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-semibold"
              >
                Logout
              </button>
            </div>

            <Link
              href="/pos/shift"
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-semibold shadow-sm"
            >
              Shift
            </Link>

            <Link
              href="/pos/sales"
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Sales History
            </Link>

            <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-500">Cart Items</p>

              <p className="text-xl font-bold text-gray-900">
                {totalItems}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="space-y-4">
            <form
              onSubmit={handleBarcodeSubmit}
              className="rounded-2xl bg-white p-4 shadow-sm"
            >
              <label
                htmlFor="barcode"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                Scan or enter barcode
              </label>

              <div className="flex gap-2">
                <input
                  id="barcode"
                  value={barcode}
                  onChange={(event) =>
                    setBarcode(event.target.value)
                  }
                  placeholder="Scan barcode..."
                  autoFocus
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-3 text-lg outline-none focus:border-black"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-black px-6 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {loading ? "Searching..." : "Add"}
                </button>
              </div>

              {message && (
                <p className="mt-3 text-sm font-medium text-red-600">
                  {message}
                </p>
              )}
            </form>

            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="border-b border-gray-200 p-4">
                <h2 className="text-lg font-bold text-gray-900">
                  Current Sale
                </h2>
              </div>

              {cart.length === 0 ? (
                <div className="p-10 text-center text-gray-500">
                  Scan a product to begin the sale.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cart.map((item) => {
                    const price = Number(
                      item.product.sellingPrice,
                    );

                    const lineTotal =
                      price * item.quantity;

                    const availableStock =
                      getAvailableStock(item.product);

                    return (
                      <div
                        key={item.product.id}
                        className="p-4"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-gray-900">
                              {item.product.name}
                            </p>

                            <p className="text-sm text-gray-500">
                              SKU: {item.product.sku}
                            </p>

                            <p className="text-sm text-gray-500">
                              Barcode: {item.product.barcode}
                            </p>

                            <p className="mt-1 text-sm">
                              Stock: {" "}
                              <span className="font-semibold">
                                {availableStock}
                              </span>
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-500">
                              Unit price
                            </p>

                            <p className="font-semibold">
                              KES {price.toLocaleString()}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                decreaseQuantity(item.product.id)
                              }
                              className="h-10 w-10 rounded-lg border border-gray-300 text-lg"
                            >
                              -
                            </button>

                            <div className="min-w-12 text-center font-bold">
                              {item.quantity}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                increaseQuantity(item.product.id)
                              }
                              className="h-10 w-10 rounded-lg border border-gray-300 text-lg"
                            >
                              +
                            </button>
                          </div>

                          <div className="min-w-28">
                            <p className="text-sm text-gray-500">
                              Total
                            </p>

                            <p className="font-bold">
                              KES {lineTotal.toLocaleString()}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              removeItem(item.product.id)
                            }
                            className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="h-fit rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-5 text-xl font-bold text-gray-900">
              Sale Summary
            </h2>

            <div className="space-y-3">
              <div className="flex justify-between text-gray-600">
                <span>Items</span>
                <span>{totalItems}</span>
              </div>

              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>

                <span>
                  KES {subtotal.toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between text-gray-600">
                <span>Discount</span>
                <span>KES 0</span>
              </div>
            </div>

            <div className="my-5 border-t border-gray-200" />

            <div className="flex items-end justify-between">
              <span className="font-semibold text-gray-700">
                Total
              </span>

              <span className="text-2xl font-bold text-gray-900">
                KES {subtotal.toLocaleString()}
              </span>
            </div>

            {!showPayment ? (
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => {
                  setShowPayment(true);
                  setAmountTendered(subtotal.toFixed(2));
                }}
                className="mt-6 w-full rounded-xl bg-green-600 px-4 py-4 text-lg font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Proceed to Payment
              </button>
            ) : (
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => {
                  setShowPayment(true);
                  setAmountTendered(subtotal.toFixed(2));
                }}
                className="mt-6 w-full rounded-xl bg-green-600 px-4 py-4 text-lg font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Proceed to Payment
              </button>
            )}

            <button
              type="button"
              onClick={() => setCart([])}
              disabled={cart.length === 0}
              className="mt-3 w-full rounded-xl border border-gray-300 px-4 py-3 font-semibold text-gray-700 disabled:opacity-40"
            >
              Clear Sale
            </button>
          </aside>
        </div>
      </div>

      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-2xl font-bold">Complete Payment</h2>

            <div className="mt-5 rounded-xl bg-gray-100 p-4">
              <p className="text-sm text-gray-500">Amount Due</p>
              <p className="text-3xl font-bold">
                KES {subtotal.toLocaleString()}
              </p>
            </div>

            <div className="mt-5">
              <p className="mb-2 font-semibold">Payment Method</p>
              <div className="grid grid-cols-3 gap-2">
                {(["CASH", "MPESA", "CARD"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`rounded-xl border px-4 py-3 font-semibold ${
                      paymentMethod === method
                        ? "bg-black text-white"
                        : "bg-white text-gray-800"
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label
                htmlFor="amount-tendered"
                className="mb-2 block font-semibold"
              >
                Amount Tendered
              </label>
              <input
                id="amount-tendered"
                type="number"
                value={amountTendered}
                onChange={(event) => setAmountTendered(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-xl"
              />
            </div>

            <div className="mt-4 flex justify-between rounded-xl bg-gray-50 p-4">
              <span>Change</span>
              <span className="font-bold">
                KES {Math.max(
                  0,
                  Number(amountTendered || 0) - subtotal,
                ).toLocaleString()}
              </span>
            </div>

            {message && (
              <p className="mt-3 text-sm font-medium text-red-600">
                {message}
              </p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowPayment(false)}
                className="rounded-xl border border-gray-300 px-4 py-3 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={completeSale}
                disabled={paymentLoading}
                className="rounded-xl bg-green-600 px-4 py-3 font-bold text-white disabled:opacity-50"
              >
                {paymentLoading ? "Processing..." : "Complete Sale"}
              </button>
            </div>
          </div>
        </div>
      )}

      {completedSale && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="mx-auto my-6 max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="print:hidden">
              <div className="text-center">
                <div className="text-5xl text-green-600">✓</div>

                <h2 className="mt-2 text-2xl font-bold">
                  Sale Completed
                </h2>

                <p className="mt-1 text-gray-500">
                  Receipt {completedSale.receiptNumber}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <Receipt sale={completedSale} />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-green-600 px-4 py-3 font-bold text-white"
              >
                Print Receipt
              </button>

              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="rounded-xl bg-black px-4 py-3 font-bold text-white"
              >
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
