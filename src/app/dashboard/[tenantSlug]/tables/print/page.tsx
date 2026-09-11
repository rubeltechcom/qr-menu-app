import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import * as locationRepo from "@/modules/locations/location.repository";
import * as tableRepo from "@/modules/tables/table.repository";
import { tableQrSvg } from "@/modules/tables/qr";

/**
 * The printable sheet: every table's QR on one page, cut-and-stick.
 *
 * Laid out for A4/Letter with a print stylesheet rather than generating a
 * PDF server-side — the browser's own print dialog gives the owner page
 * setup, a preview, and "save as PDF" for free, and it is one less
 * dependency to keep alive.
 */
export default async function PrintTablesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, db } = await requireDashboardTenant(tenantSlug);

  const locations = await locationRepo.listLocations(db);
  const location = locations[0];
  const tables = location ? await tableRepo.listTables(db, location.id) : [];

  const cards = await Promise.all(
    tables.map(async (table) => ({
      id: table.id,
      label: table.label,
      publicCode: table.publicCode,
      // The restaurant's own subdomain, so the printed sticker carries
      // their address rather than the platform's.
      svg: await tableQrSvg(table.publicCode, 280, { tenantSlug: tenant.slug }),
    })),
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 print:px-0 print:py-0">
      <style>{`
        @page { margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          .qr-card { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Print QR codes</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {cards.length} {cards.length === 1 ? "table" : "tables"} — cut along the lines
            and stick one on each table.
          </p>
        </div>
        {/* Rendered as a plain link rather than a print button: a button
            needs client JS for window.print(), and the browser's own
            Ctrl/Cmd+P does the same job on a page built for it. */}
        <p className="text-sm text-zinc-500">
          Press{" "}
          <kbd className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs">Ctrl</kbd>
          {" / "}
          <kbd className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs">⌘</kbd>
          {" + "}
          <kbd className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs">P</kbd> to
          print
        </p>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-zinc-600">No tables yet — add some first.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 print:grid-cols-3 print:gap-4">
          {cards.map((card) => (
            <div
              key={card.id}
              className="qr-card flex flex-col items-center rounded-lg border border-dashed border-zinc-300 p-4 text-center print:border-zinc-400"
            >
              <p className="text-sm font-semibold text-zinc-900 print:text-black">
                {tenant.name}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 print:text-zinc-700">
                Scan to see the menu &amp; order
              </p>

              <div
                className="mt-3 w-full [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: card.svg }}
              />

              <p className="mt-2 text-lg font-bold text-zinc-900 print:text-black">
                Table {card.label}
              </p>
              {/* Printed under the code so a diner whose camera fails can
                  still reach the menu by typing it in. */}
              <p className="font-mono text-[10px] tracking-wider text-zinc-500 print:text-zinc-700">
                {card.publicCode}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
