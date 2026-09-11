"use client";

import { useRef } from "react";
import { ImagePlus, Loader2, Star, Video, X } from "lucide-react";
import { useMediaUpload } from "@/lib/use-media-upload";

/**
 * A dish's photos and its short video.
 *
 * Up to five images and one clip. The first image is the one the menu
 * grid shows, so it can be promoted from any tile rather than forcing
 * the owner to delete and re-upload in the right order — reordering by
 * drag is a poor fit for a phone, which is what most owners use.
 *
 * Video is kept separate from the photos rather than mixed into one
 * list, because it is genuinely different: it plays, it is capped at
 * one, and the storefront shows it first.
 */

const MAX_IMAGES = 5;

export function MediaGallery({
  images,
  videoUrl,
  onImagesChange,
  onVideoChange,
  tenantSlug,
}: {
  images: string[];
  videoUrl: string | null;
  onImagesChange: (urls: string[]) => void;
  onVideoChange: (url: string | null) => void;
  tenantSlug: string;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const imageUpload = useMediaUpload({
    tenantSlug,
    kind: "menuItem",
    onUploaded: ({ url }) => onImagesChange([...images, url].slice(0, MAX_IMAGES)),
  });

  const videoUpload = useMediaUpload({
    tenantSlug,
    kind: "menuItem",
    onUploaded: ({ url }) => onVideoChange(url),
  });

  const canAddMore = images.length < MAX_IMAGES;

  /** Promote a photo to first, which is what the menu grid shows. */
  const makeCover = (index: number) => {
    if (index === 0) return;
    const next = [...images];
    const [moved] = next.splice(index, 1);
    onImagesChange([moved!, ...next]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-zinc-800">Photos</span>
          <span className="text-xs text-zinc-500">
            {images.length} of {MAX_IMAGES}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((url, index) => (
            <figure
              key={url}
              className={`group relative aspect-square overflow-hidden rounded-xl border-2 ${
                index === 0 ? "border-zinc-900" : "border-zinc-200"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- uploads
                  may live on a bucket whose host is unknown at build time. */}
              <img src={url} alt="" className="h-full w-full object-cover" />

              {index === 0 && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-zinc-900/80 py-0.5 text-center text-[10px] font-semibold text-white">
                  Cover
                </figcaption>
              )}

              <div className="absolute inset-x-0 top-0 flex justify-between p-1">
                {index !== 0 ? (
                  <button
                    type="button"
                    onClick={() => makeCover(index)}
                    title="Make this the cover photo"
                    aria-label="Make this the cover photo"
                    className="rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                  >
                    <Star className="h-3 w-3" />
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={() => onImagesChange(images.filter((_, i) => i !== index))}
                  title="Remove"
                  aria-label="Remove photo"
                  className="rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </figure>
          ))}

          {/* The in-flight upload, shown in place so the grid does not
              jump when it completes. */}
          {imageUpload.isUploading && imageUpload.state.preview && (
            <div className="relative aspect-square overflow-hidden rounded-xl border-2 border-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img
                src={imageUpload.state.preview}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 text-white">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-xs font-medium tabular-nums">
                  {imageUpload.state.progress}%
                </span>
              </div>
            </div>
          )}

          {canAddMore && !imageUpload.isUploading && (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700"
            >
              <ImagePlus className="h-5 w-5" />
              <span className="text-xs font-medium">Add</span>
            </button>
          )}
        </div>

        {images.length > 1 && (
          <p className="mt-1.5 text-xs text-zinc-500">
            Tap ★ to choose which photo guests see on the menu.
          </p>
        )}

        {imageUpload.state.message && (
          <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
            {imageUpload.state.message}
          </p>
        )}
      </div>

      <div>
        <span className="text-sm font-medium text-zinc-800">
          Video <span className="font-normal text-zinc-500">(optional)</span>
        </span>
        <p className="mt-0.5 text-xs text-zinc-500">
          A short clip, shown before the photos. Keep it brief — guests are on their
          phones.
        </p>

        <div className="mt-2">
          {videoUrl ? (
            <div className="relative overflow-hidden rounded-xl border-2 border-zinc-200">
              <video
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full bg-black object-contain"
              />
              <button
                type="button"
                onClick={() => onVideoChange(null)}
                aria-label="Remove video"
                className="absolute top-2 right-2 rounded-full bg-black/70 p-1.5 text-white transition-colors hover:bg-black/90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : videoUpload.isUploading ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-zinc-200 bg-zinc-50">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
              <div className="h-1.5 w-1/2 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full bg-zinc-900 transition-[width] duration-150"
                  style={{ width: `${videoUpload.state.progress}%` }}
                />
              </div>
              <span className="text-xs font-medium text-zinc-600 tabular-nums">
                {videoUpload.state.progress}%
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700"
            >
              <Video className="h-6 w-6" />
              <span className="text-sm font-medium">Add a video</span>
            </button>
          )}
        </div>

        {videoUpload.state.message && (
          <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
            {videoUpload.state.message}
          </p>
        )}
      </div>

      {/* No `capture` attribute: it forces the camera and removes the
          photo library, which is the opposite of what an owner
          photographing a dish they already shot needs. */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void imageUpload.upload(file);
          event.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void videoUpload.upload(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
