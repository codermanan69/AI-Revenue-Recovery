const mongoose = require("mongoose");

const recoveryCaseSchema = new mongoose.Schema({

  amount: {
    type: Number,
    required: true
  },

  failureReason: {
    type: String,
    required: true
  },

  aiRecommendation: {
    type: String,
    enum: ["retry", "reminder", "stop"],
    required: true
  },

  recoveryStatus: {
    type: String,
    enum: ["pending", "recovered", "failed"],
    default: "pending"
  }

});

module.exports = mongoose.model("RecoveryCase", recoveryCaseSchema);