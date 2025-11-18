// ----------------------------
// Simple Inventory Backend
// Node + Express + JSON file
// ----------------------------

const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5050;

app.use(express.json());
app.use(cors());

// -------------------------------------
// Data File
// -------------------------------------
const FILE = "salesData.json";

// Create file if missing
if (!fs.existsSync(FILE)) {
  fs.writeFileSync(
    FILE,
    JSON.stringify(
      {
        mrp: [],
        bar: [],
        dailySales: {}
      },
      null,
      2
    )
  );
}

// Load + Save helpers
function load() {
  return JSON.parse(fs.readFileSync(FILE));
}
function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// -------------------------------------
// API: MRP
// -------------------------------------
app.get("/api/mrp", (req, res) => {
  try {
    const data = load();
    res.json(data.mrp || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to load MRP" });
  }
});

app.post("/api/mrp", (req, res) => {
  try {
    const data = load();
    data.mrp = req.body || [];
    save(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed saving MRP" });
  }
});

// -------------------------------------
// API: BAR
// -------------------------------------
app.get("/api/bar", (req, res) => {
  try {
    const data = load();
    res.json(data.bar || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to load Bar" });
  }
});

app.post("/api/bar", (req, res) => {
  try {
    const data = load();
    data.bar = req.body || [];
    save(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed saving Bar" });
  }
});

// -------------------------------------
// API: DAILY SALES (all)
// -------------------------------------
app.get("/api/daily", (req, res) => {
  try {
    const data = load();
    res.json(data.dailySales || {});
  } catch (err) {
    res.status(500).json({ error: "Failed to load daily" });
  }
});

// -------------------------------------
// API: DAILY SALES (single date)
// -------------------------------------
app.get("/api/daily/:date", (req, res) => {
  try {
    const data = load();
    const date = req.params.date;
    res.json(data.dailySales[date] || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to load this date" });
  }
});

app.post("/api/daily/:date", (req, res) => {
  try {
    const data = load();
    const date = req.params.date;
    data.dailySales[date] = req.body || [];
    save(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed saving daily" });
  }
});

// -------------------------------------
// API: RESET
// -------------------------------------
app.post("/api/reset", (req, res) => {
  try {
    const data = {
      mrp: [],
      bar: [],
      dailySales: {}
    };
    save(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset" });
  }
});

// -------------------------------------
// Start Server
// -------------------------------------
app.listen(PORT, () => {
  console.log("🚀 Inventory server running on port", PORT);
});
