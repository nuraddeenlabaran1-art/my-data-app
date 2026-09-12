// ===============================
// NOORSUB - LIVE VTUGATE FRONTEND
// ===============================

const API_BASE = "";

// -------------------------------
// Helpers
// -------------------------------

function hideAllSections() {
  const sections = [
    "homeSection",
    "dataSection",
    "airtimeSection",
    "billsSection"
  ];

  sections.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = "none";
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// -------------------------------
// HOME
// -------------------------------

window.showHome = function () {
  hideAllSections();

  const home = document.getElementById("homeSection");

  if (home) {
    home.style.display = "block";
  }
};

// -------------------------------
// DATA
// -------------------------------

window.showData = function () {
  hideAllSections();

  const dataSection = document.getElementById("dataSection");

  if (dataSection) {
    dataSection.style.display = "block";

    dataSection.innerHTML = `
      <div style="padding:20px;">
        <h2>Buy Data</h2>
        <p>Select your network:</p>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button onclick="showPlans('mtn')">MTN</button>
          <button onclick="showPlans('airtel')">Airtel</button>
          <button onclick="showPlans('glo')">Glo</button>
          <button onclick="showPlans('9mobile')">9mobile</button>
        </div>

        <div id="plansArea" style="margin-top:20px;"></div>
      </div>
    `;
  }
};

// -------------------------------
// FIND VTUGATE SERVICE
// -------------------------------

async function findService(network) {
  const response = await fetch(
    `${API_BASE}/api/vtugate/services`
  );

  const result = await response.json();

  if (!result.status) {
    throw new Error(
      result.message || "Unable to load services"
    );
  }

  // IMPORTANT:
  // VTUGATE returns services inside result.data
  const services =
    Array.isArray(result.services)
      ? result.services
      : Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.data?.services)
          ? result.data.services
          : [];

  if (!services.length) {
    throw new Error("No services found");
  }

  const wanted = String(network).toLowerCase();

  const service = services.find(function (item) {
    const name = String(
      item.network_name ||
      item.network ||
      item.name ||
      ""
    ).toLowerCase();

    return name.includes(wanted);
  });

  if (!service) {
    throw new Error(
      `No ${network} service found`
    );
  }

  return service;
}

// -------------------------------
// SHOW PLANS
// -------------------------------

window.showPlans = async function (network) {
  const plansArea = document.getElementById("plansArea");

  if (!plansArea) {
    return;
  }

  plansArea.innerHTML = `
    <p>Loading ${escapeHtml(network)} plans...</p>
  `;

  try {
    const service = await findService(network);

    const serviceId = service.service_id;

    if (!serviceId) {
      throw new Error(
        "Service ID not found"
      );
    }

    const response = await fetch(
      `${API_BASE}/api/vtugate/plans?service_id=${encodeURIComponent(serviceId)}`
    );

    const result = await response.json();

    if (!result.status) {
      throw new Error(
        result.message || "Unable to load plans"
      );
    }

    // Support both possible response shapes
    const plans =
      Array.isArray(result.plans)
        ? result.plans
        : Array.isArray(result.data)
          ? result.data
          : Array.isArray(result.data?.plans)
            ? result.data.plans
            : [];

    if (!plans.length) {
      plansArea.innerHTML = `
        <p>No data plans available for ${escapeHtml(network)}.</p>
      `;
      return;
    }

    let html = `
      <h3>${escapeHtml(network.toUpperCase())} Data Plans</h3>
      <div style="display:flex;flex-direction:column;gap:10px;">
    `;

    plans.forEach(function (plan) {
      const code =
        plan.plan_code ||
        plan.code ||
        "";

      const name =
        plan.plan_name ||
        plan.name ||
        `${plan.size || ""} ${plan.validity || ""}`;

      const price =
        Number(
          plan.price ||
          plan.amount ||
          0
        );

      html += `
        <button
          type="button"
          onclick='enterNumber(${JSON.stringify({
            network: network,
            serviceId: serviceId,
            planCode: code,
            name: name,
            amount: price
          })})'
          style="
            padding:14px;
            margin:4px 0;
            text-align:left;
            cursor:pointer;
          "
        >
          <strong>${escapeHtml(name)}</strong>
          <br>
          ₦${price.toLocaleString()}
        </button>
      `;
    });

    html += `</div>`;

    plansArea.innerHTML = html;

  } catch (error) {
    console.error("VTUGATE plans error:", error);

    plansArea.innerHTML = `
      <div style="padding:15px;">
        <h3>Something went wrong</h3>
        <p>${escapeHtml(error.message)}</p>

        <button
          type="button"
          onclick="showPlans('${escapeHtml(network)}')"
        >
          Try Again
        </button>
      </div>
    `;
  }
};

// -------------------------------
// ENTER PHONE NUMBER
// -------------------------------

window.enterNumber = function (plan) {
  const plansArea =
    document.getElementById("plansArea");

  if (!plansArea) {
    return;
  }

  plansArea.innerHTML = `
    <div style="padding:20px;">

      <button
        type="button"
        onclick="showPlans('${escapeHtml(plan.network)}')"
      >
        ← Back to Plans
      </button>

      <h3>${escapeHtml(plan.name)}</h3>

      <p>
        Amount:
        <strong>
          ₦${Number(plan.amount).toLocaleString()}
        </strong>
      </p>

      <label>
        Phone Number
      </label>

      <input
        id="phoneNumber"
        type="tel"
        inputmode="numeric"
        placeholder="08012345678"
        maxlength="11"
        style="
          display:block;
          width:100%;
          padding:12px;
          margin:8px 0 15px;
          box-sizing:border-box;
        "
      />

      <label>
        Email
      </label>

      <input
        id="emailAddress"
        type="email"
        placeholder="you@example.com"
        style="
          display:block;
          width:100%;
          padding:12px;
          margin:8px 0 15px;
          box-sizing:border-box;
        "
      />

      <button
        type="button"
        onclick='startPayment(${JSON.stringify(plan)})'
        style="
          padding:14px 20px;
          cursor:pointer;
        "
      >
        Pay ₦${Number(plan.amount).toLocaleString()}
      </button>

      <div id="paymentMessage" style="margin-top:15px;"></div>

    </div>
  `;
};

// -------------------------------
// START PAYSTACK PAYMENT
// -------------------------------

window.startPayment = async function (plan) {
  const phoneInput =
    document.getElementById("phoneNumber");

  const emailInput =
    document.getElementById("emailAddress");

  const message =
    document.getElementById("paymentMessage");

  if (!phoneInput || !emailInput) {
    return;
  }

  const phone =
    phoneInput.value.trim();

  const email =
    emailInput.value.trim();

  if (!/^0\d{10}$/.test(phone)) {
    if (message) {
      message.innerHTML = `
        <p>
          Please enter a valid Nigerian phone number.
        </p>
      `;
    }

    return;
  }

  if (!email || !email.includes("@")) {
    if (message) {
      message.innerHTML = `
        <p>
          Please enter a valid email address.
        </p>
      `;
    }

    return;
  }

  if (message) {
    message.innerHTML = `
      <p>Connecting to Paystack...</p>
    `;
  }

  try {
    const response = await fetch(
      `${API_BASE}/api/payment/initialize`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          network: plan.network,
          serviceId: plan.serviceId,
          planCode: plan.planCode,
          phone: phone,
          email: email,
          amount: Number(plan.amount)
        })
      }
    );

    const result =
      await response.json();

    if (!response.ok || !result.status) {
      throw new Error(
        result.message ||
        "Payment initialization failed"
      );
    }

    if (!result.authorization_url) {
      throw new Error(
        "Paystack authorization URL was not returned"
      );
    }

    window.location.href =
      result.authorization_url;

  } catch (error) {
    console.error(
      "Payment error:",
      error
    );

    if (message) {
      message.innerHTML = `
        <p>
          ${escapeHtml(error.message)}
        </p>
      `;
    }
  }
};

// -------------------------------
// AIRTIME
// -------------------------------

window.showAirtime = function () {
  hideAllSections();

  const section =
    document.getElementById("airtimeSection");

  if (section) {
    section.style.display = "block";
  }
};

// -------------------------------
// BILLS
// -------------------------------

window.showBills = function () {
  hideAllSections();

  const section =
    document.getElementById("billsSection");

  if (section) {
    section.style.display = "block";
  }
};

// -------------------------------
// PAGE LOAD
// -------------------------------

document.addEventListener(
  "DOMContentLoaded",
  function () {
    showHome();
  }
);

console.log(
  "Noorsub frontend is working!"
);
