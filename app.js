const API_BASE = "http://localhost:8080/api";

const fields = [
  "companyName",
  "companyPhone",
  "companyAddress",
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "clientName",
  "clientPhone",
  "clientAddress",
  "discountRate",
  "taxRate",
  "currency",
  "paymentMethod",
  "paymentStatus",
  "amountPaid",
  "payLink",
  "mobileProvider",
  "mobileNumber",
  "mobileMerchantName",
  "bankName",
  "bankHolder",
  "bankIban",
  "bankBic",
  "notes",
];

const stateKey = "kie-facture-draft";
const itemsEl = document.querySelector("#items");
const previewItemsEl = document.querySelector("#previewItems");

let clientsCache = [];
let productsCache = [];

function todayIso(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function money(value) {
  const currency = document.querySelector("#currency").value.trim() || "FCFA";
  const num = Math.round(Number(value) || 0);
  return `${num.toLocaleString("fr-FR")} ${currency}`;
}

function readField(id) {
  const el = document.querySelector(`#${id}`);
  return el ? el.value.trim() : "";
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getItems() {
  return [...itemsEl.querySelectorAll(".item-row")].map((row) => {
    const description = row.querySelector(".item-description").value.trim();
    const quantity = Number(row.querySelector(".item-quantity").value) || 0;
    const price = Number(row.querySelector(".item-price").value) || 0;
    return { description, quantity, price };
  });
}

function createItem(item = {}) {
  const row = document.createElement("div");
  row.className = "item-row";
  
  let productOptionsHTML = `<option value="">-- Choisir du catalogue --</option>`;
  productsCache.forEach((p) => {
    productOptionsHTML += `<option value="${escapeAttribute(p.name)}" data-price="${p.unit_price}">${escapeAttribute(p.name)} (${money(p.unit_price)})</option>`;
  });

  row.innerHTML = `
    <label>
      Désignation / Prestation
      <select class="product-preset-select" style="margin-bottom:6px; font-size:0.8rem;">
        ${productOptionsHTML}
      </select>
      <input class="item-description" type="text" value="${escapeAttribute(item.description || "")}" placeholder="Ex: Développement Web / Conseil">
    </label>
    <label>
      Quantité
      <input class="item-quantity" type="number" min="0" step="1" value="${item.quantity || 1}">
    </label>
    <label>
      Prix unitaire
      <input class="item-price" type="number" min="0" step="500" value="${item.price || 0}">
    </label>
    <button class="remove-item" type="button" aria-label="Supprimer la ligne">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  const presetSelect = row.querySelector(".product-preset-select");
  presetSelect.addEventListener("change", () => {
    const selectedOpt = presetSelect.options[presetSelect.selectedIndex];
    if (selectedOpt && selectedOpt.value) {
      row.querySelector(".item-description").value = selectedOpt.value;
      row.querySelector(".item-price").value = selectedOpt.getAttribute("data-price") || 0;
      updatePreview();
    }
  });

  row.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", updatePreview);
  });

  row.querySelector(".remove-item").addEventListener("click", () => {
    if (itemsEl.children.length > 1) {
      row.remove();
      updatePreview();
    }
  });

  itemsEl.appendChild(row);
}

function setText(id, value, fallback = "") {
  const el = document.querySelector(`#${id}`);
  if (el) el.textContent = value || fallback;
}

/* GÉNÉRATEUR SVG QR CODE ALGORITHMIQUE */
function renderQRCodeSVG(text) {
  const str = text || "PAYMENT";
  const size = 25;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  function drawFinder(x, y) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          matrix[y + r][x + c] = 1;
        }
      }
    }
  }
  
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  for (let i = 7; i < size - 7; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  let seed = Math.abs(hash) + 12345;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] !== 0) continue;
      if ((r < 8 && c < 8) || (r < 8 && c > size - 9) || (r > size - 9 && c < 8)) continue;
      seed = (seed * 9301 + 49297) % 233280;
      matrix[r][c] = seed / 233280 > 0.45 ? 1 : 0;
    }
  }

  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) {
        rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#0f172a"/>`;
      }
    }
  }

  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${rects}</svg>`;
}

function updatePaymentPanels() {
  const method = readField("paymentMethod");
  const mobilePanel = document.querySelector("#mobileMoneyConfig");
  const bankPanel = document.querySelector("#bankConfig");

  if (mobilePanel) mobilePanel.classList.toggle("active", method === "Mobile Money");
  if (bankPanel) bankPanel.classList.toggle("active", method === "Virement bancaire");
}

function updatePreview() {
  const companyName = readField("companyName") || "KIE Services";
  setText("previewCompanyName", companyName);
  setText("previewCompanyAddress", readField("companyAddress"), "Adresse de l'entreprise");
  setText("previewCompanyPhone", readField("companyPhone"));
  
  const logoBadge = document.querySelector("#companyLogoBadge");
  if (logoBadge) logoBadge.textContent = companyName.slice(0, 3).toUpperCase();

  setText("previewNumber", readField("invoiceNumber"), "FAC-2026-0001");
  setText("previewDate", readField("invoiceDate") || "--/--/----");
  setText("previewDue", readField("dueDate") || "--/--/----");

  setText("previewClientName", readField("clientName"), "Nom du Client");
  setText("previewClientAddress", readField("clientAddress"), "Adresse du client");
  setText("previewClientPhone", readField("clientPhone"));

  const status = readField("paymentStatus") || "En attente";
  const statusBadge = document.querySelector("#previewStatus");
  if (statusBadge) {
    statusBadge.className = "invoice-status-badge";
    if (status === "Payee") {
      statusBadge.classList.add("paid");
      statusBadge.textContent = "PAYÉE";
    } else if (status === "Partiellement payee") {
      statusBadge.classList.add("partial");
      statusBadge.textContent = "PARTIELLEMENT PAYÉE";
    } else if (status === "Annulee") {
      statusBadge.classList.add("cancelled");
      statusBadge.textContent = "ANNULÉE";
    } else {
      statusBadge.classList.add("pending");
      statusBadge.textContent = "EN ATTENTE";
    }
  }

  const items = getItems();
  previewItemsEl.innerHTML = "";

  let subtotal = 0;
  items.forEach((item) => {
    const lineTotal = item.quantity * item.price;
    subtotal += lineTotal;

    const tr = document.createElement("tr");
    const tdDesc = document.createElement("td");
    tdDesc.className = "col-desc";
    tdDesc.textContent = item.description || "Prestation / Article";

    const tdQty = document.createElement("td");
    tdQty.className = "col-qty";
    tdQty.textContent = item.quantity;

    const tdPrice = document.createElement("td");
    tdPrice.className = "col-price";
    tdPrice.textContent = money(item.price);

    const tdTotal = document.createElement("td");
    tdTotal.className = "col-total";
    tdTotal.textContent = money(lineTotal);

    tr.appendChild(tdDesc);
    tr.appendChild(tdQty);
    tr.appendChild(tdPrice);
    tr.appendChild(tdTotal);
    previewItemsEl.appendChild(tr);
  });

  const discountRate = Number(readField("discountRate")) || 0;
  const taxRate = Number(readField("taxRate")) || 0;
  const discount = subtotal * (discountRate / 100);
  const taxable = Math.max(subtotal - discount, 0);
  const tax = taxable * (taxRate / 100);
  const grandTotal = taxable + tax;

  const amountPaid = Number(readField("amountPaid")) || 0;
  const balance = Math.max(grandTotal - amountPaid, 0);

  setText("subtotal", money(subtotal));
  setText("discount", `- ${money(discount)}`);
  setText("previewDiscountRate", discountRate);
  setText("tax", money(tax));
  setText("previewTaxRate", taxRate);
  setText("grandTotal", money(grandTotal));
  setText("previewPaid", money(amountPaid));
  setText("previewBalance", money(balance));

  const balanceRow = document.querySelector("#balanceRow");
  if (balanceRow) {
    if (balance <= 0 && grandTotal > 0) {
      balanceRow.classList.add("cleared");
      setText("previewBalance", "RÉGLÉ (0 FCFA DÛ)");
    } else {
      balanceRow.classList.remove("cleared");
    }
  }

  const method = readField("paymentMethod");
  setText("previewPayment", method);

  const instructionsEl = document.querySelector("#paymentInstructionsText");
  const qrContainer = document.querySelector("#qrCodeContainer");

  let qrPayload = readField("payLink") || "https://pay.kie.bf";
  let instructionsHTML = "";

  if (method === "Mobile Money") {
    const provider = readField("mobileProvider") || "Orange Money";
    const phone = readField("mobileNumber") || "+226 70 00 00 00";
    const merchant = readField("mobileMerchantName") || "KIE Services";

    instructionsHTML = `
      <p>Paiement via <strong>${escapeAttribute(provider)}</strong></p>
      <p>N° Compte / Dépôt : <strong>${escapeAttribute(phone)}</strong> (${escapeAttribute(merchant)})</p>
      <p style="font-size:0.78rem; color:#64748b; margin-top:4px;">Indiquer le N° de facture <strong>${escapeAttribute(readField("invoiceNumber"))}</strong> en motif.</p>
    `;
    qrPayload = `tel:${phone}`;
  } else if (method === "Virement bancaire") {
    const bank = readField("bankName") || "Banque partenaire";
    const holder = readField("bankHolder") || readField("companyName");
    const iban = readField("bankIban") || "BF67 0100 1001 0000 0000 0000";
    const bic = readField("bankBic") || "CBOABFBF";

    instructionsHTML = `
      <p>Virement sur le compte <strong>${escapeAttribute(bank)}</strong></p>
      <p>IBAN : <strong>${escapeAttribute(iban)}</strong></p>
      <p>Titulaire : <strong>${escapeAttribute(holder)}</strong> | BIC/SWIFT : <strong>${escapeAttribute(bic)}</strong></p>
    `;
    qrPayload = `iban:${iban}`;
  } else if (method === "Lien de paiement (Online)") {
    const link = readField("payLink") || "https://pay.kie.bf";
    instructionsHTML = `
      <p>Règlement sécurisé en ligne par Carte / Mobile Money</p>
      <p>Lien direct : <a href="${escapeAttribute(link)}" target="_blank" style="color:#0d9488;">${escapeAttribute(link)}</a></p>
    `;
    qrPayload = link;
  } else if (method === "Cheque") {
    instructionsHTML = `
      <p>Chèque bancaire à l'ordre de : <strong>${escapeAttribute(readField("companyName"))}</strong></p>
      <p>A transmettre à l'adresse de l'entreprise.</p>
    `;
    qrPayload = `CHEQUE-${readField("companyName")}`;
  } else {
    instructionsHTML = `<p>Règlement en <strong>espèces</strong> au comptoir contre reçu officiel.</p>`;
    qrPayload = `CASH-${readField("invoiceNumber")}`;
  }

  if (instructionsEl) instructionsEl.innerHTML = instructionsHTML;
  if (qrContainer) qrContainer.innerHTML = renderQRCodeSVG(qrPayload);

  setText("previewNotes", readField("notes"));
}

/* ==========================================================================
   INTERACTIONS AVEC L'API BDD ET COMPTABILITÉ
   ========================================================================== */

// 1. Obtenir le prochain numéro séquentiel
async function fetchNextInvoiceNumber() {
  try {
    const res = await fetch(`${API_BASE}/next-number`);
    if (res.ok) {
      const data = await res.json();
      const numInput = document.querySelector("#invoiceNumber");
      if (numInput) {
        numInput.value = data.nextNumber;
        updatePreview();
      }
    }
  } catch (err) {
    console.warn("Mode hors-ligne API : numéro séquentiel local", err);
  }
}

// 2. Charger les clients enregistrés (CRM)
async function fetchClients() {
  try {
    const res = await fetch(`${API_BASE}/clients`);
    if (res.ok) {
      clientsCache = await res.json();
      populateClientSelect();
      renderClientsTable();
    }
  } catch (err) {
    console.warn("Erreur chargement clients", err);
  }
}

function populateClientSelect() {
  const select = document.querySelector("#clientSelect");
  if (!select) return;

  select.innerHTML = `<option value="">-- Choisir un client existant ou saisir ci-dessous --</option>`;
  clientsCache.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = `${c.name} ${c.phone ? "(" + c.phone + ")" : ""}`;
    select.appendChild(opt);
  });
}

function renderClientsTable() {
  const tbody = document.querySelector("#clientsTableBody");
  if (!tbody) return;

  if (!clientsCache.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--muted);">Aucun client enregistré.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  clientsCache.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeAttribute(c.name)}</strong></td>
      <td>${escapeAttribute(c.phone || "-")}</td>
      <td>${escapeAttribute(c.address || "-")}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 3. Charger le catalogue produits
async function fetchProducts() {
  try {
    const res = await fetch(`${API_BASE}/products`);
    if (res.ok) {
      productsCache = await res.json();
      renderProductsTable();
    }
  } catch (err) {
    console.warn("Erreur chargement produits", err);
  }
}

function renderProductsTable() {
  const tbody = document.querySelector("#productsTableBody");
  if (!tbody) return;

  if (!productsCache.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--muted);">Aucune prestation au catalogue.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  productsCache.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeAttribute(p.name)}</strong></td>
      <td><span class="preview-badge-status">${escapeAttribute(p.category || "Général")}</span></td>
      <td><strong style="font-family:var(--font-mono);">${money(p.unit_price)}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

// 4. Enregistrer la facture en BDD (Save Database)
async function saveToDatabase() {
  const saveBtn = document.querySelector("#saveDatabase");
  if (saveBtn) saveBtn.textContent = "Enregistrement...";

  const items = getItems();
  const subtotal = items.reduce((acc, item) => acc + item.quantity * item.price, 0);

  const payload = {
    invoiceNumber: readField("invoiceNumber"),
    invoiceDate: readField("invoiceDate"),
    dueDate: readField("dueDate"),
    clientName: readField("clientName"),
    clientPhone: readField("clientPhone"),
    clientAddress: readField("clientAddress"),
    companyName: readField("companyName"),
    companyPhone: readField("companyPhone"),
    companyAddress: readField("companyAddress"),
    subtotal: subtotal,
    discountRate: Number(readField("discountRate")) || 0,
    taxRate: Number(readField("taxRate")) || 0,
    amountPaid: Number(readField("amountPaid")) || 0,
    paymentMethod: readField("paymentMethod"),
    paymentStatus: readField("paymentStatus"),
    payLink: readField("payLink"),
    mobileProvider: readField("mobileProvider"),
    mobileNumber: readField("mobileNumber"),
    mobileMerchantName: readField("mobileMerchantName"),
    bankName: readField("bankName"),
    bankHolder: readField("bankHolder"),
    bankIban: readField("bankIban"),
    bankBic: readField("bankBic"),
    notes: readField("notes"),
    items: items,
  };

  try {
    const res = await fetch(`${API_BASE}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      alert(`✅ Facture ${data.invoiceNumber} enregistrée avec succès en Base de Données !`);
      fetchNextInvoiceNumber();
      fetchDashboardData();
      fetchHistoryData();
      fetchClients();
    } else {
      const err = await res.json();
      alert(`Erreur d'enregistrement : ${err.error || "Impossible d'enregistrer"}`);
    }
  } catch (err) {
    alert("Erreur réseau / Serveur BDD non joignable.");
  } finally {
    if (saveBtn) saveBtn.textContent = "Enregistrer en BDD";
  }
}

// 5. Charger le Tableau de Bord Financier (KPIs)
async function fetchDashboardData() {
  try {
    const res = await fetch(`${API_BASE}/reports/summary`);
    if (res.ok) {
      const data = await res.json();
      setText("kpiTotalHT", money(data.totalHT));
      setText("kpiTotalTVA", money(data.totalTVA));
      setText("kpiTotalPaid", money(data.totalPaid));
      setText("kpiTotalBalance", money(data.totalBalanceDue));
      
      setText("kpiRecoveryRate", `Taux de recouvrement : ${data.recoveryRate}%`);
      setText("kpiPendingInvoices", `${data.pendingCount} factures non réglées`);

      setText("statTotalCount", data.totalInvoices);
      setText("statPaidCount", data.paidCount);
      setText("statPartialCount", data.partialCount);
      setText("statPendingCount", data.pendingCount);
    }
  } catch (err) {
    console.warn("Erreur chargement résumé financier", err);
  }
}

// 6. Charger le Registre / Historique des Factures
async function fetchHistoryData() {
  try {
    const search = readField("historySearch");
    const status = readField("historyFilterStatus");
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status && status !== "ALL") params.append("status", status);

    const res = await fetch(`${API_BASE}/invoices?${params.toString()}`);
    if (res.ok) {
      const invoices = await res.json();
      renderHistoryTable(invoices);
    }
  } catch (err) {
    console.warn("Erreur chargement historique", err);
  }
}

function renderHistoryTable(invoices) {
  const tbody = document.querySelector("#historyTableBody");
  if (!tbody) return;

  if (!invoices || !invoices.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--muted);">Aucune facture enregistrée dans la base de données.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  invoices.forEach((inv) => {
    const tr = document.createElement("tr");

    let statusClass = "pending";
    if (inv.payment_status === "Payee") statusClass = "paid";
    else if (inv.payment_status === "Partiellement payee") statusClass = "partial";
    else if (inv.payment_status === "Annulee") statusClass = "cancelled";

    tr.innerHTML = `
      <td><strong style="font-family:var(--font-mono);">${escapeAttribute(inv.invoice_number)}</strong></td>
      <td>${escapeAttribute(inv.issue_date)}</td>
      <td><strong>${escapeAttribute(inv.client_name)}</strong></td>
      <td><strong style="font-family:var(--font-mono);">${money(inv.grand_total)}</strong></td>
      <td>${money(inv.amount_paid)}</td>
      <td><strong style="font-family:var(--font-mono); color:${inv.balance_due > 0 ? "var(--status-pending)" : "var(--status-paid)"}">${money(inv.balance_due)}</strong></td>
      <td><span class="invoice-status-badge ${statusClass}">${escapeAttribute(inv.payment_status)}</span></td>
      <td>
        <button class="button compact view-inv-btn" data-id="${inv.id}">Aperçu</button>
        ${inv.balance_due > 0 ? `<button class="button compact primary-soft pay-inv-btn" data-id="${inv.id}" data-number="${escapeAttribute(inv.invoice_number)}" data-client="${escapeAttribute(inv.client_name)}" data-balance="${inv.balance_due}">Régler</button>` : ""}
        <button class="button compact del-inv-btn" data-id="${inv.id}" style="color:var(--status-cancelled);">Suppr.</button>
      </td>
    `;

    tr.querySelector(".view-inv-btn").addEventListener("click", () => loadInvoiceIntoEditor(inv.id));
    if (tr.querySelector(".pay-inv-btn")) {
      tr.querySelector(".pay-inv-btn").addEventListener("click", (e) => openPaymentModal(e.target.dataset));
    }
    tr.querySelector(".del-inv-btn").addEventListener("click", () => deleteInvoice(inv.id));

    tbody.appendChild(tr);
  });
}

// Charger une facture spécifique dans l'éditeur
async function loadInvoiceIntoEditor(id) {
  try {
    const res = await fetch(`${API_BASE}/invoices/${id}`);
    if (res.ok) {
      const inv = await res.json();

      document.querySelector("#invoiceNumber").value = inv.invoice_number;
      document.querySelector("#invoiceDate").value = inv.issue_date;
      document.querySelector("#dueDate").value = inv.due_date;
      document.querySelector("#clientName").value = inv.client_name;
      document.querySelector("#clientPhone").value = inv.client_phone || "";
      document.querySelector("#clientAddress").value = inv.client_address || "";
      document.querySelector("#companyName").value = inv.company_name || "KIE Services";
      document.querySelector("#companyPhone").value = inv.company_phone || "";
      document.querySelector("#companyAddress").value = inv.company_address || "";
      document.querySelector("#discountRate").value = inv.discount_rate || 0;
      document.querySelector("#taxRate").value = inv.tax_rate || 18;
      document.querySelector("#amountPaid").value = inv.amount_paid || 0;
      document.querySelector("#paymentMethod").value = inv.payment_method || "Mobile Money";
      document.querySelector("#paymentStatus").value = inv.payment_status || "En attente";
      document.querySelector("#payLink").value = inv.pay_link || "";
      document.querySelector("#mobileProvider").value = inv.mobile_provider || "Orange Money";
      document.querySelector("#mobileNumber").value = inv.mobile_number || "";
      document.querySelector("#mobileMerchantName").value = inv.mobile_merchant_name || "";
      document.querySelector("#bankName").value = inv.bank_name || "";
      document.querySelector("#bankHolder").value = inv.bank_holder || "";
      document.querySelector("#bankIban").value = inv.bank_iban || "";
      document.querySelector("#bankBic").value = inv.bank_bic || "";
      document.querySelector("#notes").value = inv.notes || "";

      itemsEl.innerHTML = "";
      (inv.items || []).forEach(createItem);

      updatePaymentPanels();
      updatePreview();

      switchTab("viewEditor");
    }
  } catch (err) {
    alert("Erreur de chargement de la facture");
  }
}

// Modal de Paiement
function openPaymentModal(data) {
  const modal = document.querySelector("#paymentModal");
  if (!modal) return;

  // dataset renvoie toujours des strings → convertir en nombre
  const balanceNum = Math.round(parseFloat(data.balance) || 0);

  document.querySelector("#modalInvoiceId").value = data.id;
  setText("modalInvoiceNumber", data.number);
  setText("modalClientName", data.client);
  setText("modalBalanceDue", money(balanceNum));

  // Pré-remplir le montant avec le solde restant (valeur numérique entière)
  const amountInput = document.querySelector("#paymentAmount");
  amountInput.value = balanceNum;
  amountInput.min = 1;
  amountInput.max = balanceNum;

  document.querySelector("#paymentDateModal").value = todayIso();

  modal.classList.add("active");

  // Focus automatique sur le champ montant
  setTimeout(() => amountInput.focus(), 100);
}

function closePaymentModal() {
  const modal = document.querySelector("#paymentModal");
  if (modal) modal.classList.remove("active");
}

const closeBtn = document.querySelector("#closePaymentModal");
if (closeBtn) closeBtn.addEventListener("click", closePaymentModal);

const recordForm = document.querySelector("#recordPaymentForm");
if (recordForm) {
  recordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const invoiceId = document.querySelector("#modalInvoiceId").value;
    // Convertir explicitement en nombre pour éviter l'erreur de validation
    const amount = parseFloat(document.querySelector("#paymentAmount").value);
    const paymentMethod = document.querySelector("#paymentMethodModal").value;
    const paymentDate = document.querySelector("#paymentDateModal").value;
    const referenceCode = document.querySelector("#paymentRefModal").value;

    if (!amount || amount <= 0) {
      alert("Veuillez saisir un montant valide supérieur à 0.");
      document.querySelector("#paymentAmount").focus();
      return;
    }

    const submitBtn = recordForm.querySelector("button[type=submit]");
    if (submitBtn) submitBtn.textContent = "Enregistrement...";

    try {
      const res = await fetch(`${API_BASE}/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, paymentMethod, paymentDate, referenceCode }),
      });

      if (res.ok) {
        alert("✅ Règlement enregistré avec succès !");
        closePaymentModal();
        fetchDashboardData();
        fetchHistoryData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Erreur : ${err.error || "Impossible d'enregistrer le règlement"}`);
      }
    } catch (err) {
      alert("Erreur réseau / Serveur non joignable.");
    } finally {
      if (submitBtn) submitBtn.textContent = "Valider le Règlement";
    }
  });
}

// Fermer le modal en cliquant sur l'arrière-plan
document.querySelector("#paymentModal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closePaymentModal();
});

// Supprimer une facture
async function deleteInvoice(id) {
  if (!confirm("Êtes-vous sûr de vouloir supprimer cette facture de la base de données ?")) return;

  try {
    const res = await fetch(`${API_BASE}/invoices/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchDashboardData();
      fetchHistoryData();
    }
  } catch (err) {
    alert("Erreur de suppression.");
  }
}

// 7. Charger le Journal d'Audit
async function fetchAuditLogs() {
  try {
    const res = await fetch(`${API_BASE}/audit-logs`);
    if (res.ok) {
      const logs = await res.json();
      renderAuditTable(logs);
    }
  } catch (err) {
    console.warn("Erreur chargement journal audit", err);
  }
}

function renderAuditTable(logs) {
  const tbody = document.querySelector("#auditTableBody");
  if (!tbody) return;

  if (!logs || !logs.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Aucune opération d'audit enregistrée.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  logs.forEach((log) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family:var(--font-mono); font-size:0.78rem;">${new Date(log.timestamp).toLocaleString("fr-FR")}</td>
      <td><strong>${escapeAttribute(log.action)}</strong></td>
      <td><span class="preview-badge-status">${escapeAttribute(log.entity_type)}</span></td>
      <td>#${log.entity_id || "-"}</td>
      <td style="font-size:0.8rem; color:var(--muted);">${escapeAttribute(log.details)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   NAVIGATION PAR ONGLETS ET INITIALISATION
   ========================================================================== */

function switchTab(targetViewId) {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("data-target") === targetViewId);
  });

  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetViewId);
  });

  if (targetViewId === "viewDashboard") fetchDashboardData();
  if (targetViewId === "viewHistory") fetchHistoryData();
  if (targetViewId === "viewClients") fetchClients();
  if (targetViewId === "viewProducts") fetchProducts();
  if (targetViewId === "viewSecurity") fetchAuditLogs();
}

document.querySelectorAll(".nav-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    switchTab(tab.getAttribute("data-target"));
  });
});

const clientSel = document.querySelector("#clientSelect");
if (clientSel) {
  clientSel.addEventListener("change", (e) => {
    const selectedName = e.target.value;
    const client = clientsCache.find((c) => c.name === selectedName);
    if (client) {
      document.querySelector("#clientName").value = client.name;
      document.querySelector("#clientPhone").value = client.phone || "";
      document.querySelector("#clientAddress").value = client.address || "";
      updatePreview();
    }
  });
}

const addClientFm = document.querySelector("#addClientForm");
if (addClientFm) {
  addClientFm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.querySelector("#newClientName").value;
    const phone = document.querySelector("#newClientPhone").value;
    const email = document.querySelector("#newClientEmail").value;
    const address = document.querySelector("#newClientAddress").value;

    try {
      const res = await fetch(`${API_BASE}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, address }),
      });

      if (res.ok) {
        alert("✅ Client enregistré dans le CRM !");
        addClientFm.reset();
        fetchClients();
      }
    } catch (err) {
      alert("Erreur enregistrement client.");
    }
  });
}

const addProductFm = document.querySelector("#addProductForm");
if (addProductFm) {
  addProductFm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.querySelector("#newProductName").value;
    const unitPrice = document.querySelector("#newProductPrice").value;
    const category = document.querySelector("#newProductCategory").value;

    try {
      const res = await fetch(`${API_BASE}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, unitPrice, category }),
      });

      if (res.ok) {
        alert("✅ Prestation ajoutée au catalogue !");
        addProductFm.reset();
        fetchProducts();
      }
    } catch (err) {
      alert("Erreur enregistrement prestation.");
    }
  });
}

const historySrch = document.querySelector("#historySearch");
if (historySrch) historySrch.addEventListener("input", fetchHistoryData);

const historyFltr = document.querySelector("#historyFilterStatus");
if (historyFltr) historyFltr.addEventListener("change", fetchHistoryData);

const refreshHist = document.querySelector("#refreshHistory");
if (refreshHist) refreshHist.addEventListener("click", fetchHistoryData);

fields.forEach((id) => {
  const input = document.querySelector(`#${id}`);
  if (input) {
    input.addEventListener("input", () => {
      updatePaymentPanels();
      updatePreview();
    });
    input.addEventListener("change", () => {
      updatePaymentPanels();
      updatePreview();
    });
  }
});

const addBtn = document.querySelector("#addItem");
if (addBtn) {
  addBtn.addEventListener("click", () => {
    createItem({ description: "", quantity: 1, price: 0 });
    updatePreview();
  });
}

const saveDbBtn = document.querySelector("#saveDatabase");
if (saveDbBtn) saveDbBtn.addEventListener("click", saveToDatabase);

const resetBtn = document.querySelector("#resetDraft");
if (resetBtn) resetBtn.addEventListener("click", () => window.location.reload());

const printBtn = document.querySelector("#printInvoice");
if (printBtn) printBtn.addEventListener("click", () => window.print());

document.querySelector("#invoiceDate").value = todayIso();
document.querySelector("#dueDate").value = todayIso(7);

fetchClients();
fetchProducts();
fetchNextInvoiceNumber();

createItem({ description: "Développement Application Web & API", quantity: 1, price: 350000 });
createItem({ description: "Hébergement & Maintenance Annuelle", quantity: 1, price: 75000 });

updatePaymentPanels();
updatePreview();
