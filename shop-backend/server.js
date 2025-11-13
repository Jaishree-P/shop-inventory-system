// server.js - Daily Sales Email Sender + Sales Storage
// ----------------------------------------------------
// Works on Render without dotenv. Make sure EMAIL_USER and EMAIL_PASS
// are added in Render → Environment Variables.

// ----------------- IMPORTS --------------------
const express = require("express");
const fs = require("fs");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

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

// ----------------- EMAIL SETTINGS --------------------
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.error("❌ ERROR: Missing EMAIL_USER or EMAIL_PASS environment variables!");
  console.error("➡️ Add them inside Render → Dashboard → Environment.");
}

// Gmail transporter (Gmail App Password required)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  },
  debug: true
});

// verify transporter at startup
transporter.verify((err, success) => {
  if (err) {
    console.error("🔴 Nodemailer verify FAILED:", err.message || err);
  } else {
    console.log("🟢 Nodemailer is ready to send emails");
  }
});

// ----------------- BUILD EMAIL HTML --------------------
function buildReportHtml(dateISO, salesObj) {
  let html = `<h2>Daily Sales Report - ${dateISO}</h2>`;
  html += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">`;
  html += `<tr style="background-color:#e6f0ff">
             <th>Product</th>
             <th>MRP Sales</th>
             <th>Bar Sales</th>
           </tr>`;
  let total = 0;

  for (const [product, values] of Object.entries(salesObj || {})) {
    html += `<tr>
              <td>${product}</td>
              <td>${values.mrp || 0}</td>
              <td>${values.bar || 0}</td>
            </tr>`;
    total += (values.mrp || 0) + (values.bar || 0);
  }

  html += `</table>
           <p><b>Total Units Sold:</b> ${total}</p>`;

  return { html, total };
}

// ----------------------- API ROUTES ------------------------

// Save sales summary for a date
app.post("/api/sales", (req, res) => {
  try {
    const { date, sales } = req.body;

    if (!date || !sales) {
      return res.status(400).json({ error: "Missing date or sales field" });
    }

    const data = getData();
    data.dailySales[date] = sales;
    saveData(data);

    return res.json({ message: "Sales saved successfully" });
  } catch (err) {
    console.error("❌ Error saving sales:", err);
    return res.status(500).json({ error: "Server error saving sales" });
  }
});

// Get all sales
app.get("/api/sales", (req, res) => {
  try {
    const data = getData();
    return res.json(data.dailySales);
  } catch (err) {
    console.error("❌ Error reading sales:", err);
    return res.status(500).json({ error: "Server error reading sales" });
  }
});

// SEND EMAIL for a specific date
app.post("/api/send-email", async (req, res) => {
  try {
    const reqDate = req.body?.date || null;
    const dateISO = reqDate || new Date().toISOString().split("T")[0];

    console.log("📨 Email request received for date:", dateISO);

    const data = getData();
    const daySales = data.dailySales[dateISO];

    if (!daySales) {
      const msg = `No sales found for ${dateISO}`;
      console.log("ℹ️", msg);
      return res.status(200).json({ success: false, message: msg });
    }

    const { html, total } = buildReportHtml(dateISO, daySales);

    const mailOptions = {
      from: EMAIL_USER,
      to: EMAIL_USER,
      subject: `Daily Sales Report - ${dateISO} | Total Units: ${total}`,
      html
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("❌ Email send FAILED:", error.message || error);
        return res.status(500).json({
          success: false,
          message: "Failed to send email",
          error: error.message || String(error)
        });
      }

      console.log("✅ Email sent:", info.response || info);
      return res.json({
        success: true,
        message: "Email sent successfully",
        info
      });
    });

  } catch (err) {
    console.error("❌ Unexpected error:", err);
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
      error: err.message || String(err)
    });
  }
});

// ----------------- START SERVER --------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
