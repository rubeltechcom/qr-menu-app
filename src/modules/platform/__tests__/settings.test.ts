import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rawPrisma } from "@/server/db/client";
import { decryptSecret, encryptSecret, isEncrypted, maskSecret } from "@/lib/secret-box";
import {
  getBooleanSetting,
  getNumberSetting,
  getSetting,
  loadSettings,
  renderSettings,
  saveSettings,
} from "../settings.service";
import { alertSettings } from "../alert-settings";

/**
 * Platform settings, against the real database.
 *
 * These hold live payment credentials, so the properties that matter
 * are: a secret never lands in the table in readable form, a blank
 * value clears rather than overrides, and an unknown key cannot be
 * written at all.
 */

const TEST_KEYS = [
  "platform.name",
  "stripe.secretKey",
  "bkash.sandbox",
  "uploads.maxImageMb",
  "alerts.soundEnabled",
  "alerts.soundUrl",
  "alerts.repeatSeconds",
  "alerts.desktopNotifications",
];

async function clear() {
  await rawPrisma.platformSetting.deleteMany({ where: { key: { in: TEST_KEYS } } });
  await loadSettings();
}

beforeEach(clear);
afterAll(clear);

describe("secret-box", () => {
  it("round-trips a value", () => {
    const secret = "sk_live_51abcdefghijklmnop";
    const sealed = encryptSecret(secret);

    expect(sealed).not.toContain(secret);
    expect(isEncrypted(sealed)).toBe(true);
    expect(decryptSecret(sealed)).toBe(secret);
  });

  it("produces different ciphertext each time", () => {
    // A reused IV under GCM is catastrophic, so the same input must
    // never encrypt to the same bytes twice.
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("returns null for a tampered value rather than garbage", () => {
    const sealed = encryptSecret("sk_live_real_key");
    // Flip a character in the ciphertext body.
    const tampered = `${sealed.slice(0, -3)}xyz`;
    expect(decryptSecret(tampered)).toBeNull();
  });

  it("passes through a value that was never encrypted", () => {
    expect(decryptSecret("plain-text")).toBe("plain-text");
  });

  it("masks a secret without revealing the middle", () => {
    const masked = maskSecret("sk_live_1234567890abcdef");
    expect(masked.startsWith("sk_l")).toBe(true);
    expect(masked.endsWith("cdef")).toBe(true);
    expect(masked).not.toContain("1234567890");
  });
});

describe("platform settings", () => {
  it("saves and reads a plain value", async () => {
    await saveSettings({ "platform.name": "Riverside Menus" }, "test@example.com");
    expect(getSetting("platform.name")).toBe("Riverside Menus");
  });

  it("stores a secret encrypted, and reads it back in the clear", async () => {
    const key = "sk_live_do_not_store_me_plainly";
    await saveSettings({ "stripe.secretKey": key }, "test@example.com");

    // What the application sees.
    expect(getSetting("stripe.secretKey")).toBe(key);

    // What a database dump would show.
    const row = await rawPrisma.platformSetting.findUnique({
      where: { key: "stripe.secretKey" },
    });
    expect(row?.isSecret).toBe(true);
    expect(row?.value).not.toContain(key);
    expect(isEncrypted(row?.value ?? "")).toBe(true);
  });

  it("masks secrets when rendering the form, never the real value", async () => {
    const key = "sk_live_abcdefghijklmnop";
    await saveSettings({ "stripe.secretKey": key }, "test@example.com");

    const stripe = renderSettings().find((group) => group.id === "stripe");
    const field = stripe?.settings.find((setting) => setting.key === "stripe.secretKey");

    expect(field?.isSet).toBe(true);
    expect(field?.displayValue).not.toBe(key);
    expect(field?.displayValue).toContain("•");
  });

  it("clears a setting when saved blank, rather than storing an empty value", async () => {
    await saveSettings({ "platform.name": "Temporary" }, "test@example.com");
    expect(getSetting("platform.name")).toBe("Temporary");

    await saveSettings({ "platform.name": "" }, "test@example.com");

    const row = await rawPrisma.platformSetting.findUnique({
      where: { key: "platform.name" },
    });
    expect(row).toBeNull();
    // Falls back to the built-in default rather than an empty string.
    expect(getSetting("platform.name")).toBe("QR Menu");
  });

  it("ignores a key that is not in the settings schema", async () => {
    await saveSettings(
      { "definitely.not.a.real.setting": "malicious" },
      "test@example.com",
    );

    const row = await rawPrisma.platformSetting.findUnique({
      where: { key: "definitely.not.a.real.setting" },
    });
    expect(row).toBeNull();
  });

  it("reads booleans, treating only explicit falsey words as false", async () => {
    await saveSettings({ "bkash.sandbox": "false" }, "test@example.com");
    expect(getBooleanSetting("bkash.sandbox", true)).toBe(false);

    await saveSettings({ "bkash.sandbox": "true" }, "test@example.com");
    expect(getBooleanSetting("bkash.sandbox", false)).toBe(true);
  });

  it("falls back for a number that is missing or nonsense", async () => {
    expect(getNumberSetting("uploads.maxImageMb", 8)).toBe(8);

    await saveSettings({ "uploads.maxImageMb": "25" }, "test@example.com");
    expect(getNumberSetting("uploads.maxImageMb", 8)).toBe(25);
  });

  it("records who last changed a setting", async () => {
    await saveSettings({ "platform.name": "Audited" }, "operator@example.com");
    const row = await rawPrisma.platformSetting.findUnique({
      where: { key: "platform.name" },
    });
    expect(row?.updatedBy).toBe("operator@example.com");
  });
});

/**
 * Order alerts, which the operator now controls from /admin/settings.
 *
 * The interesting case is the repeat interval: 0 is a meaningful value
 * there ("play once"), which is exactly the value getNumberSetting
 * treats as unset — so this reads the raw setting instead, and these
 * tests are what stop someone "simplifying" it back.
 */
describe("alert settings", () => {
  it("defaults to sound and notifications on, playing once", () => {
    const alerts = alertSettings();
    expect(alerts.soundEnabled).toBe(true);
    expect(alerts.desktopNotifications).toBe(true);
    expect(alerts.repeatSeconds).toBe(0);
    expect(alerts.soundUrl).toBe("/sounds/new-order.wav");
  });

  it("lets the operator silence the staff screens", async () => {
    await saveSettings({ "alerts.soundEnabled": "false" }, "test@example.com");
    expect(alertSettings().soundEnabled).toBe(false);
  });

  it("keeps an explicit 0 as play-once rather than falling back", async () => {
    await saveSettings({ "alerts.repeatSeconds": "0" }, "test@example.com");
    expect(alertSettings().repeatSeconds).toBe(0);
  });

  it("caps the repeat so a chime cannot be set to every second", async () => {
    await saveSettings({ "alerts.repeatSeconds": "99999" }, "test@example.com");
    expect(alertSettings().repeatSeconds).toBe(300);
  });

  it("ignores a nonsense repeat interval", async () => {
    await saveSettings({ "alerts.repeatSeconds": "soon" }, "test@example.com");
    expect(alertSettings().repeatSeconds).toBe(0);
  });

  it("falls back to the bundled chime when the URL is cleared", async () => {
    await saveSettings({ "alerts.soundUrl": "/sounds/custom.mp3" }, "test@example.com");
    expect(alertSettings().soundUrl).toBe("/sounds/custom.mp3");

    await saveSettings({ "alerts.soundUrl": "" }, "test@example.com");
    expect(alertSettings().soundUrl).toBe("/sounds/new-order.wav");
  });
});
