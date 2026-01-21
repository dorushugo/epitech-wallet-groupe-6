# Digital Wallet - Groupe 6

Wallet avec protocole inter-wallets et détection de fraude.

## Équipe
- Maxime Lecomte
- Quentin Robert
- Kylian Giabiconi
- Hugo Dorus

## Stack Technique
- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: Next.js API Routes (Bun runtime)
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT avec bcrypt
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
DATABASE_URL="postgresql://wallet_user:wallet_password@localhost:5432/wallet_db"
JWT_SECRET="votre-secret-jwt-min-32-chars"
INTERWALLET_HMAC_SECRET="secret-partage-avec-autres-groupes"
INTERWALLET_SYSTEM_URL="http://localhost:3000"
INTERWALLET_SYSTEM_NAME="Groupe6-Wallet"
```

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
| GET | `/api/transactions` | Historique |
| POST | `/api/transactions` | Nouvelle transaction |

### Inter-Wallet Protocol
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/inter-wallet/transfer` | Recevoir un transfert |
| POST | `/api/inter-wallet/validate` | Valider un transfert |
| POST | `/api/inter-wallet/status` | Vérifier le statut |
| GET | `/api/inter-wallet/status` | Info système |

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

5. **Historique**
   - Afficher toutes les transactions
   - Filtrer par statut/type

## Structure du projet

```
epitech-wallet/
├── src/
│   ├── app/
│   │   ├── (auth)/           # Pages login/register
│   │   ├── (dashboard)/      # Pages dashboard
│   │   ├── api/              # API Routes
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── prisma.ts         # Client Prisma
│   │   ├── auth.ts           # Utils auth/JWT
│   │   ├── fraud.ts          # Détection fraude
│   │   └── interwallet.ts    # Protocole inter-wallet
│   └── components/
├── prisma/
│   └── schema.prisma         # Schéma BDD
├── docker-compose.yml        # PostgreSQL
└── README.md
```

## Scripts

```bash
bun run dev        # Serveur dev
bun run build      # Build production
bun run start      # Serveur production
bun run seed       # Seed utilisateurs test
bunx prisma studio # Interface admin BDD
```
