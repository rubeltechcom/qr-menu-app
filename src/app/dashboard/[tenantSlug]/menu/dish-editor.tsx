"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { ImageUploader } from "@/components/menu/image-uploader";
import { createMenuItemAction, updateMenuItemAction } from "./actions";

export interface DishDraft {
  id: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  images: string[];
  dietaryTags: string[];
}

/**
 * The full dish editor, as a sheet over the menu.
 *
 * Replaces the old inline "name and price" form. A dish that a guest
 * will choose from a photo needs the photo, a description and its
 * dietary tags, and none of that fits sensibly in a grid cell — so the
 * grid stays a grid and this owns the editing.
 */
export function DishEditor({
  tenantSlug,
  categoryId,
  dish,
  trigger,
}: {
  tenantSlug: string;
  categoryId: string;
  /** Absent when adding a new dish. */
  dish?: DishDraft;
  trigger: "tile" | "pencil";
}) {
  const [isOpen, setOpen] = useState(false);

  return (
    <>
      {trigger === "tile" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700"
        >
          <Plus className="h-8 w-8" />
          <span className="text-sm font-medium">Add new dish</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${dish?.name ?? "dish"}`}
          className="rounded-full bg-white/90 p-1.5 text-zinc-600 shadow-sm backdrop-blur transition-colors hover:text-zinc-900"
        >
          <PencilIcon />
        </button>
      )}

      {isOpen && (
        <DishSheet
          tenantSlug={tenantSlug}
          categoryId={categoryId}
          dish={dish}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DishSheet({
  tenantSlug,
  categoryId,
  dish,
  onClose,
}: {
  tenantSlug: string;
  categoryId: string;
  dish?: DishDraft;
  onClose: () => void;
}) {
  const [image, setImage] = useState<string | null>(dish?.images[0] ?? null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    // The uploader holds the photo outside the form, so it is attached
    // here rather than through a hidden input that could go stale.
    formData.set("image", image ?? "");

    startTransition(async () => {
      try {
        if (dish) {
          await updateMenuItemAction(tenantSlug, dish.id, formData);
        } else {
          await createMenuItemAction(tenantSlug, categoryId, formData);
        }
        onClose();
      } catch (cause) {
        // A plan limit or a rejected image comes back as a thrown
        // Error; the owner needs to read it, not lose their typing.
        setError(
          cause instanceof Error ? cause.message : "That didn't save. Please try again.",
        );
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            {dish ? "Edit dish" : "New dish"}
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

        <form action={submit} className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          <div className="flex gap-5">
            <ImageUploader
              value={image}
              onChange={setImage}
              tenantSlug={tenantSlug}
              kind="menuItem"
              className="w-36 shrink-0"
            />

            <div className="flex flex-1 flex-col gap-4">
              <div>
                <label htmlFor="name" className="text-sm font-medium text-zinc-800">
                  Dish name
                </label>
                <input
                  id="name"
                  name="name"
                  defaultValue={dish?.name}
                  required
                  maxLength={150}
                  placeholder="Chicken katsu curry"
                  className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-900"
                />
              </div>

              <div>
                <label htmlFor="price" className="text-sm font-medium text-zinc-800">
                  Price
                </label>
                <input
                  id="price"
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={dish ? (dish.basePriceCents / 100).toFixed(2) : ""}
                  required
                  placeholder="8.95"
                  className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-900"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="description" className="text-sm font-medium text-zinc-800">
              Description <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={1000}
              defaultValue={dish?.description ?? ""}
              placeholder="Panko-breaded chicken, curry sauce, sticky rice and pickles."
              className="mt-1.5 w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-900"
            />
          </div>

          <div>
            <label htmlFor="dietaryTags" className="text-sm font-medium text-zinc-800">
              Tags <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="dietaryTags"
              name="dietaryTags"
              defaultValue={dish?.dietaryTags.join(", ") ?? ""}
              placeholder="Vegan, Spicy, Popular"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-900"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Separate with commas. Guests filter by these, and anything tagged
              &ldquo;Popular&rdquo; is promoted on the menu&rsquo;s first screen.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {error}
            </p>
          )}

          <div className="mt-auto flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              {isPending ? "Saving…" : dish ? "Save changes" : "Add dish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}
