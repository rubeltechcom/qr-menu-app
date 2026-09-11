import type { LocaleCode } from "./locales";

/**
 * Every string a guest sees on the storefront.
 *
 * English is the source of truth: its keys define the shape, and
 * TypeScript then requires every other language to provide all of them.
 * A missing translation is a compile error rather than a button that
 * silently reverts to English mid-sentence.
 *
 * Only the *interface* lives here. Dish names and descriptions belong to
 * the restaurant and are translated separately — see the Translation
 * table — because we cannot know in advance what a restaurant will sell.
 */

const en = {
  // Header and navigation
  popular: "Popular",
  favourites: "Favourites",
  allItems: "All",

  // Menu
  noItems: "No items found.",
  addToOrder: "Add to order",
  soldOut: "Sold out",

  // Cart bar
  order: "Order",
  orderCount: "Order {count} for {total}",

  // Checkout
  dineIn: "DINE IN",
  takeaway: "TAKEAWAY",
  delivery: "DELIVERY",
  total: "Total:",
  deliveryFee: "+ Delivery fee {amount}",
  addNote: "Add note 🙏🏻",
  whenReady: "When ready",
  table: "Table…",
  name: "Name…",
  phone: "Phone",
  address: "Address…",
  fillAllFields: "Fill all required fields",
  placing: "Placing…",
  placeOrder: "ORDER",
  nothingToOrder: "Nothing to order",
  termsNotice: "By clicking Order, you confirm your age is 18+ and you agree to the",
  terms: "terms",

  // After ordering
  orderPlaced: "Order placed",
  orderWithKitchen: "Order {number} is with the kitchen",
  keepBrowsing: "You can keep browsing the menu",
  scheduledFor: "Scheduled for {time}",
  orderNumberPlaced: "Order {number} placed",
  trackIt: "Track it",

  // Errors
  offline: "You appear to be offline. Check your connection and try again.",
  couldNotPlace: "Could not place the order. Please try again.",
} as const;

/** The key set every language must provide. */
export type MessageKey = keyof typeof en;
type Messages = Record<MessageKey, string>;

const bn: Messages = {
  popular: "জনপ্রিয়",
  favourites: "পছন্দের",
  allItems: "সব",

  noItems: "কোনো আইটেম পাওয়া যায়নি।",
  addToOrder: "অর্ডারে যোগ করুন",
  soldOut: "শেষ হয়ে গেছে",

  order: "অর্ডার",
  orderCount: "{count}টি আইটেম, {total}",

  dineIn: "এখানে খাব",
  takeaway: "নিয়ে যাব",
  delivery: "ডেলিভারি",
  total: "সর্বমোট:",
  deliveryFee: "+ ডেলিভারি চার্জ {amount}",
  addNote: "কিছু লিখুন 🙏🏻",
  whenReady: "যখন প্রস্তুত হবে",
  table: "টেবিল…",
  name: "নাম…",
  phone: "ফোন",
  address: "ঠিকানা…",
  fillAllFields: "সব প্রয়োজনীয় তথ্য পূরণ করুন",
  placing: "পাঠানো হচ্ছে…",
  placeOrder: "অর্ডার করুন",
  nothingToOrder: "অর্ডার করার কিছু নেই",
  termsNotice: "অর্ডার করলে আপনি নিশ্চিত করছেন যে আপনার বয়স ১৮+ এবং আপনি সম্মত আছেন",
  terms: "শর্তাবলীতে",

  orderPlaced: "অর্ডার সম্পন্ন হয়েছে",
  orderWithKitchen: "অর্ডার {number} রান্নাঘরে পাঠানো হয়েছে",
  keepBrowsing: "আপনি মেনু দেখা চালিয়ে যেতে পারেন",
  scheduledFor: "{time} এর জন্য নির্ধারিত",
  orderNumberPlaced: "অর্ডার {number} সম্পন্ন",
  trackIt: "ট্র্যাক করুন",

  offline: "আপনি অফলাইনে আছেন। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
  couldNotPlace: "অর্ডার করা যায়নি। আবার চেষ্টা করুন।",
};

const DICTIONARIES: Record<LocaleCode, Messages> = { en, bn };

/**
 * A translator for one locale.
 *
 * `values` fills the {placeholders} in a string. Interpolation is done
 * here rather than by concatenating at the call site, because word order
 * differs between languages — "Order 2 for £18" and its Bengali
 * equivalent do not put the number in the same place.
 */
export function translator(locale: string) {
  const messages = DICTIONARIES[locale as LocaleCode] ?? en;

  return function t(key: MessageKey, values?: Record<string, string | number>): string {
    // Falls back to English for a key a language has not yet filled in,
    // which cannot happen today (the type system forbids it) but would
    // be the right behaviour if a locale were ever added dynamically.
    const template = messages[key] ?? en[key];
    if (!values) return template;

    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}

export type Translate = ReturnType<typeof translator>;
