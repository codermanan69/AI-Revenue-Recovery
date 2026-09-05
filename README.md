# 🚀 AI Revenue Recovery Platform
> **Autonomous AI-Powered Payment Recovery Engine for Razorpay Merchants**

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-blue.svg)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-18.x-61dafb.svg)](https://reactjs.org/)
[![Razorpay](https://img.shields.io/badge/Razorpay-API_v1-0284c7.svg)](https://razorpay.com/)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-2.0_Flash-8b5cf6.svg)](https://deepmind.google/technologies/gemini/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Database-47a248.svg)](https://www.mongodb.com/)

---

## 📌 Problem Statement

In online e-commerce and SaaS subscriptions, **10% to 20% of initiated transactions fail** due to temporary bank server downtimes, card declines, expired OTPs, or insufficient account balances. 

When a payment fails:
- **Customers abandon checkout** without attempting again.
- **Merchants lose revenue** and customer acquisition costs are wasted.
- **Manual follow-up is unscalable** and legacy email blasts lack context and urgency.

---

##💡 Our Solution

The **AI Revenue Recovery Platform** is a closed-loop autonomous system built natively on **Razorpay** and **Google Gemini AI**. The platform monitors transaction health, diagnoses payment failure root causes, formulates optimal intervention strategies (`retry`, `reminder`, `stop`), and executes bounded recovery workflows via live Razorpay Payment Links and customer recovery communications.

```
┌─────────────────┐      ┌──────────────────┐      ┌──────────────────────┐      ┌─────────────────────────┐
│ Payment Failure │ ───> │ Gemini AI Engine │ ───> │ Razorpay PaymentLink │ ───> │  Customer Completes Pay │
│   on Razorpay   │      │ Diagnoses Reason │      │   + AI Recovery Msg  │      │  via https://rzp.io/... │
└─────────────────┘      └──────────────────┘      └──────────────────────┘      └─────────────────────────┘
                                                                                              │
                                                                                              ▼
                                                                                 ┌─────────────────────────┐
                                                                                 │  Status: RECOVERED      │
                                                                                 │  Revenue Stats Updated  │
                                                                                 └─────────────────────────┘
```

---

## ✨ Key Features

### 1. 💳 Native Razorpay Checkout & Verification
- **Razorpay Orders API**: Creates official Razorpay test orders (`/api/orders`) and initializes the standard Razorpay Checkout modal.
- **HMAC SHA-256 Signature Verification**: Validates successful transaction signatures on backend (`/api/payments/verify`) using secret key HMAC hashing.
- **Real-Time Failure Ingestion**: Catches client-side checkout cancellations and failed bank events (`payment.failed`).

### 2. 🧠 Gemini AI Decision Engine (`gemini-2.0-flash`)
- **Root Cause Diagnosis**: Analyzes raw bank failure messages, payment attempt counts, and transaction amounts.
- **Prioritized Business Logic Rules**:
  1. If `attempts >= 5` or repeated failure $\rightarrow$ **`stop`** (prevents customer annoyance).
  2. If `declined` & `attempts >= 2` $\rightarrow$ **`reminder`**.
  3. If bank/server technical downtime & `attempts <= 1` $\rightarrow$ **`retry`**.
  4. If `insufficient funds` $\rightarrow$ **`reminder`**.
- **Resilient Fallback**: Equipped with a 3.5-second `Promise.race` timeout guard. If AI services experience latency, the system seamlessly falls back to a deterministic rule-based engine (`services/recommendationEngine.js`).

### 3. 🔗 Razorpay Payment Link API Integration
- Automatically invokes `razorpay.paymentLink.create()` to generate live, shareable Razorpay payment URLs (`https://rzp.io/i/...`).
- **Link Reuse**: Prevents duplicate link generation by checking existing case records in MongoDB before issuing new Razorpay API requests.

### 4. ✉️ Personalized AI Customer Communications
- Uses Gemini AI to draft concise, polite 1–2 sentence recovery messages tailored specifically to the customer's payment failure reason and action type.
- Naturally embeds the live Razorpay Payment Link into the message body without exposing internal system codes or false discount promises.

### 5. 🔄 Real-Time Razorpay Status Verification & Webhooks
- **Live Status Verification API**: Includes `POST /api/recovery-cases/:id/verify-payment` calling `razorpay.paymentLink.fetch()`. Verifies whether a payment link was paid on Razorpay's live servers before updating case status to `recovered`.
- **Razorpay Webhook Handler**: Includes `POST /api/webhooks/razorpay` with raw-body HMAC SHA-256 signature verification and idempotency tracking (`lastWebhookEventId`).

### 6. 📜 Complete Audit Trail & Metrics Dashboard
- **Timestamped Action History**: Stores every intervention (`reminder`, `retry`, `stop`) as an immutable timeline array in MongoDB.
- **Real-Time Analytics**: Live header metrics calculating **Revenue at Risk**, **Recovered Revenue**, **Open Recovery Cases**, and overall **Recovery Rate %**.

---

## 🛠 Tech Stack

- **Frontend**: React 18, Vite, Google Fonts (*Plus Jakarta Sans* & *Space Grotesk*), Vanilla CSS with Dark Mode & Glassmorphic styling.
- **Backend**: Node.js, Express.js, Mongoose ODM, Razorpay Node SDK, `@google/genai` SDK, Crypto.
- **Database**: MongoDB.
- **Payment Gateway**: Razorpay (Orders API, Checkout SDK, Payment Links API, Webhooks).
- **AI Model**: Google Gemini 2.0 Flash (`gemini-2.0-flash`).

---

## 📁 Repository Structure

```
Ai-revenue-recovery/
├── Backend/
│   ├── models/
│   │   ├── Order.js           # Schema for Razorpay orders & status
│   │   └── RecoveryCase.js    # Schema for AI recommendations, payment links & audit history
│   ├── services/
│   │   └── recommendationEngine.js # Fallback rule-based recommendation engine
│   ├── server.js              # Express server, Razorpay setup & API routes
│   └── package.json
├── Frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx            # Main React Dashboard component
│   │   ├── App.css            # Dark mode glassmorphic stylesheet
│   │   └── main.jsx           # React entry point
│   ├── index.html             # HTML shell with Google Fonts & Razorpay Checkout script
│   └── package.json
└── README.md
```

---

## 🔌 API Endpoints Reference

| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/api/orders` | Creates a new order on Razorpay and persists it in MongoDB |
| `POST` | `/api/payments/verify` | Verifies HMAC SHA-256 signature for successful Razorpay payments |
| `POST` | `/api/payments/failed` | Processes failed payments, triggers Gemini AI recommendation, creates `RecoveryCase` |
| `GET` | `/api/recovery-cases` | Fetches all recovery cases from MongoDB |
| `POST` | `/api/recovery-cases/:id/action` | Triggers recovery action (`reminder`, `retry`, `stop`), generates Payment Link & AI message |
| `POST` | `/api/recovery-cases/:id/verify-payment` | Calls `razorpay.paymentLink.fetch()` to verify live payment link status |
| `GET` | `/api/dashboard/stats` | Calculates `revenueAtRisk`, `recoveredRevenue`, `openRecoveryCases`, and `recoveryRate` |
| `POST` | `/api/webhooks/razorpay` | Validates `x-razorpay-signature` and ingests `payment.captured` & `payment.failed` webhooks |

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB instance (local or MongoDB Atlas)
- Razorpay API Keys (Key ID & Key Secret from Razorpay Dashboard in Test Mode)
- Google Gemini API Key

---

### Installation & Setup

#### 1. Clone the Repository
```bash
git clone https://github.com/codermanan69/AI-Revenue-Recovery.git
cd AI-Revenue-Recovery
```

#### 2. Backend Setup
Navigate to the `Backend` folder and install dependencies:
```bash
cd Backend
npm install
```

Create a `.env` file inside the `Backend` directory:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/revenue-recovery
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
GEMINI_API_KEY=your_gemini_api_key
```

Start the backend server:
```bash
node server.js
```

#### 3. Frontend Setup
Open a new terminal, navigate to the `Frontend` folder, and install dependencies:
```bash
cd Frontend
npm install
```

Create a `.env` file inside the `Frontend` directory:
```env
VITE_RAZORPAY_KEY_ID=your_razorpay_key_id
```

Start the Vite development server:
```bash
npm run dev
```

Open your browser and navigate to `http://localhost:5173/`.

---

## 🧪 Demonstration & Testing Workflow

1. **Create Test Order (Live Razorpay Checkout)**:
   - Click **Create Test Order** to open the authentic Razorpay Checkout modal.
   - Enter test card credentials to complete a successful payment (verifies HMAC SHA-256 signature) or cancel the modal to trigger a live failure event.

2. **Simulate Failed Payment**:
   - Click **Simulate Failed Payment** to instantly inject a failed payment event (`Insufficient funds`).
   - Observe Gemini AI analyze the failure reason and display the **AI Recommendation** and **Why?** reasoning box.

3. **Execute AI Recovery Action**:
   - Click **Send Reminder** or **Retry Payment**.
   - Observe the button transition to `"Processing..."`. The system calls Razorpay's API to generate a live `https://rzp.io/i/...` payment link, drafts a personalized AI customer message, and logs an entry in **Action History**.

4. **Verify Payment Status**:
   - Open the generated Payment Link in a browser tab to complete payment on Razorpay.
   - Click **Verify Payment Status 🔄**. The backend queries Razorpay's live Payment Link API (`razorpay.paymentLink.fetch`), confirms payment completion, marks status as `Recovered`, and updates the dashboard revenue statistics!

---

## 🛡 Security & Compliance

- **Secret Protection**: Razorpay Secret Keys and Gemini API Keys are strictly kept environment-side and never exposed in client bundles or API payloads.
- **HMAC Verification**: Both checkout verification and webhook ingestion enforce HMAC SHA-256 cryptographic signature validation.
- **Idempotency**: Prevents duplicate payment links and ignores duplicate webhook event IDs (`lastWebhookEventId`).

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.

---

<p align="center">
  Developed for the <b>Razorpay Buildathon</b> | Powered by Razorpay & Google Gemini AI
</p>