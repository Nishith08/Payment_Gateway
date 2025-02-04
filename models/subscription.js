const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema({
  name: String,
  email: String,
  service: String,
  amount: Number,
  currency: String,
  paymentStatus: String,
  crmSyncStatus: { type: Boolean, default: false },
});

module.exports = mongoose.model("Subscription", SubscriptionSchema);
