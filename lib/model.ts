// Token Launch Radar, model radar-2: comparables priced off the snapshot itself.
//
// The board ranks pre-token protocols by an implied launch value that is fitted,
// not asserted. The fit set is every protocol in the sealed snapshot that already
// trades and is not a centralised exchange, a bridge, or a liquid-staking product:
// 94 tokens. On those 94 the model fits a power law of market cap on TVL,
//     log10(mcap) = intercept + slope * log10(tvl),
// then takes a per-category multiplier from the median residual of the traded
// tokens in that category (shrunk toward 1.00 when the category has few traded
// tokens, and 1.00 when it has fewer than four). Growth and maturity adjust the
// fitted value, they never replace it:
//
//     base       = 10 ^ (intercept + slope * log10(tvl_usd)) * category_multiplier
//     growth     = clamp(change_7d, -60, 120) per cent
//     growthMult = 1 + 0.25 * growth / 100
//     maturity   = 0.70 + 0.30 * min(age_days, 1095) / 1095   (age unknown: 365)
//     implied    = max(1, round(base * growthMult * maturity))
//
// Why a power law and not a flat multiple: in this snapshot the traded tokens'
// market-cap-to-TVL ratio falls hard with size (median 0.57 at $5-20M of TVL,
// 0.17 at $50-200M, 0.03 above $1B). A flat multiple would price a $2.7B
// protocol at ten times what the biggest traded comparables actually trade at.
// The fitted slope is 0.40, so implied value grows with TVL but slower than
// linearly, exactly as the traded market does. The fit is weak (R-squared 0.10,
// leave-one-out median absolute error 85%), and the dashboard says so in plain
// words: these are order-of-magnitude comparables prices, not predictions that
// a token will launch or what it will open at.
//
// No protocol name is ever special-cased. The same functions score every row,
// and the dashboard recomputes a row from the same figures, so the page, the
// board and the code agree.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted power law and how well it fits the traded tokens it was fitted on. */
export interface PowerLawFit {
  n: number;
  intercept: number;
  slope: number;
  r_squared: number;
  median_abs_pct_error: number;
  loo_median_abs_pct_error: number;
  excluded_categories: string[];
}

/** One category's calibration: how its traded tokens sit against the fitted curve. */
export interface CategoryCalibration {
  category: string;
  traded_n: number;
  median_mcap_tvl: number;
  multiplier: number;
}

/** One TVL band's traded-token multiple, the size effect in one table. */
export interface TvlBand {
  label: string;
  n: number;
  median_mcap_tvl: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One traded comparable shown beside a ranked row. */
export interface Comparable {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_power_law_usd: number;
    category_multiplier: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  comparables: Comparable[];
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan and comparables. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  base_power_law_usd: number;
  category_multiplier: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  comparables: Comparable[];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: PowerLawFit;
  categories: CategoryCalibration[];
  bands: TvlBand[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  research: string[];
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 158;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Categories kept out of the fit: exchanges and wrapped/staked/bridged products. */
export const FIT_EXCLUDED_CATEGORIES = ['Bridge', 'Canonical Bridge', 'CEX', 'Liquid Restaking', 'Liquid Staking'];

/** The growth weight, the growth clamp and the maturity shape of the model. */
export const MODEL = {
  growth_weight: 0.25,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length;
  if (m === 0) return 0;
  return m % 2 === 1 ? s[(m - 1) / 2]! : (s[m / 2 - 1]! + s[m / 2]!) / 2;
};

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol's token trades with a usable market cap and TVL for the fit. */
export function isFitToken(p: SnapshotProtocol): boolean {
  return (
    p.mcap_usd !== null &&
    p.mcap_usd > 0 &&
    p.tvl_usd > 0 &&
    !FIT_EXCLUDED_CATEGORIES.includes(p.category ?? '')
  );
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Ordinary least squares of log10(mcap) on log10(tvl) over the given traded tokens. */
function ols(tokens: SnapshotProtocol[]): { intercept: number; slope: number; rSquared: number; medianAbsPctError: number } {
  const xs = tokens.map((p) => Math.log10(p.tvl_usd));
  const ys = tokens.map((p) => Math.log10(p.mcap_usd!));
  const n = tokens.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sst += (ys[i]! - my) * (ys[i]! - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  const errs: number[] = [];
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i]!;
    sse += (ys[i]! - pred) * (ys[i]! - pred);
    errs.push(Math.abs(10 ** (ys[i]! - pred) - 1));
  }
  return { intercept, slope, rSquared: sst === 0 ? 0 : 1 - sse / sst, medianAbsPctError: median(errs) };
}

/** The power law fitted to the snapshot's own traded tokens, with a leave-one-out check. */
export function fitPowerLaw(snapshot: Snapshot): PowerLawFit {
  const tokens = snapshot.protocols.filter(isFitToken);
  const main = ols(tokens);
  // Leave-one-out: refit without each token in turn and price the held-out one.
  const looErrs: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const rest = tokens.filter((_, j) => j !== i);
    const f = ols(rest);
    const held = tokens[i]!;
    const pred = 10 ** (f.intercept + f.slope * Math.log10(held.tvl_usd));
    looErrs.push(Math.abs(pred / held.mcap_usd! - 1));
  }
  return {
    n: tokens.length,
    intercept: round4(main.intercept),
    slope: round4(main.slope),
    r_squared: round4(main.rSquared),
    median_abs_pct_error: round4(main.medianAbsPctError),
    loo_median_abs_pct_error: round4(median(looErrs)),
    excluded_categories: [...FIT_EXCLUDED_CATEGORIES].sort(),
  };
}

/** Per-category multipliers from the median residual against the fitted curve. */
export function categoryMultipliers(snapshot: Snapshot, fit: PowerLawFit): Map<string, number> {
  const byCat = new Map<string, number[]>();
  for (const p of snapshot.protocols.filter(isFitToken)) {
    const resid = Math.log10(p.mcap_usd!) - (fit.intercept + fit.slope * Math.log10(p.tvl_usd));
    const key = p.category ?? 'Uncategorised';
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(resid);
  }
  const out = new Map<string, number>();
  for (const [cat, resids] of byCat) {
    // Four or more traded tokens: shrink the median residual toward zero by
    // n / (n + 4), so a thin category cannot swing the board on one token.
    if (resids.length >= 4) out.set(cat, round4(10 ** (median(resids) * (resids.length / (resids.length + 4)))));
    else out.set(cat, 1);
  }
  return out;
}

/** The calibration table the dashboard prints: one row per fitted category. */
export function categoryCalibration(snapshot: Snapshot, fit: PowerLawFit, multipliers: Map<string, number>): CategoryCalibration[] {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of snapshot.protocols.filter(isFitToken)) {
    const key = p.category ?? 'Uncategorised';
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(p);
  }
  return [...byCat.entries()]
    .map(([category, ps]) => ({
      category,
      traded_n: ps.length,
      median_mcap_tvl: round4(median(ps.map((p) => p.mcap_usd! / p.tvl_usd))),
      multiplier: multipliers.get(category) ?? 1,
    }))
    .sort((a, b) => b.traded_n - a.traded_n || (a.category < b.category ? -1 : 1));
}

/** The size effect in one table: traded multiples by TVL band. */
export function tvlBands(snapshot: Snapshot): TvlBand[] {
  const bands: Array<{ label: string; lo: number; hi: number }> = [
    { label: '$5-20M', lo: 5_000_000, hi: 20_000_000 },
    { label: '$20-50M', lo: 20_000_000, hi: 50_000_000 },
    { label: '$50-200M', lo: 50_000_000, hi: 200_000_000 },
    { label: '$200M-1B', lo: 200_000_000, hi: 1_000_000_000 },
    { label: 'above $1B', lo: 1_000_000_000, hi: Number.POSITIVE_INFINITY },
  ];
  const traded = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  return bands.map((b) => {
    const inBand = traded.filter((p) => p.tvl_usd >= b.lo && p.tvl_usd < b.hi);
    return { label: b.label, n: inBand.length, median_mcap_tvl: inBand.length > 0 ? round4(median(inBand.map((p) => p.mcap_usd! / p.tvl_usd))) : 0 };
  });
}

/** The three multipliers and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: PowerLawFit,
  multipliers: Map<string, number>,
): { implied: number; base: number; catMult: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const catMult = multipliers.get(protocol.category ?? 'Uncategorised') ?? 1;
  const base = 10 ** (fit.intercept + fit.slope * Math.log10(protocol.tvl_usd)) * catMult;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * MODEL.growth_weight;
  const ageForModel = age ?? MODEL.unknown_age_days;
  const maturityMult =
    MODEL.maturity_floor + (Math.min(Math.max(ageForModel, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, base: Math.round(base), catMult, growthPct, growthMult, maturityMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The three closest traded comparables in the protocol's own category, by size. */
export function comparablesFor(p: SnapshotProtocol, fitTokens: SnapshotProtocol[]): Comparable[] {
  const logTvl = Math.log10(p.tvl_usd);
  const sameCat = fitTokens.filter((q) => (q.category ?? 'Uncategorised') === (p.category ?? 'Uncategorised'));
  const pool = sameCat.length >= 3 ? sameCat : fitTokens;
  return [...pool]
    .sort((a, b) => Math.abs(Math.log10(a.tvl_usd) - logTvl) - Math.abs(Math.log10(b.tvl_usd) - logTvl))
    .slice(0, 3)
    .map((q) => ({ slug: q.slug, name: q.name, tvl_usd: q.tvl_usd, mcap_usd: q.mcap_usd!, mcap_tvl: round4(q.mcap_usd! / q.tvl_usd) }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield aggregator') || c.includes('curator') || c.includes('allocator') || c.includes('risk curators'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('yield') || c.includes('liquidity manager')) return `Deposit $${capital} into ${name}'s main yield position on ${chain} and keep it open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa') || c.includes('token locker')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('launchpad')) return `Commit $${capital} to a ${name} launch on ${chain} and hold the allocation.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} and keep the account active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, matched to the mechanism so it counts as real use. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'a deposit, a borrow, a repayment or a vote';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'a deposit, a swap, a rebalance or a vote';
  if (c.includes('bridge')) return 'a bridge, a swap or a vote';
  if (c.includes('staking') || c.includes('restak')) return 'a stake, a restake or a vote';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'a trade, a hedge or a vote';
  if (c.includes('prediction')) return 'a market position or a vote';
  if (c.includes('rwa')) return 'a mint, a redemption or a vote';
  return 'a deposit, a swap or a vote';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as ${weekly}.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: round4(p.mcap_usd! / p.tvl_usd),
    }));
}

/** The research note the dashboard prints: method, evidence, limits, in plain words. */
export function researchNote(fit: PowerLawFit, bands: TvlBand[]): string[] {
  const big = bands[bands.length - 1]!;
  const small = bands[0]!;
  return [
    `Method. The board prices 198 pre-token protocols from the sealed DefiLlama snapshot of ${fit.n > 0 ? '2026-11-14' : ''} (758 protocols at or above $5M of TVL). The fit set is the ${fit.n} protocols whose token already trades, excluding exchanges, bridges and liquid-staking products, because those are not launches. On them the model fits log10(market cap) = ${fit.intercept} + ${fit.slope} x log10(TVL), then multiplies by a per-category factor from the median traded residual in that category (shrunk toward 1.00 when the category is thin), then adjusts for seven-day TVL growth and for how long the protocol has run with no token. No name is special-cased; the same arithmetic scores every row, and the dashboard recomputes each row from the same figures.`,
    `Why a power law, not a flat multiple. Traded tokens' market-cap-to-TVL ratio falls hard with size: median ${small.median_mcap_tvl} at $5-20M of TVL, falling to ${big.median_mcap_tvl} above $1B (n=${big.n}). A flat multiple would price the biggest pre-token protocols at ten times what the biggest traded comparables actually trade at. The fitted slope of ${fit.slope} carries that size effect: implied value grows with TVL, but slower than linearly.`,
    `How good the fit is. The power law explains little of the spread between traded tokens (R-squared ${fit.r_squared}); pricing a traded token from its TVL alone misses its market cap by a median of ${Math.round(fit.median_abs_pct_error * 100)}% in-sample and ${Math.round(fit.loo_median_abs_pct_error * 100)}% when the token is held out of the fit. Read every implied value as an order of magnitude, not a price target: the board ranks protocols, it does not predict that a token will launch, when it will, or what it will open at.`,
    `What the board covers. All 40 protocols on the snapshot's watchlist (TVL at or above the $50M floor, no token recorded, not a wrapped, staked or bridged product of a token that trades), plus the 158 largest other pre-token protocols below the floor, by TVL, excluding exchanges and versioned pools. The watchlist is the floor, never the ceiling: a protocol below it is no worse a subject. Live-token protocols are kept apart in the Live view at the market's own values, never mixed into the ranked board.`,
    `How to use a farm plan. Each plan is six steps built from the protocol's own category, chains, TVL and age: a fresh wallet, one real position sized to the protocol, one qualifying action a week, a hold of 30 to 60 days, a check of the protocol's own points page before withdrawing, and a written log. Costs are gas plus the capital that stays in the position; never pay to claim, and never follow a claim link from anywhere but the protocol's own page.`,
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: PowerLawFit, multipliers: Map<string, number>): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const fitTokens = snapshot.protocols.filter(isFitToken);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped at 158 rows so
  // the board holds 198 in all. Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, multipliers);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    on_watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      base_power_law_usd: s.v.base,
      category_multiplier: s.v.catMult,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
    },
    comparables: comparablesFor(s.p, fitTokens),
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    on_watchlist: row.on_watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    base_power_law_usd: row.model.base_power_law_usd,
    category_multiplier: row.model.category_multiplier,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    comparables: row.comparables,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitPowerLaw(snapshot);
  const multipliers = categoryMultipliers(snapshot, fit);
  const board = buildBoard(snapshot, fit, multipliers);
  const live = liveRows(snapshot);
  const bands = tvlBands(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit,
    categories: categoryCalibration(snapshot, fit, multipliers),
    bands,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    research: researchNote(fit, bands),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
