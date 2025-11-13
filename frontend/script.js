/*  script.js
    - Global undo + per-day undo history
    - Delete day, Reset all, backend sync
    - Update API_BASE for your Render backend if needed
*/

/* --------- CONFIG --------- */
// Use localhost for local dev, Render backend for production (no port)
const API_BASE = (function(){
  if(location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1"){
    return "http://localhost:5000/api";
  }
  return "https://shop-inventory-system-gcil.onrender.com/api";
})();

/* --------- DEFAULTS & STATE --------- */
const defaultItems = [
  "2 Litre Water","1 Liter water","500 ML water","soda 750ml",
  "600ml cool drinks","250ml cool drinks","5rs glass","3rs glass",
  "mixer","cover big","cover medium","cover small"
];

let mrpData = [];
let barData = [];
let dailySales = {}; // dailySales[ISO] = [{name,qty,price,section}]
let currentModalDate = null;

// Undo data structures
const globalUndoStack = []; // each entry: { before: snapshot, after: snapshot, desc: '...' }
const dayHistory = {}; // dayHistory[date] = [ snapshot1, snapshot2, ... ] up to limit
const DAY_HISTORY_LIMIT = 20;

/* --------- Helpers --------- */
function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }
function toISO(dateLike){
  if(!dateLike) return new Date().toISOString().split('T')[0];
  if(typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) return dateLike;
  const d = new Date(dateLike); if(isNaN(d)) return new Date().toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
}
function isoToDisplay(iso){ const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString(); }
function escapeHtml(s){ if(s===null||s===undefined) return ""; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function snapshotAll(){
  return { mrpData: deepClone(mrpData), barData: deepClone(barData), dailySales: deepClone(dailySales) };
}
function restoreSnapshot(snap){
  mrpData = snap.mrpData || [];
  barData = snap.barData || [];
  dailySales = snap.dailySales || {};
  saveData();
  renderMRP(); renderBar(); renderDailySales();
}

/* push global snapshot BEFORE action */
function pushGlobalUndo(desc){
  const before = snapshotAll();
  globalUndoStack.push({ before, desc, at: new Date().toISOString() });
  // limit stack size
  if(globalUndoStack.length > 100) globalUndoStack.shift();
  updateUndoButton();
}

/* pop and restore */
function undoLastAction(){
  if(globalUndoStack.length === 0){ alert("Nothing to undo"); return; }
  const last = globalUndoStack.pop();
  restoreSnapshot(last.before);
  alert("Undid: " + (last.desc || "last action"));
  updateUndoButton();
}

/* per-day history push (save snapshot of that day's entries) */
function pushDayHistory(dateISO){
  if(!dateISO) return;
  dayHistory[dateISO] = dayHistory[dateISO] || [];
  const snap = deepClone(dailySales[dateISO] || []);
  // push snapshot
  dayHistory[dateISO].push(snap);
  if(dayHistory[dateISO].length > DAY_HISTORY_LIMIT) dayHistory[dateISO].shift();
  updateModalUndoButton();
}

/* per-day undo (pop last snapshot) */
function undoLastDayChange(dateISO){
  if(!dateISO) return alert("No date open");
  const arr = dayHistory[dateISO] || [];
  if(arr.length === 0) return alert("No undo history for this day");
  // pop last snapshot (the most recent BEFORE the change)
  const lastSnap = arr.pop();
  dailySales[dateISO] = deepClone(lastSnap);
  saveData();
  renderDailySales();
  openModal(dateISO, { readonly: false });
  alert("Reverted last change for " + isoToDisplay(dateISO));
  updateModalUndoButton();
}

/* --------- Local Storage --------- */
function saveData(){
  try {
    localStorage.setItem("mrpData", JSON.stringify(mrpData));
    localStorage.setItem("barData", JSON.stringify(barData));
    localStorage.setItem("dailySales", JSON.stringify(dailySales));
  } catch(e){ console.error("saveData", e); }
}
function loadLocalData(){
  try {
    const mrp = localStorage.getItem("mrpData");
    const bar = localStorage.getItem("barData");
    const sales = localStorage.getItem("dailySales");
    if(mrp) mrpData = JSON.parse(mrp);
    if(bar) barData = JSON.parse(bar);
    if(sales) dailySales = JSON.parse(sales);
  } catch(e){ console.warn("loadLocalData failed", e); mrpData=[]; barData=[]; dailySales={}; }
  if(!Array.isArray(mrpData) || mrpData.length===0) initializeItems();
}

/* Reset everything (fresh start) */
function resetAllData(){
  if(!confirm("Reset ALL data? This will clear local data and start fresh for your client.")) return;
  pushGlobalUndo("Reset All Data (before)");
  mrpData = defaultItems.map(n=>({ name:n, opening:0, mrpPrice:0, barPrice:0, total:0, transferred:0, sales:0 }));
  barData = [];
  dailySales = {};
  // clear remote? we DON'T delete remote summaries automatically
  saveData(); renderMRP(); renderBar(); renderDailySales();
  // clear dayHistory and undo stack (we keep the 'before' snapshot in undo)
  updateUndoButton(); updateModalUndoButton();
  alert("All local data reset. Your client can start fresh.");
}

/* --------- Backend fetch (merge) --------- */
async function fetchSalesFromBackend(){
  try {
    const res = await fetch(API_BASE + "/sales", { cache: "no-store" });
    if(!res.ok) { console.warn("/sales returned", res.status); return; }
    const serverData = await res.json();
    Object.keys(serverData || {}).forEach(dateISO=>{
      if(!dailySales[dateISO] || dailySales[dateISO].length === 0){
        const arr=[];
        const summary = serverData[dateISO] || {};
        Object.entries(summary).forEach(([product, vals])=>{
          if(vals.mrp) arr.push({ name: product, qty: Number(vals.mrp||0), price: 0, section: "MRP" });
          if(vals.bar) arr.push({ name: product, qty: Number(vals.bar||0), price: 0, section: "Bar" });
        });
        if(arr.length) dailySales[dateISO] = arr;
      }
    });
    saveData(); renderDailySales();
  } catch(e){ console.warn("fetchSalesFromBackend error", e); }
}

/* --------- Initialization --------- */
function initializeItems(){
  mrpData = defaultItems.map(n=>({ name:n, opening:0, mrpPrice:0, barPrice:0, total:0, transferred:0, sales:0 }));
  barData = [];
  dailySales = {};
  saveData();
}

/* --------- UI: MRP & Bar --------- */
function showSection(section){
  document.querySelectorAll(".container").forEach(d=>d.classList.remove("active-section"));
  const el = document.getElementById(section); if(el) el.classList.add("active-section");
  document.querySelectorAll("nav a").forEach(a=>a.classList.remove("active"));
  const map = { mrp:"nav-mrp", bar:"nav-bar", dashboard:"nav-dashboard" };
  const nav = document.getElementById(map[section]); if(nav) nav.classList.add("active");
}

function renderMRP(){
  const tbody = document.querySelector("#mrpTable tbody"); if(!tbody) return;
  tbody.innerHTML = "";
  mrpData.forEach((item,i)=>{
    item.total = Number(item.opening||0);
    const closing = item.total - Number(item.sales||0) - Number(item.transferred||0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td><input type="number" min="0" value="${Number(item.opening||0)}" onchange="updateOpening(${i}, this.value)"/></td>
      <td><input type="number" min="0" value="${Number(item.mrpPrice||0)}" onchange="updateMRPPrice(${i}, this.value)"/></td>
      <td><input type="number" min="0" value="${Number(item.barPrice||0)}" onchange="updateBarPriceInMRP(${i}, this.value)"/></td>
      <td>${Number(item.total||0)}</td>
      <td>${Number(closing)}</td>
      <td>${Number(item.sales||0)}</td>
      <td><div class="action-cell">
           <button class="btn small" onclick="transferToBar(${i})">⇄ Transfer</button>
           <button class="btn small" onclick="sellFromMRP(${i})">💲 Sell</button>
         </div></td>
    `;
    tbody.appendChild(tr);
  });
}

function updateOpening(i,val){ pushGlobalUndo(`Update opening ${mrpData[i].name}`); mrpData[i].opening = Math.max(0, parseInt(val||0)||0); saveData(); renderMRP(); }
function updateMRPPrice(i,val){ pushGlobalUndo(`Update MRP price ${mrpData[i].name}`); mrpData[i].mrpPrice = Math.max(0, parseFloat(val||0)||0); saveData(); renderMRP(); }
function updateBarPriceInMRP(i,val){
  pushGlobalUndo(`Update Bar price ${mrpData[i].name}`);
  mrpData[i].barPrice = Math.max(0, parseFloat(val||0)||0);
  const name = mrpData[i].name;
  const b = barData.find(x=>x.name===name);
  if(b) b.price = mrpData[i].barPrice;
  saveData(); renderMRP(); renderBar();
}

function transferToBar(i){
  const qtyStr = prompt("Enter quantity to TRANSFER to Bar (numbers only):");
  if(qtyStr === null) return;
  const qty = parseInt(String(qtyStr).replace(/\D/g,'')) || 0;
  if(qty <= 0) return alert("Enter a positive number.");
  const item = mrpData[i];
  const closing = Number(item.opening||0) - Number(item.sales||0) - Number(item.transferred||0);
  if(closing < qty) return alert("Not enough stock");
  pushGlobalUndo(`Transfer ${qty} ${item.name} to Bar`);
  // day snapshot for undo
  const price = Number(item.barPrice || item.mrpPrice || 0);
  item.transferred = (item.transferred||0) + qty;
  const b = barData.find(x=>x.name===item.name);
  if(b){ b.stock = (b.stock||0) + qty; if(!b.price && price) b.price = price; }
  else { barData.push({ name: item.name, stock: qty, price: price, sales: 0 }); }
  saveData(); renderMRP(); renderBar();
  alert(`Transferred ${qty} × ${item.name} to Bar`);
}

function sellFromMRP(i){
  const qtyStr = prompt("Enter quantity sold at MRP price:");
  if(qtyStr === null) return;
  const qty = parseInt(String(qtyStr).replace(/\D/g,'')) || 0;
  if(qty <= 0) return alert("Enter a positive number.");
  const item = mrpData[i];
  const closing = Number(item.opening||0) - Number(item.sales||0) - Number(item.transferred||0);
  if(closing < qty) return alert("Not enough stock");
  pushGlobalUndo(`Sell ${qty} ${item.name} from MRP`);
  item.sales = (item.sales||0) + qty;
  const price = Number(item.mrpPrice || 0);
  logDailySale(item.name, qty, price, "MRP");
  saveData(); renderMRP(); renderBar();
  alert(`Sold ${qty} × ${item.name} at MRP ₹${price}`);
}

function renderBar(){
  const tbody = document.querySelector("#barTable tbody"); if(!tbody) return;
  tbody.innerHTML = "";
  barData.forEach((item,i)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td><input type="number" min="0" value="${Number(item.stock||0)}" onchange="updateBarStock(${i}, this.value)"/></td>
      <td><input type="number" min="0" value="${Number(item.price||0)}" onchange="updateBarPrice(${i}, this.value)"/></td>
      <td>${Number(item.sales||0)}</td>
      <td><div class="action-cell"><button class="btn small" onclick="sellFromBar(${i})">💲 Sell</button></div></td>
    `;
    tbody.appendChild(tr);
  });
}
function updateBarStock(i,val){ pushGlobalUndo(`Update bar stock ${barData[i].name}`); barData[i].stock = Math.max(0, parseInt(val||0)||0); saveData(); renderBar(); }
function updateBarPrice(i,val){ pushGlobalUndo(`Update bar price ${barData[i].name}`); barData[i].price = Math.max(0, parseFloat(val||0)||0); saveData(); renderBar(); }

function sellFromBar(i){
  const qtyStr = prompt("Enter qty sold at Bar price:");
  if(qtyStr === null) return;
  const qty = parseInt(String(qtyStr).replace(/\D/g,'')) || 0;
  if(qty <= 0) return alert("Enter a positive number.");
  const item = barData[i];
  if(item.stock < qty) return alert("Not enough stock");
  pushGlobalUndo(`Sell ${qty} ${item.name} from Bar`);
  item.stock -= qty;
  item.sales = (item.sales||0) + qty;
  logDailySale(item.name, qty, Number(item.price||0), "Bar");
  saveData(); renderBar();
  alert(`Sold ${qty} × ${item.name} at Bar ₹${item.price}`);
}

/* --------- Sales & backend sync --------- */
function logDailySale(name, qty, price, section, dateISO = null){
  const iso = dateISO || toISO(new Date());
  // push global undo BEFORE changing
  pushGlobalUndo(`Log sale ${qty} ${name} ${section}`);
  // push day history BEFORE change for modal-level undo
  pushDayHistory(iso);
  if(!dailySales[iso]) dailySales[iso] = [];
  dailySales[iso].push({ name, qty: Number(qty||0), price: Number(price||0), section });
  saveData(); renderDailySales();
  saveSummaryToBackend(iso);
}

function saveSummaryToBackend(dateISO){
  const entries = dailySales[dateISO] || [];
  const summary = {};
  entries.forEach(s=>{
    if(!summary[s.name]) summary[s.name] = { mrp:0, bar:0 };
    const k = (s.section||"").toLowerCase();
    if(k === "mrp") summary[s.name].mrp += Number(s.qty||0);
    else summary[s.name].bar += Number(s.qty||0);
  });
  fetch(API_BASE + "/sales", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ date: dateISO, sales: summary })
  })
  .then(async r=>{
    if(!r.ok){
      const txt = await r.text().catch(()=>null);
      console.warn("saveSummaryToBackend failed:", r.status, txt);
      return;
    }
    return r.json();
  })
  .then(d=>{ if(d) console.log("Saved summary to backend:", d); })
  .catch(e=>console.error("Save summary error:", e));
}

/* --------- Dashboard & modal --------- */
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
    const summary = {}; let revenue = 0;
    entries.forEach(s=>{
      if(!summary[s.name]) summary[s.name] = { mrp:0, bar:0, price: s.price || 0 };
      if(s.section === "MRP") summary[s.name].mrp += Number(s.qty||0);
      else summary[s.name].bar += Number(s.qty||0);
      summary[s.name].price = summary[s.name].price || Number(s.price||0);
    });
    Object.keys(summary).forEach(p=>{
      revenue += (summary[p].mrp + summary[p].bar) * Number(summary[p].price || 0);
    });
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${isoToDisplay(dateISO)}</td>
      <td>${Object.values(summary).reduce((a,c)=>a + (c.mrp||0),0)}</td>
      <td>${Object.values(summary).reduce((a,c)=>a + (c.bar||0),0)}</td>
      <td>₹${Number(revenue||0).toFixed(2)}</td>
      <td>
        <button class="btn small view" data-date="${dateISO}">View</button>
        <button class="btn small edit" data-date="${dateISO}" style="margin-left:6px">Edit</button>
        <button class="btn small danger" data-date="${dateISO}" style="margin-left:6px">Close Bill</button>
        <button class="btn small" data-date="${dateISO}" style="margin-left:6px" onclick="deleteDayConfirm('${dateISO}')">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });

  wrap.appendChild(table); div.appendChild(wrap);

  div.querySelectorAll("button.view").forEach(b=> b.addEventListener("click", ()=>openModal(b.dataset.date, { readonly:true })));
  div.querySelectorAll("button.edit").forEach(b=> b.addEventListener("click", ()=>openModal(b.dataset.date, { readonly:false })));
  div.querySelectorAll("button.danger").forEach(b=> b.addEventListener("click", ()=> {
    const dateISO = b.dataset.date;
    if(confirm("Send email for " + isoToDisplay(dateISO) + " ?")) closeBillFor(dateISO);
  }));
}

/* Modal open/close & interactions */
function openModal(dateISO, opts = { readonly:false }){
  currentModalDate = dateISO;
  const modal = document.getElementById("salesModal"); modal.style.display = "flex";
  document.getElementById("modalDate").textContent = "Sales Report - " + isoToDisplay(dateISO);
  const tbody = document.querySelector("#modalTable tbody"); tbody.innerHTML = "";

  // push dayHistory snapshot BEFORE edits (so undo can revert)
  pushDayHistory(dateISO);

  const entries = dailySales[dateISO] ? deepClone(dailySales[dateISO]) : [];
  entries.forEach((e, idx)=>{
    const tr = document.createElement("tr");
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.section)}</td>
      <td><input class="modal-qty" type="number" min="0" value="${Number(e.qty||0)}" ${opts.readonly ? 'disabled' : ''}></td>
      <td><input class="modal-price" type="number" min="0" value="${Number(e.price||0)}" ${opts.readonly ? 'disabled' : ''}></td>
      <td class="modal-amount">₹${((Number(e.qty||0)) * (Number(e.price||0))).toFixed(2)}</td>
      <td>${opts.readonly ? '' : '<button class="btn small danger modal-remove">Remove</button>'}</td>
    `;
    tbody.appendChild(tr);
  });

  // product select
  const sel = document.getElementById("addProductSelect"); sel.innerHTML = "";
  const names = Array.from(new Set(defaultItems.concat((dailySales[dateISO]||[]).map(x=>x.name))));
  names.forEach(n=>{ const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });

  setModalPriceDefaults();

  const addBtn = document.getElementById("modalAddBtn");
  const saveBtn = document.getElementById("modalSaveBtn");
  addBtn.disabled = !!opts.readonly;
  saveBtn.disabled = !!opts.readonly;

  const closeBtn = document.getElementById("modalCloseBillBtn");
  if(localStorage.getItem(`billClosed_${dateISO}`) === "true"){ closeBtn.disabled = true; closeBtn.textContent = "Closed"; }
  else { closeBtn.disabled = false; closeBtn.textContent = "📨 Close Bill"; }

  // update amounts live
  tbody.querySelectorAll("input.modal-qty, input.modal-price").forEach(inp=>{
    inp.addEventListener("input", e=>{
      const row = e.target.closest("tr");
      const q = Number(row.querySelector("input.modal-qty").value || 0);
      const p = Number(row.querySelector("input.modal-price").value || 0);
      row.querySelector(".modal-amount").textContent = "₹" + (q * p).toFixed(2);
    });
  });

  // remove handlers
  tbody.querySelectorAll("button.modal-remove").forEach(b=>{
    b.addEventListener("click", e=>{
      const row = e.target.closest("tr");
      const idx = Number(row.dataset.idx);
      if(!confirm("Delete this sold item?")) return;
      pushGlobalUndo(`Delete sold item ${dailySales[dateISO][idx].name} from ${isoToDisplay(dateISO)}`);
      pushDayHistory(dateISO);
      dailySales[dateISO].splice(idx,1);
      saveData();
      openModal(dateISO, opts);
      renderDailySales();
    });
  });

  updateModalUndoButton();
}

function closeModal(){ document.getElementById("salesModal").style.display = "none"; currentModalDate = null; }

/* modal helpers */
function setModalPriceDefaults(){
  const product = document.getElementById("addProductSelect").value;
  const section = document.getElementById("addSection").value;
  const priceField = document.getElementById("addPrice");
  const m = mrpData.find(x=>x.name===product);
  const b = barData.find(x=>x.name===product);
  if(section === "MRP") priceField.value = m ? Number(m.mrpPrice||0) : 0;
  else priceField.value = b ? Number(b.price||0) : (m ? Number(m.barPrice||0) : 0);
}
document.getElementById("addProductSelect").addEventListener("change", setModalPriceDefaults);
document.getElementById("addSection").addEventListener("change", setModalPriceDefaults);

/* modal add */
document.getElementById("modalAddBtn").addEventListener("click", ()=>{
  if(!currentModalDate) return alert("Open a date first.");
  const name = document.getElementById("addProductSelect").value;
  const qty = Math.max(0, parseInt(document.getElementById("addQty").value||0));
  let price = Math.max(0, parseFloat(document.getElementById("addPrice").value||0));
  const section = document.getElementById("addSection").value || "MRP";
  if(qty <= 0) return alert("Enter qty > 0");
  pushGlobalUndo(`Add sold item ${name} ${qty} ${section} to ${currentModalDate}`);
  pushDayHistory(currentModalDate);
  if(!dailySales[currentModalDate]) dailySales[currentModalDate] = [];
  dailySales[currentModalDate].push({ name, qty, price, section });
  saveData(); saveSummaryToBackend(currentModalDate); renderDailySales(); openModal(currentModalDate, { readonly:false });
});

/* modal save */
document.getElementById("modalSaveBtn").addEventListener("click", ()=>{
  if(!currentModalDate) return;
  const tbody = document.querySelector("#modalTable tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));
  pushGlobalUndo(`Save edits for ${currentModalDate}`);
  pushDayHistory(currentModalDate);
  const newEntries = rows.map(r=>{
    const name = r.children[0].textContent;
    const section = r.children[1].textContent;
    const qty = Math.max(0, Number(r.querySelector("input.modal-qty").value || 0));
    const price = Math.max(0, Number(r.querySelector("input.modal-price").value || 0));
    return { name, qty, price, section };
  });
  dailySales[currentModalDate] = newEntries;
  saveData(); saveSummaryToBackend(currentModalDate);
  alert("Saved changes for " + isoToDisplay(currentModalDate));
  renderDailySales();
  openModal(currentModalDate, { readonly:false });
});

/* modal delete day */
document.getElementById("modalDeleteDayBtn").addEventListener("click", ()=>{
  if(!currentModalDate) return;
  if(!confirm("Delete ALL entries for " + isoToDisplay(currentModalDate) + " ?")) return;
  pushGlobalUndo(`Delete entire day ${currentModalDate}`);
  pushDayHistory(currentModalDate);
  delete dailySales[currentModalDate];
  saveData(); renderDailySales(); closeModal();
});

/* modal undo day */
document.getElementById("modalUndoDayBtn").addEventListener("click", ()=>{
  if(!currentModalDate) return;
  undoLastDayChange(currentModalDate);
});

/* modal close bill (send-email) */
document.getElementById("modalCloseBillBtn").addEventListener("click", ()=>{ if(currentModalDate) closeBillFor(currentModalDate); });

/* --------- Delete day from dashboard (confirm) --------- */
function deleteDayConfirm(dateISO){
  if(!confirm("Delete ALL entries for " + isoToDisplay(dateISO) + " ?")) return;
  pushGlobalUndo(`Delete entire day ${dateISO}`);
  pushDayHistory(dateISO);
  delete dailySales[dateISO];
  saveData(); renderDailySales();
  alert("Deleted day " + isoToDisplay(dateISO));
}

/* --------- Close bill (send email) --------- */
async function closeBillFor(dateISO){
  try {
    const resp = await fetch(API_BASE + "/send-email", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ date: dateISO })
    });
    const text = await resp.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch(e){ data = { raw: text }; }
    if(!resp.ok){ console.error("send-email failed", resp.status, data); alert("Email error. See console."); return; }
    alert((data && data.message) ? data.message : ("Email sent for " + isoToDisplay(dateISO)));
    localStorage.setItem(`billClosed_${dateISO}`, 'true');
    renderDailySales();
    if(currentModalDate === dateISO){
      document.getElementById("modalCloseBillBtn").disabled = true; document.getElementById("modalCloseBillBtn").textContent = "Closed";
    }
  } catch(err){ console.error("closeBillFor error", err); alert("Failed to send email. See console."); }
}

/* --------- Undo UI helpers --------- */
function updateUndoButton(){
  const btn = document.getElementById("undoLastBtn");
  if(!btn) return;
  btn.disabled = globalUndoStack.length === 0;
}
function updateModalUndoButton(){
  const btn = document.getElementById("modalUndoDayBtn");
  if(!btn) return;
  btn.disabled = !currentModalDate || !(dayHistory[currentModalDate] && dayHistory[currentModalDate].length > 0);
}

/* --------- Expose Undo button listeners & Reset --------- */
document.getElementById("undoLastBtn").addEventListener("click", ()=>{ undoLastAction(); });
document.getElementById("resetAllBtn").addEventListener("click", ()=>{ resetAllData(); });

/* --------- Startup --------- */
document.getElementById("modalCloseBtn").addEventListener("click", closeModal);

document.addEventListener("DOMContentLoaded", async ()=>{
  loadLocalData();
  await fetchSalesFromBackend();
  renderMRP(); renderBar(); renderDailySales();
  updateUndoButton();
  updateModalUndoButton();

  // Expose some functions for inline use (if any)
  window.showSection = showSection;
  window.transferToBar = transferToBar;
  window.sellFromMRP = sellFromMRP;
  window.sellFromBar = sellFromBar;
  window.openModal = openModal;
  window.closeModal = closeModal;
});
