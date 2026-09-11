"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
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
  category: { id: string; name: string; icon: string | null };
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

function CategorySheet({
  tenantSlug,
  menuId,
  category,
  onClose,
}: {
  tenantSlug: string;
  menuId?: string;
  category?: { id: string; name: string; icon: string | null };
  onClose: () => void;
}) {
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    formData.set("icon", icon);

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
              Shown to guests above the category name. Leave it blank and we pick one to
              match the name.
            </p>

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
