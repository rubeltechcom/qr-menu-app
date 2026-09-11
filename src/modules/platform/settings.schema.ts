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

export type SettingKind = "text" | "secret" | "boolean" | "number";

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
        placeholder: "QR Menu",
      },
      {
        key: "platform.supportEmail",
        label: "Support email",
        hint: "Where restaurants are told to get help.",
        kind: "text",
        placeholder: "support@example.com",
      },
      {
        key: "platform.demoTableCode",
        label: "Demo table code",
        hint: "The table the landing page's “See a live demo” button opens.",
        kind: "text",
        placeholder: "DEMO2345",
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
    id: "email",
    title: "Email",
    description: "Used for receipts and account emails.",
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
        kind: "text",
        envVar: "EMAIL_FROM",
        placeholder: "QR Menu <hello@example.com>",
      },
    ],
  },
];

/** Flat lookup, for validating a submitted key. */
export const SETTING_BY_KEY = new Map<string, SettingDefinition>(
  SETTING_GROUPS.flatMap((group) => group.settings.map((setting) => [setting.key, setting])),
);

/** Defaults applied when neither the database nor the environment has a value. */
export const SETTING_DEFAULTS: Record<string, string> = {
  "platform.name": "QR Menu",
  "platform.demoTableCode": "DEMO2345",
  "uploads.maxImageMb": "8",
  "uploads.maxVideoMb": "20",
  "uploads.maxVideoSeconds": "15",
};
