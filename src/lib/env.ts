import { z } from "zod";

/**
 * Centralized, validated environment configuration.
 *
 * Every environment variable the app relies on must be declared here.
 * The app must fail loudly at boot if a required variable is missing or
 * malformed — never fail mysteriously later at runtime.
 *
 * Do NOT read `process.env.X` anywhere else in the codebase. Import `env`
 * from this module instead, so every value is typed and pre-validated.
 */

// Next.js merges multiple .env files (.env, .env.local, ...) and an
// optional key declared with no value in one of them arrives as "" —
// not undefined — even though the variable is conceptually "unset". A
// bare z.string().optional() rejects "" (it fails .min(1)/.url()), so
// every optional var below goes through this helper to treat an empty
// string the same as a genuinely absent one.
const optionalString = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // --- App ---
  APP_URL: z.string().url().describe("Public base URL of the marketing site"),
  APP_DOMAIN: z
    .string()
    .min(1)
    .describe("Root domain used for tenant subdomain resolution, e.g. example.com"),

  // --- Database ---
  DATABASE_URL: z.string().url(),

  // --- Redis ---
  REDIS_URL: z.string().url(),

  // --- Auth ---
  AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: optionalString(z.string()),
  GOOGLE_CLIENT_SECRET: optionalString(z.string()),

  // --- Stripe ---
  STRIPE_SECRET_KEY: optionalString(z.string().min(1)),
  STRIPE_WEBHOOK_SECRET: optionalString(z.string().min(1)),
  STRIPE_CONNECT_CLIENT_ID: optionalString(z.string().min(1)),
  // Price ids for the Smart and Pro plans. Optional so the app runs
  // without billing configured; the checkout route reports the missing
  // one by name rather than failing with a Stripe error.
  STRIPE_PRICE_SMART_MONTHLY: optionalString(z.string().min(1)),
  STRIPE_PRICE_SMART_YEARLY: optionalString(z.string().min(1)),
  STRIPE_PRICE_PRO_MONTHLY: optionalString(z.string().min(1)),
  STRIPE_PRICE_PRO_YEARLY: optionalString(z.string().min(1)),

  // --- bKash (Tokenized Checkout) ---
  BKASH_APP_KEY: optionalString(z.string().min(1)),
  BKASH_APP_SECRET: optionalString(z.string().min(1)),
  BKASH_USERNAME: optionalString(z.string().min(1)),
  BKASH_PASSWORD: optionalString(z.string().min(1)),
  // Defaults to sandbox: pointing at live money should be a deliberate
  // act, never something a missing variable does for you.
  BKASH_SANDBOX: z
    .preprocess((value) => value !== "false", z.boolean())
    .default(true),

  // --- Object storage (S3-compatible) ---
  // Setting these switches uploads from local disk to S3. All of BUCKET,
  // ACCESS_KEY_ID and SECRET_ACCESS_KEY are required together; ENDPOINT
  // is omitted for real AWS and set for R2/MinIO.
  S3_ENDPOINT: optionalString(z.string().url()),
  S3_BUCKET: optionalString(z.string().min(1)),
  S3_ACCESS_KEY_ID: optionalString(z.string().min(1)),
  S3_SECRET_ACCESS_KEY: optionalString(z.string().min(1)),
  S3_PUBLIC_URL: optionalString(z.string().url()),

  // --- Uploads (local filesystem driver) ---
  // Where dish photos are written when S3 is not configured. Defaults to
  // <cwd>/var/uploads. IN DOCKER THIS MUST POINT AT A MOUNTED VOLUME —
  // anything inside the image is destroyed on every redeploy, taking the
  // restaurant's photos with it. src/instrumentation.ts checks this at
  // boot rather than letting it surface as a 500 on the first upload.
  UPLOAD_DIR: optionalString(z.string().min(1)),
  // Server-side hard cap in bytes. The client downscales well below this,
  // so hitting it means something is wrong rather than merely large.
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  // Optional absolute prefix (a CDN) for locally-stored files. Unset
  // means same-origin, which is what a single-server install wants.
  UPLOAD_PUBLIC_BASE: optionalString(z.string().url()),

  // --- Email ---
  RESEND_API_KEY: optionalString(z.string().min(1)),
  EMAIL_FROM: optionalString(z.string().email()),

  // --- Observability ---
  SENTRY_DSN: optionalString(z.string().url()),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    // Crash loudly and immediately — a misconfigured deploy must never
    // limp along and fail mysteriously at 3am on the first real request.
    throw new Error(
      `Invalid environment configuration. Fix the following and restart:\n${issues}`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();
