const mongoose = require("mongoose");

const recoveryCaseSchema = new mongoose.Schema({

  amount: {
    type: Number,
    required: true
  },
  attempts: {
  type: Number,
  default: 1
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
  aiReason: {
  type: String
},

  recoveryStatus: {
    type: String,
    enum: ["pending", "recovered", "failed"],
    default: "pending"
  },
  lastAction: {
    type: String,
    enum: ["retry", "reminder", "stop"]
  },
  actionAt: {
    type: Date
  },
  paymentLinkId: {
    type: String
  },
  paymentLinkUrl: {
    type: String
  },
  recoveryMessage: {
    type: String
  },
  recoveryMessageGeneratedAt: {
    type: Date
  },
  actionHistory: {
    type: [
      {
        action: {
          type: String,
          enum: ["retry", "reminder", "stop"],
          required: true
        },
        actionAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    default: []
  }

});

module.exports = mongoose.model("RecoveryCase", recoveryCaseSchema);