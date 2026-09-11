"use client";

import { useState, useEffect, useRef } from "react";
import { Minus, Plus } from "lucide-react";

interface ItemModalProps {
  item: {
    id: string;
    name: string;
    description: string | null;
    basePriceCents: number;
    images: string[];
    videoUrl?: string | null;
    dietaryTags: string[];
  };
  money: (cents: number) => string;
  onClose: () => void;
  onAdd: (quantity: number, note: string) => void;
  /** Plays the fly-into-the-order-bar animation from the given element. */
  onFly?: (origin: HTMLElement | null) => void;
  /** Icon for the dish's category, shown beside the name. */
  emoji?: string;
  /**
   * How many of this dish are in the cart right now. Passing it in keeps
   * the control truthful when the cart changes from outside — most
   * importantly when an order is placed and the cart empties.
   */
  quantity: number;
  /** Whether this dish is hearted. Owned by the storefront, not here. */
  isFavourite?: boolean;
  onToggleFavourite?: () => void;
}

export function ItemModal({
  item,
  money,
  onClose,
  onAdd,
  onFly,
  emoji,
  quantity,
  isFavourite = false,
  onToggleFavourite,
}: ItemModalProps) {
  const heroRef = useRef<HTMLImageElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    // Trigger slide-up animation after mount
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  /**
   * Each tap is applied to the cart as it happens (a delta of ±1), so the
   * order bar behind the sheet stays truthful and the diner can simply
   * swipe the sheet away when they are done. The count itself comes back
   * down as a prop — this never keeps its own copy.
   */
  const change = (delta: number) => {
    if (quantity + delta < 0) return;
    onAdd(delta, "");
    if (delta > 0) onFly?.(heroRef.current);
    setBump(true);
    setTimeout(() => setBump(false), 250);
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      onClick={handleClose}
    >
      {/* Full height, flush to the bottom: no strip of the menu grid may
          show between this sheet and the order bar. The bar itself sits
          on a higher layer and stays visible on top of the sheet, so the
          scrolling content is padded to clear it instead. */}
      <div
        className={`absolute inset-0 mx-auto flex w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isVisible ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top media & actions.
            The video leads when there is one — it is the thing a guest
            will actually watch — and the photos follow. Swiped rather
            than tapped through: this is a phone held in one hand. */}
        <div className="relative aspect-[4/3] w-full shrink-0 bg-zinc-50">
          {item.videoUrl || item.images.length > 0 ? (
            <div className="scrollbar-hide flex h-full w-full snap-x snap-mandatory overflow-x-auto">
              {item.videoUrl && (
                <video
                  src={item.videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full shrink-0 snap-center bg-black object-contain"
                />
              )}

              {item.images.map((url, index) => (
                /* eslint-disable-next-line @next/next/no-img-element -- uploads may
                   live on a bucket whose host is unknown at build time, so
                   next/image's remotePatterns cannot cover them. See the note in
                   src/modules/storage/. */
                <img
                  key={url}
                  // The fly-to-cart animation clones the first photo, so
                  // only that one needs the ref.
                  ref={index === 0 ? heroRef : undefined}
                  src={url}
                  alt={item.name}
                  className="h-full w-full shrink-0 snap-center object-cover"
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-6xl text-zinc-400">
              🍽️
            </div>
          )}

          {/* How many there are to swipe through. Only worth showing
              when there is actually more than one. */}
          {(item.videoUrl ? 1 : 0) + item.images.length > 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {Array.from({
                length: (item.videoUrl ? 1 : 0) + item.images.length,
              }).map((_, index) => (
                <span
                  key={index}
                  className="h-1.5 w-1.5 rounded-full bg-white/70 shadow"
                />
              ))}
            </div>
          )}

          <button
            onClick={handleClose}
            className="absolute top-4 left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-zinc-600 shadow-sm backdrop-blur"
          >
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
                d="M15 19l-7-7 7-7"
              ></path>
            </svg>
          </button>

          <button
            type="button"
            aria-pressed={isFavourite}
            aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
            onClick={onToggleFavourite}
            className={`absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-sm backdrop-blur transition-colors ${
              isFavourite ? "text-red-500" : "text-zinc-400 hover:text-red-500"
            }`}
          >
            <svg
              className="h-5 w-5 transition-transform active:scale-90"
              fill={isFavourite ? "currentColor" : "none"}
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
        </div>

        {/* Name and price sit on a tinted band directly under the photo,
            with the add control straddling the divider beneath it. */}
        <div className="flex shrink-0 items-center justify-between gap-4 bg-zinc-50 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {emoji && <span className="text-2xl">{emoji}</span>}
            <h2 className="truncate text-xl font-bold text-zinc-900 lowercase">
              {item.name}
            </h2>
          </div>
          <p className="text-xl font-bold whitespace-nowrap text-zinc-900">
            {money(item.basePriceCents)}
          </p>
        </div>

        {/* Floating Add Button & Divider */}
        <div className="relative mb-10 h-px w-full shrink-0 bg-zinc-200">
          <div className="absolute top-1/2 right-6 -translate-y-1/2">
            {quantity === 0 ? (
              <button
                aria-label={`Add ${item.name} to order`}
                onClick={() => change(1)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-transform hover:scale-105 active:scale-90"
              >
                <Plus className="h-8 w-8" />
              </button>
            ) : (
              <div
                className={`flex h-14 items-center gap-6 rounded-full bg-green-500 px-4 text-white shadow-lg transition-transform duration-200 ${
                  bump ? "scale-105" : "scale-100"
                }`}
              >
                <button aria-label="Remove one" onClick={() => change(-1)}>
                  <Minus className="h-6 w-6" />
                </button>
                <span className="text-xl font-semibold tabular-nums">{quantity}</span>
                <button aria-label="Add one more" onClick={() => change(1)}>
                  <Plus className="h-6 w-6" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {/* pb-24 clears the order bar that floats above this sheet. */}
        <div className="flex-1 overflow-y-auto px-6 pb-24">
          {item.description && (
            <p className="text-[15px] leading-relaxed text-zinc-600">
              {item.description}
            </p>
          )}

          {item.dietaryTags.filter((tag) => tag !== "Popular").length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {item.dietaryTags
                .filter((tag) => tag !== "Popular")
                .map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
                  >
                    {tag}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
