/* part 1/3 */
const API_BASE = (function () {
  if (
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  ) {
    return "http://127.0.0.1:5050/api";
  }
  return "https://shop-inventory-system-gcil.onrender.com/api";
})();

const defaultItems = [
  "2 Litre Water","1 Liter water","500 ML water","soda 750ml",
  "600ml cool drinks","250ml cool drinks","5rs glass","3rs glass",
  "2rs glass","chips","boti","water packet","mixer",
  "cover big","cover medium","cover small"
];

let mrpData = [];
let barData = [];
let dailySales = {};
let currentModalDate = null;

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
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function normalizeDailySales(raw) {
  const out = {};
  Object.keys(raw || {}).forEach(k => out[toISO(k)] = raw[k]);
  return out;
}

function saveData() {
  try {
    localStorage.setItem("mrpData", JSON.stringify(mrpData));
    localStorage.setItem("barData", JSON.stringify(barData));
    localStorage.setItem("dailySales", JSON.stringify(dailySales));
  } catch (e) {
    console.error("saveData", e);
  }
}
function loadLocalData() {
  try {
    const mrp = localStorage.getItem("mrpData");
    const bar = localStorage.getItem("barData");
    const sales = localStorage.getItem("dailySales");
    if (mrp) mrpData = JSON.parse(mrp);
    if (bar) barData = JSON.parse(bar);
    if (sales) dailySales = normalizeDailySales(JSON.parse(sales));
  } catch (e) {
    console.warn("loadLocalData failed", e);
    mrpData = []; barData = []; dailySales = {};
  }
  if (!Array.isArray(mrpData)) mrpData = [];
  if (!Array.isArray(barData)) barData = [];
}

function syncTwoWay() {
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
    } else {
      if ((!b.price || b.price === 0) && m.mrpPrice) b.price = m.mrpPrice;
    }
  });
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
    } else {
      if ((!m.mrpPrice || m.mrpPrice === 0) && b.price) m.mrpPrice = b.price;
    }
  });
}

function initializeItems() {
  mrpData = defaultItems.map(name => ({
    name, opening:0, mrpPrice:0, purchase:0, transferred:0, sales:0
  }));
  barData = defaultItems.map(name => ({
    name, opening:0, price:0, purchase:0, sales:0
  }));
  saveData();
}

function showSection(section) {
  document.querySelectorAll(".container").forEach(c => c.classList.remove("active-section"));
  const el = document.getElementById(section);
  if (el) el.classList.add("active-section");
  document.querySelectorAll("nav a").forEach(a => a.classList.remove("active"));
  const map = { mrp: "nav-mrp", bar: "nav-bar", dashboard: "nav-dashboard" };
  const nav = document.getElementById(map[section]);
  if (nav) nav.classList.add("active");
}

function renderMRP() {
  const tbody = document.querySelector("#mrpTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  mrpData.forEach((item,i) => {
    const opening = +item.opening||0;
    const price = +item.mrpPrice||0;
    const purchase = +item.purchase||0;
    const transferred = +item.transferred||0;
    const sales = +item.sales||0;
    const total = opening + purchase;
    const closing = total - sales - transferred;
    const amount = (sales + transferred) * price; // updated: include transferred
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Item">${escapeHtml(item.name)}</td>

      <td data-label="Opening">
        <input type="number" value="${opening}" min="0" onchange="updateMRPOpening(${i}, this.value)">
      </td>

      <td data-label="Price">
        <input type="number" value="${price}" min="0" onchange="updateMRPPrice(${i}, this.value)">
      </td>

      <td data-label="Purchase">
        <input type="number" value="${purchase}" min="0" onchange="updateMRPPurchase(${i}, this.value)">
      </td>

      <td data-label="Transferred">${transferred}</td>
      <td data-label="Total">${total}</td>
      <td data-label="Closing">${closing}</td>
      <td data-label="Sales">${sales}</td>
      <td data-label="Amount">₹${amount.toFixed(2)}</td>

      <td data-label="Action">
        <div class="action-cell">
          <button class="btn transfer" onclick="transferToBar(${i})">⇄</button>
          <button class="btn sell" onclick="sellFromMRP(${i})">💲</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}


function updateMRPOpening(i,v){ mrpData[i].opening = Number(v)||0; saveData(); renderMRP(); }
function updateMRPPrice(i,v){ mrpData[i].mrpPrice = Number(v)||0; saveData(); renderMRP(); }
function updateMRPPurchase(i,v){ mrpData[i].purchase = Number(v)||0; saveData(); renderMRP(); }

function transferToBar(i){
  const qty = Math.max(0,parseInt(prompt("Quantity to transfer:"))||0);
  if(!qty) return;
  const item = mrpData[i];
  const closing = (Number(item.opening||0)+Number(item.purchase||0))-Number(item.sales||0)-Number(item.transferred||0);
  if(closing < qty) return alert("Not enough stock.");
  item.transferred = Number(item.transferred||0)+qty;

  let b = barData.find(x=>x.name===item.name);
  if(!b){
    barData.push({name:item.name,opening:qty,price:item.mrpPrice||0,purchase:0,sales:0});
  } else {
    b.opening = Number(b.opening||0)+qty;
    if((!b.price||b.price===0)&&item.mrpPrice) b.price=item.mrpPrice;
  }

  // record transfer in dailySales for today's date
  const date = toISO(new Date());
  if(!dailySales[date]) dailySales[date] = [];
  dailySales[date].push({
    name: item.name,
    qty: qty,
    price: item.mrpPrice || 0,
    section: "MRP",
    isTransfer: true
  });

  saveData(); renderMRP(); renderBar(); renderDailySales();
}

function sellFromMRP(i){
  const qty=Math.max(0,parseInt(prompt("Qty sold:"))||0);
  if(!qty) return;
  const item=mrpData[i];
  const closing=(Number(item.opening||0)+Number(item.purchase||0))-Number(item.sales||0)-Number(item.transferred||0);
  if(closing<qty) return alert("Not enough stock.");
  item.sales=Number(item.sales||0)+qty;
  const date=toISO(new Date());
  if(!dailySales[date]) dailySales[date]=[];
  dailySales[date].push({name:item.name,qty,price:item.mrpPrice||0,section:"MRP", isTransfer: false});
  saveData(); saveSummaryToBackend(date);
  renderMRP(); renderBar(); renderDailySales();
}

function renderBar(){
  const tbody=document.querySelector("#barTable tbody");
  if(!tbody) return;
  tbody.innerHTML="";
  barData.forEach((item,i)=>{
    const opening=+item.opening||0;
    const price=+item.price||0;
    const purchase=+item.purchase||0;
    const sales=+item.sales||0;
    const total=opening+purchase;
    const closing=total-sales;
    const amount=sales*price;
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td data-label="Item">${escapeHtml(item.name)}</td>

      <td data-label="Opening">
        <input type="number" value="${opening}" min="0" onchange="updateBarOpening(${i}, this.value)">
      </td>

      <td data-label="Price">
        <input type="number" value="${price}" min="0" onchange="updateBarPrice(${i}, this.value)">
      </td>

      <td data-label="Purchase">
        <input type="number" value="${purchase}" min="0" onchange="updateBarPurchase(${i}, this.value)">
      </td>

      <td data-label="Total">${total}</td>
      <td data-label="Closing">${closing}</td>
      <td data-label="Sales">${sales}</td>
      <td data-label="Amount">₹${amount.toFixed(2)}</td>

      <td data-label="Action">
        <div class="action-cell">
          <button class="btn sell" onclick="sellFromBar(${i})">💲</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateBarOpening(i,v){ barData[i].opening = Number(v)||0; saveData(); renderBar(); }
function updateBarPrice(i,v){ barData[i].price = Number(v)||0; saveData(); renderBar(); }
function updateBarPurchase(i,v){ barData[i].purchase = Number(v)||0; saveData(); renderBar(); }

function sellFromBar(i){
  const qty=Math.max(0,parseInt(prompt("Qty sold:"))||0);
  if(!qty) return;
  const item=barData[i];
  const closing=(Number(item.opening||0)+Number(item.purchase||0))-Number(item.sales||0);
  if(closing<qty) return alert("Not enough stock.");
  item.sales=Number(item.sales||0)+qty;
  const date=toISO(new Date());
  if(!dailySales[date]) dailySales[date]=[];
  dailySales[date].push({name:item.name,qty,price:item.price||0,section:"Bar", isTransfer: false});
  saveData(); saveSummaryToBackend(date);
  renderBar(); renderDailySales();
}

function saveSummaryToBackend(dateISO){
  try{
    const summary={};
    (dailySales[dateISO]||[]).forEach(s=>{
      if(!summary[s.name]) summary[s.name]={mrp:0,bar:0};
      if((s.section||"").toLowerCase()==="mrp") {
        // only count sold quantities (non-transfers) for mrp sales in summary mrp count
        if(!s.isTransfer) summary[s.name].mrp += Number(s.qty||0);
      } else {
        summary[s.name].bar += Number(s.qty||0);
      }
    });
    fetch(API_BASE+"/sales",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({date:dateISO,sales:summary})
    }).catch(console.error);
  }catch(e){ console.error(e); }
}


function renderDailySales(){
  const div=document.getElementById("dailySales");
  if(!div) return;
  div.innerHTML="";
  const dates=Object.keys(dailySales).sort((a,b)=>b.localeCompare(a));
  if(!dates.length){
    div.innerHTML="<p>No sales recorded yet.</p>";
    return;
  }

  const wrap=document.createElement("div");
  wrap.style.overflowX="auto";

  const table=document.createElement("table");
  table.style.minWidth="900px";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Date</th>
        <th>MRP Sales</th>
        <th>MRP Transfers</th>
        <th>MRP Amount (₹)</th>
        <th>Bar Sales</th>
        <th>Bar Amount (₹)</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  dates.forEach(date=>{
    const entries = dailySales[date] || [];

    let mrpSales = 0;
    let mrpTransfers = 0;
    let mrpAmount = 0;

    let barSales = 0;
    let barAmount = 0;

    entries.forEach(s=>{
      const qty = Number(s.qty||0);
      const price = Number(s.price||0);
      if((s.section||"") === "MRP") {
        if(s.isTransfer) {
          mrpTransfers += qty;
          mrpAmount += qty * price; // transfers included in mrp amount
        } else {
          mrpSales += qty;
          mrpAmount += qty * price;
        }
      } else if((s.section||"") === "Bar") {
        barSales += qty;
        barAmount += qty * price;
      }
    });

    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td>${isoToDisplay(date)}</td>
      <td>${mrpSales}</td>
      <td>${mrpTransfers}</td>
      <td>₹${mrpAmount.toFixed(2)}</td>
      <td>${barSales}</td>
      <td>₹${barAmount.toFixed(2)}</td>
      <td>
        <button class="btn view" data-date="${date}">View</button>
        <button class="btn edit" data-date="${date}" style="margin-left:6px">Edit</button>
        <button class="btn danger close-bill" data-date="${date}" style="margin-left:6px">Close Bill</button>
        <button class="btn secondary del-day" data-date="${date}" style="margin-left:6px">Delete Day</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  div.appendChild(wrap);

  div.querySelectorAll("button.view").forEach(b =>
    b.addEventListener("click",()=>openModal(b.dataset.date,{readonly:true}))
  );
  div.querySelectorAll("button.edit").forEach(b =>
    b.addEventListener("click",()=>openModal(b.dataset.date,{readonly:false}))
  );
  div.querySelectorAll("button.close-bill").forEach(b =>
    b.addEventListener("click",()=>{
      const d=b.dataset.date;
      if(confirm("Send email for "+isoToDisplay(d)+" ?")) closeBillFor(d);
    })
  );
  div.querySelectorAll("button.del-day").forEach(b =>
    b.addEventListener("click",()=>{
      const d=b.dataset.date;
      if(!confirm("Delete entire day's data for "+isoToDisplay(d)+" ? This cannot be undone.")) return;
      delete dailySales[d];
      localStorage.removeItem(`billClosed_${d}`);
      saveData();
      renderDailySales();
    })
  );
}

/* modal (preserve isTransfer flag on rows) */
function openModal(dateISO, opts={readonly:false}) {
  currentModalDate = dateISO;
  const modal = document.getElementById("salesModal");
  if (!modal) return;
  modal.style.display = "flex";

  modal.querySelector("#modalDate").textContent =
    "Sales Report - " + isoToDisplay(dateISO);

  const modalBody = modal.querySelector("#modalBody");
  modalBody.innerHTML = "";

  if (!dailySales[dateISO]) dailySales[dateISO] = [];
  const entries = dailySales[dateISO];

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.style.marginBottom = "12px";

  const table = document.createElement("table");
  table.className = "modal-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product</th><th>Section</th><th>Qty</th>
        <th>Price</th><th>Amount</th><th>Action</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  entries.forEach((e,idx)=>{
    const tr=document.createElement("tr");
    tr.dataset.idx=idx;
    // preserve transfer flag on row
    if (e.isTransfer) tr.dataset.isTransfer = "true";
    tr.innerHTML=`
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.section)}</td>
      <td><input class="modal-qty" type="number" min="0"
        value="${Number(e.qty||0)}" ${opts.readonly?'disabled':''}></td>
      <td><input class="modal-price" type="number" min="0"
        value="${Number(e.price||0)}" ${opts.readonly?'disabled':''}></td>
      <td class="modal-amount">₹${(Number(e.qty||0)*Number(e.price||0)).toFixed(2)}</td>
      <td>${opts.readonly?"":'<button class="btn danger modal-remove">Remove</button>'}</td>
    `;
    tbody.appendChild(tr);
  });

  wrap.appendChild(table);
  modalBody.appendChild(wrap);

  if (!opts.readonly) {
    const formWrap=document.createElement("div");
    formWrap.style.marginTop="8px";

    const title=document.createElement("h4");
    title.textContent="Add / Edit Sold Item";
    title.style.margin="0 0 8px 0";
    formWrap.appendChild(title);

    const row=document.createElement("div");
    row.className="form-row";

    const select=document.createElement("select");
    select.id="addProductSelect";

    const names=Array.from(new Set(
      defaultItems.concat(entries.map(x=>x.name))
      .concat(mrpData.map(x=>x.name)).concat(barData.map(x=>x.name))
    )).sort();
    names.forEach(n=>{
      const o=document.createElement("option");
      o.value=n; o.textContent=n;
      select.appendChild(o);
    });

    const qtyInput=document.createElement("input");
    qtyInput.type="number"; qtyInput.id="addQty";
    qtyInput.min="1"; qtyInput.value="1";

    const priceInput=document.createElement("input");
    priceInput.type="number"; priceInput.id="addPrice";
    priceInput.min="0"; priceInput.value="0";

    const sectionSelect=document.createElement("select");
    sectionSelect.id="addSection";
    ["MRP","Bar"].forEach(s=>{
      const o=document.createElement("option");
      o.value=s; o.textContent=s;
      sectionSelect.appendChild(o);
    });

    function setPriceDefault(){
      const product=select.value||"";
      const section=sectionSelect.value||"MRP";
      const m=mrpData.find(x=>x.name===product);
      const b=barData.find(x=>x.name===product);
      if(section==="MRP"){
        priceInput.value=m?Number(m.mrpPrice||0):(b?Number(b.price||0):0);
      } else {
        priceInput.value=b?Number(b.price||0):(m?Number(m.mrpPrice||0):0);
      }
    }
    select.addEventListener("change",setPriceDefault);
    sectionSelect.addEventListener("change",setPriceDefault);
    setPriceDefault();

    const addBtn=document.createElement("button");
    addBtn.className="btn"; addBtn.textContent="Add";

    row.appendChild(select);
    row.appendChild(qtyInput);
    row.appendChild(priceInput);
    row.appendChild(sectionSelect);
    row.appendChild(addBtn);

    formWrap.appendChild(row);

    const act=document.createElement("div");
    act.style.marginTop="12px";
    act.style.textAlign="right";

    const saveBtn=document.createElement("button");
    saveBtn.className="btn secondary";
    saveBtn.textContent="Save";

    const closeBillBtn=document.createElement("button");
    closeBillBtn.className="btn danger";
    closeBillBtn.textContent="📨 Close Bill";

    act.appendChild(saveBtn);
    act.appendChild(closeBillBtn);
    formWrap.appendChild(act);

    modalBody.appendChild(formWrap);

    addBtn.addEventListener("click",()=>{
      const name=select.value;
      const qty=Math.max(0,parseInt(qtyInput.value)||0);
      let price=parseFloat(priceInput.value)||0;
      const section=sectionSelect.value||"MRP";
      if(!name||qty<=0) return alert("Enter product & quantity.");
      if(!price){
        price=(section==="MRP")
          ?(mrpData.find(x=>x.name===name)?.mrpPrice||0)
          :(barData.find(x=>x.name===name)?.price||0);
      }
      dailySales[dateISO].push({name,qty,price,section, isTransfer:false});
      saveData(); saveSummaryToBackend(dateISO);
      openModal(dateISO,{readonly:false});
      renderDailySales();
    });

    saveBtn.addEventListener("click",()=>{
      const rows=Array.from(tbody.querySelectorAll("tr"));
      const newEntries=rows.map(r=>{
        const name=r.children[0].textContent;
        const section=r.children[1].textContent;
        const qty=Number(r.querySelector(".modal-qty").value||0);
        const price=Number(r.querySelector(".modal-price").value||0);
        const isTransfer = r.dataset.isTransfer === "true";
        return {name,qty,price,section, isTransfer: !!isTransfer};
      });
      dailySales[dateISO]=newEntries;
      saveData(); saveSummaryToBackend(dateISO);
      alert("Saved");
      renderDailySales();
      openModal(dateISO,{readonly:false});
    });

    closeBillBtn.addEventListener("click",()=>{
      if(confirm("Send email for "+isoToDisplay(dateISO)+" ?")){
        closeBillFor(dateISO);
      }
    });
  }

  tbody.querySelectorAll("input.modal-qty, input.modal-price").forEach(inp=>{
    inp.addEventListener("input",(e)=>{
      const row=e.target.closest("tr");
      const q=Number(row.querySelector(".modal-qty").value||0);
      const p=Number(row.querySelector(".modal-price").value||0);
      row.querySelector(".modal-amount").textContent="₹"+(q*p).toFixed(2);
    });
  });

  tbody.querySelectorAll("button.modal-remove").forEach(btn=>{
    btn.addEventListener("click",(e)=>{
      const row=e.target.closest("tr");
      const idx=Number(row.dataset.idx);
      if(!confirm("Delete this item?")) return;
      dailySales[dateISO].splice(idx,1);
      saveData(); saveSummaryToBackend(dateISO);
      openModal(dateISO,{readonly:false});
      renderDailySales();
    });
  });

  modal.querySelector("#modalCloseBtn").onclick = closeModal;
}

function closeModal(){
  const modal=document.getElementById("salesModal");
  if(!modal) return;
  modal.style.display="none";
  currentModalDate=null;
}

async function closeBillFor(dateISO){
  try{
    const resp=await fetch(API_BASE+"/send-email",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({date:dateISO})
    });
    const txt=await resp.text();
    let data; try{ data=txt?JSON.parse(txt):null; }catch(e){ data={raw:txt}; }
    if(!resp.ok){
      alert("Server error sending email.");
      return;
    }
    alert(data?.message||"Email sent.");
    renderDailySales();
  }catch(e){
    alert("Network error.");
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  loadLocalData();
  if(mrpData.length===0 && barData.length===0){
    initializeItems();
  }
  syncTwoWay();
  saveData();
  renderMRP();
  renderBar();
  renderDailySales();

  window.showSection=showSection;
  window.transferToBar=transferToBar;
  window.sellFromMRP=sellFromMRP;
  window.sellFromBar=sellFromBar;
  window.openModal=openModal;
  window.closeModal=closeModal;
  window.closeBillFor=closeBillFor;
});
