import { z } from "zod";

export const ORDER_TYPES = ["DINE_IN", "TAKEAWAY", "DELIVERY"] as const;

const cartLineSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  note: z.string().trim().max(200).optional(),
  // Modifier ids the diner selected. Prices are NOT taken from the
  // client — they are re-read from the database at order time (see
  // order.service.ts), so a tampered payload cannot set its own price.
  modifierIds: z.array(z.string().min(1)).max(20).default([]),
});

export type CartLineInput = z.infer<typeof cartLineSchema>;

/**
 * What the storefront posts when a diner taps ORDER.
 *
 * Required fields differ by order type, which is exactly what the
 * reference flow does — switching the tab re-validates. Encoding that as
 * a discriminated union rather than a pile of optional fields means an
 * order that is missing its delivery address cannot be represented at
 * all, let alone saved (PROMPT.md §12.3).
 */
const baseOrder = {
  publicCode: z.string().min(1).max(32),
  items: z.array(cartLineSchema).min(1, "Add at least one item").max(60),
  note: z.string().trim().max(500).optional(),
  // Null/absent means ASAP. An ISO string means the diner scheduled it.
  scheduledFor: z.iso.datetime().optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  customerEmail: z.email().max(200).optional(),
};

export const placeOrderSchema = z.discriminatedUnion("type", [
  z.object({
    ...baseOrder,
    type: z.literal("DINE_IN"),
    // Comes from the scanned QR, not typed by the diner.
    tableId: z.string().min(1, "Table is required for dine-in"),
  }),
  z.object({
    ...baseOrder,
    type: z.literal("TAKEAWAY"),
    // Staff need a name to call out and a number to chase a no-show.
    customerName: z.string().trim().min(1, "Name is required for takeaway").max(120),
    customerPhone: z.string().trim().min(4, "Phone is required for takeaway").max(40),
  }),
  z.object({
    ...baseOrder,
    type: z.literal("DELIVERY"),
    customerName: z.string().trim().min(1, "Name is required for delivery").max(120),
    customerPhone: z.string().trim().min(4, "Phone is required for delivery").max(40),
    deliveryAddress: z
      .string()
      .trim()
      .min(6, "Address is required for delivery")
      .max(400),
  }),
]);

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const rejectOrderSchema = z.object({
  // Optional but encouraged — the diner sees it on their tracking page,
  // and "we've run out of prawns" saves a phone call.
  reason: z.string().trim().max(300).optional(),
});

export type RejectOrderInput = z.infer<typeof rejectOrderSchema>;

export const orderFilterSchema = z.object({
  type: z.enum(ORDER_TYPES).optional(),
  hideCompleted: z.boolean().default(true),
});

export type OrderFilterInput = z.infer<typeof orderFilterSchema>;
