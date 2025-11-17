// ----------------- IMPORTS --------------------
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 5050;

app.use(express.json());
app.use(cors());

// ----------------- LOAD ENV --------------------
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_TO = process.env.EMAIL_TO;

if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_TO) {
  console.error("❌ Missing environment variables!");
}

// ----------------- GMAIL TRANSPORT --------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS, // Gmail App Password
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
app.post("/api/sales", (req, res) => {
  try {
    const { date, sales } = req.body;
    const data = getData();
    data.dailySales[date] = sales;
    saveData(data);
    res.json({ message: "Sales saved" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/sales", (req, res) => {
  try {
    const data = getData();
    res.json(data.dailySales);
  } catch (err) {
    res.status(500).json({ error: "Server error reading sales" });
  }
});

// SEND EMAIL
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
      from: EMAIL_USER,
      to: EMAIL_TO,
      subject: `Daily Sales Report - ${dateISO} (Units: ${totalUnits})`,
      html,
    });

    res.json({ success: true, message: "Email sent" });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Email failed",
      error: err.message,
    });
  }
});

// ----------------- START SERVER (IMPORTANT FOR RENDER) --------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
