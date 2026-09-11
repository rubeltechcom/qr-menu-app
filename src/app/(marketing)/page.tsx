import Link from "next/link";
import {
  BellRing,
  ChefHat,
  CreditCard,
  Languages,
  QrCode,
  RefreshCw,
  Smartphone,
  Truck,
} from "lucide-react";
import { Pricing } from "@/components/marketing/pricing";

/**
 * The marketing home page.
 *
 * Written for a restaurant owner deciding in about thirty seconds
 * whether this is worth ten minutes of their evening, so the free plan
 * and the speed to a working QR code lead, and everything else follows.
 */

/** The demo table seeded by prisma/seed-demo.mjs, used by the demo CTA. */
const DEMO_TABLE_CODE = "DEMO2345";

const STEPS = [
  {
    title: "Register & get your QR",
    body: "Tell us your restaurant's name, language and timezone. Your QR code is ready straight away — download it, print it, put it on the tables.",
  },
  {
    title: "Add categories & items",
    body: "Build your menu from your phone or your laptop. Photograph a dish and upload it in a tap. Change a price at 11am and every table sees it at 11am.",
  },
  {
    title: "Start receiving orders",
    body: "Guests scan, browse and order — dine-in, takeaway or delivery. Orders land on your kitchen screen with a sound, and staff work the queue from there.",
  },
];

const FEATURES = [
  {
    icon: QrCode,
    title: "A QR code for every table",
    body: "Print a code per table, and every order arrives already labelled with where it is sitting. No app for the guest to install.",
  },
  {
    icon: Smartphone,
    title: "A menu that looks like your food",
    body: "Photos, categories, dietary tags and prices — laid out for a phone held in one hand at a busy table.",
  },
  {
    icon: RefreshCw,
    title: "Instant menu updates",
    body: "Sold out of the special? Toggle it off and it disappears from every phone in the room immediately. No reprinting.",
  },
  {
    icon: BellRing,
    title: "Nobody misses an order",
    body: "New orders ring out loud and raise a desktop notification — even when the tab is in the background or the tablet is on the pass.",
  },
  {
    icon: ChefHat,
    title: "Kitchen & floor screens",
    body: "A kitchen display built for a hot, bright room, and a waiter view organised by table rather than by queue.",
  },
  {
    icon: Truck,
    title: "Dine-in, takeaway & delivery",
    body: "One menu covers all three. Takeaway and delivery collect the details you need; dine-in already knows the table.",
  },
  {
    icon: CreditCard,
    title: "Take payment however you like",
    body: "Card payments through Stripe, bKash for Bangladesh, or simply settle at the counter. Your call, per restaurant.",
  },
  {
    icon: Languages,
    title: "Ready for your guests' language",
    body: "Automatic menu translation on paid plans, so a visitor reads your menu in the language they think in.",
  },
];

const FAQS = [
  {
    question: "Is the free plan really free?",
    answer:
      "Yes. One location, unlimited categories and menu items, and unlimited dine-in, takeaway and delivery orders, with no card required. Online payments carry card rates plus a 1% platform fee on Free; paid plans have no platform fee.",
  },
  {
    question: "Do my guests need to install anything?",
    answer:
      "No. They point their camera at the QR code and your menu opens in their browser. There is no app, no sign-up and no account for the guest.",
  },
  {
    question: "How long does it take to set up?",
    answer:
      "Most restaurants are taking orders within an evening. Create an account, add your dishes, print the table QR codes, and you are live.",
  },
  {
    question: "Can I keep taking payment at the counter?",
    answer:
      "Absolutely. Online payment is optional — you can run the whole system as an ordering tool and settle however you already do.",
  },
  {
    question: "What happens to my menu if I stop paying?",
    answer:
      "Nothing is deleted. Your account falls back to the Free plan and your menu keeps working; the paid features simply switch off until you upgrade again.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-200 bg-gradient-to-b from-amber-50 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
              Free plan — no card required
            </span>

            <h1 className="mt-5 text-4xl leading-[1.1] font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl">
              Your menu, your QR code, your orders.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-600">
              Give every table a QR code. Guests browse your menu and order from their own
              phone — dine-in, takeaway or delivery — and the order lands straight on your
              kitchen screen. Update a price from your phone and every table sees it
              instantly.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-full bg-zinc-900 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-zinc-700"
              >
                Create your free menu
              </Link>
              <Link
                href={`/t/${DEMO_TABLE_CODE}`}
                className="rounded-full border border-zinc-300 bg-white px-7 py-3.5 text-base font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
              >
                See a live demo
              </Link>
            </div>

            <p className="mt-4 text-sm text-zinc-500">
              Set up in an evening · Unlimited orders · Cancel any time
            </p>
          </div>

          {/* A phone showing the storefront, drawn rather than screenshotted
              so it can never drift out of date with the real product. */}
          <div className="relative mx-auto w-full max-w-[320px]">
            <div className="rounded-[2.5rem] border-8 border-zinc-900 bg-white shadow-2xl">
              <div className="flex items-center justify-between rounded-t-[1.8rem] bg-white px-5 pt-5">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">⭐</span>
                  <span className="text-lg font-bold tracking-tight lowercase">
                    your place
                  </span>
                </div>
                <span className="rounded-full border border-zinc-200 px-2 py-1 text-[10px] font-medium">
                  English
                </span>
              </div>

              <div className="flex gap-3 overflow-hidden px-5 pt-5">
                {[
                  { icon: "👌", label: "popular", active: true },
                  { icon: "🍛", label: "curry", active: false },
                  { icon: "🍜", label: "ramen", active: false },
                ].map((category) => (
                  <div
                    key={category.label}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${
                        category.active ? "bg-yellow-400" : "bg-zinc-100"
                      }`}
                    >
                      {category.icon}
                    </div>
                    <span className="text-[10px] font-medium text-zinc-600 lowercase">
                      {category.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2.5 p-5">
                {[
                  { emoji: "🍜", name: "chicken ramen", price: "8.95" },
                  { emoji: "🍛", name: "katsu curry", price: "9.50" },
                  { emoji: "🥟", name: "gyoza", price: "5.25" },
                  { emoji: "🍡", name: "mochi", price: "4.00" },
                ].map((dish) => (
                  <div
                    key={dish.name}
                    className="rounded-xl border border-zinc-200 p-2.5 shadow-sm"
                  >
                    <div className="mb-2 flex aspect-square items-center justify-center rounded-full bg-zinc-100 text-3xl">
                      {dish.emoji}
                    </div>
                    <p className="truncate text-[11px] font-semibold lowercase">
                      {dish.name}
                    </p>
                    <div className="mt-0.5 flex items-center justify-between">
                      <span className="text-[11px] font-bold">{dish.price} £</span>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs text-white">
                        +
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-b-[1.8rem] bg-zinc-950 px-5 py-3.5 text-white">
                <div className="flex items-center justify-between text-sm font-bold">
                  <span className="italic">Order 2 for 17.90 £</span>
                  <span>🧾</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Live in three steps
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-600">
            No hardware to buy, no installation, and nothing for your guests to download.
          </p>
        </div>

        <ol className="mt-14 grid gap-10 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-lg font-bold text-white">
                {index + 1}
              </span>
              <h3 className="mt-5 text-xl font-semibold text-zinc-900">{step.title}</h3>
              <p className="mt-3 leading-relaxed text-zinc-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Everything the front of house needs
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-600">
              Built around a real service: a phone at the table, a screen in the kitchen,
              and nothing in between that can go wrong.
            </p>
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div key={feature.title}>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold text-zinc-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Pricing />

      {/* FAQ */}
      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Questions, answered
          </h2>

          <dl className="mt-12 flex flex-col gap-8">
            {FAQS.map((faq) => (
              <div key={faq.question}>
                <dt className="font-semibold text-zinc-900">{faq.question}</dt>
                <dd className="mt-2 leading-relaxed text-zinc-600">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="bg-zinc-900">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Put a QR code on your tables tonight
          </h2>
          <p className="mt-4 text-lg text-zinc-300">
            Create your menu free. No card, no contract, no hardware.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-full bg-white px-8 py-4 text-base font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            Create your free menu
          </Link>
        </div>
      </section>
    </>
  );
}
