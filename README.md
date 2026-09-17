# 🧾 KIE Facture — Système de Gestion de Facturation

Application web complète de gestion et génération de factures pour KIE (Kinshasa Innovation & Entrepreneuriat), avec base de données sécurisée, numérotation séquentielle, comptabilisation et multi-systèmes de paiement.

---

## ✨ Fonctionnalités

### 📄 Éditeur de Facture
- Génération de factures professionnelles avec aperçu en temps réel
- Numérotation séquentielle automatique (ex: `FAC-2026-0001`)
- Gestion des articles, remises, taxes (TVA)
- Statuts de facture : Brouillon, Envoyée, Payée, En retard, Annulée

### 💳 Systèmes de Paiement Configurés
- **Mobile Money** : Orange Money, Moov Money, Wave, MTN MoMo
- **Virement Bancaire** : IBAN, SWIFT/BIC, RIB
- **Lien de Paiement en ligne** : URL directe + génération QR Code dynamique
- **Espèces & Chèque**
- Gestion des **acomptes** et calcul automatique du **Solde Restant Dû**

### 🗄️ Base de Données (SQLite3)
- **Factures** avec numérotation séquentielle et verrouillage concurrent
- **Clients** : CRM intégré avec historique de commandes
- **Produits / Services** : Catalogue réutilisable
- **Paiements** : Enregistrement multi-échéances
- **Journal d'Audit** : Traçabilité complète de toutes les actions
- **Sauvegarde automatique** des factures en brouillon

### 📊 Tableau de Bord Financier
- Chiffre d'affaires mensuel, TVA collectée, créances en cours
- Indicateurs KPI en temps réel
- États comptables exportables (CSV/Excel)

### 🔒 Sécurité
- Journal d'audit horodaté (toutes les opérations)
- Validation des données côté serveur
- Transactions atomiques (SQLite WAL)
- Variables d'environnement pour les secrets

---

## 🚀 Installation & Démarrage

### Prérequis
- [Node.js](https://nodejs.org/) >= 18.x

### Installation
```bash
# Cloner le dépôt
git clone https://github.com/votre-utilisateur/kie-facture.git
cd kie-facture

# Installer les dépendances
npm install

# Démarrer le serveur
npm start
```

L'application sera disponible sur : **http://localhost:3000**

### Mode Développement (rechargement automatique)
```bash
npm run dev
```

---

## 🏗️ Architecture

```
kie-facture/
├── index.html        # Interface utilisateur principale
├── styles.css        # Design system (CSS variables, dark mode, responsive)
├── app.js            # Logique frontend (JS vanilla)
├── server.js         # API REST + base de données SQLite
├── package.json      # Dépendances Node.js
└── README.md
```

### Stack Technique
| Couche | Technologie |
|--------|-------------|
| Frontend | HTML5, CSS3 (Vanilla), JavaScript ES6+ |
| Backend | Node.js + Express.js |
| Base de données | SQLite3 (avec WAL mode) |
| QR Code | Génération SVG pure JS |
| Polices | Google Fonts (Plus Jakarta Sans, JetBrains Mono) |

---

## 📡 API REST

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/invoices` | Liste toutes les factures |
| `POST` | `/api/invoices` | Créer une nouvelle facture |
| `GET` | `/api/invoices/:id` | Détails d'une facture |
| `PUT` | `/api/invoices/:id` | Modifier une facture |
| `DELETE` | `/api/invoices/:id` | Supprimer une facture |
| `GET` | `/api/clients` | Liste des clients |
| `POST` | `/api/clients` | Ajouter un client |
| `GET` | `/api/products` | Catalogue produits |
| `POST` | `/api/products` | Ajouter un produit |
| `GET` | `/api/dashboard` | KPIs financiers |
| `GET` | `/api/audit` | Journal d'audit |

---

## 🤝 Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/nouvelle-fonctionnalite`)
3. Committer les changements (`git commit -m 'Ajout de la fonctionnalité X'`)
4. Pousser la branche (`git push origin feature/nouvelle-fonctionnalite`)
5. Ouvrir une Pull Request

---

## 📄 Licence

MIT © 2026 KIE — Kinshasa Innovation & Entrepreneuriat
