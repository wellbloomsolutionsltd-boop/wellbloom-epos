"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  AuthSession,
  clearSession,
  getSession,
} from "../../../lib/auth";

type Customer = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  creditLimit: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
};

type CustomerSale = {
  id: string;
  saleNumber: string;
  receiptNumber: string;
  totalAmount: string;
  status: string;
  createdAt: string;
  branch: {
    id: string;
    name: string;
  };
  payments: {
    id: string;
    method: string;
    amount: string;
  }[];
};

type CustomerDetail = Customer & {
  sales: CustomerSale[];
};

type CustomerForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
};

const emptyForm: CustomerForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  notes: "",
};

function money(value: string | number) {
  return Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function customerName(customer: Customer) {
  return [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(" ");
}

export default function CustomersPage() {
  const router = useRouter();
  const [session] = useState<AuthSession | null>(() => getSession());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerDetail | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");

  function handleUnauthorized(response: Response) {
    if (response.status !== 401) {
      return false;
    }

    clearSession();
    router.replace("/login");
    return true;
  }

  async function loadCustomers(term?: string) {
    if (!session) {
      router.replace("/login");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const clean = term?.trim();
      const url = clean
        ? `http://localhost:3001/customers/search/${encodeURIComponent(clean)}`
        : "http://localhost:3001/customers";
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        cache: "no-store",
      });

      if (handleUnauthorized(response)) {
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load customers");
      }

      setCustomers(data);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load customers",
      );
    } finally {
      setLoading(false);
    }
  }

  async function openCustomer(customerId: string) {
    if (!session) {
      return;
    }

    setDetailLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `http://localhost:3001/customers/${customerId}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
          cache: "no-store",
        },
      );

      if (handleUnauthorized(response)) {
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load customer");
      }

      setSelectedCustomer(data);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load customer",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function createCustomer(event: FormEvent) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setSaving(true);
    setFormMessage("");

    try {
      const response = await fetch("http://localhost:3001/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          notes: form.notes || undefined,
        }),
      });

      if (handleUnauthorized(response)) {
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : data.message ?? "Unable to create customer",
        );
      }

      setCustomers((current) =>
        [...current, data].sort((a, b) =>
          customerName(a).localeCompare(customerName(b)),
        ),
      );
      setForm(emptyForm);
      setShowCreate(false);
      setMessage(`Customer ${customerName(data)} was added.`);
    } catch (error) {
      setFormMessage(
        error instanceof Error ? error.message : "Unable to create customer",
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

  const completedSales = useMemo(
    () =>
      selectedCustomer?.sales.filter(
        (sale) => sale.status === "COMPLETED",
      ) ?? [],
    [selectedCustomer],
  );
  const totalPurchases = useMemo(
    () =>
      completedSales.reduce(
        (total, sale) => total + Number(sale.totalAmount),
        0,
      ),
    [completedSales],
  );

  return (
    <main className="min-h-screen bg-gray-100 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
            <p className="text-gray-500">
              Manage customer details and purchase history.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/pos"
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-semibold"
            >
              Back to POS
            </Link>
            <button
              type="button"
              onClick={() => {
                setFormMessage("");
                setShowCreate(true);
              }}
              className="rounded-xl bg-black px-5 py-3 font-bold text-white"
            >
              Add Customer
            </button>
          </div>
        </header>

        <section className="mb-5 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void loadCustomers(search);
                }
              }}
              placeholder="Search name, phone or email..."
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3"
            />
            <button
              type="button"
              onClick={() => void loadCustomers(search)}
              className="rounded-xl bg-black px-6 py-3 font-semibold text-white"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                void loadCustomers();
              }}
              className="rounded-xl border border-gray-300 px-6 py-3 font-semibold"
            >
              Reset
            </button>
          </div>
        </section>

        {message && (
          <div className="mb-4 rounded-xl bg-blue-50 p-4 text-blue-700">
            {message}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-gray-50 text-sm text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Loyalty Points</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Purchase History</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-gray-500">
                      Loading customers...
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-gray-500">
                      No customers found.
                    </td>
                  </tr>
                ) : (
                  customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 font-semibold">
                        {customerName(customer)}
                      </td>
                      <td className="px-4 py-4">{customer.phone ?? "-"}</td>
                      <td className="px-4 py-4">{customer.email ?? "-"}</td>
                      <td className="px-4 py-4">{customer.loyaltyPoints}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            customer.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {customer.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          disabled={detailLoading}
                          onClick={() => void openCustomer(customer.id)}
                          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
        </section>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <form
            onSubmit={createCustomer}
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 className="text-2xl font-bold">Add Customer</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="font-semibold">
                First name
                <input
                  required
                  value={form.firstName}
                  onChange={(event) =>
                    setForm({ ...form, firstName: event.target.value })
                  }
                  className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"
                />
              </label>
              <label className="font-semibold">
                Last name
                <input
                  value={form.lastName}
                  onChange={(event) =>
                    setForm({ ...form, lastName: event.target.value })
                  }
                  className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"
                />
              </label>
              <label className="font-semibold">
                Phone
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"
                />
              </label>
              <label className="font-semibold">
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"
                />
              </label>
              <label className="font-semibold sm:col-span-2">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  className="mt-2 min-h-24 w-full rounded-xl border px-4 py-3 font-normal"
                />
              </label>
            </div>
            <p className="mt-3 text-sm text-gray-500">
              Provide at least a phone number or email address.
            </p>
            {formMessage && (
              <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
                {formMessage}
              </div>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowCreate(false)}
                className="rounded-xl border px-4 py-3 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  saving ||
                  !form.firstName.trim() ||
                  (!form.phone.trim() && !form.email.trim())
                }
                className="rounded-xl bg-green-600 px-4 py-3 font-bold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Customer"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="mx-auto my-6 max-w-4xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  {customerName(selectedCustomer)}
                </h2>
                <p className="text-gray-500">
                  {selectedCustomer.phone ?? "No phone"} · {" "}
                  {selectedCustomer.email ?? "No email"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="rounded-lg border px-3 py-2"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Total purchases</p>
                <p className="text-xl font-bold">KES {money(totalPurchases)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Transactions</p>
                <p className="text-xl font-bold">{completedSales.length}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Last purchase</p>
                <p className="font-bold">
                  {completedSales[0]
                    ? new Date(completedSales[0].createdAt).toLocaleDateString(
                        "en-KE",
                      )
                    : "No purchases"}
                </p>
              </div>
            </div>

            <h3 className="mt-7 text-xl font-bold">Purchase History</h3>
            <div className="mt-3 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedCustomer.sales.map((sale) => (
                    <tr key={sale.id}>
                      <td className="px-4 py-3 font-semibold">
                        {sale.receiptNumber || sale.saleNumber}
                      </td>
                      <td className="px-4 py-3">
                        {new Date(sale.createdAt).toLocaleString("en-KE")}
                      </td>
                      <td className="px-4 py-3">{sale.branch.name}</td>
                      <td className="px-4 py-3">
                        {sale.payments
                          .map((payment) => payment.method)
                          .join(", ")}
                      </td>
                      <td className="px-4 py-3 font-bold">
                        KES {money(sale.totalAmount)}
                      </td>
                      <td className="px-4 py-3">{sale.status}</td>
                    </tr>
                  ))}
                  {selectedCustomer.sales.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No purchase history yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
