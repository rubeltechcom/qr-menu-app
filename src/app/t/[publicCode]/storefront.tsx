"use client";

import { useMemo, useState } from "react";
import { useCart } from "./use-cart";

interface MenuItemView {
  id: string;
  name: string;
  description: string | null;
  basePriceCents: number;
}

interface CategoryView {
  id: string;
  name: string;
  items: MenuItemView[];
}

type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type PaymentMode = "COUNTER" | "OPTIONAL" | "REQUIRED";

const TYPE_TABS: Array<{ value: OrderType; label: string }> = [
  { value: "DINE_IN", label: "Dine In" },
  { value: "TAKEAWAY", label: "Takeaway" },
  { value: "DELIVERY", label: "Delivery" },
];

export function Storefront({
  publicCode,
  tableLabel,
  locationName,
  currency,
  categories,
  paymentMode,
  providers,
}: {
  publicCode: string;
  tableLabel: string;
  locationName: string;
  currency: string;
  categories: CategoryView[];
  paymentMode: PaymentMode;
  providers: Array<{ id: string; displayName: string }>;
}) {
  const cart = useCart(publicCode);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [placed, setPlaced] = useState<{ orderNumber: number; trackToken: string } | null>(
    null,
  );

  const money = useMemo(() => makeMoneyFormatter(currency), [currency]);

  if (placed) {
    return (
      <OrderPlaced
        orderNumber={placed.orderNumber}
        trackToken={placed.trackToken}
        paymentMode={paymentMode}
        providers={providers}
      />
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg px-5 pb-28">
      <header className="pt-8 pb-4">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Table {tableLabel}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {locationName}
        </h1>
      </header>

      {categories.length === 0 ? (
        <p className="mt-10 text-sm text-zinc-600 dark:text-zinc-400">
          This menu isn&apos;t ready yet. Please ask a member of staff.
        </p>
      ) : (
        <>
          <nav className="sticky top-0 -mx-5 flex gap-2 overflow-x-auto bg-white/90 px-5 py-3 backdrop-blur dark:bg-black/90">
            {categories.map((category) => (
              <a
                key={category.id}
                href={`#category-${category.id}`}
                className="shrink-0 rounded-full border border-zinc-300 px-4 py-1.5 text-sm whitespace-nowrap text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                {category.name}
              </a>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-8">
            {categories.map((category) => (
              <section key={category.id} id={`category-${category.id}`} className="scroll-mt-16">
                <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                  {category.name}
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {category.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">
                          {item.name}
                        </p>
                        {item.description && (
                          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                            {item.description}
                          </p>
                        )}
                        <p className="mt-1 text-sm font-medium text-zinc-900 tabular-nums dark:text-zinc-50">
                          {money(item.basePriceCents)}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Add ${item.name}`}
                        onClick={() =>
                          cart.add({
                            menuItemId: item.id,
                            name: item.name,
                            unitPriceCents: item.basePriceCents,
                          })
                        }
                        className="shrink-0 rounded-full bg-green-600 px-4 py-2 text-lg leading-none font-semibold text-white"
                      >
                        +
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {cart.itemCount > 0 && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-lg bg-zinc-900 px-5 py-4 text-left text-white"
        >
          <span className="font-semibold">
            Order {cart.itemCount} for {money(cart.subtotalCents)}
          </span>
        </button>
      )}

      {isSheetOpen && (
        <CheckoutSheet
          publicCode={publicCode}
          tableLabel={tableLabel}
          cart={cart}
          money={money}
          onClose={() => setSheetOpen(false)}
          onPlaced={(result) => {
            cart.clear();
            setSheetOpen(false);
            setPlaced(result);
          }}
        />
      )}
    </div>
  );
}

function CheckoutSheet({
  publicCode,
  tableLabel,
  cart,
  money,
  onClose,
  onPlaced,
}: {
  publicCode: string;
  tableLabel: string;
  cart: ReturnType<typeof useCart>;
  money: (cents: number) => string;
  onClose: () => void;
  onPlaced: (result: { orderNumber: number; trackToken: string }) => void;
}) {
  const [type, setType] = useState<OrderType>("DINE_IN");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  // Which fields are required depends on the tab, and switching tabs
  // re-validates — the same behaviour as the reference flow.
  const missing = useMemo(() => {
    const gaps: string[] = [];
    if (type !== "DINE_IN") {
      if (!name.trim()) gaps.push("name");
      if (!phone.trim()) gaps.push("phone");
    }
    if (type === "DELIVERY" && address.trim().length < 6) gaps.push("address");
    return gaps;
  }, [type, name, phone, address]);

  const submit = async () => {
    setError(null);
    if (missing.length > 0) {
      setError("Fill all required fields");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicCode,
          type,
          items: cart.lines.map((line) => ({
            menuItemId: line.menuItemId,
            quantity: line.quantity,
          })),
          note: note.trim() || undefined,
          customerName: name.trim() || undefined,
          customerPhone: phone.trim() || undefined,
          ...(type === "DELIVERY" ? { deliveryAddress: address.trim() } : {}),
        }),
      });

      const payload = (await response.json()) as {
        orderNumber?: number;
        trackToken?: string;
        error?: string;
      };

      if (!response.ok || !payload.orderNumber || !payload.trackToken) {
        setError(payload.error ?? "Could not place the order. Please try again.");
        return;
      }

      onPlaced({ orderNumber: payload.orderNumber, trackToken: payload.trackToken });
    } catch {
      setError("You appear to be offline. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/40">
      <div className="mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Your order
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-zinc-500"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex border-b border-zinc-200 dark:border-zinc-800">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={type === tab.value}
              onClick={() => {
                setType(tab.value);
                setError(null);
              }}
              className={`flex-1 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                type === tab.value
                  ? "border-green-600 text-green-700 dark:text-green-400"
                  : "border-transparent text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ul className="mt-4 flex flex-col gap-3">
          {cart.lines.map((line) => (
            <li key={line.menuItemId} className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">
                {line.name}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`One fewer ${line.name}`}
                  onClick={() => cart.setQuantity(line.menuItemId, line.quantity - 1)}
                  className="h-8 w-8 rounded-full border border-zinc-300 text-lg leading-none dark:border-zinc-700"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                <button
                  type="button"
                  aria-label={`One more ${line.name}`}
                  onClick={() => cart.setQuantity(line.menuItemId, line.quantity + 1)}
                  className="h-8 w-8 rounded-full border border-zinc-300 text-lg leading-none dark:border-zinc-700"
                >
                  +
                </button>
              </div>
              <span className="w-20 shrink-0 text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                {money(line.unitPriceCents * line.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 flex justify-between border-t border-zinc-200 pt-3 font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
          <span>Total</span>
          <span className="tabular-nums">{money(cart.subtotalCents)}</span>
        </p>

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add note 🙏…"
          rows={2}
          className="mt-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />

        {type === "DINE_IN" ? (
          // Pre-filled from the scanned QR — the diner never types it.
          <p className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            Table {tableLabel}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <Field
              label="Name"
              value={name}
              onChange={setName}
              invalid={missing.includes("name")}
            />
            <Field
              label="Phone"
              value={phone}
              onChange={setPhone}
              type="tel"
              invalid={missing.includes("phone")}
            />
            {type === "DELIVERY" && (
              <Field
                label="Delivery address"
                value={address}
                onChange={setAddress}
                invalid={missing.includes("address")}
              />
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
          By tapping Order you confirm you are 18+ and agree to the terms.
        </p>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSubmitting || cart.lines.length === 0}
          className="mt-3 w-full rounded-full bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {isSubmitting ? "Placing…" : "ORDER"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  invalid?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        className={`rounded-lg border px-3 py-2 text-sm dark:bg-zinc-900 ${
          invalid
            ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      />
    </label>
  );
}

function OrderPlaced({
  orderNumber,
  trackToken,
  paymentMode,
  providers,
}: {
  orderNumber: number;
  trackToken: string;
  paymentMode: PaymentMode;
  providers: Array<{ id: string; displayName: string }>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canPayOnline = paymentMode !== "COUNTER" && providers.length > 0;

  const pay = async (provider: string) => {
    setBusy(provider);
    setError(null);
    try {
      const response = await fetch("/api/payments/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackToken, provider }),
      });
      const payload = (await response.json()) as { redirectUrl?: string; error?: string };

      if (!response.ok || !payload.redirectUrl) {
        setError(payload.error ?? "Could not start the payment.");
        setBusy(null);
        return;
      }
      // Full navigation, not a client-side route change: the provider's
      // page has to own the tab so the diner can complete 3-D Secure or
      // the bKash PIN step.
      window.location.assign(payload.redirectUrl);
    } catch {
      setError("You appear to be offline. Check your connection and try again.");
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl">✓</p>
      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Order #{orderNumber} sent to the kitchen
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {paymentMode === "REQUIRED"
          ? "Pay now to confirm your order."
          : "We'll bring it over as soon as it's ready."}
      </p>

      {canPayOnline && (
        <div className="mt-6 flex w-full flex-col gap-2">
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              disabled={busy !== null}
              onClick={() => void pay(provider.id)}
              className="w-full rounded-full bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {busy === provider.id ? "Opening…" : `Pay with ${provider.displayName}`}
            </button>
          ))}
          {paymentMode === "OPTIONAL" && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Or pay at the counter.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <a
        href={`/order/${trackToken}`}
        className="mt-6 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
      >
        Follow your order
      </a>
    </div>
  );
}

function makeMoneyFormatter(currency: string) {
  let format: Intl.NumberFormat | null = null;
  try {
    format = new Intl.NumberFormat(undefined, { style: "currency", currency });
  } catch {
    // Unrecognised code — fall through to a plain amount below.
  }
  return (cents: number) =>
    format ? format.format(cents / 100) : (cents / 100).toFixed(2);
}
