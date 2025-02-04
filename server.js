require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const Subscription = require("./models/subscription.js");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
//const odooApiKey = (process.env.ODOO_API_KEY);
const app = express();
const axios = require("axios");
app.use(cors());
app.use(bodyParser.json());

// Load environment variables
const PORT = process.env.PORT || 5000;

const API_KEY = process.env.API_KEY || "your_secure_custom_api_key";
  app.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({ success: false, message: "Unauthorized access" });
    }
    next();
});

// Default route
app.get("/", (req, res) => {
  res.send(`Subscription API is running...`); 
});
app.post("/create-payment", async (req, res) => {
  try {
      const { amount, currency, email, customerName, serviceType } = req.body;

      // 1️⃣ Process Stripe Payment
      const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100, // Convert to cents
          currency,
          receipt_email: email,
      });

      //res.status(200).json({ success: true, clientSecret: paymentIntent.client_secret });

      //console.log("Payment successful:", paymentIntent.id);

      // 2️⃣ Sync with CRM (Odoo)
      const crmResponse = await axios.post("https://payment-gateway-p1vh.onrender.com/sync-crm", {
        name: customerName,
        email,
        service: serviceType
    }, {
        headers: {
            'x-api-key': API_KEY // Add the API key here
        }
    });
    

      if (!crmResponse.data || crmResponse.data.success === false) {
          console.error("CRM Sync failed:", crmResponse.data);
          return res.status(500).json({ success: false, message: "CRM Sync failed" });
      }

      console.log("CRM Sync successful:", crmResponse.data);

      // 3️⃣ Store Subscription in Database
      const subscriptionResponse = await axios.post("https://payment-gateway-p1vh.onrender.com/store-subscription", {
          customerName,
          email,
          serviceType,
          paymentStatus: "Paid"
      }, {
        headers: {
            'x-api-key': API_KEY // Add the API key here
        }
    });

      if (!subscriptionResponse.data.success) {
          console.error("Subscription Save Failed:", subscriptionResponse.data);
          return res.status(500).json({ success: false, message: "Subscription saving failed" });
      }

      console.log("Subscription stored successfully:", subscriptionResponse.data);

      res.status(200).json({
          success: true,
          message: "Payment, CRM sync, and subscription storage successful!",
          clientSecret: paymentIntent.client_secret
      });

  } catch (error) {
      console.error("Error in payment process:", error);
      res.status(500).json({ success: false, message: error.message });
  }
});

// odoo...
  async function createLeadInOdoo(name, email, service) {
    try {
      const response = await axios.post(process.env.ODOO_URL, {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [
            process.env.ODOO_DB,
            2, // Use correct user_id
            process.env.ODOO_PASSWORD,
            "crm.lead",
            "create",
            [{ name, email_from: email, description: service }],
          ],
        },
        id: 1,
      });
  
      return response.data;
    } catch (error) {
      console.error("Odoo API Error:", error);
      return { success: false, message: error.message };
    }
  }
  
  // Create Odoo CRM lead on payment success
  app.post("/sync-crm", async (req, res) => {
    const { name, email, service } = req.body;
    const response = await createLeadInOdoo(name, email, service);
    res.json(response);
  });


// Save subscription data
app.post("/store-subscription", async (req, res) => {
    try {
      const { customerName, email, serviceType, paymentStatus } = req.body;
  
      const newSubscription = new Subscription({
        name: customerName,  // Mapping to correct schema field
        email,
        service: serviceType, // Mapping to correct schema field
        amount: 0, // Add a default value if missing
        currency: "INR", // Default currency (modify as needed)
        paymentStatus
      });
  
      await newSubscription.save();
      res.json({ success: true, message: "Subscription stored successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });
  
  // Retrieve all subscriptions
  app.get("/subscriptions", async (req, res) => {
    try {
      const subscriptions = await Subscription.find();
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });
  mongoose
  .connect(process.env.MONGO_URI || "your_mongodb_connection_string")
  .then(() => {
    console.log("MongoDB Connected");
    // Start server only after DB connection is established
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1); // Exit the process if the database connection fails
  });

