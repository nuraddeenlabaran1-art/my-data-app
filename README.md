# My Data App
Frontend + Node/Express backend starter.

## Setup
1. Install Node.js 18+.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Put your Paystack TEST secret key in `.env`.
5. Run `npm start`.
6. Open http://localhost:3000.

The Paystack secret key must stay on the server. Before live data delivery, add a VTU provider account/API, a database/order record, and idempotent fulfillment. Do not claim data was delivered just because payment succeeded.
