import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { OrderError, placeOrder } from "@/modules/orders/order.service";

/**
 * Public order placement — called by the storefront cart.
 *
 * No auth: a diner is anonymous by design (PROMPT.md §2). The QR code's
 * publicCode in the body is what establishes which restaurant and table
 * this is, and every price is re-read server-side, so an untrusted
 * caller can choose what to order but never what it costs.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  try {
    const { order, trackToken } = await placeOrder(body);
    return Response.json(
      {
        orderNumber: order.orderNumber,
        trackToken,
        totalCents: order.totalCents,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      // Surface the first field-level message — the storefront shows it
      // inline next to the offending field rather than in a modal.
      const first = error.issues[0];
      return Response.json(
        { error: first?.message ?? "Please check the form.", field: first?.path.join(".") },
        { status: 400 },
      );
    }

    if (error instanceof OrderError) {
      // TABLE_NOT_FOUND is 404 so probing for valid codes learns nothing
      // beyond "no"; the rest are the diner's to fix and are 400.
      const status = error.code === "TABLE_NOT_FOUND" ? 404 : 400;
      return Response.json({ error: error.message, code: error.code }, { status });
    }

    console.error("[orders] Failed to place order", error);
    return Response.json(
      { error: "Something went wrong placing your order. Please try again." },
      { status: 500 },
    );
  }
}
