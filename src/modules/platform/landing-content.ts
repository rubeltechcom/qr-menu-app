import { getSetting } from "./settings.service";

/**
 * The words on the public landing page.
 *
 * Every field falls back to the copy the page shipped with, so an
 * install that never opens the admin panel looks exactly as it does
 * today. The operator overrides only what they want to say differently.
 *
 * Only text lives here. The feature grid stays in the page, because
 * each entry is bound to an icon component — a settings table can hold
 * a label but not a React import, and half-editable content is worse
 * than none.
 */

export interface LandingStep {
  title: string;
  body: string;
}

export interface LandingFaq {
  question: string;
  answer: string;
}

export interface LandingFeature {
  title: string;
  body: string;
}

export interface LandingCopy {
  heroEyebrow: string;
  heroHeadline: string;
  heroSubheading: string;
  heroPrimaryCta: string;
  heroReassurance: string;
  stepsHeading: string;
  stepsSubheading: string;
  steps: LandingStep[];
  featuresHeading: string;
  featuresSubheading: string;
  features: LandingFeature[];
  showcaseHeading: string;
  faqHeading: string;
  faqs: LandingFaq[];
  ctaHeading: string;
  ctaSubheading: string;
}

function text(key: string, fallback: string): string {
  return getSetting(key)?.trim() || fallback;
}

/**
 * Parses "Left | Right" lines.
 *
 * A line with no separator becomes a heading with no body rather than
 * being dropped — an operator halfway through typing should see their
 * work, not have it silently vanish.
 */
function parsePairs(raw: string | undefined): { left: string; right: string }[] {
  if (!raw?.trim()) return [];

  return raw
    .split("\n")
    .map((line) => {
      const [left, ...rest] = line.split("|");
      const trimmed = left?.trim();
      if (!trimmed) return null;
      return { left: trimmed, right: rest.join("|").trim() };
    })
    .filter((entry): entry is { left: string; right: string } => entry !== null)
    .slice(0, 20);
}

export function landingCopy(defaults: {
  steps: LandingStep[];
  features: LandingFeature[];
  faqs: LandingFaq[];
}): LandingCopy {
  const steps = parsePairs(getSetting("landing.steps"));
  const faqs = parsePairs(getSetting("landing.faqs"));
  const features = parsePairs(getSetting("landing.features"));

  return {
    heroEyebrow: text("landing.heroEyebrow", "Free plan — no card required"),
    heroHeadline: text("landing.heroHeadline", "Your menu, your QR code, your orders."),
    heroSubheading: text(
      "landing.heroSubheading",
      "Give every table a QR code. Guests browse your menu and order from their own phone — dine-in, takeaway or delivery — and the order lands straight on your kitchen screen. Update a price from your phone and every table sees it instantly.",
    ),
    heroPrimaryCta: text("landing.heroPrimaryCta", "Create your free menu"),
    heroReassurance: text(
      "landing.heroReassurance",
      "Set up in an evening · Unlimited orders · Cancel any time",
    ),
    stepsHeading: text("landing.stepsHeading", "Live in three steps"),
    stepsSubheading: text(
      "landing.stepsSubheading",
      "No hardware to buy, no installation, and nothing for your guests to download.",
    ),
    steps: steps.length
      ? steps.map((entry) => ({ title: entry.left, body: entry.right }))
      : defaults.steps,

    featuresHeading: text(
      "landing.featuresHeading",
      "Everything the front of house needs",
    ),
    featuresSubheading: text(
      "landing.featuresSubheading",
      "Built around a real service: a phone at the table, a screen in the kitchen, and nothing in between that can go wrong.",
    ),
    // Icons are bound to position in the page, so an operator can
    // retitle a feature without having to name an icon — but adding
    // more entries than there are icons would leave blanks, so the list
    // is capped at what the page can draw.
    features: features.length
      ? features
          .slice(0, defaults.features.length)
          .map((entry) => ({ title: entry.left, body: entry.right }))
      : defaults.features,

    showcaseHeading: text(
      "landing.showcaseHeading",
      "Menus already running on this platform",
    ),

    faqHeading: text("landing.faqHeading", "Questions, answered"),
    faqs: faqs.length
      ? faqs.map((entry) => ({ question: entry.left, answer: entry.right }))
      : defaults.faqs,

    ctaHeading: text("landing.ctaHeading", "Put a QR code on your tables tonight"),
    ctaSubheading: text(
      "landing.ctaSubheading",
      "Create your menu free. No card, no contract, no hardware.",
    ),
  };
}
