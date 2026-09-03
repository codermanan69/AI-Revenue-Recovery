const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { GoogleGenAI } = require("@google/genai");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const Order = require("./models/Order.js");
const RecoveryCase = require("./models/RecoveryCase.js");

const { getRecommendation } = require("./services/recommendationEngine.js");

require("dotenv").config();

const app = express();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


// ====================
// MIDDLEWARE
// ====================

app.use(cors());
app.use(express.json());


// ====================
// YAHAN AI FUNCTION PASTE KARNA HAI
// ====================

async function getAIRecommendation(amount, failureReason, attempts) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",

      contents: `
You are an AI payment recovery decision engine.

Analyze this failed payment and decide the best recovery action.

Payment amount: ${amount / 100} INR
Failure reason: ${failureReason}
Attempts: ${attempts}

Choose ONLY one action:
retry
reminder
stop

Rules:
- retry = payment has a reasonable chance of succeeding if attempted again
- reminder = customer should be reminded to complete the payment
- stop = repeated failures or very low chance of recovery

Return the response EXACTLY in this format:

ACTION | REASON

Example:
reminder | Customer has already attempted the payment multiple times, so a reminder is better than another immediate retry.
`
    });

    const result = response.text.trim();

    const parts = result.split("|");

    const action = parts[0]?.trim().toLowerCase();
    const reason = parts.slice(1).join("|").trim();

    if (
      action !== "retry" &&
      action !== "reminder" &&
      action !== "stop"
    ) {
      return {
        action: "reminder",
        reason: "Customer should be reminded to complete the payment."
      };
    }

    return {
      action,
      reason: reason || "AI selected this recovery action based on the payment details."
    };

  } catch (error) {
    console.error("Gemini recommendation failed:", error);

    const fallbackAction = getRecommendation(failureReason);

    return {
      action: fallbackAction,
      reason: "AI was unavailable, so the fallback recovery rule was used."
    };
  }
}

// ====================
// RAZORPAY SETUP
// ====================

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});


// ====================
// MONGODB CONNECTION
// ====================

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((error) => {
    console.log("MongoDB connection error:", error);
  });


// ====================
// HOME ROUTE
// ====================

app.get("/", (req, res) => {
  res.send("Revenue Recovery Backend is running");
});


// ====================
// CREATE RAZORPAY ORDER
// ====================

app.post("/api/orders", async (req, res) => {
  try {
    const options = {
      amount: 300000,
      currency: "INR",
      receipt: "test_receipt_001"
    };

    // Razorpay par order create
    const order = await razorpay.orders.create(options);

    // MongoDB mein order save
    const savedOrder = await Order.create({
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status
    });

    console.log("Order saved in MongoDB:", savedOrder);

    res.json(order);

  } catch (error) {
    console.error("Order creation failed:", error);

    res.status(500).json({
      error: "Order creation failed"
    });
  }
});

// ====================
// VERIFY RAZORPAY PAYMENT
// ====================

// ====================
// VERIFY RAZORPAY PAYMENT
// ====================

app.post("/api/payments/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const body =
      razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {

      const updatedOrder = await Order.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          razorpayPaymentId: razorpay_payment_id,
          paymentStatus: "paid",
          status: "paid"
        },
        { new: true }
      );

      return res.json({
        success: true,
        message: "Payment verified successfully",
        order: updatedOrder
      });
    }

    return res.status(400).json({
      success: false,
      message: "Payment verification failed"
    });

  } catch (error) {
    console.error("Payment verification error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  }
});

// ====================
// CREATE RECOVERY CASE
// ====================


app.post("/api/recovery-cases", async (req, res) => {
  try {

    const { amount, failureReason, attempts } = req.body;

    const aiRecommendation = getRecommendation(failureReason);

    const recoveryCase = await RecoveryCase.create({
      amount,
      failureReason,
      attempts: attempts || 1,
      aiRecommendation
    });

    console.log("Recovery case created:", recoveryCase);

    res.json(recoveryCase);

  } catch (error) {

    console.error("Recovery case creation failed:", error);

    res.status(500).json({
      error: "Recovery case creation failed"
    });

  }
});


app.post("/api/payments/failed", async (req, res) => {
  try {
    const { amount, failureReason, attempts } = req.body;

    const aiRecommendation = await getAIRecommendation(
  amount,
  failureReason,
  attempts
);

const recommendationText =
  `${aiRecommendation.action} | ${aiRecommendation.reason}`;

const recoveryCase = await RecoveryCase.create({
  amount,
  failureReason,
  attempts: attempts || 1,
  aiRecommendation: aiRecommendation.action,
  aiReason: aiRecommendation.reason
});

    console.log("Failed payment recovery case:", recoveryCase);

    res.json(recoveryCase);

  } catch (error) {
    console.error("Failed payment recovery case:", error);

    res.status(500).json({
      error: "Failed payment recovery case creation failed"
    });
  }
});

// ====================
// GET RECOVERY CASES
// ====================

app.get("/api/recovery-cases", async (req, res) => {
  try {
    const recoveryCases = await RecoveryCase.find();

    res.json(recoveryCases);

  } catch (error) {
    console.error("Failed to fetch recovery cases:", error);

    res.status(500).json({
      error: "Failed to fetch recovery cases"
    });
  }
});

// ====================
// DASHBOARD STATS
// ====================

app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const recoveryCases = await RecoveryCase.find();

    const totalCases = recoveryCases.length;

    const revenueAtRisk = recoveryCases
      .filter((item) => item.recoveryStatus === "pending")
      .reduce((total, item) => total + item.amount, 0);

    const recoveredRevenue = recoveryCases
      .filter((item) => item.recoveryStatus === "recovered")
      .reduce((total, item) => total + item.amount, 0);

    const openRecoveryCases = recoveryCases.filter(
      (item) => item.recoveryStatus === "pending"
    ).length;

    const recoveredCases = recoveryCases.filter(
      (item) => item.recoveryStatus === "recovered"
    ).length;

    const recoveryRate =
      totalCases === 0
        ? 0
        : Math.round((recoveredCases / totalCases) * 100);

    res.json({
      revenueAtRisk,
      recoveredRevenue,
      openRecoveryCases,
      recoveryRate
    });

  } catch (error) {
    console.error("Failed to fetch dashboard stats:", error);

    res.status(500).json({
      error: "Failed to fetch dashboard stats"
    });
  }
});

app.patch("/api/recovery-cases/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = ["pending", "recovered", "failed"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid recovery status"
      });
    }

    const updatedCase = await RecoveryCase.findByIdAndUpdate(
      req.params.id,
      { recoveryStatus: status },
      { new: true }
    );

    if (!updatedCase) {
      return res.status(404).json({
        error: "Recovery case not found"
      });
    }

    res.json(updatedCase);
  } catch (error) {
    console.error("Failed to update recovery case:", error);

    res.status(500).json({
      error: "Failed to update recovery case"
    });
  }
});

app.post("/api/recovery-cases/:id/action", async (req, res) => {
  try {
    const { action } = req.body;

    const allowedActions = ["retry", "reminder", "stop"];

    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        error: "Invalid recovery action"
      });
    }

    const recoveryCase = await RecoveryCase.findById(
      req.params.id
    );

    if (!recoveryCase) {
      return res.status(404).json({
        error: "Recovery case not found"
      });
    }

    if (action === "reminder") {
      return res.json({
        message: "Reminder sent to the customer",
        recoveryCase
      });
    }

    if (action === "retry") {
      return res.json({
        message: "Payment retry initiated",
        recoveryCase
      });
    }

    if (action === "stop") {
      recoveryCase.recoveryStatus = "failed";

      await recoveryCase.save();

      return res.json({
        message: "Recovery stopped",
        recoveryCase
      });
    }

  } catch (error) {
    console.error("Recovery action failed:", error);

    res.status(500).json({
      error: "Recovery action failed"
    });
  }
});
// ====================
// START SERVER
// ====================

app.listen(5000, () => {
  console.log("Server running on port 5000");
});