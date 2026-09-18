"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  useRouter,
} from "next/navigation";

import {
  clearSession,
  getSession,
} from "../../../lib/auth";

type Shift = {
  id: string;
  shiftNumber: string;

  status:
    | "OPEN"
    | "CLOSED";

  openingCash: string;

  expectedCash:
    | string
    | null;

  countedCash:
    | string
    | null;

  cashDifference:
    | string
    | null;

  openedAt: string;

  closedAt:
    | string
    | null;

  branch: {
    id: string;
    name: string;
    code: string;
  };

  user: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
};

type ShiftSummary = {
  totals: {
    openingFloat: string;
    cashSales: string;
    cashRefunds: string;
    cashIn: string;
    cashOut: string;
    bankDrops: string;
  };

  movements: {
    id: string;
    type: string;
    amount: string;
    reference?: string | null;
    notes?: string | null;
    createdAt: string;
  }[];
};

function money(
  value:
    | string
    | number
    | null,
) {
  return Number(
    value ?? 0,
  ).toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );
}

export default function ShiftPage() {
  const router =
    useRouter();

  const [shift, setShift] =
    useState<Shift | null>(
      null,
    );

  const [summary, setSummary] =
    useState<ShiftSummary | null>(
      null,
    );

  const [movementType, setMovementType] =
    useState<
      "CASH_IN" |
      "CASH_OUT" |
      "BANK_DROP"
    >("CASH_OUT");

  const [movementAmount, setMovementAmount] =
    useState("");

  const [movementNotes, setMovementNotes] =
    useState("");

  const [
    openingCash,
    setOpeningCash,
  ] = useState("");

  const [
    countedCash,
    setCountedCash,
  ] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [working, setWorking] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const session =
    getSession();

  async function request(
    url: string,
    options:
      RequestInit = {},
  ) {
    if (!session) {
      clearSession();

      router.replace(
        "/login",
      );

      throw new Error(
        "Login required",
      );
    }

    const response =
      await fetch(url, {
        ...options,

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${session.accessToken}`,

          ...(options.headers ??
            {}),
        },
      });

    if (
      response.status === 401
    ) {
      clearSession();

      router.replace(
        "/login",
      );

      throw new Error(
        "Your session expired",
      );
    }

    return response;
  }

  async function loadShift() {
    setLoading(true);
    setMessage("");

    try {
      const response =
        await request(
          "http://localhost:3001/shifts/current",
        );

      if (!response.ok) {
        throw new Error(
          "Unable to load shift",
        );
      }

      const data =
        await response.json();

      setShift(data);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load shift",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadShift();
  }, []);

  async function loadSummary() {
    if (!shift) {
      setSummary(null);
      return;
    }

    const response =
      await request(
        "http://localhost:3001/shifts/summary",
      );

    if (!response.ok) {
      return;
    }

    const data =
      await response.json();

    setSummary(data);
  }

  useEffect(() => {
    if (shift) {
      loadSummary();
    }
  }, [shift]);

  async function addMovement(
    event: FormEvent,
  ) {
    event.preventDefault();

    setWorking(true);

    try {
      const response =
        await request(
          "http://localhost:3001/shifts/cash-movement-requests",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                type:
                  movementType,

                amount:
                  Number(
                    movementAmount,
                  ),

                reason:
                  movementNotes,
              }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to submit cash movement request",
        );
      }

      setMovementAmount("");
      setMovementNotes("");

      setMessage(
        "Request submitted for manager approval.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit movement request",
      );
    } finally {
      setWorking(false);
    }
  }

  async function openShift(
    event: FormEvent,
  ) {
    event.preventDefault();

    setWorking(true);
    setMessage("");

    try {
      const response =
        await request(
          "http://localhost:3001/shifts/open",
          {
            method: "POST",

            body:
              JSON.stringify({
                openingCash:
                  Number(
                    openingCash,
                  ),
              }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(
            data.message,
          )
            ? data.message.join(
                ", ",
              )
            : data.message ??
                "Unable to open shift",
        );
      }

      setShift(data);
      setOpeningCash("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to open shift",
      );
    } finally {
      setWorking(false);
    }
  }

  async function closeShift(
    event: FormEvent,
  ) {
    event.preventDefault();

    setWorking(true);
    setMessage("");

    try {
      const response =
        await request(
          "http://localhost:3001/shifts/close",
          {
            method: "POST",

            body:
              JSON.stringify({
                countedCash:
                  Number(
                    countedCash,
                  ),
              }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(
            data.message,
          )
            ? data.message.join(
                ", ",
              )
            : data.message ??
                "Unable to close shift",
        );
      }

      setShift(null);

      setSummary(null);

      setCountedCash("");

      setOpeningCash("");

      setMessage(
        `Expected: KES ${money(
          data.expectedCash,
        )}. Counted: KES ${money(
          data.countedCash,
        )}. Variance: KES ${money(
          data.cashDifference,
        )}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to close shift",
      );
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        Loading shift...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4 lg:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Cashier Shift
            </h1>

            <p className="text-gray-500">
              Manage your till session
            </p>
          </div>

          <Link
            href="/pos"
            className="rounded-xl bg-black px-4 py-3 font-semibold text-white"
          >
            POS
          </Link>
        </div>

        {message && (
          <div className="mb-5 rounded-xl bg-blue-50 p-4 text-sm font-medium">
            {message}
          </div>
        )}

        {!shift ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">
              Open Shift
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Enter the physical cash
              currently placed in your
              till.
            </p>

            <form
              onSubmit={
                openShift
              }
              className="mt-6"
            >
              <label className="mb-2 block font-semibold">
                Opening Cash
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  openingCash
                }
                onChange={(
                  event,
                ) =>
                  setOpeningCash(
                    event.target
                      .value,
                  )
                }
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-xl"
                placeholder="5000"
              />

              <button
                type="submit"
                disabled={
                  working
                }
                className="mt-5 w-full rounded-xl bg-green-600 px-4 py-4 text-lg font-bold text-white disabled:opacity-50"
              >
                {working
                  ? "Opening..."
                  : "Open Shift"}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">
                    Current Shift
                  </p>

                  <p className="text-lg font-bold">
                    {
                      shift.shiftNumber
                    }
                  </p>
                </div>

                <span className="rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-700">
                  OPEN
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">
                    Branch
                  </p>

                  <p className="font-semibold">
                    {
                      shift.branch
                        .name
                    }
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Opened
                  </p>

                  <p className="font-semibold">
                    {new Date(
                      shift.openedAt,
                    ).toLocaleString(
                      "en-KE",
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Opening Cash
                  </p>

                  <p className="text-xl font-bold">
                    KES{" "}
                    {money(
                      shift.openingCash,
                    )}
                  </p>
                </div>
              </div>
            </div>

            {summary && (
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">
                  Cash Drawer
                </h2>

                <div className="mt-5 space-y-3">
                  <div className="flex justify-between">
                    <span>
                      Opening Float
                    </span>

                    <strong>
                      KES{" "}
                      {money(
                        summary.totals
                          .openingFloat,
                      )}
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span>
                      Cash Sales
                    </span>

                    <strong>
                      + KES{" "}
                      {money(
                        summary.totals
                          .cashSales,
                      )}
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span>
                      Cash In
                    </span>

                    <strong>
                      + KES{" "}
                      {money(
                        summary.totals
                          .cashIn,
                      )}
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span>
                      Cash Refunds
                    </span>

                    <strong>
                      - KES{" "}
                      {money(
                        summary.totals
                          .cashRefunds,
                      )}
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span>
                      Cash Out
                    </span>

                    <strong>
                      - KES{" "}
                      {money(
                        summary.totals
                          .cashOut,
                      )}
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span>
                      Bank Drops
                    </span>

                    <strong>
                      - KES{" "}
                      {money(
                        summary.totals
                          .bankDrops,
                      )}
                    </strong>
                  </div>

                </div>
              </div>
            )}

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">
                Cash Movement
              </h2>

              <form
                onSubmit={addMovement}
                className="mt-5 space-y-4"
              >
                <select
                  value={movementType}
                  onChange={(event) =>
                    setMovementType(
                      event.target.value as
                        | "CASH_IN"
                        | "CASH_OUT"
                        | "BANK_DROP",
                    )
                  }
                  className="w-full rounded-xl border px-4 py-3"
                >
                  <option value="CASH_IN">
                    Cash In
                  </option>

                  <option value="CASH_OUT">
                    Cash Out
                  </option>

                  <option value="BANK_DROP">
                    Bank / Safe Drop
                  </option>
                </select>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={movementAmount}
                  onChange={(event) =>
                    setMovementAmount(
                      event.target.value,
                    )
                  }
                  placeholder="Amount"
                  className="w-full rounded-xl border px-4 py-3"
                  required
                />

                <input
                  value={movementNotes}
                  onChange={(event) =>
                    setMovementNotes(
                      event.target.value,
                    )
                  }
                  placeholder="Reason / notes"
                  className="w-full rounded-xl border px-4 py-3"
                />

                <button
                  type="submit"
                  disabled={working}
                  className="w-full rounded-xl bg-black px-4 py-3 font-bold text-white disabled:opacity-50"
                >
                  Request Cash Movement
                </button>
              </form>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">
                Close Shift
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Count all physical cash
                in the drawer.
              </p>

              <form
                onSubmit={
                  closeShift
                }
                className="mt-6"
              >
                <label className="mb-2 block font-semibold">
                  Counted Cash
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    countedCash
                  }
                  onChange={(
                    event,
                  ) =>
                    setCountedCash(
                      event.target
                        .value,
                    )
                  }
                  required
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-xl"
                />

                <button
                  type="submit"
                  disabled={
                    working
                  }
                  className="mt-5 w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-bold text-white disabled:opacity-50"
                >
                  {working
                    ? "Closing..."
                    : "Close Shift"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
