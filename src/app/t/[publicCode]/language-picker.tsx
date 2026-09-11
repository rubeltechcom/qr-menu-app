"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { localeInfo } from "@/modules/i18n/locales";

/**
 * Switching the menu's language.
 *
 * Shows each language in its own script — a guest looking for Bengali
 * is looking for "বাংলা", not for the word "Bengali" written in an
 * alphabet they may not read.
 *
 * Only rendered when the restaurant offers more than one language, so a
 * single-language menu carries no dead control.
 */
export function LanguagePicker({
  locales,
  active,
  onChange,
}: {
  locales: string[];
  active: string;
  onChange: (locale: string) => void;
}) {
  const [isOpen, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on an outside tap or Escape. A dropdown that can only be
  // dismissed by choosing something is a trap on a phone.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const current = localeInfo(active);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Change language"
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        <Globe className="h-4 w-4" />
        {current.nativeName}
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1 min-w-40 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {locales.map((code) => {
            const info = localeInfo(code);
            const isActive = code === active;

            return (
              <li key={code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onChange(code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-zinc-50 ${
                    isActive ? "font-semibold text-zinc-900" : "text-zinc-700"
                  }`}
                >
                  <span>
                    {info.nativeName}
                    {info.nativeName !== info.name && (
                      <span className="ml-1.5 text-xs text-zinc-400">{info.name}</span>
                    )}
                  </span>
                  {isActive && <Check className="h-4 w-4 shrink-0 text-green-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
