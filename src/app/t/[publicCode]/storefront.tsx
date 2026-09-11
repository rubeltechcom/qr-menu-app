"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCart } from "./use-cart";
import { useFavourites } from "./use-favourites";
import { useActiveOrder } from "./use-active-order";
import { useLocale } from "./use-locale";
import { buildTranslationMap } from "@/modules/i18n/translation-map";
import type { TranslationRow } from "@/modules/i18n/translation.repository";
import { LanguagePicker } from "./language-picker";

interface MenuItemView {
  id: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  images: string[];
  /** A short clip, shown ahead of the photos in the detail sheet. */
  videoUrl?: string | null;
  dietaryTags: string[];
}

interface CategoryView {
  id: string;
  name: string;
  /** Chosen by the restaurant; null falls back to guessing from the name. */
  icon?: string | null;
  /** An uploaded icon image, which wins over the emoji when set. */
  iconUrl?: string | null;
  items: MenuItemView[];
}

type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type PaymentMode = "COUNTER" | "OPTIONAL" | "REQUIRED";

import { ItemModal } from "@/components/menu/item-modal";
import type { Translate } from "@/modules/i18n/dictionary";
import { DELIVERY_FEE_CENTS } from "@/modules/orders/order.schema";
import { Plus, Minus } from "lucide-react";

/** Reserved ids for the cross-category tabs — neither is a real row. */
const POPULAR_ID = "__popular__";
const FAVOURITES_ID = "__favourites__";

/**
 * Stacking order of the storefront's floating surfaces, lowest first:
 *
 *   20  header
 *   50  item detail sheet — full height, flush to the bottom so no strip
 *       of the menu grid shows through beneath it
 *   60  cart bar — above the item sheet on purpose: the running total
 *       stays visible while dishes are added, and it can be tapped to
 *       open the order without dismissing the dish first
 *   65  the dish flying into the cart
 *   70  checkout sheet — the topmost surface; it opens from the cart bar
 *       and must cover the item sheet underneath it
 */

const CATEGORY_EMOJI: Array<[RegExp, string]> = [
  [/popular/i, "👌"],
  [/curry/i, "🍛"],
  [/ramen|noodle/i, "🍜"],
  [/teppan/i, "🍤"],
  [/donburi|rice|bowl/i, "🍲"],
  [/side|starter|small/i, "🥟"],
  [/dessert|sweet/i, "🍡"],
  [/drink|beverage/i, "🥤"],
];

/**
 * The icon for a category: the one the restaurant chose, or a guess
 * from its name. The guess is what every menu created before icons
 * existed still relies on, so it is a fallback rather than dead code.
 */
function categoryEmoji(category: { name: string; icon?: string | null }) {
  if (category.icon) return category.icon;
  return CATEGORY_EMOJI.find(([pattern]) => pattern.test(category.name))?.[1] ?? "🍽️";
}

/**
 * Country dialling codes offered beside the phone field.
 *
 * A short list on purpose: a diner is standing in one restaurant, in one
 * country, and a 200-entry picker is friction for a field they will fill
 * in once. The location's currency picks the default (below), so the
 * common case is no interaction at all.
 */
const DIAL_CODES: Array<{ code: string; flag: string; sample: string }> = [
  { code: "+44", flag: "🇬🇧", sample: "7400 123456" },
  { code: "+880", flag: "🇧🇩", sample: "1712 345678" },
  { code: "+1", flag: "🇺🇸", sample: "555 123 4567" },
  { code: "+91", flag: "🇮🇳", sample: "98765 43210" },
  { code: "+61", flag: "🇦🇺", sample: "412 345 678" },
  { code: "+971", flag: "🇦🇪", sample: "50 123 4567" },
];

/** The dialling code a location's currency implies, falling back to UK. */
function defaultDialCode(currency: string) {
  const byCurrency: Record<string, string> = {
    GBP: "+44",
    BDT: "+880",
    USD: "+1",
    INR: "+91",
    AUD: "+61",
    AED: "+971",
  };
  return byCurrency[currency] ?? "+44";
}

/**
 * Turn an "HH:mm" pickup slot into the ISO instant the API expects.
 *
 * The slot is a wall-clock time on the diner's device, which is the same
 * clock the restaurant is on. A slot that has already passed by the time
 * they tap ORDER is read as tomorrow — the alternative is rejecting an
 * order for being a minute late.
 */
function isoForSlot(slot: string) {
  const [hours, minutes] = slot.split(":").map(Number);
  const when = new Date();
  when.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  if (when.getTime() < Date.now()) when.setDate(when.getDate() + 1);
  return when.toISOString();
}

export function Storefront({
  publicCode,
  tableId,
  tables,
  restaurantName,
  logoUrl,
  locales,
  defaultLocale,
  translations,
  currency,
  categories,
  paymentMode,
  providers,
}: {
  publicCode: string;
  tableId: string;
  tables: Array<{ id: string; label: string }>;
  /** The restaurant's own name, shown in the header beside its logo. */
  restaurantName: string;
  logoUrl: string | null;
  /** Languages this restaurant offers, first being its preferred one. */
  locales: string[];
  defaultLocale: string;
  /** Menu-content translations, keyed by locale. */
  translations: Record<string, TranslationRow[]>;
  currency: string;
  categories: CategoryView[];
  paymentMode: PaymentMode;
  providers: Array<{ id: string; displayName: string }>;
}) {
  const cart = useCart(publicCode);
  const { locale, setLocale, t } = useLocale({
    publicCode,
    offered: locales,
    fallback: defaultLocale,
  });
  // Dish and category names in the guest's language.
  //
  // Applied here rather than on the server because the language is a
  // device preference the server cannot know — every offered language
  // ships with the page, so switching is instant and needs no request.
  const localisedCategories = useMemo(() => {
    const rows = translations[locale];
    if (!rows?.length) return categories;

    const map = buildTranslationMap(rows);

    return categories.map((category) => ({
      ...category,
      name: map.get(category.id, "name", category.name),
      items: category.items.map((item) => ({
        ...item,
        name: map.get(item.id, "name", item.name),
        description: map.get(item.id, "description", item.description ?? "") || null,
      })),
    }));
  }, [categories, translations, locale]);

  const {
    isFavourite,
    toggle: toggleFavourite,
    count: favouriteCount,
  } = useFavourites(publicCode);
  const { clear: clearCart } = cart;
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [placed, setPlaced] = useState<{
    orderNumber: number;
    trackToken: string;
  } | null>(null);
  // The most recent order from this device, kept so the menu can offer a
  // way back to its tracking page after the sheet closes. Stored rather
  // than held in state: a diner who refreshes or locks their phone while
  // waiting must not lose the only link to their own order.
  const { activeOrder, remember: rememberOrder } = useActiveOrder(publicCode);
  const [selectedItem, setSelectedItem] = useState<MenuItemView | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(POPULAR_ID);
  const [activeFilter, setActiveFilter] = useState("All");

  /**
   * "Popular" is a view across every category, not a category of its own —
   * the schema has no such row. It leads the strip and is what a diner
   * lands on, so the first screen is never an arbitrary category.
   *
   * Items tagged Popular float to the front; if a restaurant has tagged
   * nothing yet, the tab still shows the whole menu rather than an empty
   * screen.
   */
  const popularCategory = useMemo<CategoryView>(() => {
    const all = localisedCategories.flatMap((category) => category.items);
    const tagged = all.filter((item) => item.dietaryTags.includes("Popular"));
    return {
      id: POPULAR_ID,
      name: t("popular"),
      items:
        tagged.length > 0 ? [...tagged, ...all.filter((i) => !tagged.includes(i))] : all,
    };
  }, [localisedCategories, t]);

  /**
   * The dishes this diner has hearted, as a tab of their own.
   *
   * Only appears once there is something in it: an empty "Favourites"
   * tab on a first visit is a dead end, and it would push the real
   * categories off the edge of a phone screen.
   */
  const favouritesCategory = useMemo<CategoryView | null>(() => {
    if (favouriteCount === 0) return null;
    const all = localisedCategories.flatMap((category) => category.items);
    const items = all.filter((item) => isFavourite(item.id));
    return items.length > 0
      ? { id: FAVOURITES_ID, name: t("favourites"), icon: "❤️", items }
      : null;
  }, [localisedCategories, favouriteCount, isFavourite, t]);

  const navCategories = useMemo(
    () => [
      popularCategory,
      ...(favouritesCategory ? [favouritesCategory] : []),
      ...localisedCategories,
    ],
    [popularCategory, favouritesCategory, localisedCategories],
  );

  /**
   * The icon for a dish's OWN category — not the active tab's, since the
   * Popular tab mixes categories together.
   */
  const emojiForItem = useMemo(() => {
    const byItem = new Map<string, string>();
    for (const category of localisedCategories) {
      const icon = categoryEmoji(category);
      for (const item of category.items) byItem.set(item.id, icon);
    }
    return (itemId: string) => byItem.get(itemId);
  }, [localisedCategories]);

  const money = useMemo(() => {
    return (cents: number) => {
      const val = (cents / 100).toFixed(2);
      return currency === "GBP"
        ? `${val} £`
        : currency === "USD"
          ? `$${val}`
          : `${val} ${currency}`;
    };
  }, [currency]);

  // Current category
  const currentCategory = useMemo(
    () => navCategories.find((c) => c.id === activeCategory) ?? navCategories[0],
    [navCategories, activeCategory],
  );

  // Sub-category pills for the ACTIVE category only. Popular spans every
  // category, so its dishes have no one set of sub-categories to offer —
  // it shows no pills at all. "Popular" itself is a promotion marker
  // rather than something a diner filters by, so it is never a pill.
  const categoryTags = useMemo(() => {
    if (
      !currentCategory ||
      currentCategory.id === POPULAR_ID ||
      currentCategory.id === FAVOURITES_ID
    ) {
      return [];
    }
    const tags = new Set<string>();
    currentCategory.items.forEach((i) =>
      i.dietaryTags.forEach((t) => {
        if (t !== "Popular") tags.add(t);
      }),
    );
    return tags.size > 0 ? ["All", ...Array.from(tags)] : [];
  }, [currentCategory]);

  // Filtered items: only from the active category, then by tag
  const filteredItems = useMemo(() => {
    if (!currentCategory) return [];
    if (activeFilter === "All") return currentCategory.items;
    return currentCategory.items.filter((item) =>
      item.dietaryTags.includes(activeFilter),
    );
  }, [currentCategory, activeFilter]);

  // Reset tag filter when switching categories
  const handleCategoryChange = (categoryId: string) => {
    setActiveCategory(categoryId);
    setActiveFilter("All");
  };

  /**
   * Tapping + adds straight to the cart — there is no confirm step. The
   * dish image flies down into the order bar so the diner sees where it
   * went without the cart bar having to steal focus.
   *
   * The flying node is a plain cloned element rather than React state:
   * it is throwaway chrome, and re-rendering the whole grid for it would
   * stutter on a mid-range phone.
   */
  const [addedItemId, setAddedItemId] = useState<string | null>(null);
  const [cartBump, setCartBump] = useState(false);

  const flyToCart = (origin: HTMLElement | null) => {
    if (!origin || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const from = origin.getBoundingClientRect();
    const ghost = origin.cloneNode(true) as HTMLElement;
    ghost.style.cssText = `position:fixed;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;border-radius:9999px;object-fit:cover;z-index:65;pointer-events:none;transition:transform .6s cubic-bezier(.55,-0.2,.6,1),opacity .6s ease-in;`;
    document.body.appendChild(ghost);

    const target = document.getElementById("cart-bar")?.getBoundingClientRect();
    const dx =
      (target ? target.left + target.width / 2 : window.innerWidth / 2) -
      (from.left + from.width / 2);
    const dy =
      (target ? target.top + target.height / 2 : window.innerHeight) -
      (from.top + from.height / 2);

    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${dx}px, ${dy}px) scale(.15)`;
      ghost.style.opacity = "0.4";
    });
    setTimeout(() => ghost.remove(), 650);
  };

  /** `delta` may be negative — the detail sheet edits the line in place. */
  const addToCart = (item: MenuItemView, delta = 1, note?: string) => {
    const lineId = `${item.id}-${note ?? ""}`;
    if (delta < 0) {
      const line = cart.lines.find((candidate) => candidate.id === lineId);
      if (line) cart.setQuantity(lineId, line.quantity + delta);
      return;
    }
    for (let i = 0; i < delta; i += 1) {
      cart.add({
        menuItemId: item.id,
        name: item.name,
        unitPriceCents: item.basePriceCents,
        note: note || undefined,
      });
    }
    setCartBump(true);
    setTimeout(() => setCartBump(false), 400);
  };

  /**
   * The order has landed and the diner has seen the confirmation inside
   * the sheet.
   *
   * When there is nothing left to do, that confirmation IS the ending:
   * the sheet closes back to the menu, and a slim strip at the top links
   * to the tracking page. Replacing the whole screen with a second
   * "Thank you" would only strand them on a dead end.
   *
   * The one exception is a restaurant that takes payment online — those
   * orders still need a pay step, which owns the screen.
   *
   * Stable identity: the sheet holds this in an effect's deps while the
   * confirmation plays, and a new function each render would restart it.
   */
  const needsPayment = paymentMode !== "COUNTER" && providers.length > 0;
  const handlePlaced = useCallback(
    (result: { orderNumber: number; trackToken: string }) => {
      clearCart();
      setSheetOpen(false);
      rememberOrder(result);
      if (needsPayment) setPlaced(result);
    },
    [clearCart, needsPayment, rememberOrder],
  );

  /**
   * How many of a dish are in the cart, summed across notes. The detail
   * sheet renders from this rather than its own counter, so clearing the
   * cart (placing an order) is reflected everywhere at once.
   */
  const quantityInCart = (menuItemId: string) =>
    cart.lines.reduce(
      (sum, line) => (line.menuItemId === menuItemId ? sum + line.quantity : sum),
      0,
    );

  const handleQuickAdd = (item: MenuItemView, event: React.MouseEvent) => {
    event.stopPropagation(); // the card itself opens the detail sheet
    const card = (event.currentTarget as HTMLElement).closest("[data-item-card]");
    flyToCart(card?.querySelector("img") ?? null);
    addToCart(item);
    setAddedItemId(item.id);
    setTimeout(() => setAddedItemId(null), 600);
  };

  if (placed) {
    return (
      <OrderPlaced
        orderNumber={placed.orderNumber}
        trackToken={placed.trackToken}
        paymentMode={paymentMode}
        providers={providers}
      />
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-white pb-28 shadow-2xl ring-1 ring-zinc-200">
      {/* The way back to an order already placed from this device. The
          diner stays on the menu — they may well order more — but never
          loses the thread to what is already cooking. */}
      {activeOrder && (
        <a
          href={`/order/${activeOrder.trackToken}`}
          className="flex items-center justify-between gap-3 bg-green-50 px-5 py-3 text-sm font-medium text-green-800 transition-colors hover:bg-green-100"
        >
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            Order {activeOrder.orderNumber} placed
          </span>
          <span className="underline">Track it</span>
        </a>
      )}

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white px-5 pt-6 pb-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {/* The restaurant's own logo when it has uploaded one. The
                star is the fallback, not the brand — a menu should look
                like the restaurant, not like us. */}
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- uploads
                 may live on a bucket whose host is unknown at build time. */
              <img
                src={logoUrl}
                alt={restaurantName}
                className="h-10 w-10 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="flex shrink-0 items-center justify-center text-red-600">
                <svg className="h-10 w-10 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
            )}
            <h1 className="truncate text-2xl font-bold tracking-tight text-zinc-900">
              {restaurantName}
            </h1>
          </div>

          {locales.length > 1 && (
            <LanguagePicker locales={locales} active={locale} onChange={setLocale} />
          )}
        </div>

        {/* Categories Slider */}
        <div className="scrollbar-hide -mx-5 mt-6 flex overflow-x-auto px-5 pb-4">
          <div className="flex gap-4">
            {navCategories.map((category) => {
              const isActive = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleCategoryChange(category.id)}
                  className="group flex shrink-0 flex-col items-center gap-2"
                >
                  <div
                    className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-3xl transition-all ${
                      isActive
                        ? "bg-yellow-400 text-zinc-900 shadow-md"
                        : "bg-transparent text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {category.iconUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- uploads
                         may live on a bucket whose host is unknown at build time. */
                      <img
                        src={category.iconUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      categoryEmoji(category)
                    )}
                  </div>
                  <span
                    className={`text-sm font-medium lowercase ${isActive ? "text-zinc-900" : "text-zinc-600"}`}
                  >
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-tag Filters (per-category) */}
        {categoryTags.length > 1 && (
          <div className="scrollbar-hide -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-4">
            {categoryTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveFilter(tag)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeFilter === tag
                    ? "bg-zinc-800 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Menu Items — only the active category */}
      {filteredItems.length === 0 ? (
        <div className="px-5 py-20 text-center">
          <p className="text-zinc-500">{t("noItems")}</p>
        </div>
      ) : (
        <div className="px-4 py-6">
          <div className="grid grid-cols-2 gap-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                data-item-card
                className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white p-3 shadow-sm transition-all hover:shadow-md ${
                  addedItemId === item.id
                    ? "border-green-400 ring-2 ring-green-200"
                    : "border-zinc-200"
                }`}
              >
                {/* How many of this dish are in the order. Read straight
                    from the cart, so placing an order clears every badge
                    at once — no stale counts left on the menu. */}
                {quantityInCart(item.id) > 0 && (
                  <span className="absolute top-0 left-0 z-10 flex h-8 min-w-8 items-center justify-center rounded-tl-2xl rounded-br-2xl bg-green-500 px-2.5 text-sm font-bold text-white tabular-nums shadow-sm">
                    {quantityInCart(item.id)}
                  </span>
                )}

                {/* Favourite. Filled when hearted, so the state is
                    obvious at a glance rather than only on hover. */}
                <button
                  type="button"
                  aria-pressed={isFavourite(item.id)}
                  aria-label={
                    isFavourite(item.id)
                      ? `Remove ${item.name} from favourites`
                      : `Add ${item.name} to favourites`
                  }
                  onClick={(event) => {
                    // The card itself opens the detail sheet.
                    event.stopPropagation();
                    toggleFavourite(item.id);
                  }}
                  className={`absolute top-3 right-3 z-10 rounded-full bg-white/80 p-1.5 backdrop-blur transition-colors ${
                    isFavourite(item.id)
                      ? "text-red-500"
                      : "text-zinc-400 hover:text-red-500"
                  }`}
                >
                  <svg
                    className="h-4 w-4 transition-transform active:scale-90"
                    fill={isFavourite(item.id) ? "currentColor" : "none"}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    ></path>
                  </svg>
                </button>

                {/* Image — click opens detail */}
                <div
                  className="relative mb-3 aspect-square w-full overflow-hidden rounded-full"
                  onClick={() => setSelectedItem(item)}
                >
                  {item.images && item.images[0] ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- uploads
                       may live on a bucket whose host is unknown at build time, so
                       next/image's remotePatterns cannot cover them. Photos are
                       already downscaled on upload and served immutable. */
                    <img
                      src={item.images[0]}
                      alt={item.name}
                      loading="lazy"
                      className="h-full w-full object-cover drop-shadow-md"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-100">
                      <span className="text-4xl opacity-20">🍽️</span>
                    </div>
                  )}

                  {/* Added animation overlay */}
                  {addedItemId === item.id && (
                    <div className="absolute inset-0 flex animate-pulse items-center justify-center rounded-full bg-green-500/20">
                      <span className="text-2xl">✓</span>
                    </div>
                  )}
                </div>

                {/* Name, price & quick add button */}
                <div className="mt-auto flex items-center justify-between gap-1 pt-1">
                  <div className="min-w-0 flex-1" onClick={() => setSelectedItem(item)}>
                    <h3 className="line-clamp-2 text-xs leading-tight font-semibold text-zinc-800 lowercase">
                      {item.name}
                    </h3>
                    <p className="mt-0.5 text-xs font-bold whitespace-nowrap text-zinc-800">
                      {money(item.basePriceCents)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Add ${item.name} to order`}
                    onClick={(event) => handleQuickAdd(item, event)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500 text-white shadow-sm transition-transform hover:bg-green-600 active:scale-90"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Item Modal — slides up from bottom */}
      {selectedItem && (
        <ItemModal
          item={{
            ...selectedItem,
            images: selectedItem.images ?? [],
            dietaryTags: selectedItem.dietaryTags ?? [],
          }}
          money={money}
          onClose={() => setSelectedItem(null)}
          onAdd={(quantity, note) => addToCart(selectedItem, quantity, note)}
          onFly={flyToCart}
          emoji={emojiForItem(selectedItem.id)}
          quantity={quantityInCart(selectedItem.id)}
          isFavourite={isFavourite(selectedItem.id)}
          onToggleFavourite={() => toggleFavourite(selectedItem.id)}
        />
      )}

      {/* Sticky Cart Bar — see the stacking note at the top of the file.
          Opening the order leaves any dish sheet open underneath it: the
          checkout slides up over the dish, and closing it returns the
          diner to what they were looking at. */}
      <div
        id="cart-bar"
        className={`fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-md rounded-t-2xl bg-zinc-950 px-5 py-4 text-white shadow-[0_-10px_40px_rgba(0,0,0,0.15)] transition-transform duration-300 ${
          cartBump ? "scale-[1.03]" : "scale-100"
        }`}
      >
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex w-full items-center justify-between font-bold"
        >
          <span className="italic">
            {cart.itemCount > 0
              ? t("orderCount", {
                  count: cart.itemCount,
                  total: money(cart.subtotalCents),
                })
              : t("order")}
          </span>
          <div className="flex items-center gap-3">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              ></path>
            </svg>
          </div>
        </button>
      </div>

      {/* Checkout Sheet */}
      {isSheetOpen && (
        <CheckoutSheet
          publicCode={publicCode}
          tableId={tableId}
          tables={tables}
          cart={cart}
          currency={currency}
          money={money}
          t={t}
          onClose={() => setSheetOpen(false)}
          onPlaced={handlePlaced}
        />
      )}
    </div>
  );
}

function CheckoutSheet({
  publicCode,
  tableId,
  tables,
  cart,
  currency,
  money,
  t,
  onClose,
  onPlaced,
}: {
  publicCode: string;
  tableId: string;
  tables: Array<{ id: string; label: string }>;
  cart: ReturnType<typeof useCart>;
  currency: string;
  money: (cents: number) => string;
  t: Translate;
  onClose: () => void;
  onPlaced: (result: { orderNumber: number; trackToken: string }) => void;
}) {
  const [type, setType] = useState<OrderType>("DINE_IN");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dialCode, setDialCode] = useState(defaultDialCode(currency));
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  // The scanned table is pre-selected — it is nearly always the right
  // answer — but the diner must be able to correct it if they moved.
  const [seatedTableId, setSeatedTableId] = useState(tableId);
  // "" means as soon as it is ready; anything else is an "HH:mm" slot.
  const [scheduledAt, setScheduledAt] = useState("");
  // Set once the order lands, so the success state can play inside this
  // same sheet rather than replacing the whole screen.
  const [placed, setPlaced] = useState<{
    orderNumber: number;
    trackToken: string;
  } | null>(null);

  // Mirrors the server's rule (order.service DELIVERY_FEE_CENTS) so the
  // quoted total is the one the order is written with.
  const deliveryFeeCents = type === "DELIVERY" ? DELIVERY_FEE_CENTS : 0;

  const missing = useMemo(() => {
    const gaps: string[] = [];
    if (type === "DINE_IN" && !seatedTableId) gaps.push("table");
    if (type !== "DINE_IN") {
      if (!name.trim()) gaps.push("name");
      if (!phone.trim()) gaps.push("phone");
    }
    if (type === "DELIVERY" && address.trim().length < 6) gaps.push("address");
    return gaps;
  }, [type, seatedTableId, name, phone, address]);

  /**
   * Pickup slots for the rest of today, in 15-minute steps, starting at
   * the next whole quarter hour. Built on the client because it depends
   * on "now" — rendering it on the server would ship a stale list.
   */
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    const cursor = new Date();
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + (15 - (cursor.getMinutes() % 15)));
    const endOfDay = new Date(cursor);
    endOfDay.setHours(23, 59, 0, 0);
    while (cursor <= endOfDay) {
      slots.push(
        `${String(cursor.getHours()).padStart(2, "0")}:${String(cursor.getMinutes()).padStart(2, "0")}`,
      );
      cursor.setMinutes(cursor.getMinutes() + 15);
    }
    return slots;
  }, []);

  const submit = async () => {
    setError(null);
    if (missing.length > 0) {
      setError(t("fillAllFields"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicCode,
          type,
          tableId: type === "DINE_IN" ? seatedTableId : undefined,
          ...(scheduledAt ? { scheduledFor: isoForSlot(scheduledAt) } : {}),
          items: cart.lines.map((line) => ({
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            note: line.note,
          })),
          note: note.trim() || undefined,
          customerName: name.trim() || undefined,
          // Sent in full international form — the kitchen and the driver
          // both dial it from a phone that has no idea which country the
          // diner typed it in.
          customerPhone: phone.trim() ? `${dialCode} ${phone.trim()}` : undefined,
          ...(type === "DELIVERY" ? { deliveryAddress: address.trim() } : {}),
        }),
      });

      const payload = (await response.json()) as {
        orderNumber?: number;
        trackToken?: string;
        error?: string;
      };

      if (!response.ok || !payload.orderNumber || !payload.trackToken) {
        setError(payload.error ?? t("couldNotPlace"));
        return;
      }

      // Show the confirmation inside this sheet first; the parent is told
      // only once the diner has seen it (see the effect below).
      setPlaced({ orderNumber: payload.orderNumber, trackToken: payload.trackToken });
    } catch {
      setError(t("offline"));
    } finally {
      setSubmitting(false);
    }
  };

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Let the confirmation play in place, then hand the result up. The
  // parent swaps in the full tracking screen; this delay is what makes
  // the tick and the order number readable rather than a flash.
  useEffect(() => {
    if (!placed) return;
    const timer = setTimeout(() => onPlaced(placed), 2200);
    return () => clearTimeout(timer);
  }, [placed, onPlaced]);

  const handleClose = () => {
    // While the confirmation is showing, the order is already placed —
    // a stray backdrop tap must not look like a cancellation.
    if (placed) return;
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div
      className={`fixed inset-0 z-[70] transition-opacity duration-300 ${
        isVisible ? "bg-black/40 opacity-100" : "bg-black/0 opacity-0"
      }`}
      onClick={handleClose}
    >
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isVisible ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between rounded-t-3xl bg-zinc-950 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <button onClick={handleClose} className="p-1 hover:text-zinc-300">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                ></path>
              </svg>
            </button>
            {/* The same line the cart bar shows, so opening the sheet
                reads as that bar expanding rather than a new screen. */}
            <h2 className="text-base font-bold italic">
              {cart.itemCount > 0
                ? `Order ${cart.itemCount} for ${money(cart.subtotalCents + deliveryFeeCents)}`
                : "Order"}
            </h2>
          </div>
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            ></path>
          </svg>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-5">
          {placed ? (
            /* The order landed. This plays here, in the sheet the diner
               is already looking at, before the parent swaps in the
               tracking screen. */
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <div className="relative flex h-24 w-24 items-center justify-center">
                {/* A ring that expands and fades outward, behind the tick. */}
                <span className="order-pop-ring absolute inset-0 animate-ping rounded-full bg-green-200 opacity-75" />
                <div className="order-pop relative flex h-20 w-20 items-center justify-center rounded-full bg-green-500 text-white shadow-lg">
                  <svg
                    className="h-11 w-11"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="mt-6 text-2xl font-bold text-zinc-900">
                {t("orderPlaced")}
              </h3>
              <p className="mt-2 text-[15px] text-zinc-600">
                {t("orderWithKitchen", { number: placed.orderNumber })}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {scheduledAt
                  ? t("scheduledFor", { time: scheduledAt })
                  : t("keepBrowsing")}
              </p>
            </div>
          ) : cart.lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center pt-20">
              <div className="mb-4 text-zinc-300">
                <svg
                  className="h-24 w-24"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                  ></path>
                </svg>
              </div>
              <p className="text-lg font-medium text-zinc-600">{t("nothingToOrder")}</p>
            </div>
          ) : (
            <>
              {/* Order type. The chosen one sits in a grey pill rather
                  than under a rule — at this width an underline reads as
                  a divider between the tabs and the basket below it. */}
              <div className="flex">
                {[
                  { value: "DINE_IN", label: t("dineIn") },
                  { value: "TAKEAWAY", label: t("takeaway") },
                  { value: "DELIVERY", label: t("delivery") },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => {
                      setType(tab.value as OrderType);
                      setError(null);
                    }}
                    className={`flex-1 rounded-lg px-1 py-3 text-[13px] font-semibold tracking-wider transition-colors ${
                      type === tab.value
                        ? "bg-zinc-100 text-green-600"
                        : "text-zinc-500 hover:text-zinc-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <ul className="mt-4 flex flex-col gap-6 border-t border-dashed border-zinc-300 pt-6">
                {cart.lines.map((line) => (
                  <li
                    key={line.id ?? line.menuItemId}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-[15px] text-zinc-700">{line.quantity} x</span>
                      <span className="truncate text-[15px] font-medium text-zinc-900 lowercase">
                        {line.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Add one more ${line.name}`}
                        onClick={() => cart.setQuantity(line.id, line.quantity + 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove one ${line.name}`}
                        onClick={() => cart.setQuantity(line.id, line.quantity - 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="w-16 shrink-0 text-right text-[15px] font-medium text-zinc-900">
                      {money(line.unitPriceCents * line.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Total, with the delivery fee folded in rather than left
                  as a surprise at the payment step. The breakdown sits
                  under the rule so the headline figure is what the diner
                  will actually be charged. */}
              <div className="mt-8 border-t border-dashed border-zinc-300 pt-6">
                <div className="flex justify-between text-xl font-bold text-zinc-900">
                  <span>{t("total")}</span>
                  <span>{money(cart.subtotalCents + deliveryFeeCents)}</span>
                </div>
              </div>
              <div className="border-b border-dashed border-zinc-300 pb-2">
                {deliveryFeeCents > 0 && (
                  <p className="mt-1 text-right text-[13px] text-zinc-500">
                    {t("deliveryFee", { amount: money(deliveryFeeCents) })}
                  </p>
                )}
              </div>

              <div className="mt-6">
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t("addNote")}
                  rows={2}
                  className="w-full rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-[15px] text-zinc-900 placeholder:text-zinc-500 focus:ring-1 focus:ring-zinc-300 focus:outline-none"
                />
              </div>

              {/* When — optional for every order type. Empty means the
                  kitchen starts it straight away. */}
              <div className="mt-4 flex items-center gap-3">
                <svg
                  className="h-5 w-5 shrink-0 text-zinc-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <select
                  aria-label="When"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  className="h-12 flex-1 rounded-lg bg-zinc-100 px-4 text-[15px] font-medium text-zinc-900 focus:ring-1 focus:ring-zinc-300 focus:outline-none"
                >
                  <option value="">{t("whenReady")}</option>
                  {timeSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>

              {type === "DINE_IN" ? (
                /* Table — required. Pre-set to the scanned table, but a
                   diner who has moved seats can correct it. */
                <div className="mt-3">
                  <select
                    aria-label="Table"
                    value={seatedTableId}
                    onChange={(event) => {
                      setSeatedTableId(event.target.value);
                      setError(null);
                    }}
                    className={`h-12 w-full rounded-lg border px-4 text-[15px] font-medium focus:ring-1 focus:ring-zinc-300 focus:outline-none ${
                      missing.includes("table")
                        ? "border-zinc-800 bg-amber-100 text-zinc-600"
                        : "border-transparent bg-zinc-100 text-zinc-900"
                    }`}
                  >
                    <option value="">{t("table")}</option>
                    {tables.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  {type === "DELIVERY" && (
                    <Field
                      label="Address"
                      value={address}
                      onChange={setAddress}
                      invalid={missing.includes("address")}
                    />
                  )}
                  <Field
                    label="Name"
                    value={name}
                    onChange={setName}
                    invalid={missing.includes("name")}
                  />
                  <PhoneField
                    dialCode={dialCode}
                    onDialCodeChange={setDialCode}
                    value={phone}
                    onChange={setPhone}
                    invalid={missing.includes("phone")}
                  />
                </div>
              )}

              {/* Standing notice while something required is still
                  blank, so the greyed-out ORDER button is never a
                  mystery. A real failure (offline, item sold out)
                  replaces it — that message is the more urgent one. */}
              {(error ?? (missing.length > 0 ? t("fillAllFields") : null)) && (
                <p
                  role="alert"
                  className="mt-4 text-center text-sm font-medium text-red-600"
                >
                  {error ?? t("fillAllFields")}
                </p>
              )}

              <p className="mt-6 text-xs text-zinc-500">
                {t("termsNotice")}{" "}
                {/* A real page rather than "#": the checkout asks the
                    diner to agree to terms, so they have to be readable.
                    Opened in a new tab so a half-filled basket survives. */}
                <a href="/terms" target="_blank" rel="noreferrer" className="underline">
                  {t("terms")}
                </a>
              </p>
            </>
          )}

          <div className={`mt-auto pt-6 pb-2 ${placed ? "hidden" : ""}`}>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={isSubmitting || cart.lines.length === 0 || missing.length > 0}
              className={`w-full rounded-full py-4 text-[17px] font-bold text-white shadow-md transition-colors ${
                cart.lines.length === 0 || missing.length > 0
                  ? "cursor-not-allowed bg-zinc-400"
                  : "bg-green-500 hover:bg-green-600 disabled:opacity-50"
              }`}
            >
              {isSubmitting ? t("placing") : t("placeOrder")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  invalid?: boolean;
}) {
  // An unfilled required field is amber with a dark outline — the same
  // "still needed" language the Table picker uses — rather than red,
  // which would read as an error for something simply not typed yet.
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={`${label}…`}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className={`h-12 w-full rounded-lg border px-4 text-[15px] font-medium focus:ring-1 focus:ring-zinc-300 focus:outline-none ${
        invalid
          ? "border-zinc-800 bg-amber-100 text-zinc-900 placeholder:text-zinc-600"
          : "border-transparent bg-zinc-100 text-zinc-900 placeholder:text-zinc-500"
      }`}
    />
  );
}

/**
 * Phone number, with its dialling code picked separately.
 *
 * The two controls share one bordered box so they read as a single
 * field, and the placeholder follows the chosen country — a diner
 * seeing their own local format is the fastest way to signal what to
 * type. The parts are joined only when the order is submitted, so the
 * kitchen always gets a number it can dial.
 */
function PhoneField({
  dialCode,
  onDialCodeChange,
  value,
  onChange,
  invalid,
}: {
  dialCode: string;
  onDialCodeChange: (value: string) => void;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const country = DIAL_CODES.find((candidate) => candidate.code === dialCode);

  return (
    <div
      className={`flex h-12 w-full overflow-hidden rounded-lg border ${
        invalid ? "border-zinc-800 bg-amber-100" : "border-transparent bg-zinc-100"
      }`}
    >
      <div className="relative flex shrink-0 items-center gap-1 border-r border-zinc-300/70 pr-2 pl-3">
        <span aria-hidden className="text-base leading-none">
          {country?.flag ?? "🌐"}
        </span>
        <span
          className={`text-[15px] font-medium ${invalid ? "text-zinc-900" : "text-zinc-900"}`}
        >
          {dialCode}
        </span>
        <svg
          aria-hidden
          className="h-3 w-3 text-zinc-500"
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M2 4l4 4 4-4z" />
        </svg>
        {/* The native select sits invisibly over the pill so the phone's
            own wheel picker opens — far easier to hit than a custom
            dropdown one-handed. */}
        <select
          aria-label="Country code"
          value={dialCode}
          onChange={(event) => onDialCodeChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {DIAL_CODES.map((candidate) => (
            <option key={candidate.code} value={candidate.code}>
              {candidate.flag} {candidate.code}
            </option>
          ))}
        </select>
      </div>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={country?.sample ?? "Phone…"}
        aria-label="Phone"
        aria-invalid={invalid || undefined}
        className={`h-full min-w-0 flex-1 bg-transparent px-4 text-[15px] font-medium focus:outline-none ${
          invalid
            ? "text-zinc-900 placeholder:text-zinc-600"
            : "text-zinc-900 placeholder:text-zinc-500"
        }`}
      />
    </div>
  );
}

function OrderPlaced({
  orderNumber,
  trackToken,
  paymentMode,
  providers,
}: {
  orderNumber: number;
  trackToken: string;
  paymentMode: PaymentMode;
  providers: Array<{ id: string; displayName: string }>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canPayOnline = paymentMode !== "COUNTER" && providers.length > 0;

  const pay = async (provider: string) => {
    setBusy(provider);
    setError(null);
    try {
      const response = await fetch("/api/payments/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackToken, provider }),
      });
      const payload = (await response.json()) as { redirectUrl?: string; error?: string };

      if (!response.ok || !payload.redirectUrl) {
        setError(payload.error ?? "Could not start the payment.");
        setBusy(null);
        return;
      }
      // Full navigation, not a client-side route change: the provider's
      // page has to own the tab so the diner can complete 3-D Secure or
      // the bKash PIN step.
      window.location.assign(payload.redirectUrl);
    } catch {
      // Not translated yet: the payment screen is a separate surface
      // with its own strings, and half-translating it would be worse
      // than leaving it consistent.
      setError("You appear to be offline. Check your connection and try again.");
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center bg-white px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600">
        <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M5 13l4 4L19 7"
          ></path>
        </svg>
      </div>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">
        Order {orderNumber} is placed
      </h1>
      <p className="mt-2 text-base text-zinc-600">
        {paymentMode === "REQUIRED"
          ? "Pay now so the kitchen can start."
          : "Pay now, or settle at the counter."}
      </p>

      {canPayOnline && (
        <div className="mt-8 flex w-full flex-col gap-3">
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              disabled={busy !== null}
              onClick={() => void pay(provider.id)}
              className="w-full rounded-full bg-green-500 py-4 text-[17px] font-bold text-white shadow-md transition-colors hover:bg-green-600 disabled:opacity-50"
            >
              {busy === provider.id ? "Opening…" : `Pay with ${provider.displayName}`}
            </button>
          ))}
          {paymentMode === "OPTIONAL" && (
            <p className="mt-2 text-sm text-zinc-500">Or pay at the counter.</p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <a
        href={`/order/${trackToken}`}
        className="mt-8 font-medium text-green-600 underline"
      >
        Follow your order
      </a>
    </div>
  );
}
