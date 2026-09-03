/**
 * Single source of truth for subscription plans.
 *
 * The Stripe checkout metadata, the webhook, and every gate that reads a plan
 * name all resolve through this file. Previously payments.js and
 * stripeWebhook.js each carried their own copy of PRICING_PLANS, while the
 * authorization and limit checks keyed off a completely different set of names
 * ('free', 'basic', 'pro', 'enterprise') that the product never sold.
 */

/**
 * Prices are in cents. `price` on a yearly entry is the full annual charge,
 * not a monthly rate.
 *
 * These MUST match what the DEPLOYED frontend advertises — they are what
 * Stripe actually charges, since payments.js passes `price` straight to
 * `unit_amount`. The deployed frontend is `frontend/`, not the root `src/`:
 * all three deploy scripts build and `vercel --prod` from frontend/, and it
 * is the tree holding vercel.json. The root `src/` tree is a stale fork that
 * still quotes $12/$25 and ships nowhere; do not price against it.
 *
 * Source of truth: frontend/src/pages/LandingPage.jsx and
 * frontend/src/pages/GetCreditsPage.jsx. plans.test.js pins these numbers.
 */
const PRICING_PLANS = {
  builder: {
    monthly: { price: 1500, credits: 500, influencerTrainings: 1 },
    yearly: { price: 14400, credits: 500, influencerTrainings: 1 },
  },
  launch: {
    monthly: { price: 2900, credits: 2000, influencerTrainings: 2 },
    yearly: { price: 27600, credits: 2000, influencerTrainings: 2 },
  },
  growth: {
    // null means unlimited, here and everywhere downstream.
    monthly: { price: 7900, credits: null, influencerTrainings: null },
    yearly: { price: 78000, credits: null, influencerTrainings: null },
  },
};

/** Ranking used to compare a user's plan against a required minimum. */
const PLAN_LEVELS = { free: 0, builder: 1, launch: 2, growth: 3 };

/**
 * What each plan allows. `null` means unlimited.
 *
 * `influencers` is the plan's influencerTrainings allowance. `contentPerDay`
 * and `contentPerMonth` use the plan's credit allowance as the ceiling —
 * credits are the unit the product actually meters, so text generation is
 * capped by the same number rather than by a separate invented ladder.
 *
 * Users with no paid plan sit on `free`, which allows nothing: every creation
 * route is wrapped in requireSubscription, and the pricing page has no free
 * tier. Raise these numbers here if a free allowance is ever introduced.
 */
const PLAN_LIMITS = {
  free: { influencers: 0, contentPerDay: 0, contentPerMonth: 0 },
  builder: { influencers: 1, contentPerDay: 500, contentPerMonth: 500 },
  launch: { influencers: 2, contentPerDay: 2000, contentPerMonth: 2000 },
  growth: { influencers: null, contentPerDay: null, contentPerMonth: null },
};

const FREE_PLAN = 'free';

/**
 * Lowest tier that counts as "subscribed". Routes that require any paid plan
 * gate on this rather than naming a tier, so introducing a new entry plan is a
 * one-line change here.
 */
const MIN_PAID_PLAN = 'builder';

/** Normalize whatever is stored on a user row into a known plan name. */
function normalizePlan(plan) {
  return plan && Object.prototype.hasOwnProperty.call(PLAN_LIMITS, plan) ? plan : FREE_PLAN;
}

function getPlanLimits(plan) {
  return PLAN_LIMITS[normalizePlan(plan)];
}

/** True when `plan` is at least as high as `requiredPlan`. */
function planMeets(plan, requiredPlan) {
  return (PLAN_LEVELS[normalizePlan(plan)] ?? 0) >= (PLAN_LEVELS[normalizePlan(requiredPlan)] ?? 0);
}

/** True when the limit is unlimited (null) or the count is still under it. */
function withinLimit(count, limit) {
  return limit === null || count < limit;
}

module.exports = {
  PRICING_PLANS,
  PLAN_LEVELS,
  PLAN_LIMITS,
  FREE_PLAN,
  MIN_PAID_PLAN,
  normalizePlan,
  getPlanLimits,
  planMeets,
  withinLimit,
};
