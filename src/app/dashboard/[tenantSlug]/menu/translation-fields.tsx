"use client";

import { useState } from "react";
import { Languages } from "lucide-react";
import { localeInfo } from "@/modules/i18n/locales";

/**
 * Where an owner types their dish names in another language.
 *
 * Collapsed by default. Most restaurants serve one language, and a
 * second name box under every field would make the common case worse to
 * serve the rarer one. It opens already filled in, so an owner adding a
 * translation sees what is there rather than an empty box that might
 * mean "nothing saved" or "not loaded yet".
 *
 * Field names are `tr.<locale>.<field>`, which is what the save action
 * looks for — one submit carries every language.
 */

export interface ExistingTranslation {
  field: string;
  locale: string;
  value: string;
}

export function TranslationFields({
  locales,
  defaultLocale,
  existing,
  fields,
}: {
  /** Every language the restaurant offers, including its default. */
  locales: string[];
  defaultLocale: string;
  existing: ExistingTranslation[];
  /** Which fields to offer, matching the entity being edited. */
  fields: { key: "name" | "description"; label: string; multiline?: boolean }[];
}) {
  const [isOpen, setOpen] = useState(false);

  // The default language is the original text, already typed in the
  // fields above — offering a "translation" of it would be confusing.
  const others = locales.filter((code) => code !== defaultLocale);
  if (others.length === 0) return null;

  const valueFor = (locale: string, field: string) =>
    existing.find((row) => row.locale === locale && row.field === field)?.value ?? "";

  const filledCount = existing.filter((row) => row.value.trim()).length;

  return (
    <div className="rounded-xl border border-zinc-200">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        <Languages className="h-4 w-4 shrink-0 text-zinc-500" />
        <span className="flex-1">Other languages</span>
        {filledCount > 0 && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
            {filledCount} filled
          </span>
        )}
        <span className="text-xs text-zinc-400">{isOpen ? "Hide" : "Show"}</span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-5 border-t border-zinc-200 p-4">
          <p className="text-xs text-zinc-500">
            Leave a box empty and guests reading that language see the original text,
            rather than a blank.
          </p>

          {others.map((locale) => {
            const info = localeInfo(locale);
            return (
              <div key={locale} className="flex flex-col gap-3">
                <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                  {info.nativeName}
                  {info.nativeName !== info.name && (
                    <span className="ml-1.5 font-normal text-zinc-400 normal-case">
                      {info.name}
                    </span>
                  )}
                </p>

                {fields.map((field) => (
                  <div key={field.key}>
                    <label
                      htmlFor={`tr.${locale}.${field.key}`}
                      className="text-xs text-zinc-600"
                    >
                      {field.label}
                    </label>
                    {field.multiline ? (
                      <textarea
                        id={`tr.${locale}.${field.key}`}
                        name={`tr.${locale}.${field.key}`}
                        rows={2}
                        defaultValue={valueFor(locale, field.key)}
                        className={FIELD}
                      />
                    ) : (
                      <input
                        id={`tr.${locale}.${field.key}`}
                        name={`tr.${locale}.${field.key}`}
                        defaultValue={valueFor(locale, field.key)}
                        className={FIELD}
                      />
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const FIELD =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";
