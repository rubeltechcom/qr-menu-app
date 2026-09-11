"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { downscaleImage } from "@/lib/downscale-image";

/**
 * The photo tile in the dish editor.
 *
 * Designed for a restaurant owner standing in their own kitchen with a
 * phone: one tap opens the camera or the photo library, the picture
 * appears immediately, and the upload happens behind it. The preview is
 * painted from a local object URL before a single byte leaves the
 * device, so the slow part never blocks the part that feels like
 * progress.
 *
 * Uses XMLHttpRequest rather than fetch for one reason: fetch cannot
 * report upload progress, and a determinate bar is the difference
 * between "working" and "frozen" on a weak connection.
 */

interface UploadState {
  status: "idle" | "uploading" | "error";
  progress: number;
  message: string | null;
}

const IDLE: UploadState = { status: "idle", progress: 0, message: null };

export function ImageUploader({
  value,
  onChange,
  tenantSlug,
  kind = "menuItem",
  label = "Add photo",
  className = "",
}: {
  /** The stored URL, or null when there is no photo yet. */
  value: string | null;
  onChange: (url: string | null) => void;
  tenantSlug: string;
  kind?: "menuItem" | "category";
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const previewRef = useRef<string | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<UploadState>(IDLE);

  const clearPreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    setPreview(null);
  }, []);

  // An abandoned upload — the owner closed the sheet mid-transfer —
  // must not keep running, and its object URL must not leak.
  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const upload = useCallback(
    async (file: File) => {
      // Paint the photo instantly from the local file, so the owner sees
      // their dish before the network is involved at all.
      const objectUrl = URL.createObjectURL(file);
      previewRef.current = objectUrl;
      setPreview(objectUrl);
      setState({ status: "uploading", progress: 0, message: null });

      const prepared = await downscaleImage(file);

      const body = new FormData();
      body.append("file", prepared, "photo.jpg");

      const request = new XMLHttpRequest();
      requestRef.current = request;

      request.open(
        "POST",
        `/api/uploads?tenantSlug=${encodeURIComponent(tenantSlug)}&kind=${kind}`,
      );

      request.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable) return;
        setState((current) => ({
          ...current,
          progress: Math.round((event.loaded / event.total) * 100),
        }));
      });

      request.addEventListener("load", () => {
        requestRef.current = null;

        let payload: { url?: string; error?: string } = {};
        try {
          payload = JSON.parse(request.responseText) as typeof payload;
        } catch {
          // fall through to the generic message below
        }

        if (request.status >= 200 && request.status < 300 && payload.url) {
          onChange(payload.url);
          clearPreview();
          setState(IDLE);
          return;
        }

        setState({
          status: "error",
          progress: 0,
          message: payload.error ?? "That upload didn't work. Please try again.",
        });
      });

      request.addEventListener("error", () => {
        requestRef.current = null;
        setState({
          status: "error",
          progress: 0,
          message: "No connection. Check your network and try again.",
        });
      });

      request.addEventListener("abort", () => {
        requestRef.current = null;
        clearPreview();
        setState(IDLE);
      });

      request.send(body);
    },
    [tenantSlug, kind, onChange, clearPreview],
  );

  const handleFile = (file: File | undefined) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setState({ status: "error", progress: 0, message: "That file isn't an image." });
      return;
    }
    // A friendly stop before spending time decoding something absurd.
    // The real limit is enforced server-side.
    if (file.size > 25 * 1024 * 1024) {
      setState({
        status: "error",
        progress: 0,
        message: "That photo is very large. Try one under 25MB.",
      });
      return;
    }
    void upload(file);
  };

  const remove = () => {
    requestRef.current?.abort();
    clearPreview();
    setState(IDLE);
    onChange(null);
  };

  const shown = preview ?? value;
  const isUploading = state.status === "uploading";

  return (
    <div className={className}>
      <div
        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
          state.status === "error"
            ? "border-red-300 bg-red-50"
            : "border-zinc-300 bg-zinc-50 hover:border-zinc-400"
        }`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          handleFile(event.dataTransfer.files[0]);
        }}
      >
        {shown ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- see the
                note in the storage module: uploads may live on a bucket
                whose host is unknown at build time, so next/image's
                remotePatterns cannot be configured for them. */}
            <img src={shown} alt="" className="h-full w-full object-cover" />

            {isUploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white">
                <Loader2 className="h-6 w-6 animate-spin" />
                <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-white/30">
                  <div
                    className="h-full bg-white transition-[width] duration-150"
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums">{state.progress}%</span>
              </div>
            )}

            {!isUploading && (
              <button
                type="button"
                onClick={remove}
                aria-label="Remove photo"
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-500 hover:text-zinc-700"
          >
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm font-medium">{label}</span>
            <span className="px-4 text-center text-xs text-zinc-400">
              Take a photo or choose a file
            </span>
          </button>
        )}
      </div>

      {shown && !isUploading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 w-full text-center text-xs font-medium text-zinc-600 hover:text-zinc-900"
        >
          Replace photo
        </button>
      )}

      {state.message && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
          {state.message}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        // The formats the server accepts, so the picker cannot offer
        // something that is only going to be rejected.
        accept="image/jpeg,image/png,image/webp,image/avif"
        // No `capture` attribute on purpose. It does NOT mean "offer the
        // camera as well" — it forces the camera and removes the photo
        // library entirely, which is the opposite of what an owner
        // photographing a dish they already shot needs. Without it the
        // phone shows its own sheet: Camera, Photo Library, or Files.
        className="sr-only"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          // Reset, so picking the same file twice in a row still fires.
          event.target.value = "";
        }}
      />
    </div>
  );
}
