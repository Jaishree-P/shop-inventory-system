// server.js - manual email only, no cron, use env vars for credentials
const express = require("express");
const fs = require("fs");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const DATA_FILE = "salesData.json";
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ dailySales: {} }, null, 2));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function getData() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

// -- EMAIL TRANSPORTER: use environment variables --
const EMAIL_USER = process.env.EMAIL_USER || "REPLACE_WITH_ENV";
const EMAIL_PASS = process.env.EMAIL_PASS || "REPLACE_WITH_ENV";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// verify transporter so we get an immediate, clear message at startup
transporter.verify((err, success) => {
  if (err) {
    console.error("🔴 Nodemailer verify failed — check EMAIL_USER/EMAIL_PASS & network:");
    console.error(err && err.message ? err.message : err);
  } else {
    console.log("🟢 Nodemailer ready to send messages");
  }
});

// helper to build the HTML for the report
function buildReportHtml(dateISO, salesObj) {
  let html = `<h2>Daily Sales Report - ${dateISO}</h2>`;
  html += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">`;
  html += `<tr style="background-color:#e6f0ff"><th>Product</th><th>MRP Sales</th><th>Bar Sales</th></tr>`;
  let total = 0;
  for (const [product, values] of Object.entries(salesObj || {})) {
    html += `<tr><td>${product}</td><td>${values.mrp || 0}</td><td>${values.bar || 0}</td></tr>`;
    total += (values.mrp || 0) + (values.bar || 0);
  }
  html += `</table><p><b>Total Sales (units):</b> ${total}</p>`;
  return { html, total };
}

// ---- API ROUTES ----

// Save daily summary
app.post("/api/sales", (req, res) => {
  try {
    const { date, sales } = req.body;
    if (!date || !sales) return res.status(400).json({ error: "Missing date or sales data" });

    const data = getData();
    data.dailySales[date] = sales;
    saveData(data);
    return res.json({ message: "✅ Sales data saved successfully!" });
  } catch (err) {
    console.error("Error saving data:", err);
    return res.status(500).json({ error: "Failed to save sales data" });
  }
});

// Get all sales
app.get("/api/sales", (req, res) => {
  try {
    const data = getData();
    return res.json(data.dailySales);
  } catch (err) {
    console.error("Error reading data:", err);
    return res.status(500).json({ error: "Failed to read sales data" });
  }
});

// Manual send email endpoint - POST /api/send-email { date: "YYYY-MM-DD" (optional) }
app.post("/api/send-email", async (req, res) => {
  try {
    const reqDate = req.body && req.body.date ? req.body.date : null;
    const dateISO = reqDate || new Date().toISOString().split("T")[0];
    console.log(`📨 Received send-email request for: ${dateISO}`);

    const data = getData();
    const daySales = data.dailySales[dateISO];
    if (!daySales) {
      const msg = `No sales data for ${dateISO}`;
      console.log("ℹ️", msg);
      return res.status(200).json({ success: false, message: msg });
    }

    const { html, total } = buildReportHtml(dateISO, daySales);
    const mailOptions = {
      from: EMAIL_USER,
      to: EMAIL_USER, // change to another address if desired
      subject: `Daily Sales Report - ${dateISO} (Total units: ${total})`,
      html,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("❌ Error sending email:", error && error.message ? error.message : error);
        return res.status(500).json({ success: false, message: "Failed to send email", error: error && error.message ? error.message : String(error) });
      }
      console.log("✅ Email sent:", info && info.response ? info.response : info);
      return res.json({ success: true, message: "Email sent", info: info || null });
    });
  } catch (err) {
    console.error("Unexpected error in /api/send-email:", err);
    return res.status(500).json({ success: false, message: "Server error while sending email", error: err && err.message ? err.message : String(err) });
  }
});

// ---- START SERVER ----
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
