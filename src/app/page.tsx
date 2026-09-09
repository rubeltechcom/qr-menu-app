export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 text-center dark:bg-black">
      <p className="mb-3 text-sm font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        Phase 1 — Tenancy &amp; Auth (in progress)
      </p>
      <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
        QR Menu &amp; Ordering
      </h1>
      <p className="mt-4 max-w-md text-base text-zinc-600 dark:text-zinc-400">
        Digital QR-code menus and contactless ordering for restaurants.
        Marketing site, storefront, and dashboard are being built out
        module by module — see{" "}
        <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
          PROMPT.md
        </code>{" "}
        for the full build plan.
      </p>
    </div>
  );
}
