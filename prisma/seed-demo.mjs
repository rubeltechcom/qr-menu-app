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
const STAFF_EMAIL = "kitchen@qrmenu.test";
const STAFF_PIN = "1234";
const SUPERADMIN_EMAIL = "admin@qrmenu.test";
const SUPERADMIN_PASSWORD = "admin1234";
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
      await tx.orderEvent.deleteMany({});
      await tx.orderItem.deleteMany({});
      await tx.order.deleteMany({});
      await tx.orderCounter.deleteMany({});
      await tx.table.deleteMany({});
      await tx.zone.deleteMany({});
      await tx.modifier.deleteMany({});
      await tx.modifierGroup.deleteMany({});
      await tx.menuItem.deleteMany({});
      await tx.category.deleteMany({});
      await tx.menu.deleteMany({});
      await tx.location.deleteMany({});
      // staffPin has a required membership, so it goes first.
      await tx.staffPin.deleteMany({});
      await tx.membership.deleteMany({});
      await tx.tenant.delete({ where: { id: tenantId } });
    });
  }

  if (prior) await prisma.user.delete({ where: { id: prior.id } });

  const priorStaff = await prisma.user.findUnique({ where: { email: STAFF_EMAIL } });
  if (priorStaff) await prisma.user.delete({ where: { id: priorStaff.id } });
}

// Same alphabet as src/modules/tables/public-code.ts.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const publicCode = () =>
  Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

async function main() {
  await removeExistingDemo();

  // The platform operator. Belongs to no restaurant, so it is upserted
  // rather than swept up in the demo wipe above — re-seeding must not
  // lock you out of the admin panel.
  await prisma.user.upsert({
    where: { email: SUPERADMIN_EMAIL },
    update: { globalRole: "SUPERADMIN", hashedPassword: await hash(SUPERADMIN_PASSWORD) },
    create: {
      email: SUPERADMIN_EMAIL,
      name: "Platform Admin",
      globalRole: "SUPERADMIN",
      hashedPassword: await hash(SUPERADMIN_PASSWORD),
    },
  });

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
        currency: "GBP",
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
  for (const [index, name] of ["Curry", "Ramen", "Teppanyaki", "Donburi", "Sides", "Drinks"].entries()) {
    categories[name] = await scoped(tenantId, (tx) =>
      tx.category.create({ data: { tenantId, menuId: menu.id, name, sortOrder: index } }),
    );
  }

  // The storefront has no sub-category table (Category is flat), so the
  // Chicken / Prawn / Veg pills under a category are driven by dietaryTags
  // — the same field the item filter already reads.
  //
  // `isPopular` promotes a dish into the "Popular" tab, which is a view
  // over every category rather than a category of its own.
  const dishes = [
    // [category, name, description, priceCents, tags, isPopular]
    ["Curry", "Prawn Raisukaree", "Coconut + lime curry sauce, mangetout, peppers, red + spring onion, chilli, coriander, white rice", 1200, ["Prawn"], true],
    ["Curry", "Chicken Raisukaree", "Grilled chicken in a coconut + lime curry sauce with white rice", 1095, ["Chicken"], false],
    ["Curry", "Firecracker Prawn", "Prawns in a hot chilli sauce with peppers, mangetout and white rice", 1100, ["Prawn"], true],
    ["Curry", "Firecracker Chicken", "Chicken in a hot chilli sauce with peppers, mangetout and white rice", 995, ["Chicken"], false],
    ["Curry", "Hot Chicken Katsu Curry", "Panko-breaded chicken breast, hot curry sauce, sticky white rice, dressed leaves", 975, ["Chicken"], true],
    ["Curry", "Tofu Firecracker", "Grilled tofu in a hot chilli sauce with peppers, mangetout and white rice", 975, ["Veg"], true],
    ["Curry", "Yasai Katsu Curry", "Sweet potato, aubergine and butternut squash in panko, curry sauce, white rice", 950, ["Veg"], false],

    ["Ramen", "Chilli Prawn + Kimchee Ramen", "Prawns, kimchee, chicken broth, ramen noodles, spring onion, coriander", 895, ["Prawn"], true],
    ["Ramen", "Chilli Sirloin Steak Ramen", "Seared sirloin, chicken broth, ramen noodles, red onion, chilli, coriander", 895, ["Beef"], true],
    ["Ramen", "Shirodashi Ramen", "Clear chicken broth, chashu pork, soft-boiled egg, menma, spring onion", 1050, ["Chicken"], false],
    ["Ramen", "Tantanmen Beef Brisket Ramen", "Sesame broth, slow-cooked beef brisket, pak choi, chilli oil", 1295, ["Beef"], false],
    ["Ramen", "Kare Burosu Ramen", "Coconut + curry broth, tofu, mixed vegetables, ramen noodles", 950, ["Veg"], false],

    ["Teppanyaki", "Yaki Soba Chicken", "Soba noodles, chicken, egg, prawns, chikuwa, peppers, beansprouts", 1150, ["Chicken"], false],
    ["Teppanyaki", "Yaki Udon Prawn", "Udon noodles, prawns, egg, chikuwa, mushrooms, ginger, pickled onion", 1250, ["Prawn"], false],
    ["Teppanyaki", "Yasai Yaki Soba", "Soba noodles, tofu, mixed vegetables, beansprouts, sesame", 995, ["Veg"], false],
    ["Teppanyaki", "Steak Bulgogi", "Sirloin steak, bulgogi sauce, teppan-fried noodles, kimchee", 1795, ["Beef"], true],

    ["Donburi", "Teriyaki Beef Donburi", "Grilled beef, teriyaki sauce, sticky white rice, kimchee, pickled radish, egg", 1095, ["Beef"], true],
    ["Donburi", "Teriyaki Chicken Donburi", "Grilled chicken, teriyaki sauce, sticky white rice, kimchee, egg", 995, ["Chicken"], false],
    ["Donburi", "Grilled Duck Donburi", "Grilled duck breast, sticky white rice, amai sauce, mixed leaves", 1650, ["Duck"], true],
    ["Donburi", "Yasai Donburi", "Grilled seasonal vegetables, tofu, sticky white rice, amai sauce", 950, ["Veg"], false],

    ["Sides", "Edamame", "Steamed soy beans, sea salt", 450, ["Veg"], false],
    ["Sides", "Chilli Squid", "Crispy fried squid, shichimi, spicy sauce", 875, ["Prawn"], false],
    ["Sides", "Duck Gyoza (5 pcs)", "Pan-fried duck dumplings, cherry hoisin sauce", 795, ["Duck"], false],
    ["Sides", "Chicken Gyoza (5 pcs)", "Pan-fried chicken dumplings, ponzu dip", 650, ["Chicken"], false],

    ["Drinks", "Green Tea", "Free-pour Japanese green tea", 250, [], false],
    ["Drinks", "Yuzu Lemonade", "Yuzu, lemon, soda", 395, [], false],
    ["Drinks", "Coconut + Kale Shake", "Coconut milk, kale, banana, apple juice", 495, ["Veg"], false],
  ];
  // There is no image upload yet, so the demo borrows stock photography
  // to show the grid as it is meant to look. Real tenants will carry
  // their own uploads; nothing outside this seed depends on these URLs.
  const PHOTOS = {
    Curry: "photo-1455619452474-d2be8b1e70cd",
    Ramen: "photo-1569718212165-3a8278d5f624",
    Teppanyaki: "photo-1552611052-33e04de081de",
    Donburi: "photo-1546069901-ba9599a7e63c",
    Sides: "photo-1541014741259-de529411b96a",
    Drinks: "photo-1544145945-f90425340c7e",
  };
  const photoFor = (category) =>
    `https://images.unsplash.com/${PHOTOS[category]}?w=600&h=600&fit=crop&q=80`;

  for (const [category, name, description, basePriceCents, dietaryTags, isPopular] of dishes) {
    await scoped(tenantId, (tx) =>
      tx.menuItem.create({
        data: {
          tenantId,
          categoryId: categories[category].id,
          name,
          description,
          basePriceCents,
          images: [photoFor(category)],
          dietaryTags: isPopular ? [...dietaryTags, "Popular"] : dietaryTags,
        },
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

  // A kitchen tablet logs in with a PIN, not an email — so the demo
  // needs a staff member to exercise /staff/kitchen and /staff/floor.
  const staffUser = await prisma.user.create({
    data: { email: STAFF_EMAIL, name: "Demo Kitchen" },
  });
  const staffMembership = await scoped(tenantId, (tx) =>
    tx.membership.create({ data: { tenantId, userId: staffUser.id, role: "KITCHEN" } }),
  );
  const hashedPin = await hash(STAFF_PIN);
  await scoped(tenantId, (tx) =>
    tx.staffPin.create({
      data: { membershipId: staffMembership.id, hashedPin },
    }),
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
  console.log(`  Staff PIN  http://localhost:3000/staff/login`);
  console.log(`             restaurant "${SLUG}", PIN ${STAFF_PIN}`);
  console.log("");
  console.log(`  Platform admin  http://localhost:3000/admin`);
  console.log(`                  ${SUPERADMIN_EMAIL} / ${SUPERADMIN_PASSWORD}`);
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
