const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({

  razorpayOrderId: {
    type: String,
    required: true
  },

  razorpayPaymentId: {
    type: String
  },

  amount: {
    type: Number,
    required: true
  },

  currency: {
    type: String,
    required: true
  },

  status: {
    type: String,
    default: "created"
  },

  paymentStatus: {
    type: String,
    default: "pending"
  }

});

module.exports = mongoose.model("Order", orderSchema);