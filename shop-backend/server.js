// server.js (updated)
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

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ dailySales: {} }, null, 2));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function getData() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

// ---- EMAIL SETUP ----
// IMPORTANT: keep credentials secret. Use env vars in production.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "jaishree3025@gmail.com",
    pass: "jpzy piyo sgbu qcup", // app password
  },
});

// verify transporter at startup so we get clear error if creds are wrong
transporter.verify((err, success) => {
  if (err) {
    console.error("🔴 Nodemailer verify failed — check credentials/network:");
    console.error(err && err.message ? err.message : err);
  } else {
    console.log("🟢 Nodemailer ready to send messages");
  }
});

// ---- Helper: build HTML for a date report ----
function buildReportHtml(dateISO, todaySales) {
  let html = `<h2>Daily Sales Report - ${dateISO}</h2>`;
  html += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">`;
  html += `<tr style="background-color:#e6f0ff"><th>Product</th><th>MRP Sales</th><th>Bar Sales</th></tr>`;
  let total = 0;
  for (const [product, values] of Object.entries(todaySales)) {
    html += `<tr><td>${product}</td><td>${values.mrp || 0}</td><td>${values.bar || 0}</td></tr>`;
    total += (values.mrp || 0) + (values.bar || 0);
  }
  html += `</table><p><b>Total Sales:</b> ₹${total}</p>`;
  return { html, total };
}

// Function to attempt sending email for a specific ISO date (YYYY-MM-DD)
function sendDailyReportFor(dateISO) {
  const data = getData();
  const daySales = data.dailySales[dateISO];

  if (!daySales) {
    const msg = `No sales data for ${dateISO}.`;
    console.log("ℹ️", msg);
    // Return resolved promise so caller can handle
    return Promise.resolve({ success: false, message: msg });
  }

  const { html, total } = buildReportHtml(dateISO, daySales);

  const mailOptions = {
    from: "jaishree3025@gmail.com",
    to: "jaishree3025@gmail.com", // change for production if needed
    subject: `Daily Sales Report - ${dateISO} (Total ₹${total})`,
    html,
  };

  return new Promise((resolve) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("❌ Error sending email:", error && error.message ? error.message : error);
        return resolve({ success: false, message: error && error.message ? error.message : String(error) });
      }
      console.log("✅ Daily sales email sent:", info && info.response ? info.response : info);
      return resolve({ success: true, message: "Email sent", info });
    });
  });
}

// ---- API ROUTES ----

// Save today's sales (your existing route)
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

app.get("/api/sales", (req, res) => {
  try {
    const data = getData();
    return res.json(data.dailySales);
  } catch (err) {
    console.error("Error reading data:", err);
    return res.status(500).json({ error: "Failed to read sales data" });
  }
});

// Endpoint to manually trigger sending email for a specific date (optional date in body)
app.post("/api/send-email", async (req, res) => {
  try {
    // Accept either { date: "YYYY-MM-DD" } or empty (then use today's date)
    const reqDate = req.body && req.body.date ? req.body.date : null;
    const dateISO = reqDate || new Date().toISOString().split("T")[0];
    console.log(`📨 Received send-email request for: ${dateISO}`);

    const result = await sendDailyReportFor(dateISO);
    if (result.success) return res.json({ message: "✅ Email sent successfully!", info: result.info || null });
    // if not success, give client useful message
    return res.status(200).json({ message: `❌ ${result.message}` });
  } catch (err) {
    console.error("Unexpected error in /api/send-email:", err);
    return res.status(500).json({ error: "Server error while sending email", details: (err && err.message) ? err.message : err });
  }
});

// ---- CRON JOB ----
// Runs every day at 3:00 AM India time
cron.schedule("0 3 * * *", () => {
  const todayISO = new Date().toISOString().split("T")[0];
  console.log("🕒 Cron job triggered for date:", todayISO);
  sendDailyReportFor(todayISO).then(r => {
    if (!r.success) console.log("Cron: email not sent:", r.message);
  });
}, {
  timezone: "Asia/Kolkata"
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
