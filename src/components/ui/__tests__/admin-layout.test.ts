import { describe, expect, it } from "vitest";
import type { NavItem } from "../admin-layout";
import { isItemActive } from "../admin-layout";

/**
 * Which navigation link is highlighted.
 *
 * The bug this guards against was not the highlight itself but where
 * the path came from: the layout used to read an `x-pathname` request
 * header, and Next.js keeps a layout mounted across client-side
 * navigations, so the header was only ever read on a full page load.
 * The nav therefore showed the previous page's links until the browser
 * was refreshed. The path now comes from usePathname().
 *
 * These cover the matching rules, which are the part with real edge
 * cases: an overview link must not stay lit on every child page, and a
 * section link must stay lit on its children.
 */

const item = (href: string, prefix = false): NavItem => ({
  href,
  label: href,
  icon: null,
  prefix,
});

describe("isItemActive", () => {
  it("matches an exact link only on that page", () => {
    const overview = item("/dashboard/joes");
    expect(isItemActive(overview, "/dashboard/joes")).toBe(true);
    // Without this, Overview stays highlighted on every sub-page and
    // the nav never appears to move.
    expect(isItemActive(overview, "/dashboard/joes/menu")).toBe(false);
  });

  it("keeps a section lit on its child pages", () => {
    const menu = item("/dashboard/joes/menu", true);
    expect(isItemActive(menu, "/dashboard/joes/menu")).toBe(true);
    expect(isItemActive(menu, "/dashboard/joes/menu/categories")).toBe(true);
  });

  it("does not match a sibling that merely shares a prefix string", () => {
    // /admin/settings must not light up on /admin/settings-export, which
    // a bare startsWith() would.
    const settings = item("/admin/settings", true);
    expect(isItemActive(settings, "/admin/settings-export")).toBe(false);
    expect(isItemActive(settings, "/admin/settings/email")).toBe(true);
  });

  it("distinguishes the admin overview from its sections", () => {
    const overview = item("/admin");
    const tenants = item("/admin/tenants", true);

    expect(isItemActive(overview, "/admin")).toBe(true);
    expect(isItemActive(overview, "/admin/tenants")).toBe(false);
    expect(isItemActive(tenants, "/admin/tenants/new")).toBe(true);
  });
});
