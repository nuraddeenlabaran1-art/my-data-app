require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const BASE =
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

// Paystack webhook
app.post(
  "/api/paystack/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["x-paystack-signature"];

    if (!SECRET || !sig) {
      return res.sendStatus(401);
    }

    const hash = crypto
      .createHmac("sha512", SECRET)
      .update(req.body)
      .digest("hex");

    if (hash !== sig) {
      return res.sendStatus(401);
    }

    const event = JSON.parse(req.body.toString());

    if (event.event === "charge.success") {
      console.log("Paystack success:", event.data.reference);
    }

    res.sendStatus(200);
  }
);

app.use(express.json());

app.use(express.static(path.join(__dirname)));

// Backend health check
app.get("/api/health", (req, res) => {
  res.json({
    status: true,
    message: "Backend is working",
  });
});

// Check whether VTUGATE API key is configured
// This does NOT reveal the key.
app.get("/api/vtugate/status", (req, res) => {
  const configured = Boolean(process.env.VTUGATE_API_KEY);

  res.json({
    status: configured,
    message: configured
      ? "VTUGATE API key is configured."
      : "VTUGATE API key is not configured.",
  });
});

// Paystack payment initialization
app.post("/api/payment/initialize", async (req, res) => {
  try {
    if (!SECRET) {
      return res.status(500).json({
        status: false,
        message: "PAYSTACK_SECRET_KEY is not configured.",
      });
    }

    const {
      email,
      amount,
      network,
      plan,
      productCode,
      phone,
    } = req.body;

    if (
      !email ||
      !amount ||
      !network ||
      !plan ||
      !productCode ||
      !/^0\d{10}$/.test(phone)
    ) {
      return res.status(400).json({
        status: false,
        message: "Missing or invalid payment information.",
      });
    }

    const reference = `MDA-${Date.now()}-${crypto
      .randomBytes(4)
      .toString("hex")}`;

    const r = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: String(Math.round(Number(amount) * 100)),
          currency: "NGN",
          reference,

          callback_url: `${BASE}/payment/callback`,

          metadata: {
            network,
            plan,
            productCode,
            phone,
          },
        }),
      }
    );

    const d = await r.json();

    if (!r.ok || !d.status) {
      return res.status(400).json({
        status: false,
        message:
          d.message || "Paystack initialization failed.",
      });
    }

    res.json({
      status: true,
      authorization_url: d.data.authorization_url,
      access_code: d.data.access_code,
      reference: d.data.reference,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      status: false,
      message: "Server error.",
    });
  }
});

// Paystack payment callback
app.get("/payment/callback", async (req, res) => {
  try {
    const ref = req.query.reference;

    if (!ref || !SECRET) {
      return res.status(400).send(
        "Missing payment reference."
      );
    }

    const r = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        ref
      )}`,
      {
        headers: {
          Authorization: `Bearer ${SECRET}`,
        },
      }
    );

    const d = await r.json();

    if (!r.ok || !d.status) {
      return res.status(400).send(
        "Could not verify payment."
      );
    }

    if (d.data.status !== "success") {
      return res.status(400).send(`
        <h2>Payment not successful</h2>
        <p>Status: ${d.data.status}</p>
        <a href="/">Back</a>
      `);
    }

    res.send(`
      <html>
        <body style="font-family:Arial;text-align:center;padding:40px">
          <h1>Payment Successful! ✅</h1>
          <p>Reference: ${ref}</p>
          <p>Paystack has verified the payment.</p>
          <p><b>VTU delivery is not enabled yet.</b></p>
          <a href="/">Back to Noorsub</a>
        </body>
      </html>
    `);
  } catch (e) {
    console.error(e);

    res.status(500).send(
      "Verification error."
    );
  }
});

app.listen(PORT, () => {
  console.log(
    `Noorsub backend running on port ${PORT}`
  );
});
