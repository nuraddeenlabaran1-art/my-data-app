const API_BASE = "";

const plans = [
  ["500MB", 150, "500MB"],
  ["1GB", 300, "1GB"],
  ["2GB", 600, "2GB"],
  ["3GB", 900, "3GB"],
  ["5GB", 1500, "5GB"]
];

function hideAllSections() {
  document.getElementById("homeSection").style.display = "none";
  document.getElementById("dataSection").style.display = "none";
  document.getElementById("airtimeSection").style.display = "none";
  document.getElementById("billsSection").style.display = "none";
}

window.showHome = function () {
  hideAllSections();
  document.getElementById("homeSection").style.display = "block";
};

window.showData = function () {
  hideAllSections();

  const section = document.getElementById("dataSection");
  section.style.display = "block";

  section.innerHTML = `
    <button class="back-btn" onclick="showHome()">← Back</button>

    <h2>Select Network</h2>
    <p>Zaɓi network ɗinka:</p>

    <div class="network-buttons">
      <button onclick="showPlans('MTN')">MTN</button>
      <button onclick="showPlans('Airtel')">Airtel</button>
      <button onclick="showPlans('Glo')">Glo</button>
      <button onclick="showPlans('9mobile')">9mobile</button>
    </div>
  `;
};

window.showPlans = function (network) {
  const section = document.getElementById("dataSection");
  section.style.display = "block";

  let html = `
    <button class="back-btn" onclick="showData()">← Back</button>

    <h2>${network} Data Plans</h2>
    <p>Zaɓi data bundle:</p>

    <div class="plans">
  `;

  plans.forEach(plan => {
    html += `
      <button
        class="plan"
        onclick="enterNumber('${network}', '${plan[0]}', ${plan[1]}, '${plan[2]}')"
      >
        <strong>${plan[0]}</strong>
        <span>₦${plan[1].toLocaleString()}</span>
      </button>
    `;
  });

  html += `
    </div>
  `;

  section.innerHTML = html;
};

window.enterNumber = function (
  network,
  plan,
  amount,
  productCode
) {
  const section = document.getElementById("dataSection");
  section.style.display = "block";

  section.innerHTML = `
    <button class="back-btn" onclick="showPlans('${network}')">
      ← Back
    </button>

    <h2>${network} - ${plan}</h2>

    <p>Price: ₦${amount.toLocaleString()}</p>

    <div class="form-box">

      <label for="phoneNumber">
        Phone Number
      </label>

      <input
        id="phoneNumber"
        type="tel"
        inputmode="numeric"
        maxlength="11"
        placeholder="08012345678"
      >

      <label for="email">
        Email Address
      </label>

      <input
        id="email"
        type="email"
        placeholder="you@example.com"
      >

      <button
        class="pay-btn"
        onclick="startPayment('${network}', '${plan}', ${amount}, '${productCode}')"
      >
        💳 Pay ₦${amount.toLocaleString()} with Paystack
      </button>

    </div>
  `;
};

window.startPayment = async function (
  network,
  plan,
  amount,
  productCode
) {
  const phone =
    document.getElementById("phoneNumber").value.trim();

  const email =
    document.getElementById("email").value.trim();

  if (!/^0\d{10}$/.test(phone)) {
    alert("Please enter a valid 11-digit Nigerian phone number.");
    return;
  }

  if (!email.includes("@")) {
    alert("Please enter a valid email address.");
    return;
  }

  const section = document.getElementById("dataSection");

  section.innerHTML = `
    <p>Initializing secure payment...</p>
  `;

  try {
    const response = await fetch(
      API_BASE + "/api/payment/initialize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          amount,
          network,
          plan,
          productCode,
          phone
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      throw new Error(
        data.message || "Payment initialization failed."
      );
    }

    window.location.href = data.authorization_url;

  } catch (error) {
    section.innerHTML = `
      <p class="error">${error.message}</p>

      <button onclick="showData()">
        Try Again
      </button>
    `;
  }
};

window.showAirtime = function () {
  hideAllSections();

  const section =
    document.getElementById("airtimeSection");

  section.style.display = "block";
};

window.showBills = function () {
  hideAllSections();

  const section =
    document.getElementById("billsSection");

  section.style.display = "block";
};

console.log("Noorsub frontend is working!");
