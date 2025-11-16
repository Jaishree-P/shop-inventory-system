/* ===========================
   CONFIG
   =========================== */
const API_BASE = (function(){
  if (
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  ) {
    return "http://127.0.0.1:5050/api";   // ★ YOUR LOCAL BACKEND ★
  }
  return "https://shop-inventory-system-gcil.onrender.com/api"; // keep for future deployment
})();


/* ---------------------------
   Default Items & State
   --------------------------- */
const defaultItems = [
  "2 Litre Water","1 Liter water","500 ML water","soda 750ml",
  "600ml cool drinks","250ml cool drinks","5rs glass","3rs glass","2rs glass","chips","boti","water packet",
  "mixer","cover big","cover medium","cover small"
];

let mrpData = [];
let barData = [];
let dailySales = {}; // dailySales[ISO] = [{name, qty, price, section}]
let currentModalDate = null;

/* ---------------------------
   Helpers
   --------------------------- */
function toISO(dateLike){
  if(!dateLike) return new Date().toISOString().split('T')[0];
  if(typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) return dateLike;
  const d = new Date(dateLike);
  if(isNaN(d)) return new Date().toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
}
function isoToDisplay(iso){
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString();
}
function normalizeDailySales(raw){
  const out = {};
  Object.keys(raw || {}).forEach(k => { out[toISO(k)] = raw[k]; });
  return out;
}
function escapeHtml(unsafe){
  if(unsafe === null || unsafe === undefined) return "";
  return String(unsafe).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ---------------------------
   Persistence (localStorage)
   --------------------------- */
function saveData(){
  try {
    localStorage.setItem("mrpData", JSON.stringify(mrpData));
    localStorage.setItem("barData", JSON.stringify(barData));
    localStorage.setItem("dailySales", JSON.stringify(dailySales));
  } catch(e){
    console.error("saveData error:", e);
  }
}
function loadLocalData(){
  try {
    const mrp = localStorage.getItem("mrpData");
    const bar = localStorage.getItem("barData");
    const sales = localStorage.getItem("dailySales");
    if(mrp) mrpData = JSON.parse(mrp);
    if(bar) barData = JSON.parse(bar);
    if(sales){
      try { dailySales = normalizeDailySales(JSON.parse(sales)); } catch(e){ dailySales = {}; }
    }
  } catch(e){
    console.warn("loadLocalData failed:", e);
    mrpData = []; barData = []; dailySales = {};
  }
  if(!Array.isArray(mrpData) || mrpData.length === 0) initializeItems();
}

/* ---------------------------
   Init
   --------------------------- */
function initializeItems(){
  mrpData = defaultItems.map(name => ({
    name,
    opening:0,
    mrpPrice:0,
    purchase:0,
    transferred:0,
    sales:0
  }));
  barData = defaultItems.map(name => ({
    name,
    opening:0,
    price:0,
    purchase:0,
    sales:0
  })); // prepopulate bar so UI shows same names
  saveData();
}

/* ---------------------------
   UI: Sections
   --------------------------- */
function showSection(section){
  document.querySelectorAll(".container").forEach(div=>div.classList.remove("active-section"));
  const el = document.getElementById(section); if(el) el.classList.add("active-section");
  document.querySelectorAll("nav a").forEach(a=>a.classList.remove("active"));
  const map = { mrp:"nav-mrp", bar:"nav-bar", dashboard:"nav-dashboard" };
  const nav = document.getElementById(map[section]); if(nav) nav.classList.add("active");
}

/* ---------------------------
   MRP Rendering & Logic
   --------------------------- */
function renderMRP(){
  const tbody = document.querySelector("#mrpTable tbody");
  if(!tbody) return;
  tbody.innerHTML = "";

  mrpData.forEach((item,i) => {
    const opening = Number(item.opening || 0);
    const price = Number(item.mrpPrice || 0);
    const purchase = Number(item.purchase || 0);
    const transferred = Number(item.transferred || 0);
    const sales = Number(item.sales || 0);

    const total = opening + purchase;
    const closing = total - sales - transferred;
    const amount = sales * price;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Items">${escapeHtml(item.name)}</td>

      <td data-label="Opening Balance">
        <input type="number" min="0" value="${opening}"
               onchange="updateMRPOpening(${i}, this.value)">
      </td>

      <td data-label="Amt per Quantity">
        <input type="number" min="0" value="${price}"
               onchange="updateMRPPrice(${i}, this.value)">
      </td>

      <td data-label="Purchase">
        <input type="number" min="0" value="${purchase}"
               onchange="updateMRPPurchase(${i}, this.value)">
      </td>

      <td data-label="Transferred">${transferred}</td>

      <td data-label="Total">${total}</td>

      <td data-label="Closing Balance">${closing}</td>

      <td data-label="Sales">${sales}</td>

      <td data-label="Amount">₹${amount.toFixed(2)}</td>

      <td data-label="Action">
        <div class="action-cell">
          <button class="btn transfer" onclick="transferToBar(${i})">⇄ Transfer</button>
          <button class="btn sell" onclick="sellFromMRP(${i})">💲 Sell</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateMRPOpening(index, val){ mrpData[index].opening = Math.max(0, parseInt(val||0)||0); saveData(); renderMRP(); }
function updateMRPPrice(index, val){ mrpData[index].mrpPrice = Math.max(0, parseFloat(val||0)||0); saveData(); renderMRP(); }
function updateMRPPurchase(index, val){ mrpData[index].purchase = Math.max(0, parseInt(val||0)||0); saveData(); renderMRP(); }

/* transfer from MRP -> Bar: increases mrp.transferred and adds to BAR opening */
function transferToBar(index){
  const qtyStr = prompt("Enter quantity to TRANSFER to Bar (numbers only):");
  if(qtyStr === null) return;
  const qty = parseInt(String(qtyStr).replace(/\D/g,'')) || 0;
  if(qty <= 0) return alert("Please enter a positive number.");
  const item = mrpData[index];
  const opening = Number(item.opening || 0);
  const purchase = Number(item.purchase || 0);
  const sales = Number(item.sales || 0);
  const transferred = Number(item.transferred || 0);
  const closing = (opening + purchase) - sales - transferred;
  if(closing < qty) return alert("Not enough stock in MRP to transfer!");

  // update MRP transferred
  item.transferred = transferred + qty;

  // add to BAR opening (create if missing)
  const name = item.name;
  let bIndex = barData.findIndex(b => b.name === name);
  if(bIndex === -1){
    barData.push({ name, opening: qty, price: item.mrpPrice || 0, purchase:0, sales:0 });
  } else {
    barData[bIndex].opening = (Number(barData[bIndex].opening||0) + qty);
    if(!barData[bIndex].price) barData[bIndex].price = item.mrpPrice || 0;
  }

  saveData();
  renderMRP();
  renderBar();
  alert(`Transferred ${qty} × ${item.name} to Bar (added to Opening).`);
}

function sellFromMRP(index){
  const qtyStr = prompt("Enter quantity sold at MRP price (numbers only):");
  if(qtyStr === null) return;
  const qty = parseInt(String(qtyStr).replace(/\D/g,'')) || 0;
  if(qty <= 0) return alert("Please enter a positive number.");

  const item = mrpData[index];
  const opening = Number(item.opening || 0);
  const purchase = Number(item.purchase || 0);
  const transferred = Number(item.transferred || 0);
  const sales = Number(item.sales || 0);

  const closing = (opening + purchase) - sales - transferred;
  if(closing < qty) return alert("Not enough stock in MRP to sell!");

  item.sales = sales + qty;

  const dateISO = toISO(new Date());
  if(!dailySales[dateISO]) dailySales[dateISO] = [];
  dailySales[dateISO].push({
    name: item.name,
    qty,
    price: item.mrpPrice || 0,
    section: "MRP"
  });

  saveData();
  saveSummaryToBackend(dateISO);
  renderMRP();
  renderBar();
  renderDailySales();

  alert(`Sold ${qty} × ${item.name} at MRP ₹${item.mrpPrice || 0}`);
}

/* ---------------------------
   BAR Rendering & Logic (same formulas as MRP but NO transfer column)
   --------------------------- */
function renderBar(){
  const tbody = document.querySelector("#barTable tbody");
  if(!tbody) return;
  tbody.innerHTML = "";

  barData.forEach((item,i) => {
    const opening = Number(item.opening || 0);
    const price = Number(item.price || 0);
    const purchase = Number(item.purchase || 0);
    const sales = Number(item.sales || 0);

    const total = opening + purchase;
    const closing = total - sales;
    const amount = sales * price;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Items">${escapeHtml(item.name)}</td>

      <td data-label="Opening Balance">
        <input type="number" min="0" value="${opening}"
               onchange="updateBarOpening(${i}, this.value)">
      </td>

      <td data-label="Amt per Quantity">
        <input type="number" min="0" value="${price}"
               onchange="updateBarPrice(${i}, this.value)">
      </td>

      <td data-label="Purchase">
        <input type="number" min="0" value="${purchase}"
               onchange="updateBarPurchase(${i}, this.value)">
      </td>

      <td data-label="Total">${total}</td>

      <td data-label="Closing Balance">${closing}</td>

      <td data-label="Sales">${sales}</td>

      <td data-label="Amount">₹${amount.toFixed(2)}</td>

      <td data-label="Action">
        <div class="action-cell">
          <button class="btn sell" onclick="sellFromBar(${i})">💲 Sell</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateBarOpening(i, val){
  barData[i].opening = Math.max(0, parseInt(val||0)||0);
  saveData(); renderBar();
}
function updateBarPrice(i, val){
  barData[i].price = Math.max(0, parseFloat(val||0)||0);
  saveData(); renderBar();
}
function updateBarPurchase(i, val){
  barData[i].purchase = Math.max(0, parseInt(val||0)||0);
  saveData(); renderBar();
}

function sellFromBar(i){
  const qtyStr = prompt("Enter quantity sold at Bar price (numbers only):");
  if(qtyStr === null) return;
  const qty = parseInt(String(qtyStr).replace(/\D/g,'')) || 0;
  if(qty <= 0) return alert("Please enter a positive number.");

  const item = barData[i];
  const opening = Number(item.opening || 0);
  const purchase = Number(item.purchase || 0);
  const sales = Number(item.sales || 0);

  const total = opening + purchase;
  const closing = total - sales;
  if(closing < qty) return alert("Not enough stock in Bar to sell!");

  item.sales = sales + qty;

  const dateISO = toISO(new Date());
  if(!dailySales[dateISO]) dailySales[dateISO] = [];
  dailySales[dateISO].push({
    name: item.name,
    qty,
    price: item.price || 0,
    section: "Bar"
  });

  saveData();
  saveSummaryToBackend(dateISO);
  renderBar();
  renderDailySales();

  alert(`Sold ${qty} × ${item.name} at Bar ₹${item.price || 0}`);
}

/* ---------------------------
   Sales helpers
   --------------------------- */
function logDailySale(name, qty, price, section, dateISO = null){
  const iso = dateISO || toISO(new Date());
  if(!dailySales[iso]) dailySales[iso] = [];
  dailySales[iso].push({ name, qty: Number(qty||0), price: Number(price||0), section });
  saveData();
  renderDailySales();
  saveSummaryToBackend(iso);
}

/* ---------------------------
   Save summary to backend
   --------------------------- */
function saveSummaryToBackend(dateISO){
  const entries = dailySales[dateISO] || [];
  const summary = {};
  entries.forEach(s=>{
    if(!summary[s.name]) summary[s.name] = { mrp:0, bar:0 };
    const k = (s.section || "").toLowerCase();
    if(k === "mrp") summary[s.name].mrp += Number(s.qty || 0);
    else summary[s.name].bar += Number(s.qty || 0);
  });

  fetch(API_BASE + "/sales", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ date: dateISO, sales: summary })
  }).then(async r=>{
    if(!r.ok){
      const txt = await r.text().catch(()=>null);
      console.warn("saveSummaryToBackend failed:", r.status, txt);
      return;
    }
    return r.json();
  }).then(d=>{ if(d) console.log("Saved summary to backend:", d); })
  .catch(e=>console.error("Save summary error:", e));
}

/* ---------------------------
   Dashboard + modal
   --------------------------- */
function renderDailySales(){
  const div = document.getElementById("dailySales"); if(!div) return;
  div.innerHTML = "";
  const dates = Object.keys(dailySales).sort((a,b)=> b.localeCompare(a));
  if(dates.length === 0){ div.innerHTML = "<p>No sales recorded yet.</p>"; return; }

  const wrap = document.createElement("div"); wrap.style.overflowX="auto"; wrap.style.marginTop="6px";
  const table = document.createElement("table"); table.style.minWidth="760px";
  table.innerHTML = `<thead><tr><th>Date</th><th>MRP Items</th><th>Bar Items</th><th>Revenue (₹)</th><th>Actions</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  dates.forEach(dateISO=>{
    const entries = dailySales[dateISO] || [];
    const summary = {}; let totalAmount = 0;
    entries.forEach(s=>{
      if(!summary[s.name]) summary[s.name] = { mrp:0, bar:0, price: s.price || 0 };
      if(s.section === "MRP") summary[s.name].mrp += Number(s.qty || 0);
      else summary[s.name].bar += Number(s.qty || 0);
      if(!summary[s.name].price) summary[s.name].price = Number(s.price || 0);
    });
    Object.keys(summary).forEach(p=>{
      const price = Number(summary[p].price || 0);
      totalAmount += (summary[p].mrp + summary[p].bar) * price;
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${isoToDisplay(dateISO)}</td>
      <td>${Object.values(summary).reduce((a,c)=>a + (c.mrp||0),0)}</td>
      <td>${Object.values(summary).reduce((a,c)=>a + (c.bar||0),0)}</td>
      <td>₹${Number(totalAmount||0).toFixed(2)}</td>
      <td>
        <button class="btn view" data-date="${dateISO}">View</button>
        <button class="btn edit" data-date="${dateISO}" style="margin-left:6px">Edit</button>
        <button class="btn danger" data-date="${dateISO}" style="margin-left:6px">Close Bill</button>
        <button class="btn secondary" data-date="${dateISO}" style="margin-left:6px">Delete Day</button>
      </td>`;
    tbody.appendChild(tr);
  });

  wrap.appendChild(table); div.appendChild(wrap);

  div.querySelectorAll("button.view").forEach(b=>b.addEventListener("click", ()=>openModal(b.dataset.date, { readonly:true })));
  div.querySelectorAll("button.edit").forEach(b=>b.addEventListener("click", ()=>openModal(b.dataset.date, { readonly:false })));
  div.querySelectorAll("button.danger").forEach(b=>b.addEventListener("click", ()=> {
    const dateISO = b.dataset.date;
    if(confirm("Send email for " + isoToDisplay(dateISO) + " ?")) closeBillFor(dateISO);
  }));
  div.querySelectorAll("button.secondary").forEach(b=>b.addEventListener("click", ()=> {
    const dateISO = b.dataset.date;
    if(!confirm("Delete entire day's data for " + isoToDisplay(dateISO) + " ? This cannot be undone.")) return;
    delete dailySales[dateISO];
    localStorage.removeItem(`billClosed_${dateISO}`);
    saveData();
    renderDailySales();
    alert("Deleted day: " + isoToDisplay(dateISO));
  }));
}

/* modal open/close */
function openModal(dateISO, opts = { readonly:false }){
  currentModalDate = dateISO;
  const modal = document.getElementById("salesModal"); modal.style.display = "flex";
  document.getElementById("modalDate").textContent = "Sales Report - " + isoToDisplay(dateISO);
  const tbody = document.querySelector("#modalTable tbody"); tbody.innerHTML = "";
  if(!dailySales[dateISO]) dailySales[dateISO] = [];
  const entries = dailySales[dateISO];

  entries.forEach((e, idx) => {
    const tr = document.createElement("tr"); tr.dataset.idx = idx;
    tr.innerHTML = `
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.section)}</td>
      <td><input class="modal-qty" type="number" min="0" value="${Number(e.qty||0)}" ${opts.readonly ? 'disabled' : ''}></td>
      <td><input class="modal-price" type="number" min="0" value="${Number(e.price||0)}" ${opts.readonly ? 'disabled' : ''}></td>
      <td class="modal-amount">₹${((Number(e.qty||0)) * (Number(e.price||0))).toFixed(2)}</td>
      <td>${opts.readonly ? '' : '<button class="btn danger modal-remove">Remove</button>'}</td>
    `;
    tbody.appendChild(tr);
  });

  const select = document.getElementById("addProductSelect"); select.innerHTML = "";
  const names = Array.from(new Set(defaultItems.concat(entries.map(x=>x.name)).concat(mrpData.map(x=>x.name)).concat(barData.map(x=>x.name))));
  names.forEach(n => { const opt = document.createElement("option"); opt.value = n; opt.textContent = n; select.appendChild(opt); });

  setModalPriceDefaults();

  const addBtn = document.getElementById("modalAddBtn");
  const saveBtn = document.getElementById("modalSaveBtn");
  addBtn.disabled = !!opts.readonly;
  saveBtn.disabled = !!opts.readonly;

  tbody.querySelectorAll("input.modal-qty, input.modal-price").forEach(inp=>{
    inp.addEventListener("input", e=>{
      const row = e.target.closest("tr");
      const qty = Number(row.querySelector("input.modal-qty").value || 0);
      const price = Number(row.querySelector("input.modal-price").value || 0);
      row.querySelector(".modal-amount").textContent = "₹" + (qty * price).toFixed(2);
    });
  });

  tbody.querySelectorAll("button.modal-remove").forEach(btn=>{
    btn.addEventListener("click", e=>{
      const row = e.target.closest("tr"); const idx = Number(row.dataset.idx);
      if(!confirm("Delete this sold item?")) return;
      dailySales[dateISO].splice(idx,1);
      saveData();
      openModal(dateISO, opts);
      renderDailySales();
    });
  });
}

function closeModal(){ const modal = document.getElementById("salesModal"); if(modal) modal.style.display = "none"; currentModalDate = null; }
document.getElementById("modalCloseBtn").addEventListener("click", closeModal);

function setModalPriceDefaults(){
  const productEl = document.getElementById("addProductSelect");
  const sectionEl = document.getElementById("addSection");
  const priceField = document.getElementById("addPrice");
  if(!productEl || !sectionEl || !priceField) return;
  const product = productEl.value || "";
  const section = sectionEl.value || "MRP";
  const m = mrpData.find(x=>x.name===product);
  if(section === "MRP"){
    priceField.value = m ? Number(m.mrpPrice || 0) : 0;
  } else {
    const b = barData.find(x=>x.name===product);
    priceField.value = b ? Number(b.price || 0) : (m ? Number(m.mrpPrice||0) : 0);
  }
}
document.getElementById("addProductSelect").addEventListener("change", setModalPriceDefaults);
document.getElementById("addSection").addEventListener("change", setModalPriceDefaults);

/* modal add */
document.getElementById("modalAddBtn").addEventListener("click", ()=>{
  if(!currentModalDate) return alert("Open a date first.");
  const name = document.getElementById("addProductSelect").value;
  const qty = parseInt(document.getElementById("addQty").value) || 0;
  let price = parseFloat(document.getElementById("addPrice").value) || 0;
  const section = document.getElementById("addSection").value || "MRP";
  if(!name || qty <= 0) return alert("Please enter product and numeric positive quantity.");
  if(!price){
    price = section === "MRP" ? (mrpData.find(x=>x.name===name)?.mrpPrice||0) : (barData.find(x=>x.name===name)?.price||0);
  }
  if(!dailySales[currentModalDate]) dailySales[currentModalDate] = [];
  dailySales[currentModalDate].push({ name, qty, price, section });
  saveData(); saveSummaryToBackend(currentModalDate);
  openModal(currentModalDate, { readonly:false }); renderDailySales();
});

/* modal save */
document.getElementById("modalSaveBtn").addEventListener("click", ()=>{
  if(!currentModalDate) return;
  const tbody = document.querySelector("#modalTable tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));
  const newEntries = rows.map(row=>{
    const name = row.children[0].textContent;
    const section = row.children[1].textContent;
    const qty = Number(row.querySelector("input.modal-qty").value || 0);
    const price = Number(row.querySelector("input.modal-price").value || 0);
    return { name, qty, price, section };
  });
  dailySales[currentModalDate] = newEntries;
  saveData(); saveSummaryToBackend(currentModalDate);
  alert("Saved changes for " + isoToDisplay(currentModalDate));
  renderDailySales();
  openModal(currentModalDate, { readonly:false });
});

/* close bill (send email) */
async function closeBillFor(dateISO){
  try {
    const resp = await fetch(API_BASE + "/send-email", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ date: dateISO })
    });
    const text = await resp.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch(e){ data = { raw:text }; }
    if(!resp.ok){ console.error("send-email failed", resp.status, resp.statusText, data); alert("Server returned error (see console)."); return; }
    const countKey = `emailSentCount_${dateISO}`;
    const prev = parseInt(localStorage.getItem(countKey) || "0", 10) || 0;
    localStorage.setItem(countKey, String(prev+1));
    alert((data && data.message) ? data.message : ("Email sent for " + isoToDisplay(dateISO)));
    renderDailySales();
  } catch (err) {
    console.error("closeBillFor error (network/exception):", err);
    alert("Failed to send email (network or exception). See console for details.");
  }
}
document.getElementById("modalCloseBillBtn").addEventListener("click", ()=>{ if(currentModalDate) closeBillFor(currentModalDate); });

/* ---------------------------
   Init & bindings
   --------------------------- */
document.addEventListener("DOMContentLoaded", ()=>{
  loadLocalData();
  renderMRP();
  renderBar();
  renderDailySales();

  // expose globals
  window.showSection = showSection;
  window.transferToBar = transferToBar;
  window.sellFromMRP = sellFromMRP;
  window.sellFromBar = sellFromBar;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.closeBillFor = closeBillFor;
});
