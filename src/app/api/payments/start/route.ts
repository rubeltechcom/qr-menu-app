import type { NextRequest } from "next/server";
import { z } from "zod";
import { PaymentError, startPayment } from "@/modules/payments/payment.service";

/**
 * Start an online payment for an order the diner has already placed.
 *
 * Public and unauthenticated, like order placement: the track token in
 * the body is the diner's only credential, and it is unguessable. The
 * amount is never taken from the request — it is read from the stored
 * order, so a tampered call can only pay the real total.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  trackToken: z.string().min(8).max(128),
  provider: z.enum(["STRIPE", "BKASH"]),
});

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payment request." }, { status: 400 });
  }

  try {
    const { redirectUrl } = await startPayment(parsed.data);
    return Response.json({ redirectUrl });
  } catch (error) {
    if (error instanceof PaymentError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[payments] Failed to start payment", error);
    return Response.json(
      { error: "Could not start the payment. Please try again." },
      { status: 500 },
    );
  }
}
