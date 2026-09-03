/**
 * Regression tests for plan gating.
 *
 * The bug these cover: plan limits were keyed on 'free'/'basic'/'pro'/
 * 'enterprise' while the product sells 'builder'/'launch'/'growth', and the
 * gate read a `subscriptions` table nothing ever wrote to.
 */
const assert = require('node:assert/strict');
const {
  PRICING_PLANS,
  PLAN_LIMITS,
  FREE_PLAN,
  MIN_PAID_PLAN,
  normalizePlan,
  getPlanLimits,
  planMeets,
  withinLimit,
} = require('../config/plans');

// Every plan the checkout sells must have limits defined for it.
for (const plan of Object.keys(PRICING_PLANS)) {
  assert.ok(PLAN_LIMITS[plan], `${plan} is sold but has no limits`);
}
console.log('✓ every sold plan has limits');

// The dead plan names must not resolve to anything but free.
for (const dead of ['basic', 'pro', 'enterprise']) {
  assert.equal(normalizePlan(dead), FREE_PLAN);
}
assert.equal(normalizePlan(null), FREE_PLAN);
assert.equal(normalizePlan(undefined), FREE_PLAN);
assert.equal(normalizePlan('nonsense'), FREE_PLAN);
console.log('✓ unknown and legacy plan names fall back to free');

// A paying plan must never get less than free — the regression that made
// every paid customer look like a free user.
for (const plan of Object.keys(PRICING_PLANS)) {
  const paid = getPlanLimits(plan);
  const free = getPlanLimits(FREE_PLAN);
  assert.ok(
    paid.influencers === null || paid.influencers > free.influencers,
    `${plan} allows no more influencers than free`
  );
  assert.ok(
    paid.contentPerDay === null || paid.contentPerDay > free.contentPerDay,
    `${plan} allows no more content than free`
  );
}
console.log('✓ every paid plan beats the free tier');

// The entry paid tier must actually gate: a user with no plan must fail it,
// and every sold plan must pass it. Routes previously gated on 'free', which
// let everyone through once the table lookup was removed.
assert.ok(!planMeets(null, MIN_PAID_PLAN), 'no plan must not satisfy the paid gate');
assert.ok(!planMeets(FREE_PLAN, MIN_PAID_PLAN), 'free must not satisfy the paid gate');
for (const plan of Object.keys(PRICING_PLANS)) {
  assert.ok(planMeets(plan, MIN_PAID_PLAN), `${plan} must satisfy the paid gate`);
}
console.log('✓ the entry paid tier gates free users out and paid users in');

// Ordering.
assert.ok(planMeets('growth', 'builder'));
assert.ok(planMeets('launch', 'launch'));
assert.ok(!planMeets('builder', 'launch'));
assert.ok(!planMeets(null, 'builder'));
assert.ok(planMeets('builder', FREE_PLAN));
console.log('✓ plan ordering gates correctly');

// null means unlimited, not zero.
assert.ok(withinLimit(999999, null), 'null limit must be unlimited');
assert.ok(withinLimit(0, 1));
assert.ok(!withinLimit(1, 1), 'limit is exclusive — at the cap means blocked');
assert.ok(!withinLimit(0, 0), 'a zero limit blocks everything');
console.log('✓ null limits are unlimited, numeric limits are exclusive');

// Growth is the unlimited plan, end to end.
const growth = getPlanLimits('growth');
assert.equal(growth.influencers, null);
assert.equal(growth.contentPerDay, null);
assert.equal(PRICING_PLANS.growth.monthly.credits, null);
console.log('✓ growth is unlimited across pricing and limits');

// Prices must match what the DEPLOYED frontend advertises. The deployed tree
// is `frontend/`, not the root `src/` — every deploy script builds and ships
// frontend/, while src/ is a stale fork quoting $12/$25 that reaches nobody.
// Pricing against src/ once set checkout $3-4/mo BELOW the advertised price;
// these assertions pin the deployed numbers so that cannot recur silently.
// Yearly `price` is the full annual charge, not a monthly rate.
//
// Source: frontend/src/pages/{LandingPage,GetCreditsPage}.jsx
const ADVERTISED = {
  builder: { monthly: 1500, yearly: 14400 },
  launch: { monthly: 2900, yearly: 27600 },
  growth: { monthly: 7900, yearly: 78000 },
};
for (const [plan, prices] of Object.entries(ADVERTISED)) {
  assert.equal(
    PRICING_PLANS[plan].monthly.price,
    prices.monthly,
    `${plan} monthly must charge the advertised price`
  );
  assert.equal(
    PRICING_PLANS[plan].yearly.price,
    prices.yearly,
    `${plan} yearly must charge the advertised price`
  );
}
assert.deepEqual(
  Object.keys(PRICING_PLANS).sort(),
  Object.keys(ADVERTISED).sort(),
  'a plan was added or removed without pinning its advertised price'
);
// Paying for a year must never cost more than twelve monthly charges.
for (const plan of Object.keys(PRICING_PLANS)) {
  assert.ok(
    PRICING_PLANS[plan].yearly.price < PRICING_PLANS[plan].monthly.price * 12,
    `${plan} yearly must be cheaper than paying monthly`
  );
}
console.log('\u2713 checkout prices match the advertised prices');

// The two former copies of PRICING_PLANS are now one: both modules that used
// to carry their own must still load against the shared config.
// These modules build their Stripe/Supabase clients at require time.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'dummy-anon-key';
assert.ok(require('../routes/payments.js'), 'payments route still loads');
assert.ok(require('../stripeWebhook.js'), 'stripe webhook still loads');
assert.ok(require('../middleware/auth.js').requireSubscription, 'auth middleware still loads');
console.log('✓ payments, webhook and auth load against the shared plan config');

console.log('\nAll plan tests passed.');
