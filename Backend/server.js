const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("./models/Order.js");
const RecoveryCase = require("./models/RecoveryCase.js");
const { getRecommendation } = require("./services/recommendationEngine.js");
require("dotenv").config();


const app = express();


// ====================
// MIDDLEWARE
// ====================

app.use(cors());
app.use(express.json());


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

// ====================
// CREATE RECOVERY CASE
// ====================

app.post("/api/recovery-cases", async (req, res) => {
  try {

    const {
      amount,
      failureReason
    } = req.body;

    const aiRecommendation = getRecommendation(failureReason);

    const recoveryCase = await RecoveryCase.create({
      amount,
      failureReason,
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
// START SERVER
// ====================

app.listen(5000, () => {
  console.log("Server running on port 5000");
});