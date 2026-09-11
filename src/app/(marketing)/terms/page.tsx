import type { Metadata } from "next";
import Link from "next/link";
import {
  getSetting,
  loadSettings,
  settingsLoaded,
} from "@/modules/platform/settings.service";

/**
 * Terms of service.
 *
 * Google's OAuth verification asks for this alongside the privacy
 * policy, and the storefront's checkout already links to "terms" — a
 * link that went nowhere until this existed.
 */
export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using this service, for restaurants and for diners.",
};

export const dynamic = "force-dynamic";

export default async function TermsPage() {
  if (!settingsLoaded()) await loadSettings();

  const platform = getSetting("platform.name")?.trim() || "QR Menu";
  const support = getSetting("platform.supportEmail")?.trim();

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        Terms of service
      </h1>
      <p className="mt-3 text-sm text-zinc-500">Last updated 12 September 2026</p>

      <div className="mt-10 flex flex-col gap-8 leading-relaxed text-zinc-700">
        <section>
          <p>
            {platform} gives restaurants a digital menu and takes orders from their
            guests. Using the service means accepting these terms.
          </p>
        </section>

        <Section title="What we provide, and what we do not">
          <p>
            We provide the software. The restaurant provides the food, sets its own
            prices, decides what it can deliver and when, and is responsible for the
            accuracy of its menu — including allergen and dietary information.
          </p>
          <p className="mt-3">
            An order placed through this service is a contract between the diner and the
            restaurant. We are not a party to it. If an order is wrong, late, or not what
            you expected, the restaurant is who to talk to.
          </p>
        </Section>

        <Section title="If you run a restaurant">
          <p>You agree to:</p>
          <List
            items={[
              "Keep your menu, prices and availability accurate, and your allergen information correct.",
              "Fulfil the orders you accept, or reject them promptly with a reason.",
              "Keep your login credentials to yourself, and your staff PINs within your team.",
              "Upload only content you have the right to use — your own photographs, or ones you are licensed to publish.",
              "Comply with the food safety, hygiene and consumer law that applies where you trade.",
            ]}
          />
          <p className="mt-3">
            Your menu, photographs and business data remain yours. You grant us only the
            permission needed to display them to your guests and run the service.
          </p>
        </Section>

        <Section title="If you are a diner">
          <p>
            Order honestly: give a phone number that reaches you and, for delivery, an
            address that exists. Where alcohol is sold, you confirm you are of legal
            drinking age in your country when you place the order.
          </p>
          <p className="mt-3">
            Cancellations, refunds and complaints are handled by the restaurant under its
            own policy.
          </p>
        </Section>

        <Section title="Plans and payment">
          <p>
            Paid plans are billed in advance for the period you choose. Prices are shown
            on the{" "}
            <Link
              href="/pricing"
              className="font-medium text-zinc-900 underline underline-offset-2"
            >
              pricing page
            </Link>{" "}
            before you subscribe. Cancelling stops future billing; the plan continues
            until the end of the period already paid for, after which the account reverts
            to the free plan rather than being deleted.
          </p>
          <p className="mt-3">
            Where the platform takes a percentage of an order, it is stated on the pricing
            page for the plan in question.
          </p>
        </Section>

        <Section title="Availability">
          <p>
            We work to keep the service running but do not guarantee uninterrupted
            availability. Maintenance, upstream provider failures and outages can happen.
            A restaurant should be able to take an order on paper if it has to.
          </p>
        </Section>

        <Section title="Suspension">
          <p>
            We may suspend an account that breaks these terms — for fraud, for illegal
            use, or for content that has no business being on a menu. Suspension hides a
            restaurant&rsquo;s storefront; it does not delete its data, so an account
            restored after a misunderstanding comes back intact.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            These terms may change as the product does. Material changes will be announced
            to restaurant owners by email before they take effect.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            {support ? (
              <>
                Questions about these terms can go to{" "}
                <a
                  href={`mailto:${support}`}
                  className="font-medium text-zinc-900 underline underline-offset-2"
                >
                  {support}
                </a>
                .
              </>
            ) : (
              <>Questions about these terms can go to the operator of this install.</>
            )}
          </p>
        </Section>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
