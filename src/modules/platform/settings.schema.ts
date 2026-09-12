/**
 * Every setting the platform operator can change from /admin.
 *
 * Declared as data rather than as a form, so the admin page renders
 * itself from this list and adding a setting means adding one entry
 * here — not touching a page, an action and a reader in three places.
 *
 * Each setting names the environment variable it replaces. Env stays
 * the fallback, which is what lets an install that is already deployed
 * keep working untouched: the database only overrides what an operator
 * has actually set.
 */

export type SettingKind = "text" | "multiline" | "secret" | "boolean" | "number";

export interface SettingDefinition {
  key: string;
  label: string;
  hint?: string;
  kind: SettingKind;
  /** The environment variable this falls back to when unset. */
  envVar?: string;
  placeholder?: string;
}

export interface SettingGroup {
  id: string;
  title: string;
  description: string;
  settings: SettingDefinition[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: "platform",
    title: "Platform",
    description: "How the product presents itself to restaurants and their guests.",
    settings: [
      {
        key: "platform.name",
        label: "Platform name",
        hint: "Shown in the header, page titles and emails.",
        kind: "text",
        placeholder: "Scanly",
      },
      {
        key: "platform.supportEmail",
        label: "Support email",
        hint: "Where restaurants are told to get help.",
        kind: "text",
        placeholder: "support@example.com",
      },
    ],
  },
  {
    id: "landing",
    title: "Landing page copy",
    description:
      "The words on the public home page. Leave a field blank to keep the " +
      "built-in wording.",
    settings: [
      {
        key: "landing.heroEyebrow",
        label: "Badge above the headline",
        kind: "text",
        placeholder: "Free plan — no card required",
      },
      {
        key: "landing.heroHeadline",
        label: "Headline",
        kind: "text",
        placeholder: "Your menu, your QR code, your orders.",
      },
      {
        key: "landing.heroSubheading",
        label: "Paragraph under the headline",
        kind: "multiline",
        placeholder:
          "Give every table a QR code. Guests browse your menu and order from " +
          "their own phone…",
      },
      {
        key: "landing.heroPrimaryCta",
        label: "Main button",
        kind: "text",
        placeholder: "Create your free menu",
      },
      {
        key: "landing.heroReassurance",
        label: "Small print under the buttons",
        kind: "text",
        placeholder: "Set up in an evening · Unlimited orders · Cancel any time",
      },
      {
        key: "landing.stepsHeading",
        label: "How-it-works heading",
        kind: "text",
        placeholder: "Live in three steps",
      },
      {
        key: "landing.stepsSubheading",
        label: "How-it-works subheading",
        kind: "multiline",
        placeholder: "No hardware to buy, no installation…",
      },
      {
        key: "landing.featuresHeading",
        label: "Features heading",
        kind: "text",
        placeholder: "Everything the front of house needs",
      },
      {
        key: "landing.featuresSubheading",
        label: "Features subheading",
        kind: "multiline",
        placeholder: "Built around a real service…",
      },
      {
        key: "landing.features",
        label: "Feature list",
        hint:
          "One per line, as: Title | Description. Icons stay in their " +
          "existing order. Blank keeps the built-in set.",
        kind: "multiline",
        placeholder: "A QR code for every table | Print a code per table…",
      },
      {
        key: "landing.showcaseHeading",
        label: "Example-menus heading",
        kind: "text",
        placeholder: "Menus already running on this platform",
      },
      {
        key: "landing.faqHeading",
        label: "FAQ heading",
        kind: "text",
        placeholder: "Questions, answered",
      },
      {
        key: "landing.ctaHeading",
        label: "Closing banner heading",
        kind: "text",
        placeholder: "Put a QR code on your tables tonight",
      },
      {
        key: "landing.ctaSubheading",
        label: "Closing banner text",
        kind: "multiline",
        placeholder: "Create your menu free. No card, no contract, no hardware.",
      },
      {
        key: "landing.steps",
        label: "How it works",
        hint:
          "One step per line, as: Title | Description. Blank keeps the three " +
          "built-in steps.",
        kind: "multiline",
        placeholder: "Register & get your QR | Tell us your restaurant's name…",
      },
      {
        key: "landing.faqs",
        label: "Frequently asked questions",
        hint: "One per line, as: Question | Answer. Blank keeps the built-in set.",
        kind: "multiline",
        placeholder: "Is the free plan really free? | Yes — no card required…",
      },
    ],
  },
  {
    id: "showcase",
    title: "Example menus",
    description:
      "Real menus shown on the landing page, so a visitor can see the product " +
      "before signing up. One per line: the table code, then a name. " +
      "For example: DEMO2345 | Wagamama",
    settings: [
      {
        key: "platform.demoTableCode",
        label: "Demo table code",
        hint:
          "The table the landing page's “See a live demo” button opens. Take it " +
          "from any restaurant's Tables page. Leave blank and the button is " +
          "hidden rather than leading to a dead link.",
        kind: "text",
        placeholder: "DEMO2345",
      },
      {
        key: "showcase.menus",
        label: "Menus to show",
        hint:
          "Use tables from restaurants that are happy to be featured. Each one " +
          "opens its live menu, so keep the list to menus that look good.",
        kind: "multiline",
        placeholder: "AB12CD34 | Riverside Kitchen",
      },
    ],
  },
  {
    id: "alerts",
    title: "Order alerts",
    description:
      "How staff are told a new order has arrived. Browsers require each " +
      "device to grant sound and notification permission itself — that cannot " +
      "be forced from here — but these control what happens once they have.",
    settings: [
      {
        key: "alerts.soundEnabled",
        label: "Play a sound for new orders",
        hint: "Turn off to leave staff screens silent, notifications only.",
        kind: "boolean",
      },
      {
        key: "alerts.soundUrl",
        label: "Alert sound",
        hint: "A URL to a short audio file. Leave blank for the built-in chime.",
        kind: "text",
        placeholder: "/sounds/new-order.wav",
      },
      {
        key: "alerts.repeatSeconds",
        label: "Repeat the sound every (seconds)",
        hint:
          "Keeps sounding while an order sits unaccepted, for a noisy kitchen. " +
          "0 plays once.",
        kind: "number",
        placeholder: "0",
      },
      {
        key: "alerts.desktopNotifications",
        label: "Show desktop notifications",
        hint: "A popup even when the tab is behind another window.",
        kind: "boolean",
      },
    ],
  },
  {
    id: "pricing",
    title: "Plan pricing",
    description:
      "What each plan costs, in whole units of your currency. Blank keeps " +
      "the built-in price. Changing a price here changes what the pricing " +
      "page advertises — it does NOT change what existing subscribers are " +
      "billed, which is set by the Stripe price they signed up on.",
    settings: [
      {
        key: "pricing.currencySymbol",
        label: "Currency symbol",
        hint: "Shown before the amount on the pricing page.",
        kind: "text",
        placeholder: "$",
      },
      {
        key: "pricing.smartMonthly",
        label: "Smart — per month",
        kind: "number",
        placeholder: "20",
      },
      {
        key: "pricing.smartYearly",
        label: "Smart — per year",
        kind: "number",
        placeholder: "200",
      },
      {
        key: "pricing.proMonthly",
        label: "Pro — per month",
        kind: "number",
        placeholder: "40",
      },
      {
        key: "pricing.proYearly",
        label: "Pro — per year",
        kind: "number",
        placeholder: "400",
      },
    ],
  },
  {
    id: "stripe",
    title: "Stripe",
    description:
      "Card payments, and the subscriptions restaurants pay you with. Leave blank to disable card payments entirely.",
    settings: [
      {
        key: "stripe.secretKey",
        label: "Secret key",
        kind: "secret",
        envVar: "STRIPE_SECRET_KEY",
        placeholder: "sk_live_…",
      },
      {
        key: "stripe.webhookSecret",
        label: "Webhook signing secret",
        hint: "From the Stripe dashboard's webhook endpoint.",
        kind: "secret",
        envVar: "STRIPE_WEBHOOK_SECRET",
        placeholder: "whsec_…",
      },
      {
        key: "stripe.connectClientId",
        label: "Connect client ID",
        hint: "Lets restaurants connect their own Stripe account.",
        kind: "text",
        envVar: "STRIPE_CONNECT_CLIENT_ID",
        placeholder: "ca_…",
      },
      {
        key: "stripe.priceSmartMonthly",
        label: "Smart plan — monthly price ID",
        kind: "text",
        envVar: "STRIPE_PRICE_SMART_MONTHLY",
        placeholder: "price_…",
      },
      {
        key: "stripe.priceSmartYearly",
        label: "Smart plan — yearly price ID",
        kind: "text",
        envVar: "STRIPE_PRICE_SMART_YEARLY",
        placeholder: "price_…",
      },
      {
        key: "stripe.priceProMonthly",
        label: "Pro plan — monthly price ID",
        kind: "text",
        envVar: "STRIPE_PRICE_PRO_MONTHLY",
        placeholder: "price_…",
      },
      {
        key: "stripe.priceProYearly",
        label: "Pro plan — yearly price ID",
        kind: "text",
        envVar: "STRIPE_PRICE_PRO_YEARLY",
        placeholder: "price_…",
      },
    ],
  },
  {
    id: "bkash",
    title: "bKash",
    description: "Mobile payments for Bangladesh. Leave blank to disable.",
    settings: [
      {
        key: "bkash.appKey",
        label: "App key",
        kind: "secret",
        envVar: "BKASH_APP_KEY",
      },
      {
        key: "bkash.appSecret",
        label: "App secret",
        kind: "secret",
        envVar: "BKASH_APP_SECRET",
      },
      {
        key: "bkash.username",
        label: "Username",
        kind: "secret",
        envVar: "BKASH_USERNAME",
      },
      {
        key: "bkash.password",
        label: "Password",
        kind: "secret",
        envVar: "BKASH_PASSWORD",
      },
      {
        key: "bkash.sandbox",
        label: "Sandbox mode",
        hint: "Leave on until you intend to move real money.",
        kind: "boolean",
        envVar: "BKASH_SANDBOX",
      },
    ],
  },
  {
    id: "uploads",
    title: "Uploads",
    description: "Limits on the photos and videos restaurants add to their menus.",
    settings: [
      {
        key: "uploads.maxImageMb",
        label: "Largest image (MB)",
        hint: "Photos are shrunk in the browser first, so this is a backstop.",
        kind: "number",
        placeholder: "8",
      },
      {
        key: "uploads.maxVideoMb",
        label: "Largest video (MB)",
        hint: "Short clips only — a long video is slow on a diner's phone.",
        kind: "number",
        placeholder: "20",
      },
      {
        key: "uploads.maxVideoSeconds",
        label: "Longest video (seconds)",
        kind: "number",
        placeholder: "15",
      },
    ],
  },
  {
    id: "google",
    title: "Google sign-in",
    description:
      "Lets restaurant owners sign up and log in with their Google " +
      "account. Leave blank and the button is hidden rather than shown " +
      "and broken. Create the credentials in Google Cloud Console under " +
      "APIs & Services → Credentials → OAuth client ID (Web application).",
    settings: [
      {
        key: "google.clientId",
        label: "Client ID",
        hint: "Ends in .apps.googleusercontent.com",
        kind: "text",
        envVar: "GOOGLE_CLIENT_ID",
        placeholder: "1234567890-abc.apps.googleusercontent.com",
      },
      {
        key: "google.clientSecret",
        label: "Client secret",
        kind: "secret",
        envVar: "GOOGLE_CLIENT_SECRET",
        placeholder: "GOCSPX-…",
      },
    ],
  },
  {
    id: "email",
    title: "Email",
    description:
      "Used for receipts and account emails. Set either Resend or SMTP — " +
      "Resend is used when both are configured.",
    settings: [
      {
        key: "email.resendApiKey",
        label: "Resend API key",
        kind: "secret",
        envVar: "RESEND_API_KEY",
        placeholder: "re_…",
      },
      {
        key: "email.from",
        label: "From address",
        hint: "The address recipients see. Must be a domain you have verified.",
        kind: "text",
        envVar: "EMAIL_FROM",
        placeholder: "Scanly <hello@example.com>",
      },
      {
        key: "email.replyTo",
        label: "Reply-to address",
        hint: "Where replies go, if different from the sender.",
        kind: "text",
        placeholder: "support@example.com",
      },
    ],
  },
  {
    id: "smtp",
    title: "SMTP server",
    description:
      "An alternative to Resend, for an operator who would rather send " +
      "through their own mail server. Ignored when a Resend key is set.",
    settings: [
      {
        key: "smtp.host",
        label: "Host",
        kind: "text",
        envVar: "SMTP_HOST",
        placeholder: "smtp.example.com",
      },
      {
        key: "smtp.port",
        label: "Port",
        hint: "587 for STARTTLS, 465 for implicit TLS.",
        kind: "number",
        envVar: "SMTP_PORT",
        placeholder: "587",
      },
      {
        key: "smtp.user",
        label: "Username",
        kind: "text",
        envVar: "SMTP_USER",
      },
      {
        key: "smtp.password",
        label: "Password",
        kind: "secret",
        envVar: "SMTP_PASSWORD",
      },
      {
        key: "smtp.secure",
        label: "Implicit TLS",
        hint: "On for port 465. Off for 587, which upgrades with STARTTLS.",
        kind: "boolean",
      },
    ],
  },
];

/** Flat lookup, for validating a submitted key. */
export const SETTING_BY_KEY = new Map<string, SettingDefinition>(
  SETTING_GROUPS.flatMap((group) =>
    group.settings.map((setting) => [setting.key, setting]),
  ),
);

/** Defaults applied when neither the database nor the environment has a value. */
export const SETTING_DEFAULTS: Record<string, string> = {
  "platform.name": "Scanly",
  // No demo code by default. The seeded DEMO2345 exists only on a
  // developer's machine, so shipping it as a default sent every live
  // install's "See a live demo" button to a 404.
  "alerts.soundEnabled": "true",
  "alerts.desktopNotifications": "true",
  "alerts.repeatSeconds": "0",
  "uploads.maxImageMb": "8",
  "uploads.maxVideoMb": "20",
  "uploads.maxVideoSeconds": "15",
};
