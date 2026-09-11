"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { useMediaUpload } from "@/lib/use-media-upload";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "./actions";

/**
 * Naming a category and choosing its icon.
 *
 * The icon is what a guest actually navigates by — the storefront's
 * category strip is a row of emoji with the names underneath — so it is
 * offered as a picker rather than buried in an optional field. Leaving
 * it unset is fine: the storefront then guesses one from the name.
 */

/** Offered by the picker. Anything the owner types is still accepted. */
const SUGGESTED_ICONS = [
  "🍽️",
  "👌",
  "🍛",
  "🍜",
  "🍤",
  "🍲",
  "🥟",
  "🍡",
  "🥤",
  "🍕",
  "🍔",
  "🌮",
  "🍣",
  "🥗",
  "🍰",
  "☕",
  "🍺",
  "🍷",
  "🥩",
  "🍗",
  "🍟",
  "🥞",
  "🧀",
  "🍦",
  "🌶️",
  "🥘",
  "🍱",
  "🥐",
  "🍹",
  "🫖",
];

export function AddCategoryButton({
  tenantSlug,
  menuId,
}: {
  tenantSlug: string;
  menuId: string;
}) {
  const [isOpen, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 flex-col items-center gap-2"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600">
          <Plus className="h-6 w-6" />
        </span>
        <span className="text-sm font-medium text-zinc-500">Add</span>
      </button>

      {isOpen && (
        <CategorySheet
          tenantSlug={tenantSlug}
          menuId={menuId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function EditCategoryButton({
  tenantSlug,
  category,
}: {
  tenantSlug: string;
  category: { id: string; name: string; icon: string | null; imageUrl: string | null };
}) {
  const [isOpen, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${category.name}`}
        className="text-zinc-400 transition-colors hover:text-zinc-700"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </button>

      {isOpen && (
        <CategorySheet
          tenantSlug={tenantSlug}
          category={category}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * A category's own icon image, as an alternative to an emoji.
 *
 * Square and small — it renders at 64px in the storefront's category
 * strip — so a logo or a product shot both work.
 */
function CategoryImagePicker({
  value,
  onChange,
  tenantSlug,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  tenantSlug: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, upload, isUploading } = useMediaUpload({
    tenantSlug,
    kind: "category",
    onUploaded: ({ url }) => onChange(url),
  });

  const shown = state.preview ?? value;

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-zinc-200 bg-zinc-50">
        {shown ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- uploads
                may live on a bucket whose host is unknown at build time. */}
            <img src={shown} alt="" className="h-full w-full object-cover" />
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-300">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="w-fit rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
        >
          {value ? "Replace image" : "Upload an image"}
        </button>

        {value && !isUploading && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="w-fit text-xs font-medium text-red-600 hover:underline"
          >
            Remove, use an emoji instead
          </button>
        )}

        {state.message && (
          <p role="alert" className="text-xs font-medium text-red-600">
            {state.message}
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function CategorySheet({
  tenantSlug,
  menuId,
  category,
  onClose,
}: {
  tenantSlug: string;
  menuId?: string;
  category?: { id: string; name: string; icon: string | null; imageUrl: string | null };
  onClose: () => void;
}) {
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(category?.imageUrl ?? null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    formData.set("icon", icon);
    formData.set("imageUrl", imageUrl ?? "");

    startTransition(async () => {
      try {
        if (category) {
          await updateCategoryAction(tenantSlug, category.id, formData);
        } else if (menuId) {
          await createCategoryAction(tenantSlug, menuId, formData);
        }
        onClose();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That didn't save.");
      }
    });
  };

  const remove = () => {
    if (!category) return;
    if (!confirm(`Remove "${category.name}" and its dishes from the menu?`)) return;
    startTransition(async () => {
      await deleteCategoryAction(tenantSlug, category.id);
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            {category ? "Edit category" : "New category"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={submit} className="flex flex-col gap-5 p-6">
          <div>
            <label htmlFor="name" className="text-sm font-medium text-zinc-800">
              Name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={category?.name}
              required
              maxLength={120}
              placeholder="Starters"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-900"
            />
          </div>

          <div>
            <span className="text-sm font-medium text-zinc-800">Icon</span>
            <p className="mt-0.5 text-xs text-zinc-500">
              Shown to guests above the category name. Upload your own, pick an emoji, or
              leave it blank and we choose one to match the name.
            </p>

            {/* Your own image first: it is what a business with real
                branding actually wants, and the emoji list below is the
                quick option rather than the only one. */}
            <div className="mt-3">
              <CategoryImagePicker
                value={imageUrl}
                onChange={(url) => {
                  setImageUrl(url);
                  // An uploaded icon wins over an emoji, so clear the
                  // emoji rather than leaving two competing choices set.
                  if (url) setIcon("");
                }}
                tenantSlug={tenantSlug}
              />
            </div>

            {!imageUrl && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTED_ICONS.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => setIcon(candidate === icon ? "" : candidate)}
                    aria-pressed={icon === candidate}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition-colors ${
                      icon === candidate
                        ? "bg-yellow-400 ring-2 ring-zinc-900"
                        : "bg-zinc-100 hover:bg-zinc-200"
                    }`}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            {category && (
              <button
                type="button"
                onClick={remove}
                disabled={isPending}
                aria-label="Delete category"
                className="rounded-full p-3 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              {isPending ? "Saving…" : category ? "Save changes" : "Add category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
