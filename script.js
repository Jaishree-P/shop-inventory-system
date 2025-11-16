/* ===========================
   CONFIG
=========================== */
const API_BASE = (function () {
  if (
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  ) {
    return "http://127.0.0.1:5050/api"; // LOCAL
  }
  return "https://shop-inventory-system-gcil.onrender.com/api";
})();

/* ===========================
   DEFAULT ITEMS
=========================== */
const defaultItems = [
  "2 Litre Water", "1 Liter water", "500 ML water", "soda 750ml",
  "600ml cool drinks", "250ml cool drinks", "5rs glass", "3rs glass",
  "2rs glass", "chips", "boti", "water packet", "mixer",
  "cover big", "cover medium", "cover small"
];

let mrpData = [];
let barData = [];
let dailySales = {};
let currentModalDate = null;

/* ===========================
   HELPERS
=========================== */
function toISO(dateLike) {
  if (!dateLike) return new Date().toISOString().split("T")[0];
  if (typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) return dateLike;
  const d = new Date(dateLike);
  if (isNaN(d)) return new Date().toISOString().split("T")[0];
  return d.toISOString().split("T")[0];
}

function isoToDisplay(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString();
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
}

function normalizeDailySales(raw) {
  const out = {};
  Object.keys(raw || {}).forEach(k => out[toISO(k)] = raw[k]);
  return out;
}

/* ===========================
   SAVE / LOAD
=========================== */
function saveData() {
  localStorage.setItem("mrpData", JSON.stringify(mrpData));
  localStorage.setItem("barData", JSON.stringify(barData));
  localStorage.setItem("dailySales", JSON.stringify(dailySales));
}

function loadLocalData() {
  const mrp = localStorage.getItem("mrpData");
  const bar = localStorage.getItem("barData");
  const sales = localStorage.getItem("dailySales");

  if (mrp) mrpData = JSON.parse(mrp);
  if (bar) barData = JSON.parse(bar);
  if (sales) dailySales = normalizeDailySales(JSON.parse(sales));

  if (!Array.isArray(mrpData)) mrpData = [];
  if (!Array.isArray(barData)) barData = [];
}

/* ===========================
   TWO-WAY SYNC
=========================== */
function syncTwoWay() {
  // Ensure all MRP items exist in BAR
  mrpData.forEach(m => {
    let b = barData.find(x => x.name === m.name);
    if (!b) {
      barData.push({
        name: m.name,
        opening: 0,
        price: m.mrpPrice || 0,
        purchase: 0,
        sales: 0
      });
    }
  });

  // Ensure all BAR items exist in MRP
  barData.forEach(b => {
    let m = mrpData.find(x => x.name === b.name);
    if (!m) {
      mrpData.push({
        name: b.name,
        opening: 0,
        mrpPrice: b.price || 0,
        purchase: 0,
        transferred: 0,
        sales: 0
      });
    }
  });
}

/* ===========================
   INITIALIZE DEFAULT ITEMS
=========================== */
function initializeItems() {
  mrpData = defaultItems.map(name => ({
    name,
    opening: 0,
    mrpPrice: 0,
    purchase: 0,
    transferred: 0,
    sales: 0
  }));

  barData = defaultItems.map(name => ({
    name,
    opening: 0,
    price: 0,
    purchase: 0,
    sales: 0
  }));

  saveData();
}

/* ===========================
   SWITCH SECTION
=========================== */
function showSection(section) {
  document.querySelectorAll(".container").forEach(c => c.classList.remove("active-section"));
  document.getElementById(section).classList.add("active-section");

  document.querySelectorAll("nav a").forEach(a => a.classList.remove("active"));
  const map = { mrp: "nav-mrp", bar: "nav-bar", dashboard: "nav-dashboard" };
  document.getElementById(map[section]).classList.add("active");
}

/* ===========================
   RENDER MRP
=========================== */
function renderMRP() {
  const tbody = document.querySelector("#mrpTable tbody");
  tbody.innerHTML = "";

  mrpData.forEach((item, i) => {
    const opening = +item.opening || 0;
    const price = +item.mrpPrice || 0;
    const purchase = +item.purchase || 0;
    const transferred = +item.transferred || 0;
    const sales = +item.sales || 0;

    const total = opening + purchase;
    const closing = total - sales - transferred;
    const amount = sales * price;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>

      <td><input type="number" value="${opening}" min="0"
                 onchange="updateMRPOpening(${i}, this.value)"></td>

      <td><input type="number" value="${price}" min="0"
                 onchange="updateMRPPrice(${i}, this.value)"></td>

      <td><input type="number" value="${purchase}" min="0"
                 onchange="updateMRPPurchase(${i}, this.value)"></td>

      <td>${transferred}</td>
      <td>${total}</td>
      <td>${closing}</td>
      <td>${sales}</td>
      <td>₹${amount.toFixed(2)}</td>

      <td>
        <div class="action-cell">
          <button class="btn transfer" onclick="transferToBar(${i})">⇄</button>
          <button class="btn sell" onclick="sellFromMRP(${i})">💲</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateMRPOpening(i, v) { mrpData[i].opening = Number(v)||0; saveData(); renderMRP(); }
function updateMRPPrice(i, v)   { mrpData[i].mrpPrice = Number(v)||0; saveData(); renderMRP(); }
function updateMRPPurchase(i, v){ mrpData[i].purchase = Number(v)||0; saveData(); renderMRP(); }

/* ===========================
   TRANSFER
=========================== */
function transferToBar(i) {
  const qty = Number(prompt("Quantity to transfer:")) || 0;
  if (!qty) return;

  const item = mrpData[i];
  const closing = (item.opening + item.purchase) - item.sales - item.transferred;
  if (closing < qty) return alert("Not enough stock.");

  item.transferred += qty;

  let b = barData.find(x => x.name === item.name);
  if (!b)
    barData.push({ name: item.name, opening: qty, price: item.mrpPrice, purchase: 0, sales: 0 });
  else
    b.opening += qty;

  saveData();
  renderMRP();
  renderBar();
}

/* ===========================
   SELL MRP
=========================== */
function sellFromMRP(i) {
  const qty = Number(prompt("Qty sold:")) || 0;
  if (!qty) return;

  const item = mrpData[i];
  const closing = (item.opening + item.purchase) - item.sales - item.transferred;

  if (closing < qty) return alert("Not enough stock.");

  item.sales += qty;

  const date = toISO(new Date());
  if (!dailySales[date]) dailySales[date] = [];

  dailySales[date].push({
    name: item.name,
    qty,
    price: item.mrpPrice,
    section: "MRP"
  });

  saveData();
  saveSummaryToBackend(date);
  renderMRP();
  renderBar();
  renderDailySales();
}

/* ===========================
   RENDER BAR
=========================== */
function renderBar() {
  const tbody = document.querySelector("#barTable tbody");
  tbody.innerHTML = "";

  barData.forEach((item, i) => {
    const opening = +item.opening || 0;
    const price = +item.price || 0;
    const purchase = +item.purchase || 0;
    const sales = +item.sales || 0;

    const total = opening + purchase;
    const closing = total - sales;
    const amount = sales * price;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>

      <td><input type="number" value="${opening}" min="0"
                 onchange="updateBarOpening(${i}, this.value)"></td>

      <td><input type="number" value="${price}" min="0"
                 onchange="updateBarPrice(${i}, this.value)"></td>

      <td><input type="number" value="${purchase}" min="0"
                 onchange="updateBarPurchase(${i}, this.value)"></td>

      <td>${total}</td>
      <td>${closing}</td>
      <td>${sales}</td>
      <td>₹${amount.toFixed(2)}</td>

      <td>
        <div class="action-cell">
          <button class="btn sell" onclick="sellFromBar(${i})">💲</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateBarOpening(i, v) { barData[i].opening = Number(v)||0; saveData(); renderBar(); }
function updateBarPrice(i, v)   { barData[i].price   = Number(v)||0; saveData(); renderBar(); }
function updateBarPurchase(i, v){ barData[i].purchase= Number(v)||0; saveData(); renderBar(); }

/* ===========================
   SELL BAR
=========================== */
function sellFromBar(i) {
  const qty = Number(prompt("Qty sold:")) || 0;
  if (!qty) return;

  const item = barData[i];
  const closing = (item.opening + item.purchase) - item.sales;

  if (closing < qty) return alert("Not enough stock.");

  item.sales += qty;

  const date = toISO(new Date());
  if (!dailySales[date]) dailySales[date] = [];

  dailySales[date].push({
    name: item.name,
    qty,
    price: item.price,
    section: "Bar"
  });

  saveData();
  saveSummaryToBackend(date);
  renderBar();
  renderDailySales();
}

/* ===========================
   BACKEND SUMMARY SAVE
=========================== */
function saveSummaryToBackend(dateISO) {
  const summary = {};

  (dailySales[dateISO] || []).forEach(s => {
    if (!summary[s.name]) summary[s.name] = { mrp: 0, bar: 0 };
    if (s.section === "MRP") summary[s.name].mrp += s.qty;
    else summary[s.name].bar += s.qty;
  });

  fetch(API_BASE + "/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateISO, sales: summary })
  }).catch(console.error);
}

/* ===========================
   DASHBOARD
=========================== */
function renderDailySales() {
  const div = document.getElementById("dailySales");
  div.innerHTML = "";

  const dates = Object.keys(dailySales).sort((a, b) => b.localeCompare(a));

  if (!dates.length) {
    div.innerHTML = "<p>No sales recorded yet.</p>";
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.overflowX = "auto";

  const table = document.createElement("table");
  table.style.minWidth = "720px";

  table.innerHTML = `
    <thead>
      <tr>
        <th>Date</th><th>MRP</th><th>Bar</th><th>Revenue(₹)</th><th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  dates.forEach(date => {
    const entries = dailySales[date] || [];
    const summary = {};
    let totalAmount = 0;

    entries.forEach(s => {
      if (!summary[s.name])
        summary[s.name] = { mrp: 0, bar: 0, price: s.price };

      if (s.section === "MRP") summary[s.name].mrp += s.qty;
      else summary[s.name].bar += s.qty;
    });

    Object.values(summary).forEach(s => {
      totalAmount += (s.mrp + s.bar) * s.price;
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${isoToDisplay(date)}</td>
      <td>${Object.values(summary).reduce((a, c) => a + c.mrp, 0)}</td>
      <td>${Object.values(summary).reduce((a, c) => a + c.bar, 0)}</td>
      <td>₹${totalAmount.toFixed(2)}</td>
      <td>
        <button class="btn view" data-date="${date}">View</button>
        <button class="btn edit" data-date="${date}">Edit</button>
        <button class="btn danger" data-date="${date}">Close Bill</button>
        <button class="btn secondary" data-date="${date}">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  wrap.appendChild(table);
  div.appendChild(wrap);
}

/* ===========================
   SEND EMAIL
=========================== */
async function closeBillFor(dateISO) {
  try {
    const resp = await fetch(API_BASE + "/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateISO })
    });

    if (!resp.ok) return alert("Server error sending email.");

    const data = await resp.json();
    alert(data.message || "Email sent.");
  } catch (err) {
    alert("Network error sending email.");
  }
}

/* ===========================
   INIT
=========================== */
document.addEventListener("DOMContentLoaded", () => {
  loadLocalData();

  // If both lists empty → restore defaults
  if (mrpData.length === 0 && barData.length === 0) {
    initializeItems();
  }

  // Two-way sync
  syncTwoWay();
  saveData();

  renderMRP();
  renderBar();
  renderDailySales();

  window.showSection = showSection;
  window.transferToBar = transferToBar;
  window.sellFromMRP = sellFromMRP;
  window.sellFromBar = sellFromBar;
  window.closeBillFor = closeBillFor;
});


/* ===========================
   script.js — Part 2/3
=========================== */

/* update funcs */
function updateMRPOpening(i, v) { mrpData[i].opening = Number(v) || 0; saveData(); renderMRP(); }
function updateMRPPrice(i, v)   { mrpData[i].mrpPrice = Number(v) || 0; saveData(); renderMRP(); }
function updateMRPPurchase(i, v){ mrpData[i].purchase = Number(v) || 0; saveData(); renderMRP(); }

/* TRANSFER MRP -> BAR */
function transferToBar(i) {
  const qty = Math.max(0, parseInt(prompt("Quantity to transfer:")) || 0);
  if (!qty) return;

  const item = mrpData[i];
  const closing = (Number(item.opening || 0) + Number(item.purchase || 0)) - Number(item.sales || 0) - Number(item.transferred || 0);
  if (closing < qty) return alert("Not enough stock.");

  item.transferred = (Number(item.transferred || 0) + qty);

  let b = barData.find(x => x.name === item.name);
  if (!b) {
    barData.push({ name: item.name, opening: qty, price: item.mrpPrice || 0, purchase: 0, sales: 0 });
  } else {
    b.opening = (Number(b.opening||0) + qty);
    if (!b.price && item.mrpPrice) b.price = item.mrpPrice;
  }

  saveData();
  renderMRP();
  renderBar();
}

/* SELL MRP */
function sellFromMRP(i) {
  const qty = Math.max(0, parseInt(prompt("Qty sold:")) || 0);
  if (!qty) return;

  const item = mrpData[i];
  const closing = (Number(item.opening||0) + Number(item.purchase||0)) - Number(item.sales||0) - Number(item.transferred||0);
  if (closing < qty) return alert("Not enough stock.");

  item.sales = (Number(item.sales||0) + qty);

  const date = toISO(new Date());
  if (!dailySales[date]) dailySales[date] = [];
  dailySales[date].push({ name: item.name, qty, price: item.mrpPrice || 0, section: "MRP" });

  saveData();
  saveSummaryToBackend(date);
  renderMRP();
  renderBar();
  renderDailySales();
}

/* ===========================
   RENDER: BAR
=========================== */
function renderBar() {
  const tbody = document.querySelector("#barTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  barData.forEach((item, i) => {
    const opening = +item.opening || 0;
    const price = +item.price || 0;
    const purchase = +item.purchase || 0;
    const sales = +item.sales || 0;

    const total = opening + purchase;
    const closing = total - sales;
    const amount = sales * price;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>

      <td><input type="number" value="${opening}" min="0" onchange="updateBarOpening(${i}, this.value)"></td>
      <td><input type="number" value="${price}" min="0" onchange="updateBarPrice(${i}, this.value)"></td>
      <td><input type="number" value="${purchase}" min="0" onchange="updateBarPurchase(${i}, this.value)"></td>

      <td>${total}</td>
      <td>${closing}</td>
      <td>${sales}</td>
      <td>₹${amount.toFixed(2)}</td>

      <td>
        <div class="action-cell">
          <button class="btn sell" onclick="sellFromBar(${i})">💲</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateBarOpening(i, v) { barData[i].opening = Number(v) || 0; saveData(); renderBar(); }
function updateBarPrice(i, v)   { barData[i].price   = Number(v) || 0; saveData(); renderBar(); }
function updateBarPurchase(i, v){ barData[i].purchase= Number(v) || 0; saveData(); renderBar(); }

/* SELL BAR */
function sellFromBar(i) {
  const qty = Math.max(0, parseInt(prompt("Qty sold:")) || 0);
  if (!qty) return;

  const item = barData[i];
  const closing = (Number(item.opening||0) + Number(item.purchase||0)) - Number(item.sales||0);
  if (closing < qty) return alert("Not enough stock.");

  item.sales = (Number(item.sales||0) + qty);

  const date = toISO(new Date());
  if (!dailySales[date]) dailySales[date] = [];
  dailySales[date].push({ name: item.name, qty, price: item.price || 0, section: "Bar" });

  saveData();
  saveSummaryToBackend(date);
  renderBar();
  renderDailySales();
}

/* ===========================
   BACKEND SUMMARY SAVE
=========================== */
function saveSummaryToBackend(dateISO) {
  try {
    const summary = {};
    (dailySales[dateISO] || []).forEach(s => {
      if (!summary[s.name]) summary[s.name] = { mrp: 0, bar: 0 };
      if ((s.section || "").toLowerCase() === "mrp") summary[s.name].mrp += Number(s.qty || 0);
      else summary[s.name].bar += Number(s.qty || 0);
    });

    fetch(API_BASE + "/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateISO, sales: summary })
    }).then(async r => {
      if (!r.ok) {
        const txt = await r.text().catch(() => null);
        console.warn("save summary failed", r.status, txt);
      }
    }).catch(console.error);
  } catch (e) {
    console.error("saveSummaryToBackend error", e);
  }
}

/* ===========================
   DASHBOARD (UPGRADED)
   - Builds a clear table with totals
   - Adds full handlers for View/Edit/Close/Delete
   - Uses new modal functions below
=========================== */
function renderDailySales() {
  const div = document.getElementById("dailySales");
  if (!div) return;
  div.innerHTML = "";

  const dates = Object.keys(dailySales).sort((a, b) => b.localeCompare(a));
  if (dates.length === 0) {
    div.innerHTML = "<p>No sales recorded yet.</p>";
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.overflowX = "auto";

  const table = document.createElement("table");
  table.style.minWidth = "760px";
  table.className = "dashboard-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Date</th><th>MRP Items</th><th>Bar Items</th><th>Revenue (₹)</th><th>Actions</th></tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  dates.forEach(dateISO => {
    const entries = dailySales[dateISO] || [];
    const summary = {}; let totalAmount = 0;

    entries.forEach(s => {
      if (!summary[s.name]) summary[s.name] = { mrp: 0, bar: 0, price: s.price || 0 };
      if (s.section === "MRP") summary[s.name].mrp += Number(s.qty || 0);
      else summary[s.name].bar += Number(s.qty || 0);
      if (!summary[s.name].price) summary[s.name].price = Number(s.price || 0);
    });

    Object.keys(summary).forEach(k => {
      totalAmount += (summary[k].mrp + summary[k].bar) * Number(summary[k].price || 0);
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${isoToDisplay(dateISO)}</td>
      <td>${Object.values(summary).reduce((a,c)=>a+(c.mrp||0),0)}</td>
      <td>${Object.values(summary).reduce((a,c)=>a+(c.bar||0),0)}</td>
      <td>₹${Number(totalAmount||0).toFixed(2)}</td>
      <td>
        <button class="btn view" data-date="${dateISO}">View</button>
        <button class="btn edit" data-date="${dateISO}" style="margin-left:6px">Edit</button>
        <button class="btn danger close-bill" data-date="${dateISO}" style="margin-left:6px">Close Bill</button>
        <button class="btn secondary del-day" data-date="${dateISO}" style="margin-left:6px">Delete Day</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  div.appendChild(wrap);

  // ---------- Attach handlers ----------
  div.querySelectorAll("button.view").forEach(b =>
    b.addEventListener("click", () => openModal(b.dataset.date, { readonly: true }))
  );
  div.querySelectorAll("button.edit").forEach(b =>
    b.addEventListener("click", () => openModal(b.dataset.date, { readonly: false }))
  );
  div.querySelectorAll("button.close-bill").forEach(b =>
    b.addEventListener("click", () => {
      const dateISO = b.dataset.date;
      if (confirm("Send email for " + isoToDisplay(dateISO) + " ?")) closeBillFor(dateISO);
    })
  );
  div.querySelectorAll("button.del-day").forEach(b =>
    b.addEventListener("click", () => {
      const dateISO = b.dataset.date;
      if (!confirm("Delete entire day's data for " + isoToDisplay(dateISO) + " ? This cannot be undone.")) return;
      delete dailySales[dateISO];
      localStorage.removeItem(`billClosed_${dateISO}`);
      saveData();
      renderDailySales();
      alert("Deleted day: " + isoToDisplay(dateISO));
    })
  );
}
/* ===========================
   script.js — Part 3/3
=========================== */

/* ===========================
   MODAL (UPGRADED)
   - Shows list of sold items for date
   - Allows inline editing, removal, add new item, save, close bill
=========================== */
function openModal(dateISO, opts = { readonly: false }) {
  currentModalDate = dateISO;
  const modal = document.getElementById("salesModal");
  if (!modal) return;
  modal.style.display = "flex";

  const header = modal.querySelector("#modalDate");
  header.textContent = "Sales Report - " + isoToDisplay(dateISO);

  const modalBody = modal.querySelector("#modalBody");
  modalBody.innerHTML = "";

  // Ensure day array exists
  if (!dailySales[dateISO]) dailySales[dateISO] = [];
  const entries = dailySales[dateISO];

  // Build a responsive table inside modal
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.style.marginBottom = "12px";

  const table = document.createElement("table");
  table.className = "modal-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product</th><th>Section</th><th>Qty</th><th>Price</th><th>Amount</th><th>Action</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  entries.forEach((e, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.section)}</td>
      <td><input class="modal-qty" type="number" min="0" value="${Number(e.qty||0)}" ${opts.readonly ? 'disabled' : ''}></td>
      <td><input class="modal-price" type="number" min="0" value="${Number(e.price||0)}" ${opts.readonly ? 'disabled' : ''}></td>
      <td class="modal-amount">₹${(Number(e.qty||0) * Number(e.price||0)).toFixed(2)}</td>
      <td>${opts.readonly ? '' : '<button class="btn danger modal-remove">Remove</button>'}</td>
    `;
    tbody.appendChild(tr);
  });

  wrap.appendChild(table);
  modalBody.appendChild(wrap);

  // Add controls (Add product + save + close bill) — only when not readonly
  if (!opts.readonly) {
    const formWrap = document.createElement("div");
    formWrap.style.marginTop = "8px";

    const h4 = document.createElement("h4");
    h4.textContent = "Add / Edit Sold Item";
    h4.style.margin = "0 0 8px 0";
    formWrap.appendChild(h4);

    const row = document.createElement("div");
    row.className = "form-row";

    const select = document.createElement("select");
    select.id = "addProductSelect";
    select.setAttribute("aria-label", "Select product");

    // populate select with unique names (default + mrp + bar + existing)
    const names = Array.from(new Set(
      defaultItems.concat(entries.map(x=>x.name)).concat(mrpData.map(x=>x.name)).concat(barData.map(x=>x.name))
    )).sort();

    names.forEach(n => {
      const opt = document.createElement("option");
      opt.value = n; opt.textContent = n;
      select.appendChild(opt);
    });

    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.id = "addQty";
    qtyInput.min = "1";
    qtyInput.value = "1";
    qtyInput.placeholder = "Qty";
    qtyInput.setAttribute("inputmode", "numeric");

    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.id = "addPrice";
    priceInput.min = "0";
    priceInput.value = "0";
    priceInput.placeholder = "Price";

    const sectionSelect = document.createElement("select");
    sectionSelect.id = "addSection";
    ["MRP","Bar"].forEach(s => {
      const o = document.createElement("option"); o.value = s; o.textContent = s; sectionSelect.appendChild(o);
    });

    const addBtn = document.createElement("button");
    addBtn.className = "btn";
    addBtn.id = "modalAddBtn";
    addBtn.textContent = "Add";

    // set default price based on product & section
    function setModalPriceDefaults() {
      const product = select.value || "";
      const section = sectionSelect.value || "MRP";
      const m = mrpData.find(x=>x.name===product);
      const b = barData.find(x=>x.name===product);
      if (section === "MRP") {
        priceInput.value = m ? Number(m.mrpPrice||0) : (b ? Number(b.price||0) : 0);
      } else {
        priceInput.value = b ? Number(b.price||0) : (m ? Number(m.mrpPrice||0) : 0);
      }
    }
    select.addEventListener("change", setModalPriceDefaults);
    sectionSelect.addEventListener("change", setModalPriceDefaults);
    setModalPriceDefaults();

    row.appendChild(select);
    row.appendChild(qtyInput);
    row.appendChild(priceInput);
    row.appendChild(sectionSelect);
    row.appendChild(addBtn);

    formWrap.appendChild(row);

    // Save + Close Bill buttons
    const actionsDiv = document.createElement("div");
    actionsDiv.style.marginTop = "12px";
    actionsDiv.style.textAlign = "right";

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn secondary";
    saveBtn.id = "modalSaveBtn";
    saveBtn.textContent = "Save";

    const closeBillBtn = document.createElement("button");
    closeBillBtn.className = "btn danger";
    closeBillBtn.id = "modalCloseBillBtn";
    closeBillBtn.textContent = "📨 Close Bill";

    actionsDiv.appendChild(saveBtn);
    actionsDiv.appendChild(closeBillBtn);
    formWrap.appendChild(actionsDiv);

    modalBody.appendChild(formWrap);

    // add button handler
    addBtn.addEventListener("click", () => {
      const name = select.value;
      const qty = Math.max(0, parseInt(qtyInput.value) || 0);
      let price = parseFloat(priceInput.value) || 0;
      const section = sectionSelect.value || "MRP";
      if (!name || qty <= 0) return alert("Please enter product and positive quantity.");
      if (!price) {
        price = (section === "MRP") ? (mrpData.find(x=>x.name===name)?.mrpPrice||0) : (barData.find(x=>x.name===name)?.price||0);
      }
      dailySales[dateISO].push({ name, qty, price, section });
      saveData();
      saveSummaryToBackend(dateISO);
      openModal(dateISO, { readonly: false }); // refresh modal
      renderDailySales();
    });

    // save button handler
    saveBtn.addEventListener("click", () => {
      // read rows from tbody
      const rows = Array.from(tbody.querySelectorAll("tr"));
      const newEntries = rows.map(r => {
        const name = r.children[0].textContent;
        const section = r.children[1].textContent;
        const qty = Number(r.querySelector(".modal-qty").value || 0);
        const price = Number(r.querySelector(".modal-price").value || 0);
        return { name, qty, price, section };
      });
      dailySales[dateISO] = newEntries;
      saveData();
      saveSummaryToBackend(dateISO);
      alert("Saved changes for " + isoToDisplay(dateISO));
      renderDailySales();
      openModal(dateISO, { readonly: false });
    });

    // close bill handler
    closeBillBtn.addEventListener("click", () => {
      if (confirm("Send email for " + isoToDisplay(dateISO) + " ?")) {
        closeBillFor(dateISO);
      }
    });
  } // end if not readonly

  // Attach input listeners for modal qty/price to update amount
  tbody.querySelectorAll("input.modal-qty, input.modal-price").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const row = e.target.closest("tr");
      const q = Number(row.querySelector(".modal-qty").value || 0);
      const p = Number(row.querySelector(".modal-price").value || 0);
      row.querySelector(".modal-amount").textContent = "₹" + (q * p).toFixed(2);
    });
  });

  // remove handlers
  tbody.querySelectorAll("button.modal-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const row = e.target.closest("tr");
      const idx = Number(row.dataset.idx);
      if (!confirm("Delete this sold item?")) return;
      dailySales[dateISO].splice(idx, 1);
      saveData();
      saveSummaryToBackend(dateISO);
      openModal(dateISO, { readonly: false });
      renderDailySales();
    });
  });

  // Close icon handler
  const closeBtn = modal.querySelector("#modalCloseBtn");
  if (closeBtn) closeBtn.onclick = closeModal;
}

function closeModal() {
  const modal = document.getElementById("salesModal");
  if (!modal) return;
  modal.style.display = "none";
  currentModalDate = null;
}

/* ===========================
   SEND EMAIL
=========================== */
async function closeBillFor(dateISO) {
  try {
    const resp = await fetch(API_BASE + "/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateISO })
    });
    const txt = await resp.text();
    let data;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = { raw: txt }; }
    if (!resp.ok) {
      console.error("send-email failed", resp.status, data);
      alert("Server returned error while sending email. See console for details.");
      return;
    }
    const countKey = `emailSentCount_${dateISO}`;
    const prev = parseInt(localStorage.getItem(countKey) || "0", 10) || 0;
    localStorage.setItem(countKey, String(prev + 1));
    alert((data && data.message) ? data.message : ("Email sent for " + isoToDisplay(dateISO)));
    renderDailySales();
  } catch (err) {
    console.error("closeBillFor error:", err);
    alert("Failed to send email (network or exception). See console for details.");
  }
}

/* ===========================
   INIT
=========================== */
document.addEventListener("DOMContentLoaded", () => {
  loadLocalData();

  // If both lists empty → restore defaults
  if (mrpData.length === 0 && barData.length === 0) {
    initializeItems();
  }

  // Two-way sync to ensure names match
  syncTwoWay();
  saveData();

  // render UI
  renderMRP();
  renderBar();
  renderDailySales();

  // expose some functions for HTML inline handlers
  window.showSection = showSection;
  window.transferToBar = transferToBar;
  window.sellFromMRP = sellFromMRP;
  window.sellFromBar = sellFromBar;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.closeBillFor = closeBillFor;
});
