import Link from "next/link";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import * as locationRepo from "@/modules/locations/location.repository";
import * as tableRepo from "@/modules/tables/table.repository";
import { tableQrSvg, tableStorefrontUrl } from "@/modules/tables/qr";
import {
  createLocationAction,
  createTableAction,
  createTableRangeAction,
} from "./actions";
import { DeleteTableButton, RegenerateCodeButton } from "./table-controls";

export default async function TablesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { db } = await requireDashboardTenant(tenantSlug);

  const locations = await locationRepo.listLocations(db);

  if (locations.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-xl font-semibold text-zinc-900">Add your first location</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Tables belong to a location — add one to start printing QR codes.
        </p>
        <form
          action={createLocationAction.bind(null, tenantSlug)}
          className="mt-6 flex flex-col gap-3"
        >
          <input
            name="name"
            placeholder="Location name (e.g. Main St)"
            required
            className="rounded-lg border border-zinc-300 px-3 py-2"
          />
          <button
            type="submit"
            className="mt-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white"
          >
            Create location
          </button>
        </form>
      </div>
    );
  }

  const location = locations[0]!;
  const tables = await tableRepo.listTables(db, location.id);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Tables — {location.name}
        </h1>
        {tables.length > 0 && (
          <Link
            href={`/dashboard/${tenantSlug}/tables/print`}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700"
          >
            Print all QR codes
          </Link>
        )}
      </div>

      {tables.length === 0 ? (
        <EmptyState tenantSlug={tenantSlug} locationId={location.id} />
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {tables.map((table) => (
              <TableCard key={table.id} tenantSlug={tenantSlug} table={table} />
            ))}
          </div>

          <div className="mt-10 border-t border-zinc-200 pt-6">
            <h2 className="text-sm font-medium text-zinc-900">Add another table</h2>
            <form
              action={createTableAction.bind(null, tenantSlug, location.id)}
              className="mt-3 flex flex-wrap gap-2"
            >
              <input
                name="label"
                placeholder="Table name or number"
                required
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                name="seats"
                type="number"
                min="1"
                max="99"
                placeholder="Seats"
                className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white"
              >
                Add
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A restaurant setting up has 20 tables numbered 1-20, not one table. So
 * the empty state leads with the range form — adding them one at a time is
 * the kind of friction that loses a signup before the first order.
 */
function EmptyState({
  tenantSlug,
  locationId,
}: {
  tenantSlug: string;
  locationId: string;
}) {
  return (
    <div className="mt-8 rounded-xl border border-zinc-200 p-6">
      <h2 className="font-medium text-zinc-900">Add your tables</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Most places number their tables in a run. Create the whole range at once, then
        print the codes.
      </p>

      <form
        action={createTableRangeAction.bind(null, tenantSlug, locationId)}
        className="mt-5 flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Prefix (optional)</span>
          <input
            name="prefix"
            placeholder="e.g. T"
            className="w-28 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">From</span>
          <input
            name="from"
            type="number"
            min="1"
            max="999"
            defaultValue={1}
            required
            className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">To</span>
          <input
            name="to"
            type="number"
            min="1"
            max="999"
            defaultValue={12}
            required
            className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white"
        >
          Create tables
        </button>
      </form>
    </div>
  );
}

async function TableCard({
  tenantSlug,
  table,
}: {
  tenantSlug: string;
  table: { id: string; label: string; publicCode: string; seats: number | null };
}) {
  // Encodes the restaurant's own subdomain, so a guest reading the URL
  // under a printed code sees a name they recognise rather than ours.
  const svg = await tableQrSvg(table.publicCode, 160, { tenantSlug });

  return (
    <div className="flex flex-col items-center rounded-xl border border-zinc-200 p-4">
      <div className="flex w-full items-start justify-between">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-900">{table.label}</p>
          {table.seats != null && (
            <p className="text-xs text-zinc-500">{table.seats} seats</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RegenerateCodeButton
            tenantSlug={tenantSlug}
            tableId={table.id}
            label={table.label}
          />
          <DeleteTableButton
            tenantSlug={tenantSlug}
            tableId={table.id}
            label={table.label}
          />
        </div>
      </div>

      {/* The QR is generated server-side as SVG, so it stays crisp when the
          owner prints it at any size. */}
      <div
        className="mt-3 w-full [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <p className="mt-2 font-mono text-[11px] tracking-wider text-zinc-500">
        {table.publicCode}
      </p>
      <p className="mt-1 w-full truncate text-center text-[10px] text-zinc-400">
        {tableStorefrontUrl(table.publicCode, { tenantSlug })}
      </p>
    </div>
  );
}
