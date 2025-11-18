/* ===========================
   Shop Inventory - frontend
   Updated script.js (full file)
   =========================== */

/* ---------------------------
   DEFAULT ITEMS & STATE
   --------------------------- */
const defaultItems = [
  "2 Litre Water","1 Liter water","500 ML water","soda 750ml",
  "600ml cool drinks","250ml cool drinks","5rs glass","3rs glass",
  "2rs glass","chips","boti","water packet","mixer",
  "cover big","cover medium","cover small"
];

let mrpData = [];
let barData = [];
let dailySales = {}; // dailySales[ISO] = [{name, qty, price, section, isTransfer}]
let currentModalDate = null;

/* ---------------------------
   HELPERS
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
function escapeHtml(unsafe){
  if(unsafe === null || unsafe === undefined) return "";
  return String(unsafe).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* Toast */
let toastTimer = null;
function ensureToastElement(){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id = "toast";
    t.style.position = "fixed";
    t.style.bottom = "18px";
    t.style.left = "50%";
    t.style.transform = "translateX(-50%)";
    t.style.background = "rgba(0,0,0,0.8)";
    t.style.color = "white";
    t.style.padding = "8px 12px";
    t.style.borderRadius = "8px";
    t.style.display = "none";
    t.style.zIndex = 9999;
    t.style.maxWidth = "90%";
    t.style.textAlign = "center";
    document.body.appendChild(t);
  }
  return t;
}
function showToast(msg, ms = 2000){
  const t = ensureToastElement();
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.style.display = "none"; }, ms);
}

/* ---------------------------
   Persistence (localStorage)
   --------------------------- */
function saveData(){
  try{
    localStorage.setItem("mrpData", JSON.stringify(mrpData));
    localStorage.setItem("barData", JSON.stringify(barData));
    localStorage.setItem("dailySales", JSON.stringify(dailySales));
  } catch(e){ console.error("saveData error:", e); }
}
function loadLocalData(){
  try{
    const mrp = localStorage.getItem("mrpData");
    const bar = localStorage.getItem("barData");
    const sales = localStorage.getItem("dailySales");
    if(mrp) mrpData = JSON.parse(mrp);
    if(bar) barData = JSON.parse(bar);
    if(sales){
      try { dailySales = JSON.parse(sales); } catch(e){ dailySales = {}; }
    }
  } catch(e){
    console.warn("loadLocalData failed:", e);
    mrpData = []; barData = []; dailySales = {};
  }
  if(!Array.isArray(mrpData) || mrpData.length === 0) initializeItems();
  if(!Array.isArray(barData) || barData.length === 0) initializeItemsBarOnly();
}

/* ---------------------------
   Initialize (default items)
   --------------------------- */
function initializeItems(){
  mrpData = defaultItems.map(name => ({
    name,
    opening:0,
    openingLocked:false,
    mrpPrice:0,
    purchases:0,
    transferred:0,
    sales:0
  }));
  barData = defaultItems.map(name => ({
    name,
    opening:0,
    openingLocked:false,
    price:0,
    purchases:0,
    sales:0
  }));
  saveData();
}
function initializeItemsBarOnly(){
  if(!Array.isArray(barData) || barData.length === 0){
    barData = defaultItems.map(name => ({
      name,
      opening:0,
      openingLocked:false,
      price:0,
      purchases:0,
      sales:0
    }));
  }
  saveData();
}

/* ---------------------------
   UI: Sections
   --------------------------- */
function showSection(section){
  document.querySelectorAll(".container").forEach(div=>div.classList.remove("active-section"));
  const el = document.getElementById(section); if(el) el.classList.add("active-section");
  document.querySelectorAll("nav a").forEach(a=>a.classList.remove("active"));
  const map = { mrp:"nav-mrp", bar:"nav-bar", transfer:"nav-transfer", dashboard:"nav-dashboard" };
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
    const purchases = Number(item.purchases || 0);
    const transferred = Number(item.transferred || 0);
    const sales = Number(item.sales || 0);

    const total = opening + purchases;
    const closing = total - sales - transferred;
    const amount = (sales + transferred) * price;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>

      <td>
        <div style="display:flex;gap:6px;align-items:center;">
          <input type="number" min="0" value="${opening}" ${item.openingLocked ? 'disabled' : ''} onchange="updateMRPOpening(${i}, this.value)">
          ${item.openingLocked ? '<button class="unlock-btn" onclick="unlockMRPOpening('+i+')">Unlock Opening</button>' : ''}
        </div>
      </td>

      <td>
        <input type="number" min="0" value="${price}" onchange="updateMRPPrice(${i}, this.value)">
      </td>

      <td>
        <input type="number" min="0" value="${purchases}" onchange="updateMRPPurchases(${i}, this.value)">
      </td>

      <td>${total}</td>

      <td>${closing}</td>

      <td>${sales}</td>

      <td>₹${amount.toFixed(2)}</td>

      <td>
        <div class="action-cell">
          <button class="btn sell" onclick="sellFromMRP(${i})">💲 Sell</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Ensure header label "Purchase" -> "Inward"
  const mrpHeadCells = document.querySelectorAll("#mrpTable thead th");
  mrpHeadCells.forEach(th => {
    if(/purchase/i.test(th.textContent)) th.textContent = "Inward";
  });
}

function updateMRPOpening(index, val){
  const num = Math.max(0, parseInt(val||0)||0);
  mrpData[index].opening = num;
  if(num > 0) mrpData[index].openingLocked = true;
  saveData(); renderMRP();
}
function unlockMRPOpening(index){
  mrpData[index].openingLocked = false;
  saveData(); renderMRP();
}
function updateMRPPrice(index, val){
  mrpData[index].mrpPrice = Math.max(0, parseFloat(val||0)||0);
  saveData(); renderMRP();
}
function updateMRPPurchases(index, val){
  mrpData[index].purchases = Math.max(0, parseInt(val||0)||0);
  saveData(); renderMRP();
}

function sellFromMRP(index){
  const qtyStr = prompt("Enter quantity sold at MRP price (numbers only):");
  if(qtyStr === null) return;
  const qty = Math.max(0, parseInt(String(qtyStr).replace(/\D/g,'')) || 0);
  if(qty <= 0) return alert("Please enter a positive number.");

  const item = mrpData[index];
  const opening = Number(item.opening || 0);
  const purchases = Number(item.purchases || 0);
  const transferred = Number(item.transferred || 0);
  const sales = Number(item.sales || 0);
  const closing = (opening + purchases) - sales - transferred;
  if(closing < qty) return alert("Not enough stock in MRP to sell!");

  item.sales = sales + qty;

  const dateISO = toISO(new Date());
  if(!dailySales[dateISO]) dailySales[dateISO] = [];
  dailySales[dateISO].push({
    name: item.name,
    qty,
    price: item.mrpPrice || 0,
    section: "MRP",
    isTransfer: false
  });

  saveData();
  showToast(`Sold ${qty} × ${item.name} (MRP)`);
  renderMRP();
  renderBar();
  renderDailySales();
}

/* ---------------------------
   BAR Rendering & Logic
   --------------------------- */
function renderBar(){
  const tbody = document.querySelector("#barTable tbody");
  if(!tbody) return;
  tbody.innerHTML = "";

  barData.forEach((item,i) => {
    const opening = Number(item.opening || 0);
    const price = Number(item.price || 0);
    const purchases = Number(item.purchases || 0);
    const sales = Number(item.sales || 0);

    const total = opening + purchases;
    const closing = total - sales;
    const amount = sales * price;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>

      <td>
        <div style="display:flex;gap:6px;align-items:center;">
          <input type="number" min="0" value="${opening}" ${item.openingLocked ? 'disabled' : ''} onchange="updateBarOpening(${i}, this.value)">
          ${item.openingLocked ? '<button class="unlock-btn" onclick="unlockBarOpening('+i+')">Unlock Opening</button>' : ''}
        </div>
      </td>

      <td>
        <input type="number" min="0" value="${price}" onchange="updateBarPrice(${i}, this.value)">
      </td>

      <td>
        <input type="number" min="0" value="${purchases}" onchange="updateBarPurchases(${i}, this.value)">
      </td>

      <td>${total}</td>
      <td>${closing}</td>
      <td>${sales}</td>
      <td>₹${amount.toFixed(2)}</td>

      <td>
        <div class="action-cell">
          <button class="btn sell" onclick="sellFromBar(${i})">💲 Sell</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Ensure header label "Purchase" -> "Inward"
  const barHeadCells = document.querySelectorAll("#barTable thead th");
  barHeadCells.forEach(th => {
    if(/purchase/i.test(th.textContent)) th.textContent = "Inward";
  });
}

function updateBarOpening(i, val){
  const num = Math.max(0, parseInt(val||0)||0);
  barData[i].opening = num;
  if(num > 0) barData[i].openingLocked = true;
  saveData(); renderBar();
}
function unlockBarOpening(i){
  barData[i].openingLocked = false;
  saveData(); renderBar();
}
function updateBarPrice(i, val){
  barData[i].price = Math.max(0, parseFloat(val||0)||0); saveData(); renderBar();
}
function updateBarPurchases(i, val){
  barData[i].purchases = Math.max(0, parseInt(val||0)||0); saveData(); renderBar();
}

function sellFromBar(i){
  const qtyStr = prompt("Enter quantity sold at Bar price (numbers only):");
  if(qtyStr === null) return;
  const qty = Math.max(0, parseInt(String(qtyStr).replace(/\D/g,'')) || 0);
  if(qty <= 0) return alert("Please enter a positive number.");

  const item = barData[i];
  const opening = Number(item.opening || 0);
  const purchases = Number(item.purchases || 0);
  const sales = Number(item.sales || 0);
  const closing = (opening + purchases) - sales;
  if(closing < qty) return alert("Not enough stock in Bar to sell!");

  item.sales = sales + qty;

  const dateISO = toISO(new Date());
  if(!dailySales[dateISO]) dailySales[dateISO] = [];
  dailySales[dateISO].push({
    name: item.name,
    qty,
    price: item.price || 0,
    section: "Bar",
    isTransfer: false
  });

  saveData();
  showToast(`Sold ${qty} × ${item.name} (Bar)`);
  renderBar();
  renderDailySales();
}

/* ---------------------------
   Transfer logic (new tab)
   --------------------------- */
function populateTransferProducts(){
  const sel = document.getElementById("transferProduct");
  if(!sel) return;
  sel.innerHTML = "";
  const names = Array.from(new Set( mrpData.map(x=>x.name).concat(barData.map(x=>x.name)) )).sort();
  names.forEach(n=>{
    const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o);
  });
  setTransferPriceDefault();
}

function setTransferPriceDefault(){
  const directionEl = document.getElementById("transferDirection");
  const productEl = document.getElementById("transferProduct");
  const priceField = document.getElementById("transferPrice");
  if(!directionEl || !productEl || !priceField) return;
  const direction = directionEl.value;
  const product = productEl.value || "";
  if(direction === "MRP_TO_BAR"){
    const m = mrpData.find(x=>x.name===product);
    priceField.value = m ? Number(m.mrpPrice||0) : 0;
  } else {
    const b = barData.find(x=>x.name===product);
    priceField.value = b ? Number(b.price||0) : 0;
  }
}

function doTransferAction(){
  const directionEl = document.getElementById("transferDirection");
  const productEl = document.getElementById("transferProduct");
  const qtyEl = document.getElementById("transferQty");
  if(!directionEl || !productEl || !qtyEl) return alert("Transfer UI missing elements.");
  const direction = directionEl.value;
  const product = productEl.value;
  const qty = Math.max(0, parseInt(qtyEl.value)||0);
  if(!product) return alert("Select product.");
  if(qty <= 0) return alert("Enter positive quantity.");

  if(direction === "MRP_TO_BAR"){
    const mIndex = mrpData.findIndex(x=>x.name===product);
    if(mIndex === -1) return alert("Product not found in MRP.");
    const m = mrpData[mIndex];
    const closing = (Number(m.opening||0) + Number(m.purchases||0)) - Number(m.sales||0) - Number(m.transferred||0);
    if(closing < qty) return alert("Not enough stock in MRP to transfer.");

    m.transferred = Number(m.transferred||0) + qty;

    let bIndex = barData.findIndex(x=>x.name===product);
    if(bIndex === -1){
      barData.push({ name: product, opening: qty, openingLocked:false, price: m.mrpPrice||0, purchases:0, sales:0 });
      bIndex = barData.length - 1;
    } else {
      barData[bIndex].opening = Number(barData[bIndex].opening||0) + qty;
      if(!barData[bIndex].price && m.mrpPrice) barData[bIndex].price = m.mrpPrice || 0;
    }

    const dateISO = toISO(new Date());
    if(!dailySales[dateISO]) dailySales[dateISO] = [];
    dailySales[dateISO].push({ name: product, qty, price: m.mrpPrice||0, section:"MRP", isTransfer:true });

    saveData();
    renderMRP();
    renderBar();
    renderDailySales();
    showToast(`Transferred ${qty} × ${product} (MRP → Bar)`);
    return;
  } else {
    const bIndex = barData.findIndex(x=>x.name===product);
    if(bIndex === -1) return alert("Product not found in Bar.");
    const b = barData[bIndex];
    const closing = (Number(b.opening||0) + Number(b.purchases||0)) - Number(b.sales||0);
    if(closing < qty) return alert("Not enough stock in Bar to transfer.");

    b.opening = Number(b.opening||0) - qty;

    let mIndex = mrpData.findIndex(x=>x.name===product);
    if(mIndex === -1){
      mrpData.push({ name: product, opening: qty, openingLocked:false, mrpPrice: b.price||0, purchases:0, transferred:0, sales:0 });
      mIndex = mrpData.length - 1;
    } else {
      mrpData[mIndex].opening = Number(mrpData[mIndex].opening||0) + qty;
      if(!mrpData[mIndex].mrpPrice && b.price) mrpData[mIndex].mrpPrice = b.price || 0;
    }

    const dateISO = toISO(new Date());
    if(!dailySales[dateISO]) dailySales[dateISO] = [];
    dailySales[dateISO].push({ name: product, qty, price: b.price||0, section:"Bar", isTransfer:true });

    saveData();
    renderMRP();
    renderBar();
    renderDailySales();
    showToast(`Transferred ${qty} × ${product} (Bar → MRP)`);
    return;
  }
}

/* ---------------------------
   Save summary placeholder (no backend)
   --------------------------- */
function saveSummaryToBackend(dateISO){
  // noop for now
}

/* ---------------------------
   Dashboard: summary table & date picker modal
   --------------------------- */
function renderDailySales(){
  const div = document.getElementById("dailySales"); if(!div) return;
  div.innerHTML = "";

  ensurePickDateUI();

  const dates = Object.keys(dailySales).sort((a,b)=> b.localeCompare(a));
  if(dates.length === 0){ div.innerHTML = "<p>No sales recorded yet.</p>"; return; }

  const wrap = document.createElement("div"); wrap.style.overflowX="auto"; wrap.style.marginTop="6px";
  const table = document.createElement("table"); table.style.minWidth="760px";
  table.innerHTML = `<thead><tr><th>Date</th><th>MRP Sales</th><th>MRP Transfers</th><th>MRP Amount (₹)</th><th>Bar Sales</th><th>Bar Amount (₹)</th><th>Actions</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  dates.forEach(dateISO=>{
    const entries = dailySales[dateISO] || [];
    let mrpSales = 0, mrpTransfers = 0, mrpAmount = 0, barSales = 0, barAmount = 0;
    entries.forEach(s=>{
      const qty = Number(s.qty||0);
      const price = Number(s.price||0);
      if((s.section||"") === "MRP"){
        if(s.isTransfer) { mrpTransfers += qty; mrpAmount += qty*price; }
        else { mrpSales += qty; mrpAmount += qty*price; }
      } else if((s.section||"") === "Bar"){
        if(s.isTransfer) {
          // not counted into bar sales
        } else {
          barSales += qty;
          barAmount += qty*price;
        }
      }
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${isoToDisplay(dateISO)}</td>
      <td>${mrpSales}</td>
      <td>${mrpTransfers}</td>
      <td>₹${Number(mrpAmount||0).toFixed(2)}</td>
      <td>${barSales}</td>
      <td>₹${Number(barAmount||0).toFixed(2)}</td>
      <td>
        <button class="btn view" data-date="${dateISO}">View</button>
        <button class="btn edit" data-date="${dateISO}" style="margin-left:6px">Edit</button>
      </td>`;
    tbody.appendChild(tr);
  });

  wrap.appendChild(table); div.appendChild(wrap);

  div.querySelectorAll("button.view").forEach(b=> b.addEventListener("click", ()=> openModal(b.dataset.date, { readonly:true })));
  div.querySelectorAll("button.edit").forEach(b=> b.addEventListener("click", ()=> openModal(b.dataset.date, { readonly:false })));
}

/* modal open/close */
function openModal(dateISO, opts = { readonly:false }){
  currentModalDate = dateISO;
  const modal = document.getElementById("salesModal");
  if(!modal) return;
  modal.style.display = "flex";
  const modalDateEl = document.getElementById("modalDate");
  if(modalDateEl) modalDateEl.textContent = "Sales Report - " + isoToDisplay(dateISO);
  const tbody = document.querySelector("#modalTable tbody"); if(!tbody) return;
  tbody.innerHTML = "";
  if(!dailySales[dateISO]) dailySales[dateISO] = [];
  const entries = dailySales[dateISO];

  entries.forEach((e, idx) => {
    const tr = document.createElement("tr"); tr.dataset.idx = idx;
    tr.dataset.isTransfer = e.isTransfer ? "true" : "false";
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

  // populate add product select
  const select = document.getElementById("addProductSelect"); if(select){
    select.innerHTML = "";
    const names = Array.from(new Set(defaultItems.concat(entries.map(x=>x.name)).concat(mrpData.map(x=>x.name)).concat(barData.map(x=>x.name))));
    names.forEach(n => { const opt = document.createElement("option"); opt.value = n; opt.textContent = n; select.appendChild(opt); });
  }

  setModalPriceDefaults();

  const addBtn = document.getElementById("modalAddBtn");
  const saveBtn = document.getElementById("modalSaveBtn");
  if(addBtn) addBtn.disabled = !!opts.readonly;
  if(saveBtn) saveBtn.disabled = !!opts.readonly;

  // live update amount on input
  tbody.querySelectorAll("input.modal-qty, input.modal-price").forEach(inp=>{
    inp.addEventListener("input", e=>{
      const row = e.target.closest("tr");
      const qty = Number(row.querySelector("input.modal-qty").value || 0);
      const price = Number(row.querySelector("input.modal-price").value || 0);
      const amEl = row.querySelector(".modal-amount");
      if(amEl) amEl.textContent = "₹" + (qty * price).toFixed(2);
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

  // modal Add
  document.getElementById("modalAddBtn").onclick = function(){
    if(!currentModalDate) return alert("Open a date first.");
    const name = document.getElementById("addProductSelect").value;
    const qty = parseInt(document.getElementById("addQty").value) || 0;
    let price = parseFloat(document.getElementById("addPrice").value) || 0;
    const section = document.getElementById("addSection").value || "MRP";
    if(!name || qty <= 0) return alert("Please enter product and numeric positive quantity.");
    if(!price){
      price = (section === "MRP") ? (mrpData.find(x=>x.name===name)?.mrpPrice||0) : (barData.find(x=>x.name===name)?.price||0);
    }
    if(!dailySales[currentModalDate]) dailySales[currentModalDate] = [];
    dailySales[currentModalDate].push({ name, qty, price, section, isTransfer:false });
    saveData();
    showToast("Added item");
    openModal(currentModalDate, { readonly:false });
    renderDailySales();
  };

  // modal Save
  document.getElementById("modalSaveBtn").onclick = function(){
    if(!currentModalDate) return;
    const rows = Array.from(document.querySelectorAll("#modalTable tbody tr"));
    const newEntries = rows.map(row=>{
      const name = row.children[0].textContent;
      const section = row.children[1].textContent;
      const qty = Number(row.querySelector("input.modal-qty").value || 0);
      const price = Number(row.querySelector("input.modal-price").value || 0);
      const isTransfer = row.dataset.isTransfer === "true";
      return { name, qty, price, section, isTransfer: !!isTransfer };
    });
    dailySales[currentModalDate] = newEntries;
    saveData();
    saveSummaryToBackend(currentModalDate);
    showToast("Saved");
    renderDailySales();
    openModal(currentModalDate, { readonly:false });
  };

  document.getElementById("modalCloseBtn").onclick = closeModal;
}

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
document.addEventListener("change", function(e){
  if(e.target && (e.target.id === "addProductSelect" || e.target.id === "addSection")) setModalPriceDefaults();
});

/* ---------------------------
   Dashboard date picker integration (make robust, mobile-safe)
   --------------------------- */
function ensurePickDateUI(){
  const dash = document.getElementById("dashboard");
  if(!dash) return;
  let wrapper = document.getElementById("pickDateWrapper");
  if(!wrapper){
    wrapper = document.createElement("div");
    wrapper.id = "pickDateWrapper";
    wrapper.style.margin = "8px 0";
    const btn = document.createElement("button");
    btn.id = "pickDateBtn";
    btn.className = "btn";
    btn.textContent = "Pick date";
    const inp = document.createElement("input");
    inp.type = "date";
    inp.id = "pickDateInput";
    inp.style.display = "none";
    wrapper.appendChild(btn);
    wrapper.appendChild(inp);
    dash.insertBefore(wrapper, dash.firstChild);

    btn.addEventListener("click", ()=>{
      // Try the modern showPicker (mobile browsers) first
      inp.value = toISO(new Date());
      if(typeof inp.showPicker === "function"){
        try { inp.showPicker(); return; } catch(e){ /* fallback */ }
      }
      // fallback to click
      inp.click();
    });

    inp.addEventListener("change", (e)=>{
      const d = e.target.value;
      if(!d) return;
      if(!dailySales[d]) {
        dailySales[d] = [];
        saveData();
      }
      openModal(d, { readonly:true });
    });
  }
}

/* ---------------------------
   Reset / clear data
   --------------------------- */
function confirmReset(){
  if(!confirm("This will clear ALL saved data (localStorage) and reset items to defaults. Continue?")) return;
  // remove anything saved related to this project
  Object.keys(localStorage).forEach(k=>{
    if(k.startsWith("mrpData") || k.startsWith("barData") || k.startsWith("dailySales") || k.startsWith("billClosed_")){
      localStorage.removeItem(k);
    }
  });
  // explicitly remove keys
  localStorage.removeItem("mrpData");
  localStorage.removeItem("barData");
  localStorage.removeItem("dailySales");
  initializeItems();
  saveData();
  renderMRP(); renderBar(); renderDailySales();
  showToast("Data reset");
}

/* ---------------------------
   Init & bindings
   --------------------------- */
document.addEventListener("DOMContentLoaded", ()=>{
  ensureToastElement();

  loadLocalData();

  if(!Array.isArray(mrpData) || mrpData.length === 0) initializeItems();
  if(!Array.isArray(barData) || barData.length === 0) initializeItemsBarOnly();

  populateTransferProducts();

  renderMRP();
  renderBar();
  renderDailySales();

  window.showSection = showSection;
  window.sellFromMRP = sellFromMRP;
  window.sellFromBar = sellFromBar;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.unlockMRPOpening = unlockMRPOpening;
  window.unlockBarOpening = unlockBarOpening;

  document.getElementById("nav-transfer")?.addEventListener("click", populateTransferProducts);

  const dirEl = document.getElementById("transferDirection");
  const prodEl = document.getElementById("transferProduct");
  const doTransferBtn = document.getElementById("doTransferBtn");
  if(dirEl) dirEl.addEventListener("change", setTransferPriceDefault);
  if(prodEl) prodEl.addEventListener("change", setTransferPriceDefault);
  if(doTransferBtn) doTransferBtn.addEventListener("click", doTransferAction);

  // If transfer UI missing in markup, create fallback UI
  const transferSection = document.getElementById("transfer");
  if(transferSection && !document.getElementById("transferProduct")){
    const wrapper = document.createElement("div");
    wrapper.style.margin = "8px 0";
    wrapper.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <label>Direction</label>
        <select id="transferDirection">
          <option value="MRP_TO_BAR">MRP → Bar</option>
          <option value="BAR_TO_MRP">Bar → MRP</option>
        </select>
        <label>Product</label>
        <select id="transferProduct"></select>
        <label>Qty</label>
        <input id="transferQty" type="number" min="1" value="1" style="width:80px" />
        <label>Price</label>
        <input id="transferPrice" type="number" min="0" value="0" style="width:100px" />
        <button id="doTransferBtn" class="btn">Transfer</button>
      </div>
    `;
    transferSection.insertBefore(wrapper, transferSection.firstChild);
    document.getElementById("transferDirection").addEventListener("change", setTransferPriceDefault);
    document.getElementById("transferProduct").addEventListener("change", setTransferPriceDefault);
    document.getElementById("doTransferBtn").addEventListener("click", doTransferAction);
    populateTransferProducts();
  }

  ensurePickDateUI();
});
