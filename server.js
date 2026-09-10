require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const VTUGATE_API_KEY = process.env.VTUGATE_API_KEY;

const BASE =
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

const VTUGATE_BASE_URL = "https://api.vtugate.com";

// --------------------------------------------------
// PAYSTACK WEBHOOK
// --------------------------------------------------

app.post(
  "/api/paystack/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["x-paystack-signature"];

    if (!PAYSTACK_SECRET_KEY || !sig) {
      return res.sendStatus(401);
    }

    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(req.body)
      .digest("hex");

    if (hash !== sig) {
      return res.sendStatus(401);
    }

    try {
      const event = JSON.parse(req.body.toString());

      if (event.event === "charge.success") {
        console.log(
          "Paystack success:",
          event.data.reference
        );
      }

      return res.sendStatus(200);
    } catch (e) {
      console.error(e);
      return res.sendStatus(400);
    }
  }
);

app.use(express.json());

app.use(express.static(path.join(__dirname)));

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    status: true,
    message: "Backend is working",
  });
});

// --------------------------------------------------
// VTUGATE KEY STATUS
// --------------------------------------------------

app.get("/api/vtugate/status", (req, res) => {
  const configured = Boolean(VTUGATE_API_KEY);

  res.json({
    status: configured,
    message: configured
      ? "VTUGATE API key is configured."
      : "VTUGATE API key is not configured.",
  });
});

// --------------------------------------------------
// VTUGATE HELPER
// --------------------------------------------------

async function vtugateRequest(endpoint, body = {}) {
  if (!VTUGATE_API_KEY) {
    throw new Error("VTUGATE_API_KEY is not configured.");
  }

  const response = await fetch(
    `${VTUGATE_BASE_URL}${endpoint}`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",

        Authorization:
          `Bearer ${VTUGATE_API_KEY}`,
      },

      body: new URLSearchParams(body),
    }
  );

  const data = await response.json();

  return {
    httpStatus: response.status,
    data,
  };
}

// --------------------------------------------------
// FETCH DATA SERVICES
// --------------------------------------------------
//
// VTUGATE requires:
// service_type=data
//
// This returns services/providers such as MTN,
// Airtel, Glo and 9mobile when available.
// --------------------------------------------------

app.get("/api/vtugate/services", async (req, res) => {
  try {
    const result = await vtugateRequest(
      "/api/v1/fetchservices",
      {
        service_type: "data",
      }
    );

    if (
      result.httpStatus < 200 ||
      result.httpStatus >= 300
    ) {
      return res.status(400).json({
        status: false,
        message:
          result.data?.message ||
          "Could not fetch VTUGATE data services.",
        vtugate: result.data,
      });
    }

    res.json(result.data);
  } catch (e) {
    console.error("VTUGATE services error:", e);

    res.status(500).json({
      status: false,
      message: "Could not connect to VTUGATE.",
    });
  }
});

// --------------------------------------------------
// FETCH DATA PLANS
// --------------------------------------------------
//
// Example:
// /api/vtugate/plans?service_id=137
//
// VTUGATE requires service_id.
// --------------------------------------------------

app.get("/api/vtugate/plans", async (req, res) => {
  try {
    const serviceId = Number(req.query.service_id);

    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return res.status(400).json({
        status: false,
        message: "A valid service_id is required.",
      });
    }

    const result = await vtugateRequest(
      "/api/v1/fetchdataplans",
      {
        service_id: String(serviceId),
      }
    );

    if (
      result.httpStatus < 200 ||
      result.httpStatus >= 300
    ) {
      return res.status(400).json({
        status: false,
        message:
          result.data?.message ||
          "Could not fetch data plans.",
        vtugate: result.data,
      });
    }

    res.json(result.data);
  } catch (e) {
    console.error("VTUGATE plans error:", e);

    res.status(500).json({
      status: false,
      message: "Could not fetch VTUGATE data plans.",
    });
  }
});

// --------------------------------------------------
// VTUGATE BUY DATA
// --------------------------------------------------
//
// Required by VTUGATE:
//
// service_id
// phone_number
// amount
// plan_code
// --------------------------------------------------

app.post("/api/vtugate/buydata", async (req, res) => {
  try {
    const {
      service_id,
      phone_number,
      amount,
      plan_code,
    } = req.body;

    const serviceId = Number(service_id);
    const numericAmount = Number(amount);

    if (
      !Number.isInteger(serviceId) ||
      serviceId <= 0
    ) {
      return res.status(400).json({
        status: false,
        message: "Invalid service_id.",
      });
    }

    if (!/^0\d{10}$/.test(String(phone_number))) {
      return res.status(400).json({
        status: false,
        message: "Invalid Nigerian phone number.",
      });
    }

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return res.status(400).json({
        status: false,
        message: "Invalid amount.",
      });
    }

    if (!plan_code) {
      return res.status(400).json({
        status: false,
        message: "plan_code is required.",
      });
    }

    const result = await vtugateRequest(
      "/api/v1/buydata",
      {
        service_id: String(serviceId),
        phone_number: String(phone_number),
        amount: String(numericAmount),
        plan_code: String(plan_code),
      }
    );

    if (
      result.httpStatus < 200 ||
      result.httpStatus >= 300
    ) {
      return res.status(400).json({
        status: false,
        message:
          result.data?.message ||
          "VTUGATE data purchase failed.",
        vtugate: result.data,
      });
    }

    res.json(result.data);
  } catch (e) {
    console.error("VTUGATE buy data error:", e);

    res.status(500).json({
      status: false,
      message: "Could not complete VTUGATE data purchase.",
    });
  }
});

// --------------------------------------------------
// PAYSTACK INITIALIZE
// --------------------------------------------------

app.post("/api/payment/initialize", async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        status: false,
        message:
          "PAYSTACK_SECRET_KEY is not configured.",
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
      !/^0\d{10}$/.test(String(phone))
    ) {
      return res.status(400).json({
        status: false,
        message:
          "Missing or invalid payment information.",
      });
    }

    const reference =
      `MDA-${Date.now()}-${crypto
        .randomBytes(4)
        .toString("hex")}`;

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${PAYSTACK_SECRET_KEY}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          email,

          amount: String(
            Math.round(Number(amount) * 100)
          ),

          currency: "NGN",

          reference,

          callback_url:
            `${BASE}/payment/callback`,

          metadata: {
            network,
            plan,
            productCode,
            phone,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      return res.status(400).json({
        status: false,
        message:
          data.message ||
          "Paystack initialization failed.",
      });
    }

    res.json({
      status: true,

      authorization_url:
        data.data.authorization_url,

      access_code:
        data.data.access_code,

      reference:
        data.data.reference,
    });
  } catch (e) {
    console.error("Paystack initialize error:", e);

    res.status(500).json({
      status: false,
      message: "Server error.",
    });
  }
});

// --------------------------------------------------
// PAYSTACK CALLBACK
// --------------------------------------------------

app.get("/payment/callback", async (req, res) => {
  try {
    const reference = req.query.reference;

    if (!reference || !PAYSTACK_SECRET_KEY) {
      return res.status(400).send(
        "Missing payment reference."
      );
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        headers: {
          Authorization:
            `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      return res.status(400).send(
        "Could not verify payment."
      );
    }

    if (data.data.status !== "success") {
      return res.status(400).send(`
        <h2>Payment not successful</h2>
        <p>Status: ${data.data.status}</p>
        <a href="/">Back to Noorsub</a>
      `);
    }

    res.send(`
      <html>
        <body
          style="
            font-family:Arial;
            text-align:center;
            padding:40px
          "
        >
          <h1>Payment Successful! ✅</h1>

          <p>
            Reference:
            ${reference}
          </p>

          <p>
            Paystack has verified the payment.
          </p>

          <p>
            <b>
              VTU delivery is not enabled yet.
            </b>
          </p>

          <a href="/">
            Back to Noorsub
          </a>
        </body>
      </html>
    `);
  } catch (e) {
    console.error("Paystack callback error:", e);

    res.status(500).send(
      "Verification error."
    );
  }
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `Noorsub backend running on port ${PORT}`
  );
});
