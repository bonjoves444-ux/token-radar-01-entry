# Token Launch Radar — round two

198 pre-token protocols priced off 82 comparable launches, from the sealed
snapshot alone. MIT licensed.

## The model

Fitted at run time from the snapshot's own traded tokens, in three stages
(`lib/model.ts`, `fitModel`):

1. **Comparables.** A traded token counts when its category is not Bridge,
   Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX,
   and its market-cap-to-TVL ratio sits between 0.01 and 5. That drops dead
   tokens (ratio under 0.01) and tokens whose market cap is driven by a
   business outside the recorded TVL (ratio over 5, up to 400x). 82 of the
   snapshot's 128 traded tokens with a market cap above zero survive.
2. **Size curve.** `log10(market cap) = intercept + slope * log10(TVL)`,
   fitted by least squares. On this snapshot: intercept 2.25, slope 0.62,
   R² 0.30.
3. **Category, seasoning, momentum.** Category factors are shrunk mean
   residuals (`n / (n + 4)`, capped 0.4x–2.0x), trusted only with at least
   three comparables — Risk Curators and Onchain Capital Allocator each have
   one, so they carry 1.00. Seasoning is `log10(age in years + 0.25)`;
   momentum is the 7-day TVL change clipped to ±20%. Full fit R² 0.31.

Backtest (five-fold, folds dealt by slug order, each fold refitted): the
median held-out error is ×3.11, with 34% of held-out comparables within ×2
of their true market cap, 49% within ×3 and 65% within ×5. The middle half
of comparables land within ×0.36–×2.78 of the fitted curve in-sample.

## The board

The whole 40-protocol watchlist, plus the 158 largest pre-token protocols
below the $50M floor that pass the watchlist's own product filters. Top of
the board on this snapshot: Steakhouse Financial $125.0M, Gauntlet $93.0M,
Veda $87.3M, USDD $70.5M, Upshift $48.6M.

Every row carries a farm plan for a $1,000 working stake: concrete steps
with a dollar cost and a setup time on the protocol's primary chain, plus a
Slice / $1k figure — the reader's pro-rata share of 10% of the implied
launch value per $1,000 staked.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22 or later, standard library only. The run is deterministic: same
bytes across runs, no clock, no random source, no network. `main.ts`
writes `board.json`, `dashboard/data.js`, copies `dashboard/` and
`screenshots/`, and writes `dossier.json` with `buildDossier` from
`vendor/makefun-board.ts`.

Screenshots (1280×800) are taken from the built dashboard with a headless
browser: `1-board.png` the board, `2-detail.png` a protocol detail view,
`3-filtered.png` the watchlist filter.
