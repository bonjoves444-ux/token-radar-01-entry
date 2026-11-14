# Token Launch Radar — 198 pre-token protocols priced off traded comparables

Build the best token launch radar (make.fun `token-radar-01`). The program reads
the sealed DefiLlama snapshot, fits a comparables model on the snapshot's own
traded tokens, and writes a static dashboard that ranks the pre-token protocols
by implied launch value, with a detail view and a six-step farm plan for each.

## The model (radar-2)

The fit set is the 94 protocols in the snapshot whose token already trades,
excluding centralised exchanges, bridges and liquid-staking products. On them
the model fits a power law of market cap on TVL:

    log10(mcap) = 3.9077 + 0.4049 x log10(TVL)

then multiplies by a per-category factor from the median traded residual in
that category (shrunk toward 1.00 when the category is thin, 1.00 when it has
fewer than four traded tokens), then adjusts for seven-day TVL growth
(1 + 0.25 x clamped growth) and for maturity (0.70 + 0.30 x age capped at
1,095 days; unknown age counts as 365 days).

Why a power law, not a flat multiple: in this snapshot the traded tokens'
market-cap-to-TVL ratio falls hard with size — median 0.57 at $5-20M of TVL,
0.17 at $50-200M, 0.03 above $1B. A flat multiple would price the biggest
pre-token protocols at ten times what the biggest traded comparables trade at.

How good the fit is: R-squared 0.10; pricing a traded token from its TVL alone
misses its market cap by a median of 78% in-sample and 84% when the token is
held out of the fit (leave-one-out). Every implied value is an order of
magnitude, not a price target. The board ranks protocols; it does not predict
that a token will launch, when it will, or what it will open at.

## The board

198 rows: all 40 protocols on the snapshot's watchlist (TVL at or above the
$50M floor, no token recorded, not a wrapped, staked or bridged product of a
token that trades), plus the 158 largest other pre-token protocols below the
floor, by TVL, excluding exchanges and versioned pools. Live-token protocols
are kept apart in the Live view at the market's own values.

Each row carries its implied value, the model's working (fitted base, category
multiplier, growth and maturity multipliers), its three closest traded
comparables in its own category, and a six-step farm plan built from its
category, chains, TVL and age.

## Run it

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

Node 22, standard library only, no install. The run is deterministic: two
runs write the same bytes. Output: `board.json`, `data.js`, `dashboard/`,
`screenshots/`, `dossier.json`.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes the board, data, dashboard, screenshots and dossier.
- `lib/model.ts` — the fitted model, the board, the farm plans, the research note.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit.
- `dashboard/` — the static page: board, filters, detail view per protocol, live view, research note. No network.
- `screenshots/` — the board, a protocol detail view, a filtered view.
