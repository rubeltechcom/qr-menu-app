import Link from "next/link";
import { Check } from "lucide-react";

/**
 * Chrome for signing up and logging in.
 *
 * Two panels on a laptop: the form on the left, and on the right the
 * reasons someone started filling it in. On a phone the panel drops
 * away entirely — at that width it would push the first field below the
 * fold, and a form nobody can see is worse than no reassurance.
 */

const REASSURANCE = [
  "Free plan, no card required",
  "Unlimited categories and menu items",
  "Dine-in, takeaway and delivery orders",
  "Your QR codes ready to print today",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <div className="flex w-full flex-col lg:w-1/2">
        <header className="px-6 py-6 sm:px-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-bold tracking-tight text-zinc-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm text-white">
              QR
            </span>
            <span className="text-lg">Menu</span>
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>

      <aside className="hidden w-1/2 flex-col justify-center bg-gradient-to-br from-zinc-900 to-zinc-800 px-12 py-16 lg:flex">
        <blockquote className="max-w-lg">
          <p className="text-3xl font-bold leading-tight tracking-tight text-white">
            Put a QR code on every table and let your guests order for
            themselves.
          </p>
          <p className="mt-6 text-lg leading-relaxed text-zinc-300">
            Your menu updates instantly, orders arrive on the kitchen screen with
            a sound, and nobody has to install anything.
          </p>
        </blockquote>

        <ul className="mt-10 flex max-w-lg flex-col gap-3">
          {REASSURANCE.map((line) => (
            <li key={line} className="flex items-center gap-3 text-zinc-200">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
