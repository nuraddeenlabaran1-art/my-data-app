require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY;

const VTUGATE_API_KEY =
  process.env.VTUGATE_API_KEY;

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  `http://localhost:${PORT}`;

const VTUGATE_BASE_URL =
  "https://api.vtugate.com";

// Temporary order storage.
// This is okay for sandbox testing.
// Production should use a real database.
const orders = new Map();

/* =========================================================
   VTUGATE HELPERS
========================================================= */

async function vtugateRequest(endpoint, params = {}) {
  if (!VTUGATE_API_KEY) {
    throw new Error(
      "VTUGATE_API_KEY is not configured."
    );
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

      body: new URLSearchParams(
        Object.entries(params).reduce(
          (out, [key, value]) => {
            if (
              value !== undefined &&
              value !== null
            ) {
              out[key] = String(value);
            }

            return out;
          },
          {}
        )
      ),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
        `VTUGATE HTTP ${response.status}`
    );
  }

  return data;
}


/* =========================================================
   FIND VTUGATE SERVICE FOR NETWORK
========================================================= */

async function getDataService(network) {
  const result = await vtugateRequest(
    "/api/v1/fetchservices",
    {
      service_type: "data",
    }
  );

  if (
    !result.status ||
    !Array.isArray(result.data)
  ) {
    throw new Error(
      "VTUGATE did not return data services."
    );
  }

  const wanted = String(network)
    .trim()
    .toLowerCase();

  const service = result.data.find(
    (item) =>
      String(item.network_name || "")
        .trim()
        .toLowerCase() === wanted
  );

  if (!service) {
    throw new Error(
      `No VTUGATE data service found for ${network}.`
    );
  }

  return service;
}


/* =========================================================
   FIND PLAN
========================================================= */

async function getDataPlan(
  serviceId,
  planCode
) {
  const result = await vtugateRequest(
    "/api/v1/fetchdataplans",
    {
      service_id: serviceId,
    }
  );

  if (
    !result.status ||
    !result.data ||
    !Array.isArray(result.data.data_plans)
  ) {
    throw new Error(
      "VTUGATE did not return data plans."
    );
  }

  const plan = result.data.data_plans.find(
    (item) =>
      String(item.code) ===
      String(planCode)
  );

  if (!plan) {
    throw new Error(
      `Data plan ${planCode} was not found.`
    );
  }

  return plan;
}


/* =========================================================
   BUY DATA FROM VTUGATE
========================================================= */

async function buyData({
  serviceId,
  phone,
  amount,
  planCode,
}) {
  return await vtugateRequest(
    "/api/v1/buydata",
    {
      service_id: serviceId,
      phone_number: phone,
      amount: amount,
      plan_code: planCode,
    }
  );
}


/* =========================================================
   PAYSTACK HELPERS
========================================================= */

async function verifyPaystack(reference) {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured."
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
    throw new Error(
      data.message ||
        "Paystack verification failed."
    );
  }

  return data.data;
}


/* =========================================================
   FULFILL ORDER
========================================================= */

async function fulfillOrder(reference) {
  const order = orders.get(reference);

  if (!order) {
    throw new Error(
      "Order was not found."
    );
  }

  // Prevent duplicate VTUGATE purchases.
  if (
    order.status === "fulfilled" ||
    order.status === "processing"
  ) {
    return order;
  }

  order.status = "processing";
  orders.set(reference, order);

  try {
    /* -----------------------------------------
       1. Verify Paystack
    ----------------------------------------- */

    const payment =
      await verifyPaystack(reference);

    if (payment.status !== "success") {
      throw new Error(
        `Payment status is ${payment.status}.`
      );
    }

    /* -----------------------------------------
       2. Verify amount
       Paystack amount is in kobo.
    ----------------------------------------- */

    const paidAmount =
      Number(payment.amount);

    const expectedAmount =
      Math.round(
        Number(order.amount) * 100
      );

    if (paidAmount !== expectedAmount) {
      throw new Error(
        "Payment amount does not match order amount."
      );
    }

    /* -----------------------------------------
       3. Find VTUGATE service
    ----------------------------------------- */

    const service =
      await getDataService(order.network);

    /* -----------------------------------------
       4. Find plan
    ----------------------------------------- */

    const plan =
      await getDataPlan(
        service.service_id,
        order.productCode
      );

    /* -----------------------------------------
       5. Verify plan price
    ----------------------------------------- */

    const planPrice =
      Number(plan.price);

    const orderAmount =
      Number(order.amount);

    if (
      Number.isFinite(planPrice) &&
      planPrice !== orderAmount
    ) {
      throw new Error(
        `Plan price mismatch. VTUGATE price is ${planPrice}, order price is ${orderAmount}.`
      );
    }

    /* -----------------------------------------
       6. Buy data
    ----------------------------------------- */

    const vtu =
      await buyData({
        serviceId: service.service_id,
        phone: order.phone,
        amount: order.amount,
        planCode: order.productCode,
      });

    order.payment = {
      status: payment.status,
      reference:
        payment.reference,
      amount:
        payment.amount,
      paidAt:
        payment.paid_at,
    };

    order.vtugate = vtu;

    /* -----------------------------------------
       7. Determine final state
    ----------------------------------------- */

    if (
      vtu.status === true &&
      vtu.data &&
      vtu.data.provider_status === true
    ) {
      order.status = "fulfilled";
    } else {
      order.status = "pending";
    }

    orders.set(reference, order);

    return order;
  } catch (error) {
    console.error(
      "FULFILLMENT ERROR:",
      error
    );

    order.status = "failed";
    order.error = error.message;

    orders.set(reference, order);

    throw error;
  }
}


/* =========================================================
   PAYSTACK WEBHOOK
========================================================= */

app.post(
  "/api/paystack/webhook",

  express.raw({
    type: "application/json",
  }),

  async (req, res) => {
    try {
      const signature =
        req.headers[
          "x-paystack-signature"
        ];

      if (
        !PAYSTACK_SECRET_KEY ||
        !signature
      ) {
        return res.sendStatus(401);
      }

      const hash =
        crypto
          .createHmac(
            "sha512",
            PAYSTACK_SECRET_KEY
          )
          .update(req.body)
          .digest("hex");

      if (hash !== signature) {
        return res.sendStatus(401);
      }

      const event =
        JSON.parse(
          req.body.toString()
        );

      console.log(
        "Paystack webhook:",
        event.event
      );

      if (
        event.event ===
        "charge.success"
      ) {
        const reference =
          event.data &&
          event.data.reference;

        if (
          reference &&
          orders.has(reference)
        ) {
          try {
            await fulfillOrder(
              reference
            );
          } catch (error) {
            console.error(
              "Webhook fulfillment error:",
              error.message
            );
          }
        }
      }

      return res.sendStatus(200);
    } catch (error) {
      console.error(
        "Webhook error:",
        error
      );

      return res.sendStatus(500);
    }
  }
);


/* =========================================================
   JSON MIDDLEWARE
========================================================= */

app.use(
  express.json()
);


/* =========================================================
   STATIC WEBSITE
========================================================= */

app.use(
  express.static(
    path.join(__dirname)
  )
);


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      status: true,
      message:
        "Backend is working",
    });
  }
);


/* =========================================================
   VTUGATE STATUS
========================================================= */

app.get(
  "/api/vtugate/status",
  (req, res) => {
    const configured =
      Boolean(
        process.env.VTUGATE_API_KEY
      );

    res.json({
      status: configured,

      message: configured
        ? "VTUGATE API key is configured."
        : "VTUGATE API key is not configured.",
    });
  }
);


/* =========================================================
   TEST VTUGATE DATA SERVICES
========================================================= */

app.get(
  "/api/vtugate/services",
  async (req, res) => {
    try {
      const result =
        await vtugateRequest(
          "/api/v1/fetchservices",
          {
            service_type: "data",
          }
        );

      res.json(result);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        status: false,
        message: error.message,
      });
    }
  }
);


/* =========================================================
   FETCH DATA PLANS
========================================================= */

app.get(
  "/api/vtugate/plans",
  async (req, res) => {
    try {
      const serviceId =
        Number(
          req.query.service_id
        );

      if (!serviceId) {
        return res.status(400).json({
          status: false,
          message:
            "service_id is required.",
        });
      }

      const result =
        await vtugateRequest(
          "/api/v1/fetchdataplans",
          {
            service_id: serviceId,
          }
        );

      res.json(result);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        status: false,
        message: error.message,
      });
    }
  }
);


/* =========================================================
   PAYSTACK PAYMENT INITIALIZATION
========================================================= */

app.post(
  "/api/payment/initialize",
  async (req, res) => {
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

      /* -----------------------------------------
         Validate input
      ----------------------------------------- */

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
          message:
            "Missing or invalid payment information.",
        });
      }

      const numericAmount =
        Number(amount);

      if (
        !Number.isFinite(
          numericAmount
        ) ||
        numericAmount <= 0
      ) {
        return res.status(400).json({
          status: false,
          message:
            "Invalid amount.",
        });
      }

      /* -----------------------------------------
         Create unique reference
      ----------------------------------------- */

      const reference =
        `MDA-${Date.now()}-${crypto
          .randomBytes(4)
          .toString("hex")}`;

      /* -----------------------------------------
         Save pending order
      ----------------------------------------- */

      orders.set(
        reference,
        {
          reference,

          email,

          amount:
            numericAmount,

          network,

          plan,

          productCode,

          phone,

          status:
            "pending_payment",

          createdAt:
            new Date().toISOString(),
        }
      );

      /* -----------------------------------------
         Initialize Paystack
      ----------------------------------------- */

      const response =
        await fetch(
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

              amount:
                String(
                  Math.round(
                    numericAmount *
                    100
                  )
                ),

              currency: "NGN",

              reference,

              callback_url:
                `${PUBLIC_BASE_URL}/payment/callback`,

              metadata: {
                network,
                plan,
                productCode,
                phone,
              },
            }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.status
      ) {
        orders.delete(
          reference
        );

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
    } catch (error) {
      console.error(error);

      res.status(500).json({
        status: false,
        message:
          "Server error.",
      });
    }
  }
);


/* =========================================================
   PAYSTACK CALLBACK
========================================================= */

app.get(
  "/payment/callback",
  async (req, res) => {
    const reference =
      req.query.reference;

    if (!reference) {
      return res.status(400).send(
        `
        <html>
          <body style="font-family:Arial;text-align:center;padding:40px">
            <h2>Missing payment reference</h2>
            <a href="/">Back to Noorsub</a>
          </body>
        </html>
        `
      );
    }

    try {
      const order =
        orders.get(reference);

      if (!order) {
        return res.status(404).send(
          `
          <html>
            <body style="font-family:Arial;text-align:center;padding:40px">
              <h2>Order not found</h2>
              <p>Reference: ${reference}</p>
              <a href="/">Back to Noorsub</a>
            </body>
          </html>
          `
        );
      }

      /* -----------------------------------------
         Fulfill after verified payment
      ----------------------------------------- */

      const completedOrder =
        await fulfillOrder(
          reference
        );

      /* -----------------------------------------
         Successful VTUGATE delivery
      ----------------------------------------- */

      if (
        completedOrder.status ===
        "fulfilled"
      ) {
        const transactionId =
          completedOrder.vtugate &&
          completedOrder.vtugate.data &&
          completedOrder.vtugate.data
            .transaction_id;

        return res.send(
          `
          <html>
            <body style="font-family:Arial;text-align:center;padding:40px">

              <h1>Data Purchase Successful! ✅</h1>

              <p>
                Your Paystack payment has been verified.
              </p>

              <p>
                Network:
                <b>${order.network}</b>
              </p>

              <p>
                Phone:
                <b>${order.phone}</b>
              </p>

              <p>
                Plan:
                <b>${order.plan}</b>
              </p>

              ${
                transactionId
                  ? `
                    <p>
                      VTUGATE Transaction:
                      <b>${transactionId}</b>
                    </p>
                  `
                  : ""
              }

              <p>
                Your data request was sent successfully.
              </p>

              <a href="/">
                Back to Noorsub
              </a>

            </body>
          </html>
          `
        );
      }

      /* -----------------------------------------
         Pending
      ----------------------------------------- */

      if (
        completedOrder.status ===
        "pending"
      ) {
        return res.send(
          `
          <html>
            <body style="font-family:Arial;text-align:center;padding:40px">

              <h1>Payment Successful ✅</h1>

              <p>
                Paystack payment was verified.
              </p>

              <p>
                VTUGATE is still processing the data request.
              </p>

              <p>
                Reference:
                <b>${reference}</b>
              </p>

              <a href="/">
                Back to Noorsub
              </a>

            </body>
          </html>
          `
        );
      }

      throw new Error(
        "Unexpected order status."
      );
    } catch (error) {
      console.error(
        "Payment callback error:",
        error
      );

      return res.status(500).send(
        `
        <html>
          <body style="font-family:Arial;text-align:center;padding:40px">

            <h2>Payment verified, but data delivery failed</h2>

            <p>
              Please do not pay again.
            </p>

            <p>
              Reference:
              <b>${reference}</b>
            </p>

            <a href="/">
              Back to Noorsub
            </a>

          </body>
        </html>
        `
      );
    }
  }
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  () => {
    console.log(
      `Noorsub backend running on port ${PORT}`
    );
  }
);
