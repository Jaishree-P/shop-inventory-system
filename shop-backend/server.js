// ----------------- IMPORTS --------------------
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 5050;

app.use(express.json());

// ---- CORS -----
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));


// ----------------- LOAD ENV --------------------
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const EMAIL_FROM = process.env.EMAIL_FROM;
const EMAIL_TO = process.env.EMAIL_TO;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM || !EMAIL_TO) {
  console.error("❌ Missing environment variables!");
}

// ----------------- SMTP TRANSPORT (BREVO SMTP) --------------------
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// ----------------- DATA FILE --------------------
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

// ----------------- BUILD EMAIL HTML --------------------
function buildReportHtml(dateISO, salesObj) {
  let html = `
    <h2>Daily Sales Report - ${dateISO}</h2>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
      <tr style="background:#eef">
        <th>Product</th>
        <th>MRP Sales</th>
        <th>Bar Sales</th>
      </tr>
  `;

  let totalUnits = 0;

  for (const [product, val] of Object.entries(salesObj || {})) {
    html += `
      <tr>
        <td>${product}</td>
        <td>${val.mrp || 0}</td>
        <td>${val.bar || 0}</td>
      </tr>
    `;
    totalUnits += (val.mrp || 0) + (val.bar || 0);
  }

  html += `</table><p><b>Total Units Sold:</b> ${totalUnits}</p>`;
  return { html, totalUnits };
}

// ----------------- API ROUTES --------------------

// Save sales summary to file
app.post("/api/sales", (req, res) => {
  try {
    const { date, sales } = req.body;
    const data = getData();
    data.dailySales[date] = sales;
    saveData(data);

    res.json({ message: "Sales saved" });
  } catch (err) {
    console.error("Save sales error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all sales
app.get("/api/sales", (req, res) => {
  try {
    const data = getData();
    res.json(data.dailySales);
  } catch (err) {
    console.error("Get sales error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// SEND EMAIL using Brevo SMTP
app.post("/api/send-email", async (req, res) => {
  try {
    const dateISO = req.body?.date || new Date().toISOString().split("T")[0];
    const data = getData();
    const daySales = data.dailySales[dateISO];

    if (!daySales) {
      return res.json({ success: false, message: "No sales for this date" });
    }

    const { html, totalUnits } = buildReportHtml(dateISO, daySales);

    await transporter.sendMail({
      from: EMAIL_FROM,
      to: EMAIL_TO,
      subject: `Daily Sales Report - ${dateISO} (Units: ${totalUnits})`,
      html: html,
    });

    res.json({ success: true, message: "Email sent" });

  } catch (err) {
    console.error("❌ Email error:", err);
    res.status(500).json({
      success: false,
      message: "Email failed",
      error: err.message,
    });
  }
});

// ----------------- START SERVER --------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
