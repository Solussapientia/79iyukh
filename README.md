# Charge a card on your Stripe Reader S700/S710

A small mobile web app: type an amount, tap **Charge**, and your Stripe smart
reader prompts the customer to tap/insert/swipe their card. Built with the
**server-driven** Stripe Terminal integration (no Terminal SDK in the browser —
your backend tells the reader what to do over Stripe's cloud).

```
Phone/browser  ──►  This Node backend  ──►  Stripe API  ──►  Your S700/S710 reader
   (amount field)      (holds secret key)                      (takes the card)
```

## What you need

1. A Stripe account with **Terminal enabled** and your **S700/S710 reader
   registered** to a Location.
   - Register a reader: <https://dashboard.stripe.com/terminal/readers>
2. Your **live secret key** (`sk_live_…`): <https://dashboard.stripe.com/apikeys>
3. Node.js 18+ (you have v24).
4. The reader powered on and connected to the internet (same as normal use).

## Setup

```bash
# 1. Install dependencies (already done if you ran this once)
npm install

# 2. Create your .env from the template and fill it in
cp .env.example .env
```

Open `.env` and set:

- `STRIPE_SECRET_KEY` — your `sk_live_…` key. **Keep this secret.**
- `READER_ID` — optional. If you have only one reader the app auto-detects it.
  Otherwise the web page shows a dropdown. (IDs look like `tmr_…`, found on the
  [readers page](https://dashboard.stripe.com/terminal/readers).)
- `CURRENCY` — defaults to `usd`.

## Run it

```bash
npm start
```

Then open <http://localhost:4242> on your computer, or on your phone use your
computer's local IP (e.g. `http://192.168.1.20:4242`) while on the same Wi-Fi.

## How to use

1. Type the amount on the keypad.
2. Tap **Charge**. The reader screen switches to "present your card."
3. Customer taps/inserts/swipes.
4. The page shows **approved** or the decline reason. **Cancel** resets the reader.

Payments use **automatic capture** — the amount is charged in one step.

## Going live safely (recommended first run)

Going straight to live means **real money**. Before charging a customer:

- Do **one** real charge for a small amount (e.g. $1.00) with your own card to
  confirm the end-to-end flow, then refund it from the
  [Dashboard](https://dashboard.stripe.com/payments).
- Confirm the badge at the top of the page says **"Live mode · real money."**
- If you'd rather rehearse with **no money**, put a `sk_test_…` key in `.env`
  and register the reader in a Stripe **sandbox**; the app shows "Test mode."

## Notes / limitations

- Amounts assume 2-decimal currencies (USD, GBP, EUR, …). Zero-decimal
  currencies like JPY are handled automatically.
- Status is tracked by polling Stripe every ~1.5s. For a production
  point-of-sale you'd typically also add a webhook endpoint
  (`terminal.reader.action_succeeded` / `action_failed`) for resilience.
- This app exposes no authentication — run it on a trusted local network, not
  on the public internet, since anyone who can reach it can start a charge.

## Files

| File | Purpose |
| --- | --- |
| `server.js` | Express backend: lists readers, creates + processes PaymentIntents, polls status, cancels |
| `public/index.html` | Mobile web UI: amount keypad, charge button, live status |
| `.env` | Your secret config (never committed) |
