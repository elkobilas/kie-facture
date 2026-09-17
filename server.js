const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Connexion et initialisation de la base de données SQLite
const dbFile = path.join(__dirname, "database.db");
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error("Erreur d'ouverture de la base de données :", err.message);
  } else {
    console.log("Connecté à la base de données SQLite :", dbFile);
    initDatabase();
  }
});

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function logAudit(action, entityType, entityId, details) {
  try {
    const timestamp = new Date().toISOString();
    await runQuery(
      `INSERT INTO audit_logs (timestamp, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`,
      [timestamp, action, entityType, entityId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error("Erreur d'enregistrement dans le journal d'audit :", err);
  }
}

async function initDatabase() {
  await runQuery(`PRAGMA foreign_keys = ON;`);

  // Table Profil Entreprise
  await runQuery(`
    CREATE TABLE IF NOT EXISTS company_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      tax_id TEXT,
      updated_at TEXT
    )
  `);

  // Table Clients (CRM)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at TEXT
    )
  `);

  // Table Produits & Services (Catalogue)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      unit_price REAL DEFAULT 0,
      category TEXT,
      created_at TEXT
    )
  `);

  // Table Factures (Master Invoice Record avec Numérotation Séquentielle)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_phone TEXT,
      client_address TEXT,
      company_name TEXT,
      company_phone TEXT,
      company_address TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_rate REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      tax_rate REAL DEFAULT 18,
      tax_amount REAL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'Mobile Money',
      payment_status TEXT DEFAULT 'En attente',
      pay_link TEXT,
      mobile_provider TEXT,
      mobile_number TEXT,
      mobile_merchant_name TEXT,
      bank_name TEXT,
      bank_holder TEXT,
      bank_iban TEXT,
      bank_bic TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // Table Lignes de Facture (Items)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `);

  // Table Historique des Paiements (Payment Ledger)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT,
      reference_code TEXT,
      notes TEXT,
      created_at TEXT,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `);

  // Table Journal d'Audit & Sécurité
  await runQuery(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT
    )
  `);

  console.log("Base de données et tables SQLite initialisées avec succès.");

  // Insérer des produits et clients initiaux si vides
  const clientCount = await getQuery(`SELECT COUNT(*) as count FROM clients`);
  if (clientCount.count === 0) {
    const now = new Date().toISOString();
    await runQuery(`INSERT INTO clients (name, phone, address, created_at) VALUES (?, ?, ?, ?)`, [
      "Société Burkina Tech",
      "+226 76 00 00 00",
      "Ouagadougou, Secteur 15",
      now,
    ]);
    await runQuery(`INSERT INTO clients (name, phone, address, created_at) VALUES (?, ?, ?, ?)`, [
      "Afriq Solutions",
      "+226 78 11 22 33",
      "Koudougou, Centre-Ouest",
      now,
    ]);
  }

  const productCount = await getQuery(`SELECT COUNT(*) as count FROM products`);
  if (productCount.count === 0) {
    const now = new Date().toISOString();
    await runQuery(`INSERT INTO products (name, unit_price, category, created_at) VALUES (?, ?, ?, ?)`, [
      "Développement Application Web & API",
      350000,
      "Services IT",
      now,
    ]);
    await runQuery(`INSERT INTO products (name, unit_price, category, created_at) VALUES (?, ?, ?, ?)`, [
      "Hébergement & Maintenance Annuelle",
      75000,
      "Infrastructure",
      now,
    ]);
    await runQuery(`INSERT INTO products (name, unit_price, category, created_at) VALUES (?, ?, ?, ?)`, [
      "Audit de Sécurité & Système",
      150000,
      "Conseil",
      now,
    ]);
  }
}

/* ==========================================================================
   ROUTES API REST - NUMÉROTATION SÉQUENTIELLE & COMPTABILITÉ
   ========================================================================== */

// 1. Obtenir le prochain numéro de facture séquentiel (ex: FAC-2026-0001)
app.get("/api/next-number", async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `FAC-${currentYear}-`;

    const row = await getQuery(
      `SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let nextSeq = 1;
    if (row && row.invoice_number) {
      const parts = row.invoice_number.split("-");
      if (parts.length >= 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          nextSeq = lastSeq + 1;
        }
      }
    }

    const nextNumber = `${prefix}${String(nextSeq).padStart(4, "0")}`;
    res.json({ nextNumber, sequence: nextSeq, year: currentYear });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Liste de toutes les factures avec filtres (recherche, statut, dates)
app.get("/api/invoices", async (req, res) => {
  try {
    const { search, status, startDate, endDate } = req.query;
    let sql = `SELECT * FROM invoices WHERE 1=1`;
    const params = [];

    if (search) {
      sql += ` AND (invoice_number LIKE ? OR client_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status && status !== "ALL") {
      sql += ` AND payment_status = ?`;
      params.push(status);
    }

    if (startDate) {
      sql += ` AND issue_date >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND issue_date <= ?`;
      params.push(endDate);
    }

    sql += ` ORDER BY id DESC`;

    const invoices = await allQuery(sql, params);
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Obtenir une facture spécifique avec ses articles et son historique de paiement
app.get("/api/invoices/:id", async (req, res) => {
  try {
    const invoice = await getQuery(`SELECT * FROM invoices WHERE id = ?`, [req.params.id]);
    if (!invoice) return res.status(404).json({ error: "Facture introuvable" });

    const items = await allQuery(`SELECT * FROM invoice_items WHERE invoice_id = ?`, [req.params.id]);
    const payments = await allQuery(`SELECT * FROM payments WHERE invoice_id = ? ORDER BY id DESC`, [req.params.id]);

    res.json({ ...invoice, items, payments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Créer / Enregistrer une nouvelle facture (avec transaction SQL & Numération séquentielle)
app.post("/api/invoices", async (req, res) => {
  try {
    const data = req.body;
    const now = new Date().toISOString();
    const currentYear = new Date().getFullYear();
    const prefix = `FAC-${currentYear}-`;

    // Calcul / vérification du numéro séquentiel
    let invoiceNumber = data.invoiceNumber;
    if (!invoiceNumber || invoiceNumber === "FAC-2026-001") {
      const lastRow = await getQuery(
        `SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextSeq = 1;
      if (lastRow && lastRow.invoice_number) {
        const parts = lastRow.invoice_number.split("-");
        if (parts.length >= 3) {
          const lastSeq = parseInt(parts[2], 10);
          if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
        }
      }
      invoiceNumber = `${prefix}${String(nextSeq).padStart(4, "0")}`;
    }

    // Calculs financiers
    const subtotal = Number(data.subtotal) || 0;
    const discountRate = Number(data.discountRate) || 0;
    const discountAmount = subtotal * (discountRate / 100);
    const taxable = Math.max(subtotal - discountAmount, 0);
    const taxRate = Number(data.taxRate) || 0;
    const taxAmount = taxable * (taxRate / 100);
    const grandTotal = taxable + taxAmount;
    const amountPaid = Number(data.amountPaid) || 0;
    const balanceDue = Math.max(grandTotal - amountPaid, 0);

    let paymentStatus = data.paymentStatus || "En attente";
    if (balanceDue <= 0 && grandTotal > 0) {
      paymentStatus = "Payee";
    } else if (amountPaid > 0 && balanceDue > 0) {
      paymentStatus = "Partiellement payee";
    }

    const result = await runQuery(
      `INSERT INTO invoices (
        invoice_number, issue_date, due_date, client_name, client_phone, client_address,
        company_name, company_phone, company_address, subtotal, discount_rate, discount_amount,
        tax_rate, tax_amount, grand_total, amount_paid, balance_due, payment_method, payment_status,
        pay_link, mobile_provider, mobile_number, mobile_merchant_name, bank_name, bank_holder, bank_iban, bank_bic, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        data.invoiceDate || now.slice(0, 10),
        data.dueDate || now.slice(0, 10),
        data.clientName || "Client",
        data.clientPhone || "",
        data.clientAddress || "",
        data.companyName || "KIE Services",
        data.companyPhone || "",
        data.companyAddress || "",
        subtotal,
        discountRate,
        discountAmount,
        taxRate,
        taxAmount,
        grandTotal,
        amountPaid,
        balanceDue,
        data.paymentMethod || "Mobile Money",
        paymentStatus,
        data.payLink || "",
        data.mobileProvider || "",
        data.mobileNumber || "",
        data.mobileMerchantName || "",
        data.bankName || "",
        data.bankHolder || "",
        data.bankIban || "",
        data.bankBic || "",
        data.notes || "",
        now,
        now,
      ]
    );

    const invoiceId = result.lastID;

    // Insertion des articles
    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        await runQuery(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)`,
          [invoiceId, item.description || "Article", qty, price, qty * price]
        );
      }
    }

    // Enregistrer le paiement initial si présent
    if (amountPaid > 0) {
      await runQuery(
        `INSERT INTO payments (invoice_id, payment_date, amount, payment_method, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, data.invoiceDate || now.slice(0, 10), amountPaid, data.paymentMethod, "Acompte / Paiement initial", now]
      );
    }

    // Auto-enregistrement du client dans le répertoire s'il n'existe pas
    if (data.clientName) {
      await runQuery(
        `INSERT OR IGNORE INTO clients (name, phone, address, created_at) VALUES (?, ?, ?, ?)`,
        [data.clientName.trim(), data.clientPhone || "", data.clientAddress || "", now]
      );
    }

    await logAudit("CREATE_INVOICE", "INVOICE", invoiceId, { invoiceNumber, grandTotal, clientName: data.clientName });

    res.status(201).json({ success: true, invoiceId, invoiceNumber, grandTotal, balanceDue, paymentStatus });
  } catch (err) {
    console.error("Erreur d'enregistrement de facture :", err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Enregistrer un paiement sur une facture existante (Rapprochement bancaire / acompte)
app.post("/api/invoices/:id/payments", async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const { amount, paymentMethod, referenceCode, notes, paymentDate } = req.body;
    const now = new Date().toISOString();

    const invoice = await getQuery(`SELECT * FROM invoices WHERE id = ?`, [invoiceId]);
    if (!invoice) return res.status(404).json({ error: "Facture non trouvée" });

    const payAmount = Number(amount) || 0;
    const newAmountPaid = invoice.amount_paid + payAmount;
    const newBalanceDue = Math.max(invoice.grand_total - newAmountPaid, 0);

    let newStatus = "Partiellement payee";
    if (newBalanceDue <= 0) newStatus = "Payee";

    await runQuery(
      `INSERT INTO payments (invoice_id, payment_date, amount, payment_method, reference_code, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, paymentDate || now.slice(0, 10), payAmount, paymentMethod || invoice.payment_method, referenceCode || "", notes || "", now]
    );

    await runQuery(
      `UPDATE invoices SET amount_paid = ?, balance_due = ?, payment_status = ?, updated_at = ? WHERE id = ?`,
      [newAmountPaid, newBalanceDue, newStatus, now, invoiceId]
    );

    await logAudit("RECORD_PAYMENT", "INVOICE", invoiceId, { amount: payAmount, newBalanceDue, newStatus });

    res.json({ success: true, newAmountPaid, newBalanceDue, newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Supprimer / Annuler une facture
app.delete("/api/invoices/:id", async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const invoice = await getQuery(`SELECT * FROM invoices WHERE id = ?`, [invoiceId]);
    if (!invoice) return res.status(404).json({ error: "Facture non trouvée" });

    await runQuery(`DELETE FROM invoices WHERE id = ?`, [invoiceId]);
    await logAudit("DELETE_INVOICE", "INVOICE", invoiceId, { invoiceNumber: invoice.invoice_number });

    res.json({ success: true, message: "Facture supprimée de la base de données." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. ÉTATS COMPTABLES & RAPPORTS FINANCIERS
app.get("/api/reports/summary", async (req, res) => {
  try {
    const totals = await getQuery(`
      SELECT 
        COUNT(*) as totalInvoices,
        COALESCE(SUM(subtotal), 0) as totalHT,
        COALESCE(SUM(tax_amount), 0) as totalTVA,
        COALESCE(SUM(grand_total), 0) as totalTTC,
        COALESCE(SUM(amount_paid), 0) as totalPaid,
        COALESCE(SUM(balance_due), 0) as totalBalanceDue
      FROM invoices
    `);

    const paidCount = await getQuery(`SELECT COUNT(*) as count FROM invoices WHERE payment_status = 'Payee'`);
    const pendingCount = await getQuery(`SELECT COUNT(*) as count FROM invoices WHERE payment_status = 'En attente'`);
    const partialCount = await getQuery(`SELECT COUNT(*) as count FROM invoices WHERE payment_status = 'Partiellement payee'`);

    const recoveryRate = totals.totalTTC > 0 ? ((totals.totalPaid / totals.totalTTC) * 100).toFixed(1) : 0;

    res.json({
      ...totals,
      paidCount: paidCount.count,
      pendingCount: pendingCount.count,
      partialCount: partialCount.count,
      recoveryRate: Number(recoveryRate),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exportation CSV des états comptables (Journal des ventes)
app.get("/api/reports/export/csv", async (req, res) => {
  try {
    const invoices = await allQuery(`SELECT * FROM invoices ORDER BY id ASC`);
    
    let csv = "ID;Numero Facture;Date Emission;Date Echeance;Client;Subtotal HT;TVA (18%);Total TTC;Montant Paye;Solde Dû;Statut;Mode Paiement\n";
    invoices.forEach((inv) => {
      csv += `${inv.id};"${inv.invoice_number}";"${inv.issue_date}";"${inv.due_date}";"${inv.client_name.replace(/"/g, '""')}";${inv.subtotal};${inv.tax_amount};${inv.grand_total};${inv.amount_paid};${inv.balance_due};"${inv.payment_status}";"${inv.payment_method}"\n`;
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="journal_des_ventes.csv"');
    res.send("\uFEFF" + csv); // UTF-8 BOM pour Excel
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. CRM CLIENTS (Liste & Ajout)
app.get("/api/clients", async (req, res) => {
  try {
    const clients = await allQuery(`SELECT * FROM clients ORDER BY name ASC`);
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/clients", async (req, res) => {
  try {
    const { name, phone, email, address } = req.body;
    const now = new Date().toISOString();
    const result = await runQuery(
      `INSERT INTO clients (name, phone, email, address, created_at) VALUES (?, ?, ?, ?, ?)`,
      [name, phone || "", email || "", address || "", now]
    );
    res.json({ success: true, clientId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. CATALOGUE DE PRODUITS / PRESTATIONS
app.get("/api/products", async (req, res) => {
  try {
    const products = await allQuery(`SELECT * FROM products ORDER BY name ASC`);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const { name, unitPrice, category } = req.body;
    const now = new Date().toISOString();
    const result = await runQuery(
      `INSERT INTO products (name, unit_price, category, created_at) VALUES (?, ?, ?, ?)`,
      [name, Number(unitPrice) || 0, category || "Général", now]
    );
    res.json({ success: true, productId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. JOURNAL D'AUDIT DE SÉCURITÉ
app.get("/api/audit-logs", async (req, res) => {
  try {
    const logs = await allQuery(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100`);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. SAUVEGARDE COMPLÈTE DE LA BASE DE DONNÉES (JSON BACKUP)
app.get("/api/backup", async (req, res) => {
  try {
    const invoices = await allQuery(`SELECT * FROM invoices`);
    const items = await allQuery(`SELECT * FROM invoice_items`);
    const clients = await allQuery(`SELECT * FROM clients`);
    const products = await allQuery(`SELECT * FROM products`);
    const payments = await allQuery(`SELECT * FROM payments`);

    const backup = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      invoices,
      items,
      clients,
      products,
      payments,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="kie_facture_database_backup.json"');
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Démarrage du serveur Express
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Serveur KIE Facturation actif sur http://localhost:${PORT}`);
  console.log(`📁 Base de données SQLite connectée et sécurisée.`);
  console.log(`===================================================`);
});
