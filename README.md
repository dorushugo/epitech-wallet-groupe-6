# Digital Wallet - Groupe 6

Wallet avec protocole inter-wallets et détection de fraude.

## Équipe
- Maxime Lecomte
- Quentin Robert
- Kylian Giabiconi
- Hugo Dorus

## Stack Technique
- **Frontend**: Next.js 16, React 19, Tailwind CSS, Lucide React
- **Backend**: Next.js API Routes (Bun runtime)
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT avec bcrypt
- **Paiements**: Stripe (Checkout, Payouts)
- **Inter-Wallet**: Protocole HMAC-SHA256

## Prérequis
- Node.js 18+ ou Bun 1.0+
- Docker & Docker Compose
- PostgreSQL (via Docker)

## Installation rapide

```bash
# 1. Cloner et installer
cd epitech-wallet
bun install

# 2. Lancer PostgreSQL
docker-compose up -d

# 3. Générer Prisma client
bunx prisma generate

# 4. Appliquer les migrations
bunx prisma db push

# 5. Seed la base (optionnel)
bun run seed

# 6. Lancer le serveur
bun run dev
```

L'app est accessible sur http://localhost:3000

## Variables d'environnement

Copier `.env.example` vers `.env` et configurer:

```env
# Base de données
DATABASE_URL="postgresql://wallet_user:wallet_password@localhost:5432/wallet_db"

# Authentification
JWT_SECRET="votre-secret-jwt-min-32-chars"

# Inter-Wallet
INTERWALLET_HMAC_SECRET="secret-partage-avec-autres-groupes"
INTERWALLET_SYSTEM_URL="http://localhost:3000"
INTERWALLET_SYSTEM_NAME="Groupe6-Wallet"

# Stripe (Paiements)
STRIPE_SECRET_KEY="sk_test_..."  # Clé secrète depuis Stripe Dashboard
STRIPE_PUBLISHABLE_KEY="pk_test_..."  # Clé publique depuis Stripe Dashboard
STRIPE_WEBHOOK_SECRET="whsec_..."  # Secret webhook (CLI pour dev local ou Dashboard pour prod)
STRIPE_CURRENCY="EUR"  # Devise par défaut
```

### Configuration Stripe

1. **Créer un compte Stripe** : https://stripe.com
2. **Récupérer les clés API** :
   - Dashboard Stripe → Developers → API keys
   - Copier la clé secrète test (`sk_test_...`) et la clé publique test (`pk_test_...`)
3. **Configurer les webhooks pour le développement local** :
   ```bash
   # Installer Stripe CLI (si pas déjà fait)
   # macOS: brew install stripe/stripe-cli/stripe
   
   # Se connecter
   stripe login
   
   # Démarrer l'écouteur local (dans un terminal séparé)
   stripe listen --forward-to localhost:3000/api/payments/webhook
   
   # Copier le webhook secret affiché (whsec_...) dans STRIPE_WEBHOOK_SECRET
   ```
4. **Pour la production** :
   - Dashboard Stripe → Developers → Webhooks
   - Ajouter endpoint : `https://votre-domaine.com/api/payments/webhook`
   - Événements à écouter :
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payout.paid`
     - `payout.failed`
   - Copier le webhook secret dans `STRIPE_WEBHOOK_SECRET`

## API Endpoints

### Authentification
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Connexion |
| POST | `/api/auth/register` | Inscription |
| GET | `/api/auth/me` | Utilisateur courant |
| POST | `/api/auth/logout` | Déconnexion |

### Wallets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wallets` | Liste des wallets |
| POST | `/api/wallets` | Créer un wallet |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | Historique (filtres: `?walletId=...&type=...&status=...`) |
| POST | `/api/transactions` | Nouvelle transaction |

**Note** : Toutes les transactions incluent un champ `platformFee` indiquant la marge de 1% prélevée.

### Paiements Stripe
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/deposit` | Créer une session de dépôt Stripe |
| POST | `/api/payments/webhook` | Webhook Stripe (événements paiements) |
| POST | `/api/payments/cashout` | Initier un retrait (cashout) |

### Inter-Wallet Protocol
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/inter-wallet/transfer` | Recevoir un transfert |
| POST | `/api/inter-wallet/validate` | Valider un transfert |
| POST | `/api/inter-wallet/status` | Vérifier le statut |
| GET | `/api/inter-wallet/status` | Info système |

## Documentation API (OpenAPI/Swagger)

Le projet inclut une documentation API complète au format OpenAPI 3.1.0.

### Accès à la documentation

Une fois le serveur démarré, la documentation interactive est accessible sur :

- **Interface Swagger UI** : http://localhost:3000/api-docs
- **Fichier OpenAPI brut** : http://localhost:3000/api/openapi (format YAML)

### Contenu de la documentation

La documentation inclut :

- **Tous les endpoints API** avec descriptions détaillées
- **Schémas de données typés** basés sur les validations Zod existantes
- **Exemples de requêtes/réponses** pour chaque endpoint
- **Codes de statut HTTP** et gestion d'erreurs
- **Sécurité** : authentification JWT (cookies), signatures HMAC pour inter-wallet
- **Paramètres de requête** et filtres disponibles

### Validation du schéma OpenAPI

Pour valider le fichier `openapi.yaml` :

```bash
bun run validate:openapi
```

### Utilisation avec d'autres outils

Le fichier `openapi.yaml` peut être utilisé avec :

- **Postman** : Importer le fichier pour générer une collection
- **Insomnia** : Importer pour tester les endpoints
- **Code génération** : Utiliser `openapi-typescript` ou `openapi-generator` pour générer des clients TypeScript
- **Mock servers** : Utiliser Prism ou WireMock pour créer un serveur mock

### Notes importantes

- **Authentification** : Les cookies HTTP-only ne peuvent pas être testés directement dans Swagger UI. Utilisez un navigateur ou un outil comme Postman pour tester les endpoints authentifiés.
- **Signatures HMAC** : Pour les endpoints inter-wallet, la signature doit être calculée côté client. Voir la section "Protocole Inter-Wallet" pour des exemples de code.
- **Webhooks Stripe** : L'endpoint `/api/payments/webhook` nécessite une signature Stripe valide. Utilisez Stripe CLI pour tester en local.

## Protocole Inter-Wallet

### Format de requête
```json
{
  "transactionRef": "Groupe6-xxxx-xxxxxxxx",
  "sourceSystemUrl": "http://source-system.com",
  "sourceSystemName": "SourceWallet",
  "sourceWalletId": "wallet-id",
  "destinationWalletId": "dest-wallet-id",
  "amount": 100.00,
  "currency": "EUR",
  "description": "Description",
  "timestamp": "2024-01-20T12:00:00.000Z"
}
```

### Headers requis
```
X-Signature: <HMAC-SHA256 du payload>
X-Source-System: <URL du système source>
Content-Type: application/json
```

### Calcul de signature
```javascript
const crypto = require('crypto')
const signature = crypto
  .createHmac('sha256', HMAC_SECRET)
  .update(JSON.stringify(payload))
  .digest('hex')
```

## Détection de Fraude

Le système utilise un moteur de règles avec scoring:

| Score | Décision |
|-------|----------|
| 0-49 | ACCEPTED |
| 50-79 | REVIEW |
| 80-100 | BLOCKED |

Règles appliquées:
- Montant > 10 000€ → BLOCKED (score 100)
- Montant > 5 000€ → +30 points
- Vélocité > 10 tx/heure → +25 points
- Total journalier > 5 000€ → +35 points
- Compte < 7 jours avec montant élevé → +30 points

## Marge de Plateforme

Le système prélève une **marge de 1%** sur toutes les transactions pour financer le service.

### Application de la marge

La marge est appliquée différemment selon le type de transaction :

#### Dépôts (DEPOSIT)
- Montant reçu via Stripe : **100€**
- Marge prélevée : **1€** (1%)
- Montant crédité au wallet utilisateur : **99€**
- Marge accumulée dans le wallet système

#### Retraits (WITHDRAWAL)
- Montant demandé par l'utilisateur : **100€**
- Marge prélevée : **1€** (1%)
- Montant total débité du wallet : **101€**
- Montant envoyé à l'utilisateur : **100€** (montant net)
- Marge accumulée dans le wallet système

#### Transferts intrawallet (TRANSFER)
- Montant transféré : **100€**
- Marge prélevée : **1€** (1%)
- Wallet source débité : **101€**
- Wallet destination crédité : **100€** (montant net)
- Marge accumulée dans le wallet système

#### Transferts inter-wallet sortants (INTER_WALLET - sortant)
- Montant envoyé : **100€**
- Marge prélevée : **1€** (1%)
- Wallet source débité : **101€**
- Montant envoyé au système externe : **100€** (montant net)
- Marge accumulée dans le wallet système

#### Transferts inter-wallet entrants (INTER_WALLET - entrant)
- Montant reçu : **100€**
- Marge prélevée : **1€** (1%)
- Wallet destination crédité : **99€** (montant net)
- Marge accumulée dans le wallet système

### Stockage et suivi

- La marge est stockée dans le champ `platformFee` de chaque transaction
- Toutes les marges sont accumulées dans un **wallet système** automatiquement créé
- Le wallet système est identifié par l'email `platform@wallet.system`
- La marge est visible dans les réponses API via le champ `platformFee` des transactions

## Scénarios de démonstration

1. **Création d'utilisateurs**
   - Créer User A et User B avec wallets

2. **Transaction locale**
   - User A envoie 50€ à User B
   - Vérifier soldes mis à jour

3. **Transaction inter-wallet**
   - User A envoie 100€ à un wallet externe
   - Vérifier statut PENDING → SUCCESS

4. **Détection de fraude**
   - Tenter transaction de 10 000€
   - Vérifier statut BLOCKED + score visible

5. **Paiements Stripe**
   - Créditer un wallet via Stripe Checkout (cartes + PayPal)
   - Retirer des fonds vers virement bancaire ou carte
   - Tester avec les cartes de test Stripe (4242 4242 4242 4242)

6. **Historique**
   - Afficher toutes les transactions (dépôts, retraits, transferts)
   - Filtrer par wallet, type, statut

## Structure du projet

```
epitech-wallet/
├── src/
│   ├── app/
│   │   ├── (auth)/           # Pages login/register
│   │   ├── (dashboard)/      # Pages dashboard
│   │   │   ├── wallets/      # Liste wallets + détail par wallet
│   │   │   ├── deposit/      # Page crédit wallet
│   │   │   └── cashout/      # Page retrait wallet
│   │   ├── api/              # API Routes
│   │   │   └── payments/    # Routes Stripe
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── prisma.ts         # Client Prisma
│   │   ├── auth.ts           # Utils auth/JWT
│   │   ├── fraud.ts          # Détection fraude
│   │   ├── stripe.ts         # Client Stripe
│   │   ├── payments.ts       # Logique paiements
│   │   ├── interwallet.ts    # Protocole inter-wallet
│   │   └── platform-fee.ts   # Calcul et gestion marge plateforme
│   └── components/
├── prisma/
│   └── schema.prisma         # Schéma BDD
├── docker-compose.yml        # PostgreSQL
└── README.md
```

## Scripts

```bash
bun run dev              # Serveur dev
bun run build            # Build production
bun run start            # Serveur production
bun run seed             # Seed utilisateurs test
bun run validate:openapi # Valider le schéma OpenAPI
bun run docs             # Afficher l'URL de la documentation
bunx prisma studio       # Interface admin BDD
```
