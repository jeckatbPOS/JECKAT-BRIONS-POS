// =====================
// SUPABASE INIT (GLOBAL)
// =====================
const supabaseUrl = "https://pohzylwhrlsplsjxjpmb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvaHp5bHdocmxzcGxzanhqcG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzU5NzcsImV4cCI6MjA5NTYxMTk3N30.P2FryVHZJMWjQFlFBcv1q_sbs7W4Ivbj8SbtTkeLuF8";

window.client = window.supabase.createClient(supabaseUrl, supabaseKey);

// =====================
// GLOBAL STATE
// =====================
window.cart             = [];
window.products         = [];
window.promoTotal       = null;
window.gcashConfirmed   = false;
window.editingId        = null;
window.selectedVariants = {};

// =====================
// HELPERS
// =====================
function getEl(id) { return document.getElementById(id); }

function setMsg(text) {
  const el = getEl("message");
  if (el) el.innerText = text;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject("Failed to read file");
    reader.readAsDataURL(file);
  });
}

// =====================
// LOGIN
// =====================
window.login = async function () {
  const username = (getEl("username")?.value || "").trim();
  const password = (getEl("password")?.value || "").trim();

  if (!username || !password) { setMsg("❌ Please enter username and password"); return; }

  try {
    const { data: adminData } = await window.client
      .from("admins").select("*")
      .eq("username", username).eq("password", password).maybeSingle();

    if (adminData) {
      localStorage.setItem("user", JSON.stringify({ ...adminData, role: "admin" }));
      window.location.href = "admin.html";
      return;
    }

    const { data: cashierData } = await window.client
      .from("cashiers").select("*")
      .eq("username", username).eq("password", password).maybeSingle();

    if (cashierData) {
      localStorage.setItem("user", JSON.stringify({ ...cashierData, role: "cashier" }));
      window.location.href = "cashier.html";
      return;
    }

    setMsg("❌ Invalid username or password");
  } catch (err) {
    setMsg("❌ Login error: " + err.message);
  }
};

// =====================
// LOGOUT
// =====================
window.logout = function () {
  localStorage.removeItem("user");
  window.location.href = "index.html";
};

// =====================
// LOAD PRODUCTS
// =====================
window.loadProducts = async function () {
  try {
    const { data, error } = await window.client.from("products").select("*");
    if (error) { console.error("loadProducts error:", error); return; }

    window.products = data || [];
    const container = getEl("products");
    if (!container) return;
    container.innerHTML = "";

    const isAdmin = document.body.dataset.page === "admin";

    window.products.forEach(p => {
      const isLowStock = p.stock <= 5;
      const priceStr   = typeof p.price === "number" ? p.price.toFixed(2) : parseFloat(p.price || 0).toFixed(2);

      const promoPill = p.promo_eligible
        ? `<span class="promo-pill on"><span class="pip"></span>Promo</span>`
        : `<span class="promo-pill off"><span class="pip"></span>No Promo</span>`;

      const lowBanner  = isLowStock ? `<span class="low-banner">Low Stock</span>` : "";

      const adminBtns = isAdmin ? `
        <div class="card-actions">
          <button class="btn ghost" onclick='startEdit(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Edit</button>
          <button class="btn ghost" onclick="deleteProduct(${p.id})">Delete</button>
        </div>` : "";

      let colorSelector = "";
      if (!isAdmin && p.color) {
        const colors = p.color.split(",").map(c => c.trim()).filter(Boolean);
        if (colors.length > 0) {
          colorSelector = `
            <div class="variant-field">
              <label>Color</label>
              <select id="color-${p.id}" onchange="window.selectedVariants[${p.id}]=window.selectedVariants[${p.id}]||{};window.selectedVariants[${p.id}].color=this.value;">
                <option value="">-- Select Color --</option>
                ${colors.map(c => `<option value="${c}">${c}</option>`).join("")}
              </select>
            </div>`;
        }
      }

      let sizeSelector = "";
      if (!isAdmin && p.sizes) {
        const sizes = p.sizes.split(",").map(s => s.trim()).filter(Boolean);
        if (sizes.length > 0) {
          sizeSelector = `
            <div class="variant-field">
              <label>Size</label>
              <select id="size-${p.id}" onchange="window.selectedVariants[${p.id}]=window.selectedVariants[${p.id}]||{};window.selectedVariants[${p.id}].size=this.value;">
                <option value="">-- Select Size --</option>
                ${sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
              </select>
            </div>`;
        }
      }

      container.innerHTML += `
        <div class="card">
          ${lowBanner}
          ${p.image ? `<img src="${p.image}" alt="${p.name}">` : ""}
          <div class="card-name">${p.name}</div>
          <div class="card-price">&#8369;${priceStr}</div>
          <div class="card-meta">
            <span class="stock-badge${isLowStock ? " low" : ""}">Stock: ${p.stock}</span>
            ${promoPill}
          </div>
          ${colorSelector}
          ${sizeSelector}
          <button class="btn primary full" onclick="addToCart(${p.id})">Add to Cart</button>
          ${adminBtns}
        </div>`;
    });

    const low = window.products.filter(p => p.stock <= 5);
    if (low.length > 0) setMsg(`⚠️ ${low.length} item(s) are low on stock!`);

  } catch (err) { console.error("loadProducts crash:", err); }
};

// =====================
// ADD PRODUCT
// =====================
window.addProduct = async function () {
  const name           = (getEl("name")?.value || "").trim();
  const price          = parseFloat(getEl("price")?.value || 0);
  const stock          = parseInt(getEl("stock")?.value || 0);
  const fileInput      = getEl("imageFile");
  const file           = fileInput?.files?.[0];
  const promoEligible  = getEl("promoEligible")?.checked || false;
  const color          = (getEl("color")?.value || "").trim();
  const sizes          = (getEl("sizes")?.value || "").trim();

  if (!name || isNaN(price) || isNaN(stock)) { setMsg("❌ Please fill all required fields"); return; }

  let imageUrl = "";
  if (file) {
    setMsg("⏳ Processing image...");
    try { imageUrl = await fileToBase64(file); }
    catch (err) { setMsg("❌ Failed to read image file"); return; }
  }

  const { error } = await window.client.from("products").insert([{
    name, price, stock,
    image: imageUrl,
    color: color || null,
    sizes: sizes || null,
    promo_eligible: promoEligible
  }]);

  if (error) { setMsg("❌ Failed to add product: " + error.message); return; }

  setMsg("✅ Product added" + (imageUrl ? " with image" : ""));
  ["name","price","stock","color","sizes"].forEach(id => { if (getEl(id)) getEl(id).value = ""; });
  if (fileInput) fileInput.value = "";
  if (getEl("promoEligible")) getEl("promoEligible").checked = false;
  window.loadProducts();
};

// =====================
// DELETE PRODUCT
// =====================
window.deleteProduct = async function (id) {
  if (!confirm("Are you sure you want to delete this product?")) return;
  const { error } = await window.client.from("products").delete().eq("id", id);
  if (error) { setMsg("❌ Delete failed: " + error.message); return; }
  window.loadProducts();
};

// =====================
// EDIT PRODUCT
// =====================
window.startEdit = function (product) {
  if (getEl("name"))          getEl("name").value   = product.name  || "";
  if (getEl("price"))         getEl("price").value  = product.price || "";
  if (getEl("stock"))         getEl("stock").value  = product.stock || "";
  if (getEl("color"))         getEl("color").value  = product.color || "";
  if (getEl("sizes"))         getEl("sizes").value  = product.sizes || "";
  if (getEl("promoEligible")) getEl("promoEligible").checked = !!product.promo_eligible;

  window.editingId = product.id;
  setMsg(`✏️ Editing: ${product.name}`);

  if (getEl("addBtn"))    getEl("addBtn").style.display    = "none";
  if (getEl("updateBtn")) getEl("updateBtn").style.display = "block";
};

// =====================
// UPDATE PRODUCT
// =====================
window.updateProduct = async function () {
  const name          = (getEl("name")?.value || "").trim();
  const price         = parseFloat(getEl("price")?.value || 0);
  const stock         = parseInt(getEl("stock")?.value || 0);
  const promoEligible = getEl("promoEligible")?.checked || false;
  const fileInput     = getEl("imageFile");
  const file          = fileInput?.files?.[0];
  const color         = (getEl("color")?.value || "").trim();
  const sizes         = (getEl("sizes")?.value || "").trim();

  if (!name || isNaN(price) || isNaN(stock)) { setMsg("❌ Please fill all required fields"); return; }

  let imageUrl = window.products.find(p => p.id === window.editingId)?.image || "";
  if (file) {
    setMsg("⏳ Processing image...");
    try { imageUrl = await fileToBase64(file); }
    catch (err) { setMsg("❌ Failed to read image file"); return; }
  }

  const { error } = await window.client.from("products")
    .update({ name, price, stock, image: imageUrl, color: color || null, sizes: sizes || null, promo_eligible: promoEligible })
    .eq("id", window.editingId);

  if (error) { setMsg("❌ Update failed: " + error.message); return; }

  window.editingId = null;
  setMsg("✅ Updated Successfully");
  if (getEl("addBtn"))    getEl("addBtn").style.display    = "block";
  if (getEl("updateBtn")) getEl("updateBtn").style.display = "none";
  ["name","price","stock","color","sizes"].forEach(id => { if (getEl(id)) getEl(id).value = ""; });
  if (fileInput) fileInput.value = "";
  if (getEl("promoEligible")) getEl("promoEligible").checked = false;
  window.loadProducts();
};

// =====================
// CART
// =====================
window.addToCart = function (id) {
  const p = window.products.find(x => x.id === id);
  if (!p) return;
  if (p.stock <= 0) { alert("❌ Out of stock"); return; }

  const hasColors = p.color && p.color.trim().length > 0;
  const hasSizes  = p.sizes && p.sizes.trim().length > 0;
  const selected  = window.selectedVariants[id] || {};

  if (hasColors && !selected.color) { alert("❌ Please select a color first"); return; }
  if (hasSizes  && !selected.size)  { alert("❌ Please select a size first");  return; }

  const existing = window.cart.find(i => i.id === id);
  if (existing) {
    if (existing.qty >= p.stock) { alert("❌ Cannot exceed available stock"); return; }
    existing.qty++;
  } else {
    window.cart.push({ ...p, qty: 1, selectedColor: selected.color || null, selectedSize: selected.size || null });
  }

  window.promoTotal = null;
  const promoText = getEl("promoText");
  if (promoText) promoText.innerText = "";
  window.renderCart();
};

window.renderCart = function () {
  const cartDiv  = getEl("cart");
  const totalDiv = getEl("total");
  if (!cartDiv) return;

  let rawTotal = 0;
  cartDiv.innerHTML = "";

  if (window.cart.length === 0) {
    cartDiv.innerHTML = "<p style='color:#999;text-align:center;padding:20px 0;'>Cart is empty</p>";
  } else {
    window.cart.forEach((item, i) => {
      const price = typeof item.price === "number" ? item.price : parseFloat(item.price || 0);
      rawTotal += price * item.qty;
      const variantLine    = [item.selectedColor, item.selectedSize].filter(Boolean).join(" / ");
      const variantDisplay = variantLine ? `<br><small style="color:#2d6a4f;font-weight:500;">${variantLine}</small>` : "";
      cartDiv.innerHTML += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #ececf1;">
          <div>
            <b style="font-size:13px;">${item.name}</b>${variantDisplay}<br>
            <small style="color:#666;">x${item.qty} @ ₱${price.toFixed(2)}</small>
          </div>
          <button class="btn ghost" onclick="removeItem(${i})" style="padding:5px 9px;font-size:12px;">✕</button>
        </div>`;
    });
  }

  if (totalDiv) {
    const afterPromo = window.promoTotal !== null ? window.promoTotal : rawTotal;
    const final      = Math.max(0, afterPromo - (window.discountAmount || 0));
    totalDiv.innerText = "₱" + final.toFixed(2);
  }
};

window.removeItem = function (i) {
  window.cart.splice(i, 1);
  window.promoTotal = null;
  const promoText = getEl("promoText");
  if (promoText) promoText.innerText = "";
  window.renderCart();
};

// =====================
// PROMO
// =====================
window.applyPromo = function (type) {
  const msg = getEl("promoText");
  if (!msg) return;
  const eligible = window.cart.filter(i => i.promo_eligible);
  let count = 0;
  eligible.forEach(i => (count += i.qty));

  if (type === "3for1300") {
    if (count !== 3) { msg.innerText = "❌ Need exactly 3 promo-eligible items"; return; }
    window.promoTotal = 1300;
    msg.innerText = "✅ 3 for ₱1,300 applied!";
  }
  if (type === "2for900") {
    if (count !== 2) { msg.innerText = "❌ Need exactly 2 promo-eligible items"; return; }
    window.promoTotal = 900;
    msg.innerText = "✅ 2 for ₱900 applied!";
  }
  window.renderCart();
};

// =====================
// PAYMENT HELPERS
// =====================
window.handlePaymentMethod = function () {
  const method    = getEl("paymentMethod")?.value;
  const box       = getEl("gcashBox");
  const cashInput = getEl("cash");
  if (box) box.style.display = method === "gcash" ? "block" : "none";
  if (method === "cash") {
    window.gcashConfirmed = false;
    if (cashInput) cashInput.style.display = "block";
  } else {
    if (cashInput) cashInput.style.display = "none";
  }
};

window.confirmGcashPayment = function () {
  window.gcashConfirmed = true;
  setMsg("✅ GCash payment confirmed. Press Complete Transaction.");
};

// =====================
// CHECKOUT
// Writes to: transactions + monthly_sales
// =====================
window.checkout = async function () {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user) { window.location.href = "index.html"; return; }

  const method    = getEl("paymentMethod")?.value || "cash";
  const cashInput = getEl("cash");

  if (window.cart.length === 0) { setMsg("❌ Cart is empty"); return; }

  let rawTotal = 0;
  window.cart.forEach(i => {
    const p = typeof i.price === "number" ? i.price : parseFloat(i.price || 0);
    rawTotal += p * i.qty;
  });

  const afterPromo = window.promoTotal !== null ? window.promoTotal : rawTotal;
  const total      = Math.max(0, afterPromo - (window.discountAmount || 0));

  if (method === "gcash" && !window.gcashConfirmed) { setMsg("❌ Please confirm GCash payment first"); return; }

  const cash = parseFloat(cashInput?.value || 0);
  if (method === "cash" && cash < total) { setMsg("❌ Insufficient cash amount"); return; }

  const change = cash - total;

  // branch_id is "branch1" / "branch2" etc — transactions.branch is int8
  const branchNum = parseInt((user.branch_id || "").replace("branch", ""));
  if (!branchNum) { setMsg("❌ Branch not assigned to your account"); return; }

  // Build items JSON array
  const items = window.cart.map(item => {
    const price = typeof item.price === "number" ? item.price : parseFloat(item.price || 0);
    return {
      name:  item.name,
      qty:   item.qty,
      price: price,
      total: parseFloat((price * item.qty).toFixed(2)),
      color: item.selectedColor || null,
      size:  item.selectedSize  || null
    };
  });

  const txId      = "TXN-" + Date.now();
  const now       = new Date();
  const monthNum  = now.getMonth() + 1;
  const yearNum   = now.getFullYear();
  const unitsSold = window.cart.reduce((sum, i) => sum + i.qty, 0);

  try {
    // ── 1. Insert transaction ──
    const { error: txError } = await window.client.from("transactions").insert([{
      transaction_id: txId,
      branch:         branchNum,
      items:          items,
      total:          parseFloat(total.toFixed(2)),
      payment_method: method,
      cashier:        user.id
    }]);
    if (txError) throw txError;

    // ── 2. Deduct stock ──
    for (const item of window.cart) {
      const { error: stockError } = await window.client
        .from("products")
        .update({ stock: item.stock - item.qty })
        .eq("id", item.id);
      if (stockError) throw stockError;
    }

    // ── 3. Upsert monthly_sales ──
    // Columns: branch (int8), month (int8), year (int8),
    //          total_sales (float8), transaction_count (int8), updated (timestamptz)
    const { data: existing, error: fetchError } = await window.client
      .from("monthly_sales")
      .select("*")
      .eq("branch", branchNum)
      .eq("month",  monthNum)
      .eq("year",   yearNum)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (existing) {
      const { error: updateError } = await window.client
        .from("monthly_sales")
        .update({
          total_sales:       parseFloat((existing.total_sales + total).toFixed(2)),
          transaction_count: existing.transaction_count + 1,
          updated:           new Date().toISOString()
        })
        .eq("branch", branchNum)
        .eq("month",  monthNum)
        .eq("year",   yearNum);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await window.client
        .from("monthly_sales")
        .insert([{
          branch:            branchNum,
          month:             monthNum,
          year:              yearNum,
          total_sales:       parseFloat(total.toFixed(2)),
          transaction_count: 1,
          updated:           new Date().toISOString()
        }]);
      if (insertError) throw insertError;
    }

    // ── 4. Reset ──
    window.cart             = [];
    window.promoTotal       = null;
    window.gcashConfirmed   = false;
    window.selectedVariants = {};
    if (window.discountAmount !== undefined) window.discountAmount = 0;

    window.renderCart();
    window.loadProducts();
    if (cashInput) cashInput.value = "";
    const promoText = getEl("promoText");
    if (promoText) promoText.innerText = "";

    setMsg(
      method === "cash"
        ? `✅ Paid ₱${total.toFixed(2)} | Change: ₱${change.toFixed(2)}`
        : `✅ GCash Payment Completed — ₱${total.toFixed(2)}`
    );

  } catch (err) {
    setMsg("❌ Checkout failed: " + (err.message || err));
    console.error("Checkout error:", err);
  }
};