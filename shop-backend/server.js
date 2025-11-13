// server.js — Using RESEND for Email (Best for Render)

// ----------------- IMPORTS --------------------
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const { Resend } = require("resend");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// ----------------- LOAD ENV --------------------
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const EMAIL_TO = process.env.EMAIL_TO;

if (!RESEND_API_KEY || !EMAIL_FROM || !EMAIL_TO) {
  console.error("❌ Missing environment variables!");
  console.error("Required:");
  console.error("RESEND_API_KEY");
  console.error("EMAIL_FROM");
  console.error("EMAIL_TO");
}

// Create resend client
const resend = new Resend(RESEND_API_KEY);

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
  let html = `<h2>Daily Sales Report - ${dateISO}</h2>`;
  html += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
           <tr style="background:#eef">
             <th>Product</th><th>MRP Sales</th><th>Bar Sales</th>
           </tr>`;

  let total = 0;

  for (const [product, val] of Object.entries(salesObj || {})) {
    html += `
      <tr>
        <td>${product}</td>
        <td>${val.mrp || 0}</td>
        <td>${val.bar || 0}</td>
      </tr>`;
    total += (val.mrp || 0) + (val.bar || 0);
  }

  html += `</table><p><b>Total Units:</b> ${total}</p>`;
  return { html, total };
}

// ----------------- API ROUTES --------------------

// Save summary to backend
app.post("/api/sales", (req, res) => {
  try {
    const { date, sales } = req.body;

    if (!date || !sales)
      return res.status(400).json({ error: "Missing fields" });

    const data = getData();
    data.dailySales[date] = sales;
    saveData(data);

    res.json({ message: "Sales saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all sales
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
    console.log("📨 Send email requested for:", dateISO);

    const data = getData();
    const daySales = data.dailySales[dateISO];

    if (!daySales) {
      return res.json({ success: false, message: "No sales for this date" });
    }

    const { html, total } = buildReportHtml(dateISO, daySales);

    // use RESEND
    const emailResponse = await resend.emails.send({
      from: EMAIL_FROM,
      to: EMAIL_TO,
      subject: `Daily Sales Report - ${dateISO} (Units: ${total})`,
      html
    });

    console.log("📧 Resend API Response:", emailResponse);

    return res.json({ success: true, message: "Email sent" });

  } catch (err) {
    console.error("❌ Email error:", err);
    res.status(500).json({ success: false, message: "Email failed", error: err.message });
  }
});

// ----------------- START SERVER --------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
