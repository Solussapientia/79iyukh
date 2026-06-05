require("dotenv").config();

const path = require("path");
const express = require("express");

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const CURRENCY = (process.env.CURRENCY || "usd").toLowerCase();
const DEFAULT_READER_ID = process.env.READER_ID || "";
const PORT = process.env.PORT || 4242;

if (!SECRET_KEY) {
  console.error(
    "\n[config] STRIPE_SECRET_KEY is missing. Copy .env.example to .env and fill it in.\n"
  );
  process.exit(1);
}

const stripe = require("stripe")(SECRET_KEY);
const isLiveKey = SECRET_KEY.startsWith("sk_live_");

// Currencies that do NOT use 2 decimal places. Amounts for these are passed as-is.
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg",
  "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

// Convert a human amount (e.g. "12.50") into the smallest currency unit for Stripe.
function toMinorUnits(amountStr) {
  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid amount greater than 0.");
  }
  if (ZERO_DECIMAL_CURRENCIES.has(CURRENCY)) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Tell the front end how to render (currency + whether a default reader is set).
app.get("/api/config", (req, res) => {
  res.json({
    currency: CURRENCY,
    livemode: isLiveKey,
    defaultReaderId: DEFAULT_READER_ID,
  });
});

// List the account's readers so the operator can pick one (and see if it's online).
app.get("/api/readers", async (req, res) => {
  try {
    const readers = await stripe.terminal.readers.list({ limit: 100 });
    res.json({
      readers: readers.data.map((r) => ({
        id: r.id,
        label: r.label,
        status: r.status,
        deviceType: r.device_type,
        serial: r.serial_number,
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}); 

// Create a PaymentIntent and hand it off to the reader to collect the card.
app.post("/api/charge", async (req, res) => {
  const { amount, readerId } = req.body || {};
  const reader = readerId || DEFAULT_READER_ID;

  if (!reader) {
    return res.status(400).json({ error: "No reader selected." });
  }

  let amountMinor;
  try {
    amountMinor = toMinorUnits(amount);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountMinor,
      currency: CURRENCY,
      payment_method_types: ["card_present"],
      capture_method: "automatic",
    });

    // Push the payment to the reader. Customer is prompted to tap/insert/swipe.
    await stripe.terminal.readers.processPaymentIntent(reader, {
      payment_intent: paymentIntent.id,
      process_config: { enable_customer_cancellation: true },
    });

    res.json({
      paymentIntentId: paymentIntent.id,
      readerId: reader,
      amount: amountMinor,
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

// Poll the current state of a charge in progress.
app.get("/api/status", async (req, res) => {
  const { paymentIntentId, readerId } = req.query;
  if (!paymentIntentId) {
    return res.status(400).json({ error: "Missing paymentIntentId." });
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    let readerAction = null;
    if (readerId) {
      const reader = await stripe.terminal.readers.retrieve(readerId);
      readerAction = reader.action || null;
    }

    let state = "in_progress";
    let message = "Waiting for the customer to present their card…";

    if (pi.status === "succeeded") {
      state = "succeeded";
      message = "Payment approved.";
    } else if (readerAction && readerAction.status === "failed") {
      state = "failed";
      message =
        (readerAction.api_error && readerAction.api_error.message) ||
        readerAction.failure_message ||
        "The payment failed.";
    } else if (pi.status === "canceled") {
      state = "failed";
      message = "The payment was canceled.";
    }

    res.json({
      state,
      message,
      paymentIntentStatus: pi.status,
      readerActionStatus: readerAction ? readerAction.status : null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cancel an in-flight charge (resets the reader screen).
app.post("/api/cancel", async (req, res) => {
  const { readerId } = req.body || {};
  const reader = readerId || DEFAULT_READER_ID;
  if (!reader) {
    return res.status(400).json({ error: "No reader selected." });
  }
  try {
    await stripe.terminal.readers.cancelAction(reader);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

app.listen(PORT, () => {
  console.log(
    `\nStripe Terminal charge app running at http://localhost:${PORT}`
  );
  console.log(`Mode: ${isLiveKey ? "LIVE (real money)" : "TEST"}\n`);
});
