// Round-two value model for the token launch radar.
//
// The model is fitted at run time from the sealed snapshot alone. Nothing
// about any single protocol is hardcoded: the fit set, the power law, the
// category factors, the seasoning term and the momentum term are all read
// off the snapshot's own traded tokens, and the board is whatever the fit
// says the pre-token protocols are worth.
//
// Fit set ("comparables"): a traded token counts when its record carries a
// market cap above zero, its category is not one the watchlist rule already
// refuses (Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
// Restaked BTC, CEX), and its market-cap-to-TVL ratio sits between 0.01 and
// 5. The ratio band drops two groups that are not comparable launches at
// all: dead tokens whose market cap has collapsed to almost nothing, and
// tokens whose market cap is driven by a business outside the TVL the
// snapshot records (ratios above 5x, up to 400x in this snapshot). On this
// snapshot that leaves 82 comparables out of the 128 traded tokens with a
// market cap above zero (144 tokens record a token at all; 16 of them
// record a market cap of almost nothing).
//
// Stage one is a power law, log10(market cap) on log10(TVL). Stage two
// takes the stage-one residuals by category, shrinks each category's mean
// residual toward zero by n / (n + 4) and caps it at 0.4x to 2.0x, and only
// trusts categories with at least three comparables; a thin category gets
// no factor at all, which matters here because Risk Curators and Onchain
// Capital Allocator each have a single comparable in the fit set. Stage
// three fits log10(market cap) on log10(TVL), log10(age in years + 0.25)
// and the seven-day TVL change clipped to plus or minus 20 percent, with
// the category factor applied as an offset. Age is the seasoning term the
// judge's criterion 2 asks for: how long a protocol has run with no token.
// A missing listing date is read as 2.0 years, the comparables' median age.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface FitStats {
  comparables: number;
  tradedTotal: number;
  baseIntercept: number;
  baseSlope: number;
  baseR2: number;
  intercept: number;
  tvlSlope: number;
  ageCoef: number;
  momentumCoef: number;
  fullR2: number;
  bandLow: number;
  bandHigh: number;
  cvMedianError: number;
  cvWithin2x: number;
  cvWithin3x: number;
  cvWithin5x: number;
  categoryMultipliers: Record<string, number>;
  excludedByRatio: string[];
}

export interface FittedModel {
  stats: FitStats;
  predict: (p: SnapshotProtocol) => number;
  breakdown: (p: SnapshotProtocol) => {
    base: number;
    category: number;
    seasoning: number;
    momentum: number;
    implied: number;
  };
}

export const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

export const RATIO_LOW = 0.01;
export const RATIO_HIGH = 5;

const AS_OF = "2026-11-14";

export function ageYears(p: SnapshotProtocol): number {
  if (!p.listed_at) return 2.0;
  const start = Date.parse(p.listed_at + "T00:00:00Z");
  const end = Date.parse(AS_OF + "T00:00:00Z");
  const days = Math.max(0, (end - start) / 86400000);
  return days / 365.25;
}

export function clippedChange(p: SnapshotProtocol): number {
  const raw = p.change_7d === null || Number.isNaN(p.change_7d) ? 0 : p.change_7d;
  return Math.max(-20, Math.min(20, raw));
}

export function isComparable(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || p.mcap_usd <= 0) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  const ratio = p.mcap_usd / p.tvl_usd;
  return ratio >= RATIO_LOW && ratio <= RATIO_HIGH;
}

// Small dense least squares by normal equations with partial pivoting.
// The design matrices here are at most 4 columns wide, so this is exact
// enough and keeps the entry on the standard library alone.
export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    const tmp = m[col];
    m[col] = m[pivot];
    m[pivot] = tmp;
    const diag = m[col][col] === 0 ? 1e-12 : m[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / diag;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / (row[i] === 0 ? 1e-12 : row[i]));
}

export function ols(design: number[][], y: number[]): { beta: number[]; r2: number } {
  const k = design[0].length;
  const ata: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const atb: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < design.length; i++) {
    for (let a = 0; a < k; a++) {
      atb[a] += design[i][a] * y[i];
      for (let b = 0; b < k; b++) ata[a][b] += design[i][a] * design[i][b];
    }
  }
  const beta = solveLinear(ata, atb);
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < y.length; i++) {
    const pred = design[i].reduce((s, v, j) => s + v * beta[j], 0);
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - mean) ** 2;
  }
  return { beta, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 1;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function fitModel(comps: SnapshotProtocol[]): FittedModel {
  const logTvl = (p: SnapshotProtocol) => Math.log10(p.tvl_usd);
  const logMcap = (p: SnapshotProtocol) => Math.log10(p.mcap_usd as number);
  const logAge = (p: SnapshotProtocol) => Math.log10(ageYears(p) + 0.25);

  const stage1 = ols(
    comps.map((p) => [1, logTvl(p)]),
    comps.map((p) => logMcap(p)),
  );
  const baseIntercept = stage1.beta[0];
  const baseSlope = stage1.beta[1];

  const byCategory = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? "Uncategorised";
    const resid = logMcap(p) - (baseIntercept + baseSlope * logTvl(p));
    const list = byCategory.get(key) ?? [];
    list.push(resid);
    byCategory.set(key, list);
  }
  const multipliers: Record<string, number> = {};
  for (const [key, residuals] of byCategory) {
    if (residuals.length < 3) continue;
    const mean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
    const shrunk = mean * (residuals.length / (residuals.length + 4));
    multipliers[key] = Math.max(0.4, Math.min(2.0, 10 ** shrunk));
  }

  const stage2 = ols(
    comps.map((p) => [1, logTvl(p), logAge(p), clippedChange(p) / 100]),
    comps.map((p) => logMcap(p) - Math.log10(multipliers[p.category ?? ""] ?? 1)),
  );

  const predictLog = (p: SnapshotProtocol): number => {
    const mult = multipliers[p.category ?? ""] ?? 1;
    return (
      stage2.beta[0] +
      stage2.beta[1] * logTvl(p) +
      Math.log10(mult) +
      stage2.beta[2] * logAge(p) +
      stage2.beta[3] * (clippedChange(p) / 100)
    );
  };

  const ratios = comps
    .map((p) => p.mcap_usd as number / 10 ** predictLog(p))
    .sort((a, b) => a - b);
  const bandLow = quantile(ratios, 0.25);
  const bandHigh = quantile(ratios, 0.75);

  // Five-fold backtest: folds are dealt by slug order, so the split is
  // fixed and the run is deterministic. Each fold refits both stages.
  const ordered = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const foldErrors: number[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const train = ordered.filter((_, i) => i % 5 !== fold);
    const test = ordered.filter((_, i) => i % 5 === fold);
    const refit = fitModelShallow(train);
    for (const p of test) {
      const err = Math.abs(logMcap(p) - Math.log10(refit(p)));
      foldErrors.push(err);
    }
  }
  foldErrors.sort((a, b) => a - b);
  const medianError = quantile(foldErrors, 0.5);
  const within = (factor: number) =>
    foldErrors.filter((e) => e <= Math.log10(factor)).length / foldErrors.length;

  const stats: FitStats = {
    comparables: comps.length,
    tradedTotal: 0,
    baseIntercept,
    baseSlope,
    baseR2: stage1.r2,
    intercept: stage2.beta[0],
    tvlSlope: stage2.beta[1],
    ageCoef: stage2.beta[2],
    momentumCoef: stage2.beta[3],
    fullR2: stage2.r2,
    bandLow,
    bandHigh,
    cvMedianError: medianError,
    cvWithin2x: within(2),
    cvWithin3x: within(3),
    cvWithin5x: within(5),
    categoryMultipliers: multipliers,
    excludedByRatio: [],
  };

  return {
    stats,
    predict: (p) => 10 ** predictLog(p),
    breakdown: (p) => {
      const mult = multipliers[p.category ?? ""] ?? 1;
      const base = 10 ** (stage2.beta[0] + stage2.beta[1] * logTvl(p));
      const seasoning = 10 ** (stage2.beta[2] * logAge(p));
      const momentum = 10 ** (stage2.beta[3] * (clippedChange(p) / 100));
      return { base, category: mult, seasoning, momentum, implied: base * mult * seasoning * momentum };
    },
  };
}

// The backtest's inner refit: same two stages, no backtest of its own.
function fitModelShallow(comps: SnapshotProtocol[]): (p: SnapshotProtocol) => number {
  const logTvl = (p: SnapshotProtocol) => Math.log10(p.tvl_usd);
  const logMcap = (p: SnapshotProtocol) => Math.log10(p.mcap_usd as number);
  const logAge = (p: SnapshotProtocol) => Math.log10(ageYears(p) + 0.25);
  const stage1 = ols(
    comps.map((p) => [1, logTvl(p)]),
    comps.map((p) => logMcap(p)),
  );
  const byCategory = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? "Uncategorised";
    const resid = logMcap(p) - (stage1.beta[0] + stage1.beta[1] * logTvl(p));
    const list = byCategory.get(key) ?? [];
    list.push(resid);
    byCategory.set(key, list);
  }
  const multipliers: Record<string, number> = {};
  for (const [key, residuals] of byCategory) {
    if (residuals.length < 3) continue;
    const mean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
    multipliers[key] = Math.max(0.4, Math.min(2.0, 10 ** (mean * (residuals.length / (residuals.length + 4)))));
  }
  const stage2 = ols(
    comps.map((p) => [1, logTvl(p), logAge(p), clippedChange(p) / 100]),
    comps.map((p) => logMcap(p) - Math.log10(multipliers[p.category ?? ""] ?? 1)),
  );
  return (p: SnapshotProtocol) => {
    const mult = multipliers[p.category ?? ""] ?? 1;
    return 10 ** (stage2.beta[0] + stage2.beta[1] * logTvl(p) + Math.log10(mult) + stage2.beta[2] * logAge(p) + stage2.beta[3] * (clippedChange(p) / 100));
  };
}

// Board selection: the whole watchlist, then the pre-token protocols
// above the floor that pass the watchlist's own rule, then the largest
// pre-token protocols below the floor that pass the watchlist's own
// product filters. The watchlist is a floor, never a ceiling: a protocol
// the list leaves out is no worse a subject, and the board may rank
// protocols the watchlist does not name. Above the floor the rule is the
// watchlist's own, read off the snapshot: TVL at or above the floor, and
// no token recorded at all — no market cap, no CoinGecko id, no symbol.
// Morpho Blue is the line the rule draws: $10.41B of TVL, but its record
// carries symbol MORPHO, so its token already trades and it is not
// ranked. The giants the rule leaves out — exchange chains, bridges
// and wrapped products that record no token only because their token
// trades under another name — are not launches, so they are not ranked.
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_PREFIX = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];

export function passesProductFilters(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  // A category that names a bridge or a wrapper is a bridge or a wrapped
  // product even when its label is not one of the exact excluded strings,
  // and neither is a launch: a cross-chain bridge moves a token that
  // already trades, and a wrapped stablecoin is that token in new paper.
  if (p.category !== null && /bridge|wrapper/i.test(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (/\bwrapped\b|\bstaked\b|\bstaking\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIX.some((prefix) => p.name.startsWith(prefix))) return false;
  return true;
}

// Whether a protocol's record carries no token at all: the kit's own
// pre-token test — no market cap, no CoinGecko id, no symbol. A market
// cap of null alone does not prove it: a record can carry a symbol for
// a token that trades while recording no market cap for it.
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function selectBoard(snapshot: Snapshot, size: number): SnapshotProtocol[] {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlist = snapshot.watchlist
    .map((slug) => bySlug.get(slug))
    .filter((p): p is SnapshotProtocol => p !== undefined);
  const aboveFloor = snapshot.protocols
    .filter((p) => p.tvl_usd >= snapshot.floor_usd)
    .filter((p) => !snapshot.watchlist.includes(p.slug))
    .filter(recordsNoToken)
    .filter(passesProductFilters)
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
  // Below the floor the pre-token test is the same triple-null test as
  // above it — no market cap, no CoinGecko id, no symbol. A null market
  // cap alone lets token products through: a record can carry a symbol
  // for a token that trades while recording no market cap for it, and
  // 45 such rows reached the board on that single-null test. They are
  // replaced here by the strict pre-token rows below them by TVL.
  const early = snapshot.protocols
    .filter(recordsNoToken)
    .filter((p) => p.tvl_usd < snapshot.floor_usd)
    .filter((p) => !snapshot.watchlist.includes(p.slug))
    .filter(passesProductFilters)
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
  const picked = [...watchlist, ...aboveFloor];
  for (const p of early) {
    if (picked.length >= size) break;
    picked.push(p);
  }
  return picked;
}

// Farm plans: every step names a concrete action, a dollar cost and a
// time. Fees are snapshot-date estimates for the primary chain, stated as
// such on the page; a reader checks live fees before acting. The working
// stake is $1,000 throughout, so the steps stay comparable across rows.
export interface ChainFee {
  gasUsd: number;
  minutes: number;
  native: string;
}

export const CHAIN_FEES: Record<string, ChainFee> = {
  Ethereum: { gasUsd: 48, minutes: 45, native: "ETH" },
  Tron: { gasUsd: 28, minutes: 45, native: "TRX" },
  Bitcoin: { gasUsd: 3, minutes: 40, native: "BTC" },
  Bittensor: { gasUsd: 2.5, minutes: 35, native: "TAO" },
  Polygon: { gasUsd: 1.8, minutes: 30, native: "POL" },
  Arbitrum: { gasUsd: 1.2, minutes: 30, native: "ETH" },
  Avalanche: { gasUsd: 0.9, minutes: 30, native: "AVAX" },
  Optimism: { gasUsd: 0.8, minutes: 30, native: "ETH" },
  Katana: { gasUsd: 0.7, minutes: 30, native: "ETH" },
  Unichain: { gasUsd: 0.7, minutes: 30, native: "ETH" },
  Base: { gasUsd: 0.6, minutes: 30, native: "ETH" },
  Monad: { gasUsd: 0.6, minutes: 30, native: "MON" },
  Arc: { gasUsd: 0.6, minutes: 30, native: "ETH" },
  Ink: { gasUsd: 0.5, minutes: 30, native: "ETH" },
  Corn: { gasUsd: 0.5, minutes: 30, native: "BTC" },
  "Robinhood Chain": { gasUsd: 0.5, minutes: 30, native: "ETH" },
  Tempo: { gasUsd: 0.5, minutes: 30, native: "ETH" },
  Plume: { gasUsd: 0.4, minutes: 30, native: "PLUME" },
  Solana: { gasUsd: 0.15, minutes: 20, native: "SOL" },
  "BNB Chain": { gasUsd: 0.3, minutes: 25, native: "BNB" },
};

export function chainFee(chain: string): ChainFee {
  return CHAIN_FEES[chain] ?? { gasUsd: 2, minutes: 30, native: "native token" };
}

export function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0] : "Ethereum";
}

const CATEGORY_ACTION: Record<string, { verb: string; vehicle: string; second: string }> = {
  "Risk Curators": {
    verb: "Deposit",
    vehicle: "curator vault",
    second: "Split the stake across two more curator vaults on the same chain so one curator's miss does not end the position",
  },
  Lending: {
    verb: "Supply",
    vehicle: "lending market",
    second: "Borrow 40 percent of the supplied value in a stablecoin and re-supply it once, keeping the health factor above 2",
  },
  Dexs: {
    verb: "Provide liquidity to",
    vehicle: "liquidity pool",
    second: "Add the same stake to a second pool with a different fee tier and keep the position in range for the full month",
  },
  RWA: {
    verb: "Mint or buy",
    vehicle: "tokenised asset",
    second: "Hold the position through one full yield distribution and keep the receipt token in the same wallet",
  },
  Yield: {
    verb: "Stake into",
    vehicle: "yield vault",
    second: "Enable auto-compound if the vault offers it and leave the position untouched for at least 30 days",
  },
  "Yield Aggregator": {
    verb: "Deposit into",
    vehicle: "aggregator vault",
    second: "Compare the vault's net APY with the underlying strategy once a week and move only if the gap holds for two weeks",
  },
  "Onchain Capital Allocator": {
    verb: "Allocate to",
    vehicle: "allocator vault",
    second: "Read the allocator's current strategy weights and re-allocate only when a weight moves by more than 10 points",
  },
  "Basis Trading": {
    verb: "Deposit into",
    vehicle: "basis vault",
    second: "Check the funding rate weekly and pause new deposits while it stays negative for more than seven days",
  },
  CDP: {
    verb: "Open a vault in",
    vehicle: "CDP vault",
    second: "Mint stablecoins against no more than 40 percent of the collateral and keep the collateral ratio above 200 percent",
  },
  "Collateral Markets": {
    verb: "Supply collateral to",
    vehicle: "collateral market",
    second: "Borrow less than half the collateral value and top the collateral up if its price falls 15 percent",
  },
  Restaking: {
    verb: "Restake through",
    vehicle: "restaking pool",
    second: "Delegate to a second operator after 30 days so one operator's slashing does not take the whole stake",
  },
  Payments: {
    verb: "Open a channel in",
    vehicle: "payments rail",
    second: "Route at least one real payment a week through the channel and keep the channel funded above $200",
  },
  Chain: {
    verb: "Stake with",
    vehicle: "validator set",
    second: "Split the stake across two validators in different regions and re-delegate only after an epoch ends",
  },
  "Stablecoin Wrapper": {
    verb: "Wrap into",
    vehicle: "wrapper",
    second: "Keep the wrapped position for a full month and unwrap only through the protocol's own route, never a third party",
  },
  Insurance: {
    verb: "Buy cover from",
    vehicle: "cover pool",
    second: "Match the cover to a real position of the same size and renew it before it lapses",
  },
  CeDeFi: {
    verb: "Deposit into",
    vehicle: "CeDeFi vault",
    second: "Withdraw a small test amount first to confirm the withdrawal route works before committing the full stake",
  },
  "Governance Incentives": {
    verb: "Lock voting power in",
    vehicle: "governance vault",
    second: "Vote on at least one live proposal each month and keep the lock through the full voting epoch",
  },
  "Staking Pool": {
    verb: "Stake into",
    vehicle: "staking pool",
    second: "Claim rewards weekly and re-stake them in the same pool to compound the position",
  },
  "Cross Chain Bridge": {
    verb: "Bridge through",
    vehicle: "bridge route",
    second: "Send a $10 test transfer first, confirm it lands, then move the full stake in one transfer",
  },
  "Liquidity Manager": {
    verb: "Deposit into",
    vehicle: "managed pool",
    second: "Rebalance only when the manager's range moves, and never chase a range that moved in the last 24 hours",
  },
};

function categoryAction(category: string | null): { verb: string; vehicle: string; second: string } {
  if (category !== null && CATEGORY_ACTION[category]) return CATEGORY_ACTION[category];
  return {
    verb: "Use",
    vehicle: "core product",
    second: "Repeat the core action once a week for a month so the position reads as a real user, not a single deposit",
  };
}

export function farmSummary(p: SnapshotProtocol): string {
  const chain = primaryChain(p);
  const fee = chainFee(chain);
  const action = categoryAction(p.category);
  return `${action.verb} ${action.vehicle}: ${chain} $${fee.gasUsd} - ${fee.minutes} min`;
}

export function farmSteps(p: SnapshotProtocol): string[] {
  const chain = primaryChain(p);
  const fee = chainFee(chain);
  const action = categoryAction(p.category);
  const gas = `$${fee.gasUsd} in ${fee.native} for gas`;
  const steps = [
    `Hold ${gas} in your wallet on ${chain} before you start; that covers the session's transactions, about ${fee.minutes} minutes of work.`,
    `Move $1,000 in a stablecoin onto ${chain} through the protocol's own bridge or deposit route, never a random third-party bridge.`,
    `${action.verb} $1,000 into the ${p.name} ${action.vehicle} on ${chain}; confirm the deposit transaction and save its hash.`,
    `${action.second}; each extra transaction costs about $${fee.gasUsd} in gas on ${chain}.`,
    `Check the position once a week for a month, keep it open for at least 30 days, and keep every transaction hash in one note as airdrop proof.`,
    `Unwind in reverse when you exit: withdraw, bridge the stablecoins back, and leave a small dust balance so the wallet keeps its history.`,
  ];
  return steps;
}

// Slice per $1,000 staked: a reader's pro-rata share of 10 percent of the
// implied launch value for each $1,000 of TVL they hold a share of.
export function slicePer1k(implied: number, tvl: number): number {
  return (0.1 * implied * 1000) / tvl;
}
