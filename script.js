/* ----------------------------------------------------
   Shop Inventory System – FINAL SCRIPT.JS
   Backend: Node/Express + salesData.json
------------------------------------------------------ */

/* ============================
   DEFAULT PRODUCT NAMES
   ============================ */
const defaultItems = [
  "2 Litre Water","1 Liter water","500 ML water","soda 750ml",
  "600ml cool drinks","250ml cool drinks","5rs glass","3rs glass",
  "2rs glass","chips","boti","water packet","mixer",
  "cover big","cover medium","cover small"
];

/* ============================
   IN-MEMORY DATA
   ============================ */
let mrpData = [];
let barData = [];
let dailySales = {};

/* ============================
   HELPERS
   ============================ */
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
  return String(unsafe)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

/* toast */
let toastTimer = null;
function ensureToastElement(){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
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

/* local cache */
function saveLocal(){
  localStorage.setItem("mrpData", JSON.stringify(mrpData));
  localStorage.setItem("barData", JSON.stringify(barData));
  localStorage.setItem("dailySales", JSON.stringify(dailySales));
}
function loadLocal(){
  const a = localStorage.getItem("mrpData");
  const b = localStorage.getItem("barData");
  const c = localStorage.getItem("dailySales");
  if(a) mrpData = JSON.parse(a);
  if(b) barData = JSON.parse(b);
  if(c) dailySales = JSON.parse(c);
}

/* debounce */
function debounce(fn, ms){
  let t=null;
  return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
}

/* ============================
   API WRAPPERS
   ============================ */
async function apiGet(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
}

async function apiPost(path, body){
  const r = await fetch(path,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  if(!r.ok){
    const txt=await r.text();
    throw new Error("HTTP "+r.status+" "+txt);
  }
  return await r.json().catch(()=>({ok:true}));
}

/* ============================
   LOAD FROM SERVER
   ============================ */
async function loadAllFromServer(){
  try{
    const [mrp, bar, allDaily] = await Promise.all([
      apiGet("/api/mrp"),
      apiGet("/api/bar"),
      apiGet("/api/daily")
    ]);

    mrpData = Array.isArray(mrp) ? mrp : [];
    barData = Array.isArray(bar) ? bar : [];
    dailySales = typeof allDaily === "object" ? allDaily : {};

    saveLocal();
    return true;
  }catch(err){
    console.warn("Server offline. Using local cache.");
    loadLocal();
    return false;
  }
}

/* save with debounce */
const saveMRPToServer = debounce(async()=>{
  try{
    await apiPost("/api/mrp", mrpData);
    saveLocal();
  }catch(e){ saveLocal(); }
},400);

const saveBarToServer = debounce(async()=>{
  try{
    await apiPost("/api/bar", barData);
    saveLocal();
  }catch(e){ saveLocal(); }
},400);

const saveDailyToServer = debounce(async(dateISO)=>{
  try{
    const arr = dailySales[dateISO] || [];
    await apiPost(`/api/daily/${dateISO}`, arr);
    saveLocal();
  }catch(e){ saveLocal(); }
},400);

async function resetAll(){
  await apiPost("/api/reset", {});
  mrpData = [];
  barData = [];
  dailySales = {};
  saveLocal();
}

/* ============================
   DEFAULT DATA GENERATOR
   ============================ */
function ensureDataDefaults(){
  if(mrpData.length === 0){
    mrpData = defaultItems.map(name=>({
      name,
      opening:0, openingLocked:false,
      mrpPrice:0, purchases:0, transferred:0, sales:0
    }));
  }
  if(barData.length === 0){
    barData = defaultItems.map(name=>({
      name,
      opening:0, openingLocked:false,
      price:0, purchases:0, sales:0
    }));
  }
}

/* ============================
   MRP TABLE RENDER
   ============================ */
function renderMRP(){
  const tbody = document.querySelector("#mrpTable tbody");
  tbody.innerHTML = "";

  mrpData.forEach((item,i)=>{
    const opening=item.opening||0;
    const price=item.mrpPrice||0;
    const purchases=item.purchases||0;
    const transferred=item.transferred||0;
    const sales=item.sales||0;

    const total = opening + purchases;
    const closing = total - sales - transferred;
    const amount = (sales+transferred)*price;

    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>
        <input type="number" value="${opening}" ${item.openingLocked?"disabled":""}
               onchange="updateMRPOpening(${i},this.value)">
      </td>
      <td><input type="number" value="${price}" onchange="updateMRPPrice(${i},this.value)"></td>
      <td><input type="number" value="${purchases}" onchange="updateMRPPurchases(${i},this.value)"></td>
      <td>${total}</td>
      <td>${closing}</td>
      <td>${sales}</td>
      <td>₹${amount.toFixed(2)}</td>
      <td><button class="btn sell" onclick="sellFromMRP(${i})">💲 Sell</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* ============================
   BAR TABLE RENDER
   ============================ */
function renderBar(){
  const tbody = document.querySelector("#barTable tbody");
  tbody.innerHTML = "";

  barData.forEach((item,i)=>{
    const opening=item.opening||0;
    const price=item.price||0;
    const purchases=item.purchases||0;
    const sales=item.sales||0;

    const total=opening+purchases;
    const closing=total-sales;

    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td><input type="number" value="${opening}" onchange="updateBarOpening(${i},this.value)"></td>
      <td><input type="number" value="${price}" onchange="updateBarPrice(${i},this.value)"></td>
      <td><input type="number" value="${purchases}" onchange="updateBarPurchases(${i},this.value)"></td>
      <td>${total}</td>
      <td>${closing}</td>
      <td>${sales}</td>
      <td>₹${(sales*price).toFixed(2)}</td>
      <td><button class="btn sell" onclick="sellFromBar(${i})">💲 Sell</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* ============================
   FIELD UPDATES
   ============================ */
window.updateMRPOpening = function(i,val){
  const num=Math.max(0,parseInt(val)||0);
  mrpData[i].opening=num;
  renderMRP();
  saveMRPToServer();
};
window.updateMRPPrice = function(i,val){
  mrpData[i].mrpPrice=Math.max(0,parseFloat(val)||0);
  renderMRP();
  saveMRPToServer();
};
window.updateMRPPurchases = function(i,val){
  mrpData[i].purchases=Math.max(0,parseInt(val)||0);
  renderMRP();
  saveMRPToServer();
};

window.updateBarOpening = function(i,val){
  barData[i].opening=Math.max(0,parseInt(val)||0);
  renderBar();
  saveBarToServer();
};
window.updateBarPrice = function(i,val){
  barData[i].price=Math.max(0,parseFloat(val)||0);
  renderBar();
  saveBarToServer();
};
window.updateBarPurchases = function(i,val){
  barData[i].purchases=Math.max(0,parseInt(val)||0);
  renderBar();
  saveBarToServer();
};

/* ============================
   SELL MRP
   ============================ */
window.sellFromMRP = function(i){
  const qtyStr=prompt("Enter quantity sold at MRP:");
  if(qtyStr===null) return;
  const qty=parseInt(qtyStr)||0;
  if(qty<=0) return alert("Invalid");

  const item=mrpData[i];

  const closing=(item.opening+item.purchases)-item.sales-item.transferred;
  if(closing<qty) return alert("Not enough stock!");

  item.sales += qty;

  const dateISO=toISO(new Date());
  if(!dailySales[dateISO]) dailySales[dateISO] = [];
  dailySales[dateISO].push({
    name:item.name,
    qty,
    price:item.mrpPrice||0,
    section:"MRP",
    isTransfer:false
  });

  renderMRP();
  renderBar();
  renderDailySales();
  saveMRPToServer();
  saveDailyToServer(dateISO);
};

/* ============================
   SELL BAR
   ============================ */
window.sellFromBar = function(i){
  const qtyStr=prompt("Enter quantity sold at Bar:");
  if(qtyStr===null) return;
  const qty=parseInt(qtyStr)||0;
  if(qty<=0) return alert("Invalid");

  const item=barData[i];
  const closing=(item.opening+item.purchases)-item.sales;
  if(closing<qty) return alert("Not enough stock!");

  item.sales += qty;

  const dateISO=toISO(new Date());
  if(!dailySales[dateISO]) dailySales[dateISO] = [];
  dailySales[dateISO].push({
    name:item.name, qty,
    price:item.price||0,
    section:"Bar",
    isTransfer:false
  });

  renderBar();
  renderDailySales();
  saveBarToServer();
  saveDailyToServer(dateISO);
};

/* ============================
   TRANSFER SYSTEM
   ============================ */
window.populateTransferProducts = function(){
  const sel=document.getElementById("transferProduct");
  sel.innerHTML="";
  [...mrpData.map(x=>x.name),...barData.map(x=>x.name)]
    .filter((v,i,a)=>a.indexOf(v)==i)
    .sort()
    .forEach(n=>{
      const o=document.createElement("option");
      o.value=n;o.textContent=n;
      sel.appendChild(o);
    });
  setTransferPriceDefault();
};

window.setTransferPriceDefault = function(){
  const dir=document.getElementById("transferDirection").value;
  const prod=document.getElementById("transferProduct").value;
  const priceField=document.getElementById("transferPrice");

  if(dir==="MRP_TO_BAR"){
    const m=mrpData.find(x=>x.name===prod);
    priceField.value=m?m.mrpPrice:0;
  }else{
    const b=barData.find(x=>x.name===prod);
    priceField.value=b?b.price:0;
  }
};

window.doTransferAction = function(){
  const dir=document.getElementById("transferDirection").value;
  const prod=document.getElementById("transferProduct").value;
  const qty=parseInt(document.getElementById("transferQty").value)||0;

  if(qty<=0) return alert("Invalid qty");

  const dateISO=toISO(new Date());
  if(!dailySales[dateISO]) dailySales[dateISO]=[];

  /* MRP → BAR */
  if(dir==="MRP_TO_BAR"){
    const i=mrpData.findIndex(x=>x.name===prod);
    const m=mrpData[i];

    const closing=(m.opening+m.purchases)-m.sales-m.transferred;
    if(closing<qty) return alert("Not enough MRP stock");

    m.transferred += qty;

    let bi=barData.findIndex(x=>x.name===prod);
    if(bi===-1){
      barData.push({name:prod,opening:qty,openingLocked:false,price:m.mrpPrice,purchases:0,sales:0});
    }else{
      barData[bi].opening+=qty;
    }

    dailySales[dateISO].push({name:prod,qty,price:m.mrpPrice,section:"MRP",isTransfer:true});
  }

  /* BAR → MRP */
  if(dir==="BAR_TO_MRP"){
    const bi=barData.findIndex(x=>x.name===prod);
    const b=barData[bi];

    const closing=(b.opening+b.purchases)-b.sales;
    if(closing<qty) return alert("Not enough Bar stock");

    b.opening -= qty;

    let mi=mrpData.findIndex(x=>x.name===prod);
    if(mi===-1){
      mrpData.push({name:prod,opening:qty,openingLocked:false,mrpPrice:b.price,purchases:0,transferred:0,sales:0});
    }else{
      mrpData[mi].opening+=qty;
    }

    dailySales[dateISO].push({name:prod,qty,price:b.price,section:"Bar",isTransfer:true});
  }

  renderMRP();
  renderBar();
  renderDailySales();
  saveMRPToServer();
  saveBarToServer();
  saveDailyToServer(dateISO);
};

/* ============================
   DASHBOARD
   ============================ */
function renderDailySales(){
  const div=document.getElementById("dailySales");
  div.innerHTML="";

  const dates=Object.keys(dailySales).sort((a,b)=>b.localeCompare(a));
  if(dates.length===0){
    div.innerHTML="<p>No sales yet</p>";
    return;
  }

  const wrap=document.createElement("div");
  wrap.style.overflowX="auto";

  wrap.innerHTML=`
    <table>
      <thead>
        <tr>
          <th>Date</th><th>MRP Sales</th><th>MRP Transfers</th>
          <th>MRP Amount</th><th>Bar Sales</th><th>Bar Amount</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  const tbody=wrap.querySelector("tbody");

  dates.forEach(d=>{
    const entries=dailySales[d];

    let mrpS=0,mrpT=0,mrpA=0;
    let barS=0,barA=0;

    entries.forEach(e=>{
      const qty=e.qty;
      const amt=qty*(e.price||0);
      if(e.section==="MRP"){
        if(e.isTransfer){ mrpT+=qty; mrpA+=amt; }
        else{ mrpS+=qty; mrpA+=amt; }
      }else{
        if(!e.isTransfer){ barS+=qty; barA+=amt; }
      }
    });

    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td>${isoToDisplay(d)}</td>
      <td>${mrpS}</td>
      <td>${mrpT}</td>
      <td>₹${mrpA.toFixed(2)}</td>
      <td>${barS}</td>
      <td>₹${barA.toFixed(2)}</td>
      <td>
        <button class="btn" onclick="openModal('${d}',{readonly:true})">View</button>
        <button class="btn" onclick="openModal('${d}',{readonly:false})">Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  div.appendChild(wrap);
}

/* ============================
   MODAL
   ============================ */
function ensureModalExists(){
  if(document.getElementById("salesModal")) return;
  const modal=document.createElement("div");
  modal.id="salesModal";
  modal.className="modal";
  modal.style.display="none";

  modal.innerHTML=`
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalDate"></h3>
        <button id="modalCloseBtn">&times;</button>
      </div>
      <div id="modalBody">
        <table class="modal-table" id="modalTable">
          <thead>
            <tr><th>Product</th><th>Section</th><th>Qty</th><th>Price</th><th>Amount</th><th>Action</th></tr>
          </thead>
          <tbody></tbody>
        </table>

        <div id="modalControls">
          <select id="addProductSelect"></select>
          <input id="addQty" type="number" value="1" min="1">
          <input id="addPrice" type="number" value="0" min="0">
          <select id="addSection"><option>MRP</option><option>Bar</option></select>
          <button id="modalAddBtn" class="btn">Add</button>
          <button id="modalSaveBtn" class="btn">Save</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

let currentModalDate=null;

window.openModal = function(dateISO,opts={readonly:false}){
  ensureModalExists();
  currentModalDate=dateISO;

  const modal=document.getElementById("salesModal");
  const modalDateEl=document.getElementById("modalDate");
  const tbody=document.querySelector("#modalTable tbody");

  modalDateEl.textContent="Sales - "+isoToDisplay(dateISO);
  modal.style.display="flex";

  if(!dailySales[dateISO]) dailySales[dateISO]=[];

  tbody.innerHTML="";

  dailySales[dateISO].forEach((e,i)=>{
    const tr=document.createElement("tr");
    tr.dataset.idx=i;
    tr.dataset.isTransfer=e.isTransfer?"true":"false";
    tr.innerHTML=`
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.section)}</td>
      <td><input type="number" value="${e.qty}" ${opts.readonly?"disabled":""} class="modal-qty"></td>
      <td><input type="number" value="${e.price}" ${opts.readonly?"disabled":""} class="modal-price"></td>
      <td class="modal-amount">₹${(e.qty*e.price).toFixed(2)}</td>
      <td>${opts.readonly?"":'<button class="btn danger modal-remove">X</button>'}</td>
    `;
    tbody.appendChild(tr);
  });

  const productSel=document.getElementById("addProductSelect");
  productSel.innerHTML="";
  defaultItems.forEach(n=>{
    const o=document.createElement("option");
    o.value=n;o.textContent=n;productSel.appendChild(o);
  });

  document.querySelectorAll(".modal-remove").forEach(btn=>{
    btn.addEventListener("click",e=>{
      const idx=e.target.closest("tr").dataset.idx;
      dailySales[dateISO].splice(idx,1);
      saveDailyToServer(dateISO);
      openModal(dateISO,opts);
      renderDailySales();
    });
  });

  document.getElementById("modalAddBtn").onclick=function(){
    const name=document.getElementById("addProductSelect").value;
    const qty=parseInt(document.getElementById("addQty").value)||0;
    const price=parseFloat(document.getElementById("addPrice").value)||0;
    const section=document.getElementById("addSection").value;

    dailySales[dateISO].push({name,qty,price,section,isTransfer:false});
    saveDailyToServer(dateISO);
    openModal(dateISO,opts);
    renderDailySales();
  };

  document.getElementById("modalSaveBtn").onclick=function(){
    const rows=document.querySelectorAll("#modalTable tbody tr");
    dailySales[dateISO]=[...rows].map(r=>({
      name:r.children[0].textContent,
      section:r.children[1].textContent,
      qty:parseInt(r.querySelector(".modal-qty").value)||0,
      price:parseFloat(r.querySelector(".modal-price").value)||0,
      isTransfer:r.dataset.isTransfer==="true"
    }));
    saveDailyToServer(dateISO);
    showToast("Saved");
    renderDailySales();
    openModal(dateISO,{readonly:false});
  };

  document.getElementById("modalCloseBtn").onclick=function(){
    modal.style.display="none";
  };
};

/* ============================
   RESET
   ============================ */
window.confirmReset = async function(){
  if(!confirm("Reset ALL data?")) return;
  await resetAll();
  ensureDataDefaults();
  renderMRP();
  renderBar();
  renderDailySales();
  showToast("Reset completed");
};

/* ============================
   NAVIGATION
   ============================ */
window.showSection = function(id){
  document.querySelectorAll(".container").forEach(e=>e.classList.remove("active-section"));
  document.getElementById(id).classList.add("active-section");
  renderDailySales();
  if(id==="transfer") populateTransferProducts();
};

/* ============================
   STARTUP
   ============================ */
async function start(){
  ensureModalExists();
  loadLocal();
  ensureDataDefaults();

  renderMRP();
  renderBar();
  renderDailySales();

  const ok=await loadAllFromServer();
  ensureDataDefaults();
  renderMRP();
  renderBar();
  renderDailySales();
  populateTransferProducts();

  showToast(ok?"Synced":"Offline mode");
}

start();
