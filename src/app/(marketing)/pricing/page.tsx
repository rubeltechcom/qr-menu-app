import type { Metadata } from "next";
import Link from "next/link";
import { Pricing } from "@/components/marketing/pricing";
import { pricingProps } from "@/modules/platform/pricing-props";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free with a QR menu for one location and unlimited orders. Upgrade for more locations, translations and your own domain.",
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  return (
    <>
      <Pricing {...await pricingProps()} />

      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
            Not sure which one you need?
          </h2>
          <p className="mt-3 text-zinc-600">
            Start on Free. Nothing is deleted if you change plans later, and you can move
            up or down whenever your service does.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-full bg-zinc-900 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-zinc-700"
          >
            Create your free menu
          </Link>
        </div>
      </section>
    </>
  );
}
