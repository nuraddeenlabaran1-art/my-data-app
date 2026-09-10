// ===============================
// NOORSUB - LIVE VTUGATE FRONTEND
// ===============================

const API_BASE = "";

// Hide all sections
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

// Show Home
window.showHome = function () {
    hideAllSections();

    const home = document.getElementById("homeSection");

    if (home) {
        home.style.display = "block";
    }
};

// Show Data
window.showData = async function () {
    hideAllSections();

    const dataSection = document.getElementById("dataSection");

    if (dataSection) {
        dataSection.style.display = "block";
    }

    showNetworkButtons();
};

// Show network buttons
function showNetworkButtons() {
    const dataSection = document.getElementById("dataSection");

    if (!dataSection) return;

    dataSection.innerHTML = `
        <div style="padding:20px;">
            <h2>Buy Data</h2>
            <p>Select your network:</p>

            <div style="display:grid;gap:12px;">
                <button onclick="showPlans('MTN')">MTN</button>
                <button onclick="showPlans('AIRTEL')">Airtel</button>
                <button onclick="showPlans('GLO')">Glo</button>
                <button onclick="showPlans('9MOBILE')">9mobile</button>
            </div>
        </div>
    `;
}

// Find VTUGATE service
async function findService(network) {
    const response = await fetch(
        `${API_BASE}/api/vtugate/services`
    );

    const data = await response.json();

    if (!data.status || !Array.isArray(data.data)) {
        throw new Error(data.message || "Unable to load services");
    }

    const wanted = network.toLowerCase();

    const service = data.data.find(function (item) {
        const name = String(
            item.network_name ||
            item.network ||
            item.name ||
            ""
        ).toLowerCase();

        return name.includes(wanted);
    });

    if (!service) {
        throw new Error(`Network ${network} was not found.`);
    }

    return service;
}

// Show live plans
window.showPlans = async function (network) {
    const dataSection = document.getElementById("dataSection");

    if (!dataSection) return;

    dataSection.innerHTML = `
        <div style="padding:20px;">
            <h2>${network} Data Plans</h2>
            <p>Loading live plans...</p>
        </div>
    `;

    try {
        const service = await findService(network);

        const serviceId =
            service.service_id ||
            service.id;

        if (!serviceId) {
            throw new Error("Service ID not found.");
        }

        const response = await fetch(
            `${API_BASE}/api/vtugate/plans?service_id=${encodeURIComponent(serviceId)}`
        );

        const data = await response.json();

        if (!data.status || !Array.isArray(data.plans)) {
            throw new Error(
                data.message || "Unable to load data plans."
            );
        }

        if (data.plans.length === 0) {
            throw new Error("No data plans available.");
        }

        let html = `
            <div style="padding:20px;">
                <button onclick="showData()">← Back</button>

                <h2>${network} Data</h2>
                <p>Choose a plan:</p>

                <div style="display:grid;gap:12px;">
        `;

        data.plans.forEach(function (plan) {
            const planCode =
                plan.code ||
                plan.plan_code ||
                plan.product_code ||
                "";

            const price = Number(
                plan.price ||
                plan.amount ||
                0
            );

            const name =
                plan.name ||
                plan.plan_name ||
                plan.description ||
                "Data Plan";

            const size =
                plan.size ||
                plan.data_size ||
                "";

            const validity =
                plan.validity ||
                "";

            html += `
                <button
                    style="
                        padding:15px;
                        text-align:left;
                        border-radius:10px;
                        border:1px solid #ddd;
                        background:white;
                    "
                    onclick='enterNumber(${JSON.stringify({
                        network: network,
                        serviceId: serviceId,
                        planCode: planCode,
                        amount: price,
                        planName: name
                    })})'
                >
                    <strong>${escapeHtml(name)}</strong><br>
                    <span>₦${price.toLocaleString()}</span>
                    ${size ? `<br><small>${escapeHtml(String(size))}</small>` : ""}
                    ${validity ? `<small> • ${escapeHtml(String(validity))}</small>` : ""}
                </button>
            `;
        });

        html += `
                </div>
            </div>
        `;

        dataSection.innerHTML = html;

    } catch (error) {
        dataSection.innerHTML = `
            <div style="padding:20px;">
                <button onclick="showData()">← Back</button>

                <h2>Something went wrong</h2>

                <p>${escapeHtml(error.message)}</p>

                <button onclick="showPlans('${escapeHtml(network)}')">
                    Try Again
                </button>
            </div>
        `;
    }
};

// Enter phone number
window.enterNumber = function (plan) {
    const dataSection = document.getElementById("dataSection");

    if (!dataSection) return;

    dataSection.innerHTML = `
        <div style="padding:20px;">
            <button onclick="showPlans('${escapeHtml(plan.network)}')">
                ← Back
            </button>

            <h2>${escapeHtml(plan.planName)}</h2>

            <p>
                Price:
                <strong>₦${Number(plan.amount).toLocaleString()}</strong>
            </p>

            <label>Phone Number</label>

            <input
                id="phoneNumber"
                type="tel"
                placeholder="08012345678"
                maxlength="11"
                style="
                    width:100%;
                    padding:12px;
                    margin:8px 0 15px;
                    box-sizing:border-box;
                "
            >

            <label>Email</label>

            <input
                id="customerEmail"
                type="email"
                placeholder="you@example.com"
                style="
                    width:100%;
                    padding:12px;
                    margin:8px 0 15px;
                    box-sizing:border-box;
                "
            >

            <button
                onclick='startPayment(${JSON.stringify(plan)})'
                style="
                    width:100%;
                    padding:14px;
                    border:0;
                    border-radius:8px;
                "
            >
                Pay ₦${Number(plan.amount).toLocaleString()}
            </button>
        </div>
    `;
};

// Start Paystack payment
window.startPayment = async function (plan) {
    const phoneInput = document.getElementById("phoneNumber");
    const emailInput = document.getElementById("customerEmail");

    const phone = phoneInput ? phoneInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";

    if (!/^0\d{10}$/.test(phone)) {
        alert("Please enter a valid 11-digit Nigerian phone number.");
        return;
    }

    if (!email || !email.includes("@")) {
        alert("Please enter a valid email address.");
        return;
    }

    try {
        const button = document.querySelector(
            "#dataSection button:last-child"
        );

        if (button) {
            button.disabled = true;
            button.textContent = "Opening payment...";
        }

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

        const data = await response.json();

        if (!response.ok || !data.status) {
            throw new Error(
                data.message || "Unable to initialize payment."
            );
        }

        if (!data.authorization_url) {
            throw new Error("Paystack payment link was not returned.");
        }

        window.location.href = data.authorization_url;

    } catch (error) {
        alert(error.message);

        const button = document.querySelector(
            "#dataSection button:last-child"
        );

        if (button) {
            button.disabled = false;
            button.textContent =
                `Pay ₦${Number(plan.amount).toLocaleString()}`;
        }
    }
};

// Airtime placeholder
window.showAirtime = function () {
    hideAllSections();

    const section = document.getElementById("airtimeSection");

    if (section) {
        section.style.display = "block";
        section.innerHTML = `
            <div style="padding:20px;">
                <h2>Buy Airtime</h2>
                <p>Airtime service is coming soon.</p>
                <button onclick="showHome()">← Home</button>
            </div>
        `;
    }
};

// Bills placeholder
window.showBills = function () {
    hideAllSections();

    const section = document.getElementById("billsSection");

    if (section) {
        section.style.display = "block";
        section.innerHTML = `
            <div style="padding:20px;">
                <h2>Pay Bills</h2>
                <p>Bills service is coming soon.</p>
                <button onclick="showHome()">← Home</button>
            </div>
        `;
    }
};

// Escape HTML
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Start on Home
document.addEventListener("DOMContentLoaded", function () {
    showHome();

    console.log("Noorsub frontend is working!");
});
