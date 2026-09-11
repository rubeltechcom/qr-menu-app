"use client";

import { useActionState, useRef, useState } from "react";
import { Check, ImagePlus, Loader2 } from "lucide-react";
import { useMediaUpload } from "@/lib/use-media-upload";
import { LOCALES } from "@/modules/i18n/locales";
import { saveBrandingAction, type BrandingFormState } from "./actions";

const initialState: BrandingFormState = {};

/**
 * A restaurant's own name, logo and languages.
 *
 * The languages chosen here are what the storefront's picker offers a
 * guest. Choosing only one hides the picker entirely, which is the
 * right outcome for a restaurant that serves one language: a control
 * with a single option is noise.
 */
export function BrandingForm({
  tenantSlug,
  name,
  logoUrl: initialLogoUrl,
  locales: initialLocales,
  defaultLocale: initialDefault,
}: {
  tenantSlug: string;
  name: string;
  logoUrl: string | null;
  locales: string[];
  defaultLocale: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveBrandingAction.bind(null, tenantSlug),
    initialState,
  );

  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [locales, setLocales] = useState<string[]>(
    initialLocales.length > 0 ? initialLocales : [initialDefault],
  );
  const [defaultLocale, setDefaultLocale] = useState(initialDefault);

  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useMediaUpload({
    tenantSlug,
    kind: "brand",
    onUploaded: ({ url }) => setLogoUrl(url),
  });

  const toggleLocale = (code: string) => {
    setLocales((current) => {
      // Never leave zero selected — the storefront would have no
      // language to render in.
      if (current.includes(code)) {
        if (current.length === 1) return current;
        const next = current.filter((value) => value !== code);
        // The default must stay among the offered languages.
        if (code === defaultLocale) setDefaultLocale(next[0]!);
        return next;
      }
      return [...current, code];
    });
  };

  const shown = upload.state.preview ?? logoUrl;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {/* The gallery and picker hold their values outside the form. */}
      <input type="hidden" name="logoUrl" value={logoUrl ?? ""} />
      {locales.map((code) => (
        <input key={code} type="hidden" name="locales" value={code} />
      ))}
      <input type="hidden" name="defaultLocale" value={defaultLocale} />

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Your restaurant</h2>
        <p className="mt-1 text-sm text-zinc-600">
          What guests see at the top of your menu.
        </p>

        <div className="mt-6">
          <label htmlFor="name" className="text-sm font-medium text-zinc-800">
            Name
          </label>
          <input
            id="name"
            name="name"
            defaultValue={name}
            maxLength={120}
            className="mt-1.5 w-full max-w-sm rounded-lg border border-zinc-300 px-3.5 py-2.5 text-zinc-900 transition-colors outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        <div className="mt-6">
          <span className="text-sm font-medium text-zinc-800">Logo</span>
          <p className="mt-0.5 text-xs text-zinc-500">
            Square works best. Without one, guests see your name alone.
          </p>

          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-zinc-200 bg-zinc-50">
              {shown ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploads
                      may live on a bucket whose host is unknown at build time. */}
                  <img src={shown} alt="" className="h-full w-full object-cover" />
                  {upload.isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-300">
                  <ImagePlus className="h-7 w-7" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={upload.isUploading}
                className="w-fit rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                {logoUrl ? "Replace logo" : "Upload a logo"}
              </button>
              {logoUrl && !upload.isUploading && (
                <button
                  type="button"
                  onClick={() => setLogoUrl(null)}
                  className="w-fit text-xs font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
              {upload.state.message && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  {upload.state.message}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Languages</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Guests can switch between the languages you offer. Pick one and the switcher is
          hidden entirely.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {LOCALES.map((locale) => {
            const isOffered = locales.includes(locale.code);
            const isDefault = defaultLocale === locale.code;

            return (
              <div
                key={locale.code}
                className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
                  isOffered ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleLocale(locale.code)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                      isOffered
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300"
                    }`}
                  >
                    {isOffered && <Check className="h-3 w-3" />}
                  </span>
                  <span>
                    <span className="font-medium text-zinc-900">{locale.nativeName}</span>
                    {locale.nativeName !== locale.name && (
                      <span className="ml-2 text-sm text-zinc-500">{locale.name}</span>
                    )}
                  </span>
                </button>

                {isOffered &&
                  (isDefault ? (
                    <span className="shrink-0 rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white">
                      Default
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDefaultLocale(locale.code)}
                      className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
                    >
                      Make default
                    </button>
                  ))}
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          The default is what a guest sees before they choose, and the fallback for a
          language you do not offer.
        </p>
      </section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || upload.isUploading}
          className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>

        {state.ok && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
            <Check className="h-4 w-4" />
            Saved.
          </span>
        )}
        {state.error && (
          <span role="alert" className="text-sm font-medium text-red-600">
            {state.error}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload.upload(file);
          event.target.value = "";
        }}
      />
    </form>
  );
}
