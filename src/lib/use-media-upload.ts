"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downscaleImage } from "@/lib/downscale-image";

/**
 * Uploading one file, with progress.
 *
 * Extracted from the single-photo uploader so the dish gallery, the
 * category icon and the brand logo all behave identically — same
 * progress bar, same cancellation, same error messages.
 *
 * XMLHttpRequest rather than fetch for one reason: fetch cannot report
 * upload progress, and a determinate bar is the difference between
 * "working" and "frozen" on a restaurant's wifi.
 */

export type UploadKind = "menuItem" | "category" | "brand";

export interface UploadResult {
  url: string;
  isVideo: boolean;
}

export interface UploadState {
  status: "idle" | "uploading" | "error";
  progress: number;
  message: string | null;
  /** A local object URL, shown before the upload finishes. */
  preview: string | null;
}

const IDLE: UploadState = { status: "idle", progress: 0, message: null, preview: null };

/** Client-side sanity limits. The server re-checks everything. */
const MAX_IMAGE_MB = 25;
const MAX_VIDEO_MB = 60;

export function useMediaUpload({
  tenantSlug,
  kind = "menuItem",
  onUploaded,
}: {
  tenantSlug: string;
  kind?: UploadKind;
  onUploaded: (result: UploadResult) => void;
}) {
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const previewRef = useRef<string | null>(null);
  const [state, setState] = useState<UploadState>(IDLE);

  const releasePreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  }, []);

  // An abandoned upload — the owner closed the sheet mid-transfer — must
  // not keep running, and its object URL must not leak.
  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    requestRef.current?.abort();
    releasePreview();
    setState(IDLE);
  }, [releasePreview]);

  const upload = useCallback(
    async (file: File) => {
      const isVideo = file.type.startsWith("video/");

      if (!isVideo && !file.type.startsWith("image/")) {
        setState({
          ...IDLE,
          status: "error",
          message: "That file is not an image or a video.",
        });
        return;
      }

      const capMb = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
      if (file.size > capMb * 1024 * 1024) {
        setState({
          ...IDLE,
          status: "error",
          message: `That ${isVideo ? "video" : "photo"} is very large. Try one under ${capMb}MB.`,
        });
        return;
      }

      // Paint it instantly from the local file, so the owner sees their
      // dish before the network is involved at all.
      const objectUrl = URL.createObjectURL(file);
      previewRef.current = objectUrl;
      setState({ status: "uploading", progress: 0, message: null, preview: objectUrl });

      // Images are shrunk in the browser; video is sent as-is, since
      // re-encoding it client-side is far slower than uploading it.
      const prepared = isVideo ? file : await downscaleImage(file);

      const body = new FormData();
      body.append("file", prepared, isVideo ? file.name : "photo.jpg");

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

        let payload: { url?: string; isVideo?: boolean; error?: string } = {};
        try {
          payload = JSON.parse(request.responseText) as typeof payload;
        } catch {
          // Fall through to the generic message below.
        }

        if (request.status >= 200 && request.status < 300 && payload.url) {
          onUploaded({ url: payload.url, isVideo: payload.isVideo ?? isVideo });
          releasePreview();
          setState(IDLE);
          return;
        }

        setState({
          status: "error",
          progress: 0,
          preview: null,
          message: payload.error ?? "That upload didn't work. Please try again.",
        });
        releasePreview();
      });

      request.addEventListener("error", () => {
        requestRef.current = null;
        releasePreview();
        setState({
          status: "error",
          progress: 0,
          preview: null,
          message: "No connection. Check your network and try again.",
        });
      });

      request.addEventListener("abort", () => {
        requestRef.current = null;
        releasePreview();
        setState(IDLE);
      });

      request.send(body);
    },
    [tenantSlug, kind, onUploaded, releasePreview],
  );

  return { state, upload, reset, isUploading: state.status === "uploading" };
}
