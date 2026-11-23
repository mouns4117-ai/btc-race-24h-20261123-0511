# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/mouns4117-ai/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/mouns4117-ai/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A slow-trend BTC trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty. It trades one asset (CBBTC/USDC) on one-minute bars inside the kit's simulator — paper money only, no real exchange, no real funds. Long only, at most one open position, full size when the trend is confirmed.

The idea is deliberately boring: on one-minute bars the noise is about 8 bps a bar while a full-size round trip costs roughly 26–46 bps in fees, slippage and pool impact, so fast signals churn themselves to death (the kit's own ema-cross baseline loses $115 on the dev window by trading 76 times). This bot trades rarely. It buys only when the close sits 10 bps above its 120-bar moving average, scales in by halves so each fill pays less impact, and sells only when the close falls 100 bps below that average or 200 bps below the peak since entry — wide enough to survive ordinary pullbacks. After a sell it waits 4 hours before buying again, so it cannot re-buy every local bounce in a falling market.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1` on stdin/stdout: the harness sends `hello`, then one `batch` per minute, then `done`, and the bot answers every batch with exactly one reply. To grade it against the kit's frozen 24-hour dev window:

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --worktree --driver process
```

## Strategy

- **Trend filter:** 120-bar simple moving average of closes (2 hours). No trade until it is seeded; warm-up bars seed it too but are never traded on.
- **Entry:** flat, close > average × 1.001, and ≥ 240 bars since the last sell → buy half the cash. While the close stays above the average and the position is under 95% of equity, keep buying half the remaining cash each bar.
- **Exit:** close < average × 0.99, or close < peak close since entry × 0.98 → sell the whole position at once. Every order caps slippage at 100 bps past the deciding close. At most one order per reply.
- **Practice result (kit dev window, 1,440 bars, BTC $58,957 → $61,102):** net PnL about +$31 on $1,000 starting capital, max drawdown about 2%, a handful of trades — within a dollar of buy-and-hold's +$32, but with an exit: on the same window played backwards (a −3.6% market) it loses about $18 instead of buy-and-hold's $39.
- **Determinism:** plain float64 arithmetic over the closes in a fixed order; no clock, no environment, no randomness. Two runs produce identical action logs.

---

<sub>Entered on [make.fun](https://make.fun/?ref=yj3dej2g&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>

