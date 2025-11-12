// server.js
const express = require("express");
const fs = require("fs");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(cors());

const DATA_FILE = "salesData.json";

// Ensure data file exists with closedDates support
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ dailySales: {}, closedDates: {} }, null, 2)
  );
}

// Helpers
function saveData(obj) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}
function getData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function toISO(dateLike) {
  if (!dateLike) return new Date().toISOString().split("T")[0];
  // already ISO
  if (typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) return dateLike;
  const d = new Date(dateLike);
  if (isNaN(d)) return new Date().toISOString().split("T")[0];
  return d.toISOString().split("T")[0];
}

// ---- API ROUTES ----

// Save sales summary for a given date
app.post("/api/sales", (req, res) => {
  try {
    const { date, sales } = req.body;
    if (!date || !sales) return res.status(400).json({ error: "Missing date or sales data" });

    const iso = toISO(date);
    const data = getData();
    // set/replace summary for that date
    data.dailySales[iso] = sales;
    saveData(data);
    return res.json({ message: "✅ Sales data saved successfully!", date: iso });
  } catch (err) {
    console.error("Error saving data:", err);
    return res.status(500).json({ error: "Failed to save sales data" });
  }
});

// Get all sales data (returns dailySales and closedDates)
app.get("/api/sales", (req, res) => {
  try {
    const data = getData();
    return res.json(data);
  } catch (err) {
    console.error("Error reading data:", err);
    return res.status(500).json({ error: "Failed to read sales data" });
  }
});

// ---- EMAIL SETUP ----
// NOTE: use environment variables in production. Keep app password secret.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "jaishree3025@gmail.com", // replace if needed
    pass: "jpzy piyo sgbu qcup",     // app password
  },
});

// Send report for a specific ISO date. Returns { success, message }
function sendDailyReportForDate(dateISO) {
  try {
    const data = getData();
    const sales = data.dailySales[dateISO];

    if (!sales || Object.keys(sales).length === 0) {
      const msg = `No sales data for ${dateISO}`;
      console.log("sendDailyReportForDate:", msg);
      return { success: false, message: msg };
    }

    // build HTML report table (MRP and Bar values assumed numeric)
    let html = `<h2>Daily Sales Report - ${dateISO}</h2>`;
    html += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">`;
    html += `<tr style="background-color:#e6f0ff;"><th>Product</th><th>MRP</th><th>Bar</th></tr>`;

    let total = 0;
    for (const [product, vals] of Object.entries(sales)) {
      const mrp = Number(vals.mrp || 0);
      const bar = Number(vals.bar || 0);
      html += `<tr><td>${product}</td><td>${mrp}</td><td>${bar}</td></tr>`;
      total += mrp + bar;
    }
    html += `</table><p><b>Total Sales:</b> ₹${total}</p>`;

    const mailOptions = {
      from: "jaishree3025@gmail.com",
      to: "jaishree3025@gmail.com", // change to recipient(s) as required
      subject: `Daily Sales Report - ${dateISO}`,
      html,
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("Error sending email:", err);
      } else {
        console.log("Email sent for", dateISO, info.response);
      }
    });

    return { success: true, message: `Email sent for ${dateISO}` };
  } catch (err) {
    console.error("sendDailyReportForDate error:", err);
    return { success: false, message: "Error while sending email" };
  }
}

// Manual trigger from dashboard — accepts optional { date: "YYYY-MM-DD" }
app.post("/api/send-email", (req, res) => {
  try {
    const dateParam = req.body && req.body.date;
    const dateISO = toISO(dateParam);
    const data = getData();

    // prevent duplicate sends if already closed (global flag)
    if (data.closedDates && data.closedDates[dateISO]) {
      return res.status(200).json({ message: `❌ Date ${dateISO} is already closed (email sent).` });
    }

    const result = sendDailyReportForDate(dateISO);
    if (result.success) {
      // mark closed
      data.closedDates = data.closedDates || {};
      data.closedDates[dateISO] = true;
      saveData(data);
      return res.json({ message: result.message });
    } else {
      return res.status(200).json({ message: result.message });
    }
  } catch (err) {
    console.error("Error in /api/send-email:", err);
    return res.status(500).json({ error: "Failed to send email" });
  }
});

// ---- CRON JOB ----
// Run every day at 3:00 AM India time and send report for that date (previous day?)
// We'll send for the current date (server local). If you want previous-day behavior, adjust accordingly.
cron.schedule("0 3 * * *", () => {
  try {
    const todayISO = new Date().toISOString().split("T")[0];
    console.log("🕒 Cron job running for date:", todayISO);
    const data = getData();
    if (data.closedDates && data.closedDates[todayISO]) {
      console.log("Cron: already closed for", todayISO);
      return;
    }
    const result = sendDailyReportForDate(todayISO);
    if (result.success) {
      const d = getData();
      d.closedDates = d.closedDates || {};
      d.closedDates[todayISO] = true;
      saveData(d);
    }
  } catch (err) {
    console.error("Cron job error:", err);
  }
}, { timezone: "Asia/Kolkata" });

// ---- START SERVER ----
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
