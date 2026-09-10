/**
 * Demo data for local development: one restaurant, a small menu, and six
 * tables with printable QR codes.
 *
 * Run with `npm run db:seed:demo`. It is idempotent — re-running wipes the
 * previous demo tenant and rebuilds it, so it can be used to reset after
 * poking at the dashboard.
 *
 * Never run this against production: it deletes by a fixed email.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { randomInt } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createId } from "@paralleldrive/cuid2";
import { hash } from "@node-rs/argon2";

const EMAIL = "demo@qrmenu.test";
const PASSWORD = "demo1234";
const SLUG = "demo-diner";
const FIXED_TABLE_CODE = "DEMO2345";

const prisma = new PrismaClient();

/** Run a callback with the tenant GUC set, the way forTenant() does. */
const scoped = (tenantId, fn) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`select set_config('app.tenant_id', $1, true)`, tenantId);
    return fn(tx);
  });

async function removeExistingDemo() {
  // Collect the demo tenant from both directions: via the owner's
  // memberships, and via the slug directly. A previous run that failed
  // partway can leave a tenant with no membership pointing at it, and
  // looking it up only through the user would miss it — then the rebuild
  // fails on the unique slug.
  const tenantIds = new Set();

  const prior = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (prior) {
    const memberships = await prisma.membership.findMany({ where: { userId: prior.id } });
    for (const membership of memberships) tenantIds.add(membership.tenantId);
  }

  // A tenant row is invisible to an unscoped read (FORCE RLS applies even
  // to the table owner), so findUnique({ slug }) returns null even when the
  // row exists — while the unique index still sees it and rejects the
  // rebuild. FORCE also ignores `set row_security = off`, which is exactly
  // what it is for. Lifting FORCE for the duration of this one lookup is
  // the honest way to find an orphan left behind by a failed run, and it
  // is put back immediately. Seed-only; nothing in the app does this.
  let orphans = [];
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "tenants" NO FORCE ROW LEVEL SECURITY`);
    orphans = await prisma.$queryRawUnsafe(`select id from tenants where slug = $1`, SLUG);
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY`);
  }
  for (const row of orphans) tenantIds.add(row.id);

  // Same problem one level down: the fixed demo table code is globally
  // unique, so a table row stranded under some other tenant blocks the
  // rebuild while staying invisible. Find whoever owns it and clean that
  // tenant out too.
  let codeOwners = [];
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "tables" NO FORCE ROW LEVEL SECURITY`);
    codeOwners = await prisma.$queryRawUnsafe(
      `select "tenantId" from tables where "publicCode" = $1`,
      FIXED_TABLE_CODE,
    );
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "tables" FORCE ROW LEVEL SECURITY`);
  }
  for (const row of codeOwners) tenantIds.add(row.tenantId);

  for (const tenantId of tenantIds) {
    await scoped(tenantId, async (tx) => {
      // Children first — RLS is FORCE-enabled, so these run scoped too.
      await tx.table.deleteMany({});
      await tx.zone.deleteMany({});
      await tx.modifier.deleteMany({});
      await tx.modifierGroup.deleteMany({});
      await tx.menuItem.deleteMany({});
      await tx.category.deleteMany({});
      await tx.menu.deleteMany({});
      await tx.location.deleteMany({});
      await tx.membership.deleteMany({});
      await tx.tenant.delete({ where: { id: tenantId } });
    });
  }

  if (prior) await prisma.user.delete({ where: { id: prior.id } });
}

// Same alphabet as src/modules/tables/public-code.ts.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const publicCode = () =>
  Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

async function main() {
  await removeExistingDemo();

  const user = await prisma.user.create({
    data: { email: EMAIL, name: "Demo Owner", hashedPassword: await hash(PASSWORD) },
  });

  // Tenant creation needs the GUC set to the new id BEFORE the insert —
  // see the note in prisma/migrations/20260909183200_tenant_creation_policy.
  const tenantId = createId();
  await scoped(tenantId, (tx) =>
    tx.tenant.create({
      data: {
        id: tenantId,
        name: "Demo Diner",
        slug: SLUG,
        defaultLocale: "en",
        currency: "USD",
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
    }),
  );

  const location = await scoped(tenantId, (tx) =>
    tx.location.create({ data: { tenantId, name: "Demo Diner — Riverside" } }),
  );

  const menu = await scoped(tenantId, (tx) =>
    tx.menu.create({ data: { tenantId, locationId: location.id, name: "Main Menu" } }),
  );

  const categories = {};
  for (const [index, name] of ["Ramen", "Sides", "Drinks"].entries()) {
    categories[name] = await scoped(tenantId, (tx) =>
      tx.category.create({ data: { tenantId, menuId: menu.id, name, sortOrder: index } }),
    );
  }

  const dishes = [
    ["Ramen", "Shirodashi Ramen", "Clear chicken broth, chashu, soft egg", 895],
    ["Ramen", "Chilli Prawn Ramen", "Prawns, kimchi, chilli oil", 1195],
    ["Ramen", "Tantanmen Beef Brisket", "Sesame broth, slow-cooked brisket", 1095],
    ["Sides", "Edamame", "Sea salt", 450],
    ["Sides", "Gyoza (5 pcs)", "Chicken, ponzu dip", 650],
    ["Drinks", "Green Tea", null, 250],
    ["Drinks", "Yuzu Lemonade", null, 395],
  ];
  for (const [category, name, description, basePriceCents] of dishes) {
    await scoped(tenantId, (tx) =>
      tx.menuItem.create({
        data: { tenantId, categoryId: categories[category].id, name, description, basePriceCents },
      }),
    );
  }

  const tables = [];
  for (const label of ["1", "2", "3", "4", "5"]) {
    tables.push(
      await scoped(tenantId, (tx) =>
        tx.table.create({
          data: { tenantId, locationId: location.id, label, publicCode: publicCode(), seats: 4 },
        }),
      ),
    );
  }
  // One fixed code so the QR landing page can be opened by hand while developing.
  tables.push(
    await scoped(tenantId, (tx) =>
      tx.table.create({
        data: {
          tenantId,
          locationId: location.id,
          label: "14",
          publicCode: FIXED_TABLE_CODE,
          seats: 6,
        },
      }),
    ),
  );

  console.log("\n=== Demo data ready ===");
  console.log(`  email     ${EMAIL}`);
  console.log(`  password  ${PASSWORD}`);
  console.log("");
  console.log("  Dashboard  http://localhost:3000/login");
  console.log(`  Tables     http://localhost:3000/dashboard/${SLUG}/tables`);
  console.log(`  Menu       http://localhost:3000/dashboard/${SLUG}/menu`);
  console.log(`  Scan       http://localhost:3000/t/${FIXED_TABLE_CODE}   (table 14)`);
  console.log("");
  console.log(`  ${tables.map((t) => `${t.label}=${t.publicCode}`).join("  ")}`);
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
