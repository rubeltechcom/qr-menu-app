import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import { checkUploadRateLimit } from "@/modules/storage/rate-limit";
import {
  UploadError,
  maxImageBytes,
  maxVideoBytes,
  uploadImage,
} from "@/modules/storage/upload.service";
import type { UploadKind } from "@/modules/storage/provider";

/**
 * Dish and category photo upload.
 *
 * A route handler rather than a Server Action for three reasons: Server
 * Actions cap the request body at 1MB by default and raising that raises
 * it for every action in the app; only XMLHttpRequest against a real
 * endpoint can report upload progress, which is what makes this feel
 * solid on a phone in a restaurant; and an upload in flight can be
 * cancelled cleanly.
 *
 * The bytes stop here. Writing the resulting URL onto a menu item is a
 * Server Action (see the menu dashboard's actions.ts), so the tenancy
 * and revalidation conventions used everywhere else stay intact.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS: readonly UploadKind[] = ["menuItem", "category", "brand"];

const STATUS: Record<UploadError["code"], number> = {
  NO_FILE: 400,
  TOO_LARGE: 413,
  UNSUPPORTED_TYPE: 415,
  TOO_MANY_PIXELS: 413,
  STORAGE_FAILED: 500,
};

export async function POST(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return Response.json({ error: "Missing tenant." }, { status: 400 });
  }

  // Server Actions get an origin check from the framework; route
  // handlers do not, so a cross-site form POST would otherwise ride the
  // user's session cookie straight into this endpoint.
  //
  // Compared against the host the BROWSER reached, not request.nextUrl:
  // behind a reverse proxy (Coolify, nginx, Cloudflare) nextUrl is
  // rebuilt from the internal request and reads http://localhost:3000,
  // which never matches the real origin and rejected every upload.
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: "Cross-origin uploads are not allowed." },
      { status: 403 },
    );
  }

  const kindParam = request.nextUrl.searchParams.get("kind") ?? "menuItem";
  if (!KINDS.includes(kindParam as UploadKind)) {
    return Response.json({ error: "Unknown upload kind." }, { status: 400 });
  }
  const kind = kindParam as UploadKind;

  // The same gate every dashboard mutation uses: session, membership in
  // this tenant, and a role that belongs in the owner dashboard. The
  // tenant id used to place the file comes from here and nowhere else,
  // so nothing in the request can aim an upload at another restaurant.
  let tenantId: string;
  try {
    const { tenant } = await requireDashboardTenant(tenantSlug);
    tenantId = tenant.id;
  } catch (error) {
    // requireDashboardTenant signals "no" by throwing Next's navigation
    // errors, which would surface to fetch() as an opaque 500. A JSON
    // 403 is what the uploader can actually show the owner.
    if (isNavigationError(error)) {
      return Response.json(
        { error: "You can't upload to this restaurant." },
        { status: 403 },
      );
    }
    throw error;
  }

  const limit = await checkUploadRateLimit(tenantId);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many uploads just now. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  // Reject an oversized body before allocating anything for it. Uses
  // the larger of the two caps, because the real type is not known
  // until the bytes are sniffed; upload.service then applies the right
  // one to the actual file.
  const ceiling = Math.max(maxImageBytes(), maxVideoBytes());
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > ceiling * 1.1) {
    const limitMb = Math.floor(ceiling / (1024 * 1024));
    return Response.json(
      { error: `That file is larger than ${limitMb}MB.` },
      { status: 413 },
    );
  }

  let file: File | null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    file = candidate instanceof File ? candidate : null;
  } catch {
    return Response.json({ error: "Expected a file upload." }, { status: 400 });
  }

  if (!file) {
    return Response.json({ error: "No file was received." }, { status: 400 });
  }

  try {
    const stored = await uploadImage({ tenantId, kind, file });
    return Response.json(
      {
        url: stored.url,
        key: stored.key,
        bytes: stored.bytes,
        width: stored.width,
        height: stored.height,
        isVideo: stored.isVideo,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: STATUS[error.code] },
      );
    }
    console.error("[uploads] unexpected failure", error);
    return Response.json({ error: "We couldn't save that image." }, { status: 500 });
  }
}

/**
 * Whether this request came from a page on our own site.
 *
 * The Origin header is set by the browser on every cross-site POST and
 * cannot be forged by page JavaScript, which is what makes it a usable
 * CSRF signal. What it is compared against matters: behind a reverse
 * proxy the server sees an internal URL, so the public host comes from
 * the proxy's forwarded headers, falling back to Host.
 *
 * A request with no Origin at all is allowed: some browsers omit it on
 * same-origin requests, and the authentication check still applies.
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // unparseable Origin is not a same-origin request
  }

  // Set by the proxy that terminated TLS; x-forwarded-host may carry a
  // comma-separated chain, in which case the first entry is the client's.
  const forwarded = request.headers.get("x-forwarded-host");
  const publicHost = (forwarded?.split(",")[0] ?? request.headers.get("host"))?.trim();

  if (publicHost && originHost === publicHost) return true;

  // Last resort: the configured public URL. Covers a proxy that strips
  // the forwarded headers entirely.
  try {
    if (originHost === new URL(env.APP_URL).host) return true;
  } catch {
    // APP_URL is validated at boot, so this should be unreachable.
  }

  return false;
}

/**
 * Next signals redirect() and notFound() by throwing an error carrying a
 * `digest` string — "NEXT_REDIRECT;..." and "NEXT_HTTP_ERROR_FALLBACK;404"
 * respectively (see node_modules/next/dist/client/components/
 * http-access-fallback/http-access-fallback.js).
 */
function isNavigationError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}
