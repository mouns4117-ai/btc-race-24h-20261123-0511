// Slow-trend BTC bot for the make.fun btc-race-24h-20261123-0511 bounty.
//
// One asset (CBBTC/USDC), one-minute bars, long only, paper money. The bot
// rides a slow uptrend and sits in cash when there is none, because on
// one-minute bars the noise is ~8 bps a bar while a full-size round trip
// costs ~26-46 bps in fees, slippage and pool impact: every fast signal
// churns itself to death (the kit's own ema-cross baseline loses $115 on
// the dev window by trading 76 times). So this bot trades rarely, only on
// a confirmed slow trend, and lets a wide exit do the protecting.
//
// Rules, all decided on a bar's close and filled at the next bar's open:
//   - Track the 120-bar simple moving average of closes (2 hours of bars).
//     Warm-up bars, when the harness sends them, seed the average too;
//     they are never traded on.
//   - Flat and the close is 10 bps above the average, and at least 240
//     bars (4 hours) have passed since the last sell: buy half the cash.
//     While the close stays above the average and the position is under
//     95% of equity, keep buying half the remaining cash each bar, so the
//     entry scales in over a few bars and each fill pays less impact
//     than one full-size order would.
//   - Long and the close falls 100 bps below the average, or 200 bps
//     below the highest close seen since entry: sell the whole position
//     at once. The wide bands survive ordinary pullbacks; the 4-hour
//     cooldown after a sell stops the bot re-buying every local bounce
//     in a falling market.
//   - Every order caps slippage at 100 bps past the close it was
//     decided on, as the baselines do. At most one order per reply.
//
// Everything is deterministic: plain float64 arithmetic over the closes
// in a fixed order, no clock, no environment, no randomness. The same
// bars give the same orders on every run.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Bars in the trend average: 120 one-minute bars = 2 hours. */
const SMA_BARS = 120;
/** Entry: close this many bps above the average. */
const ENTRY_BPS = 10;
/** Exit: close this many bps below the average. */
const EXIT_BPS = 100;
/** Exit: close this many bps below the peak close since entry. */
const TRAIL_BPS = 200;
/** Bars to wait after a sell before buying again. */
const COOLDOWN_BARS = 240;
/** Slippage cap on every order, in bps past the deciding close. */
const MAX_SLIPPAGE_BPS = 100;
/** Stop adding to the position once it is this percent of equity. */
const FULL_PCT = 95n;

/** Every CBBTC close seen so far, oldest first, in raw price units. */
const closes: bigint[] = [];
/** Highest close seen since the current position opened, or null flat. */
let peak: bigint | null = null;
/** Seq of the batch on which the last sell was decided. */
let lastSellSeq = -1000000;

/** The average of the last SMA_BARS closes, or null until seeded. */
function trendAverage(): number | null {
  if (closes.length < SMA_BARS) return null;
  let sum = 0;
  for (let i = closes.length - SMA_BARS; i < closes.length; i++) sum += Number(closes[i]);
  return sum / SMA_BARS;
}

/** One order to buy half the cash, or nothing when that is too small. */
function buyHalf(state: BarsState): OrderInput[] {
  const amount = state.cash / 2n;
  if (amount < BigInt(state.hello.fees.min_notional_quote_units)) return [];
  return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

function onBatch(state: BarsState, batch: Batch): OrderInput[] {
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return [];
  closes.push(BigInt(bar.c));
  if (state.warmingUp) return [];
  const average = trendAverage();
  if (average === null) return [];
  const close = Number(bar.c);
  const position = state.positions.get(SYMBOL);
  const qty = position === undefined ? 0n : position.qty;

  if (qty === 0n) {
    // Flat: enter only on a confirmed slow uptrend, after the cooldown.
    if (state.seq - lastSellSeq < COOLDOWN_BARS) return [];
    if (close <= average * (1 + ENTRY_BPS / 10000)) return [];
    peak = BigInt(bar.c);
    return buyHalf(state);
  }

  // Long: track the peak, then check the two exits.
  if (peak === null || BigInt(bar.c) > peak) peak = BigInt(bar.c);
  if (close < average * (1 - EXIT_BPS / 10000) || close < Number(peak) * (1 - TRAIL_BPS / 10000)) {
    lastSellSeq = state.seq;
    peak = null;
    return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  }

  // Still trending up and underweight: add half the remaining cash.
  if (close > average * (1 + ENTRY_BPS / 10000)) {
    const value = state.value(SYMBOL, qty);
    if (value * 100n < state.equity * FULL_PCT) return buyHalf(state);
  }
  return [];
}

await runBars({ onBatch });

