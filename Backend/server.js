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
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);


// ====================
// YAHAN AI FUNCTION PASTE KARNA HAI
// ====================

async function getAIRecommendation(amount, failureReason, attempts) {
  try {
    const aiPromise = ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `
You are an AI payment recovery decision engine.

Analyze the failed payment using ONLY the information provided.

Payment amount: ${amount / 100} INR
Failure reason: ${failureReason}
Attempts: ${attempts}

Choose EXACTLY ONE action:
retry
reminder
stop

Follow these business rules in this priority order:

1. If attempts >= 5 OR the failure reason indicates repeated failures:
   action = stop

2. If the failure reason contains "declined" AND attempts >= 2:
   action = reminder

3. If the failure reason indicates a temporary bank/server issue AND attempts <= 1:
   action = retry

4. If the customer has insufficient funds:
   action = reminder

5. If none of the above rules clearly apply:
   action = reminder

IMPORTANT:
- Do NOT invent facts that are not present in the input.
- Do NOT assume temporary bank issues unless the failure reason says so.
- Do NOT change the action based only on the payment amount.
- Follow the business rules exactly.

Return the response EXACTLY in this format:

ACTION | REASON

Example:
reminder | The payment was declined after multiple attempts, so reminding the customer is better than immediately retrying.
`
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Gemini AI request timed out")), 3500)
    );

    const response = await Promise.race([aiPromise, timeoutPromise]);
    const result = response.text ? response.text.trim() : "";

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
    console.error("Gemini recommendation fallback triggered:", error.message || error);

    const fallbackAction = getRecommendation(failureReason);

    return {
      action: fallbackAction,
      reason: "AI rule engine selected fallback recommendation based on payment failure details."
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



// ====================
// HANDLE FAILED PAYMENT
// ====================

app.post("/api/payments/failed", async (req, res) => {
  try {
    const {
      amount,
      failureReason,
      razorpayOrderId
    } = req.body;

    let attempts = req.body.attempts || 1;

    if (razorpayOrderId) {
      const order = await Order.findOne({
        razorpayOrderId: razorpayOrderId
      });

      if (order) {
        order.attempts += 1;
        await order.save();
        attempts = order.attempts;
      }
    }

    // Ask Gemini for recovery recommendation
    const aiRecommendation = await getAIRecommendation(
      amount,
      failureReason,
      attempts
    );

    const recoveryCase = await RecoveryCase.create({
      amount,
      failureReason,
      attempts: attempts,
      aiRecommendation: aiRecommendation.action,
      aiReason: aiRecommendation.reason
    });

    console.log(
      "Failed payment recovery case:",
      recoveryCase
    );

    res.json(recoveryCase);

  } catch (error) {
    console.error(
      "Failed payment recovery case:",
      error
    );

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

    const revenueAtRisk =
      recoveryCases
        .filter((item) => item.recoveryStatus === "pending")
        .reduce((total, item) => total + item.amount, 0) / 100;

    const recoveredRevenue =
      recoveryCases
        .filter((item) => item.recoveryStatus === "recovered")
        .reduce((total, item) => total + item.amount, 0) / 100;

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

async function generateCustomerMessage(amount, failureReason, attempts, aiRecommendation, action, paymentLinkUrl) {
  const amountInRupees = amount / 100;
  try {
    const prompt = `
You are an AI customer communication assistant for a payment recovery platform.

Generate a short, polite, customer-facing recovery message for a failed payment.

Context:
- Payment Amount: ₹${amountInRupees}
- Action Type: ${action} (${action === "reminder" ? "remind customer to complete payment" : "ask customer to retry payment"})
- Failure Reason: ${failureReason}
- Payment Attempts: ${attempts}
- AI Recommendation: ${aiRecommendation}
- Payment Link: ${paymentLinkUrl}

Rules:
1. Keep it concise (1-2 sentences max).
2. Clearly explain the issue in polite, customer-friendly language without exposing internal system details or code names.
3. Naturally include the payment link (${paymentLinkUrl}).
4. Tailor tone:
   - For "reminder": polite, helpful reminder.
   - For "retry": clear notice of payment attempt issue with call-to-action to retry.
5. Do NOT invent discounts, refunds, guarantees, deadlines, or false promises.
6. Return ONLY the message text.
`;

    const aiPromise = ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Gemini customer message request timed out")), 3500)
    );

    const response = await Promise.race([aiPromise, timeoutPromise]);

    const resultText = response.text ? response.text.trim() : "";
    if (resultText) {
      return resultText;
    }
  } catch (error) {
    console.error("Gemini customer message generation fallback triggered:", error.message || error);
  }

  // Fallback if Gemini fails
  if (action === "reminder") {
    return `Your payment of ₹${amountInRupees} could not be completed (${failureReason}). Please use this link to complete your payment: ${paymentLinkUrl}`;
  } else {
    return `We noticed an issue with your payment of ₹${amountInRupees} (${failureReason}). Please use this link to retry your payment: ${paymentLinkUrl}`;
  }
}

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

    const now = new Date();

    // For retry and reminder actions, generate a Razorpay Payment Link if one does not already exist
    if (action === "retry" || action === "reminder") {
      if (!recoveryCase.paymentLinkUrl) {
        try {
          const paymentLink = await razorpay.paymentLink.create({
            amount: recoveryCase.amount,
            currency: "INR",
            accept_partial: false,
            description: `Payment recovery for case ${recoveryCase._id}`,
            customer: {
              name: "Customer",
              email: "customer@example.com",
              contact: "+919876543210"
            },
            notify: {
              sms: false,
              email: false
            },
            reminder_enable: false,
            notes: {
              recoveryCaseId: recoveryCase._id.toString()
            }
          });

          recoveryCase.paymentLinkId = paymentLink.id;
          recoveryCase.paymentLinkUrl = paymentLink.short_url;
        } catch (linkError) {
          console.error("Razorpay Payment Link creation failed:", linkError);
          return res.status(500).json({
            error: "Failed to create Razorpay payment link"
          });
        }
      }

      // Generate personalized recovery message using Gemini AI if not already stored
      if (!recoveryCase.recoveryMessage) {
        const recoveryMessage = await generateCustomerMessage(
          recoveryCase.amount,
          recoveryCase.failureReason,
          recoveryCase.attempts || 1,
          recoveryCase.aiRecommendation,
          action,
          recoveryCase.paymentLinkUrl
        );

        recoveryCase.recoveryMessage = recoveryMessage;
        recoveryCase.recoveryMessageGeneratedAt = now;
      }
    }

    // Save action details
    recoveryCase.lastAction = action;
    recoveryCase.actionAt = now;

    // Ensure actionHistory exists safely for legacy documents
    if (!Array.isArray(recoveryCase.actionHistory)) {
      recoveryCase.actionHistory = [];
    }

    // Append to history
    recoveryCase.actionHistory.push({
      action: action,
      actionAt: now
    });

    if (action === "stop") {
      recoveryCase.recoveryStatus = "failed";
    }

    await recoveryCase.save();

    let message = "";
    if (action === "reminder") {
      message = "Reminder sent to the customer";
    } else if (action === "retry") {
      message = "Payment retry initiated";
    } else if (action === "stop") {
      message = "Recovery stopped";
    }

    if (action === "reminder" || action === "retry") {
      return res.json({
        message,
        paymentLinkUrl: recoveryCase.paymentLinkUrl || null,
        recoveryMessage: recoveryCase.recoveryMessage || null,
        recoveryCase
      });
    }

    return res.json({
      message,
      recoveryCase
    });

  } catch (error) {
    console.error("Recovery action failed:", error);

    res.status(500).json({
      error: "Recovery action failed"
    });
  }
});
// ====================
// RAZORPAY WEBHOOKS
// ====================

app.post("/api/webhooks/razorpay", async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
      return res.status(500).json({ error: "Server webhook configuration error" });
    }

    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).json({ error: "Missing x-razorpay-signature header" });
    }

    const rawPayload = req.rawBody ? req.rawBody : JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawPayload)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("Razorpay webhook signature verification failed");
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const event = req.body;

    if (!event || !event.event) {
      return res.status(400).json({ error: "Invalid webhook payload structure" });
    }

    const eventType = event.event;
    const eventId = event.event_id || req.headers["x-razorpay-event-id"];
    const payload = event.payload || {};
    const paymentEntity = payload.payment?.entity;

    if (eventType === "payment.captured" || eventType === "payment.failed") {
      if (!paymentEntity) {
        return res.status(400).json({ error: "Missing payment entity in webhook payload" });
      }

      const razorpayOrderId = paymentEntity.order_id;
      const razorpayPaymentId = paymentEntity.id;

      if (!razorpayOrderId) {
        return res.status(400).json({ error: "Missing order_id in webhook payload" });
      }

      const order = await Order.findOne({ razorpayOrderId });

      if (!order) {
        console.log("Webhook order not found for razorpayOrderId:", razorpayOrderId);
        return res.status(200).json({ success: true, message: "Order not found" });
      }

      // Idempotency check: Skip if event ID was already processed
      if (eventId && order.lastWebhookEventId === eventId) {
        console.log(`Webhook event ${eventId} already processed for order ${razorpayOrderId}`);
        return res.status(200).json({ success: true, message: "Webhook already processed" });
      }

      if (eventType === "payment.captured") {
        order.razorpayPaymentId = razorpayPaymentId;
        order.paymentStatus = "paid";
        order.status = "paid";
        if (eventId) order.lastWebhookEventId = eventId;

        await order.save();
        console.log(`Webhook updated order ${razorpayOrderId} to paid`);

        return res.json({
          success: true,
          event: eventType
        });
      }

      if (eventType === "payment.failed") {
        order.attempts = (order.attempts || 0) + 1;
        order.razorpayPaymentId = razorpayPaymentId;
        order.paymentStatus = "failed";
        order.status = "failed";
        if (eventId) order.lastWebhookEventId = eventId;

        await order.save();
        console.log(`Webhook updated order ${razorpayOrderId} to failed (Attempts: ${order.attempts})`);

        return res.json({
          success: true,
          event: eventType
        });
      }
    }

    console.log("Unhandled Razorpay webhook event:", eventType);
    return res.status(200).json({
      success: true,
      event: eventType,
      message: "Event ignored"
    });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(500).json({
      error: "Webhook processing failed"
    });
  }
});

// ====================
// START SERVER
// ====================

app.listen(5000, () => {
  console.log("Server running on port 5000");
});