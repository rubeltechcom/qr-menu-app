import type { Metadata } from "next";
import {
  getSetting,
  loadSettings,
  settingsLoaded,
} from "@/modules/platform/settings.service";
import { BRAND_NAME } from "@/lib/brand";

/**
 * The privacy policy.
 *
 * Required by Google before an OAuth consent screen can be verified,
 * and their check is on the page's content rather than its existence —
 * a stub is rejected. It therefore says what the product actually does
 * with data, which is also the only version worth publishing.
 *
 * Written from the settings so it names the operator running this
 * install rather than us, and stays correct if they rename the
 * platform.
 */
export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What data this service collects, why, and how it is handled.",
};

export const dynamic = "force-dynamic";

export default async function PrivacyPolicyPage() {
  if (!settingsLoaded()) await loadSettings();

  const platform = getSetting("platform.name")?.trim() || BRAND_NAME;
  const support = getSetting("platform.supportEmail")?.trim();

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        Privacy policy
      </h1>
      <p className="mt-3 text-sm text-zinc-500">Last updated 12 September 2026</p>

      <div className="mt-10 flex flex-col gap-8 leading-relaxed text-zinc-700">
        <section>
          <p>
            {platform} provides digital menus and ordering for restaurants. This policy
            explains what we collect, why, and what we do not do with it. There are two
            different groups of people using this service, and they are treated
            differently.
          </p>
        </section>

        <Section title="If you are a diner">
          <p>
            You do not need an account, and we do not ask you to create one. Scanning a QR
            code opens a menu; nothing is collected until you place an order.
          </p>
          <p className="mt-3">When you place an order we store:</p>
          <List
            items={[
              "The items you ordered, and any note you added to them.",
              "Your name and phone number, when the order is takeaway or delivery — so the restaurant can hand it to the right person, or reach you if something is wrong.",
              "A delivery address, for delivery orders only.",
              "Which table you scanned, for dine-in orders.",
            ]}
          />
          <p className="mt-3">
            This goes to the restaurant you ordered from, and to nobody else. We do not
            sell it, we do not use it for advertising, and we do not build a profile of
            you across restaurants.
          </p>
          <p className="mt-3">
            Your order tracking page is reached by an unguessable link rather than a
            login. Anyone holding that link can see that order, so treat it as private.
          </p>
          <p className="mt-3">
            Your language choice and your basket are kept in your own browser, not on our
            servers, and clearing your browser data removes them.
          </p>
        </Section>

        <Section title="If you run a restaurant">
          <p>We store the account and business information you give us:</p>
          <List
            items={[
              "Your name and email address, and a password we never store in readable form.",
              "If you sign in with Google, your name, email address and profile picture as Google provides them. We do not receive your Google password and cannot act on your Google account.",
              "Your restaurant's name, menu, photos, tables and settings.",
              "Orders placed with you, which are your business records.",
            ]}
          />
          <p className="mt-3">
            Each restaurant&rsquo;s data is isolated at the database level. One restaurant
            cannot read another&rsquo;s menu, orders or customers.
          </p>
        </Section>

        <Section title="Payments">
          <p>
            Card and mobile payments are handled by the payment provider the restaurant
            has connected — Stripe or bKash. Card numbers are entered on the
            provider&rsquo;s own systems and never reach ours. We store only what the
            provider tells us about an outcome: whether a payment succeeded, its amount,
            and a reference for it.
          </p>
        </Section>

        <Section title="How long we keep things">
          <p>
            Orders are kept as business records for as long as the restaurant&rsquo;s
            account is open, because both sides may need to refer back to them. Account
            data is kept until the account is closed. Deleting a menu item hides it from
            guests but keeps it against past orders, so an old receipt still makes sense.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We use cookies to keep you signed in and to protect forms against cross-site
            request forgery. There are no advertising or tracking cookies, and no
            third-party analytics that follow you elsewhere.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            A diner can ask the restaurant they ordered from to remove their details. A
            restaurant owner can edit or delete their data from the dashboard, and can ask
            for their account and everything in it to be deleted.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            {support ? (
              <>
                Questions about this policy, or a request about your data, can go to{" "}
                <a
                  href={`mailto:${support}`}
                  className="font-medium text-zinc-900 underline underline-offset-2"
                >
                  {support}
                </a>
                .
              </>
            ) : (
              <>
                Questions about this policy, or a request about your data, can go to the
                restaurant you ordered from, or to the operator of this {platform}{" "}
                install.
              </>
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
