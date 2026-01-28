import { PrismaClient, TransactionType, TransactionStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Helper pour générer une date dans les X derniers jours
function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60))
  return date
}

async function main() {
  console.log('🌱 Seeding database...')

  // Create test users avec solde initial à 0 (sera calculé par les transactions)
  const usersData = [
    {
      email: 'alice@test.com',
      password: 'password123',
      firstName: 'Alice',
      lastName: 'Martin',
    },
    {
      email: 'bob@test.com',
      password: 'password123',
      firstName: 'Bob',
      lastName: 'Dupont',
    },
    {
      email: 'demo@demo.com',
      password: 'demo1234',
      firstName: 'Demo',
      lastName: 'User',
    },
  ]

  const createdUsers: { id: string; email: string; walletId: string }[] = []

  for (const userData of usersData) {
    let user = await prisma.user.findUnique({
      where: { email: userData.email },
      include: { wallets: true },
    })

    if (user) {
      console.log(`  ⏭️  User ${userData.email} already exists`)
      createdUsers.push({
        id: user.id,
        email: user.email,
        walletId: user.wallets[0]?.id || '',
      })
      continue
    }

    const hashedPassword = await bcrypt.hash(userData.password, 12)

    user = await prisma.user.create({
      data: {
        email: userData.email,
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        wallets: {
          create: {
            name: 'Wallet Principal',
            balance: 0, // Solde initial à 0
            currency: 'EUR',
          },
        },
      },
      include: { wallets: true },
    })

    createdUsers.push({
      id: user.id,
      email: user.email,
      walletId: user.wallets[0].id,
    })

    console.log(`  ✅ Created user: ${user.email} (wallet: ${user.wallets[0].id})`)
  }

  // Create sample fraud rules
  const existingRules = await prisma.fraudRule.count()
  if (existingRules === 0) {
    await prisma.fraudRule.createMany({
      data: [
        {
          name: 'Montant très élevé',
          description: 'Bloque les transactions > 10 000€',
          ruleType: 'AMOUNT_LIMIT',
          condition: { maxAmount: 10000 },
          score: 100,
          action: 'BLOCK',
          priority: 100,
        },
        {
          name: 'Montant élevé',
          description: 'Flag les transactions > 5 000€',
          ruleType: 'AMOUNT_LIMIT',
          condition: { maxAmount: 5000 },
          score: 30,
          action: 'FLAG',
          priority: 90,
        },
        {
          name: 'Vélocité haute',
          description: 'Plus de 10 transactions par heure',
          ruleType: 'VELOCITY',
          condition: { maxTransactions: 10, timeWindowMinutes: 60 },
          score: 25,
          action: 'REVIEW',
          priority: 80,
        },
        {
          name: 'Limite journalière',
          description: 'Total journalier > 5 000€',
          ruleType: 'DAILY_LIMIT',
          condition: { maxDaily: 5000 },
          score: 35,
          action: 'REVIEW',
          priority: 70,
        },
        {
          name: 'Nouveau compte suspect',
          description: 'Compte < 7 jours avec montant élevé',
          ruleType: 'NEW_ACCOUNT',
          condition: { minAgeDays: 7 },
          score: 30,
          action: 'REVIEW',
          priority: 60,
        },
      ],
    })
    console.log('  ✅ Created fraud rules')
  }

  // Create sample transactions between users
  const existingTransactions = await prisma.transaction.count()
  if (existingTransactions === 0 && createdUsers.length >= 3) {
    console.log('\n  📝 Creating sample transactions...')

    const alice = createdUsers.find((u) => u.email === 'alice@test.com')!
    const bob = createdUsers.find((u) => u.email === 'bob@test.com')!
    const demo = createdUsers.find((u) => u.email === 'demo@demo.com')!

    // ============================================
    // TRANSACTIONS COHÉRENTES AVEC LES SOLDES
    // ============================================
    // Soldes finaux visés:
    // - Alice: 1000€ = +1500 -100 -200 +50 -250
    // - Bob: 500€ = +400 +100 -50 +75 -25
    // - Demo: 2500€ = +3000 +200 -50 +50 -75 -625
    // ============================================

    const transactions = [
      // === DÉPÔTS INITIAUX ===
      {
        type: TransactionType.DEPOSIT,
        amount: 1500,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Dépôt initial par carte bancaire',
        userId: alice.id,
        destinationWalletId: alice.walletId,
        createdAt: daysAgo(28),
        fraudScore: 0,
      },
      {
        type: TransactionType.DEPOSIT,
        amount: 3000,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Virement depuis compte courant',
        userId: demo.id,
        destinationWalletId: demo.walletId,
        createdAt: daysAgo(27),
        fraudScore: 0,
      },
      {
        type: TransactionType.DEPOSIT,
        amount: 400,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Dépôt PayPal',
        userId: bob.id,
        destinationWalletId: bob.walletId,
        createdAt: daysAgo(25),
        fraudScore: 0,
      },

      // === TRANSFERTS ENTRE UTILISATEURS ===
      // Alice -> Bob: 100€
      {
        type: TransactionType.TRANSFER,
        amount: 100,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Remboursement restaurant',
        userId: alice.id,
        sourceWalletId: alice.walletId,
        destinationWalletId: bob.walletId,
        createdAt: daysAgo(22),
        fraudScore: 0,
      },
      // Alice -> Demo: 200€
      {
        type: TransactionType.TRANSFER,
        amount: 200,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Participation Airbnb vacances',
        userId: alice.id,
        sourceWalletId: alice.walletId,
        destinationWalletId: demo.walletId,
        createdAt: daysAgo(20),
        fraudScore: 5,
      },
      // Demo -> Alice: 50€
      {
        type: TransactionType.TRANSFER,
        amount: 50,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Remboursement courses',
        userId: demo.id,
        sourceWalletId: demo.walletId,
        destinationWalletId: alice.walletId,
        createdAt: daysAgo(18),
        fraudScore: 0,
      },
      // Bob -> Demo: 50€
      {
        type: TransactionType.TRANSFER,
        amount: 50,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Part cadeau anniversaire',
        userId: bob.id,
        sourceWalletId: bob.walletId,
        destinationWalletId: demo.walletId,
        createdAt: daysAgo(15),
        fraudScore: 0,
      },
      // Demo -> Bob: 75€
      {
        type: TransactionType.TRANSFER,
        amount: 75,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Remboursement concert',
        userId: demo.id,
        sourceWalletId: demo.walletId,
        destinationWalletId: bob.walletId,
        createdAt: daysAgo(12),
        fraudScore: 0,
      },

      // === RETRAITS ===
      // Alice: -250€
      {
        type: TransactionType.WITHDRAWAL,
        amount: 250,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Virement vers compte bancaire',
        userId: alice.id,
        sourceWalletId: alice.walletId,
        createdAt: daysAgo(10),
        fraudScore: 0,
      },
      // Bob: -25€
      {
        type: TransactionType.WITHDRAWAL,
        amount: 25,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Retrait DAB',
        userId: bob.id,
        sourceWalletId: bob.walletId,
        createdAt: daysAgo(8),
        fraudScore: 0,
      },
      // Demo: -625€
      {
        type: TransactionType.WITHDRAWAL,
        amount: 625,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Virement externe urgent',
        userId: demo.id,
        sourceWalletId: demo.walletId,
        createdAt: daysAgo(5),
        fraudScore: 15,
      },

      // === TRANSACTIONS SUSPECTES (n'affectent pas le solde) ===
      // Transaction REVIEW - montant élevé suspect
      {
        type: TransactionType.TRANSFER,
        amount: 2500,
        currency: 'EUR',
        status: TransactionStatus.REVIEW,
        description: 'Gros transfert en attente de vérification',
        userId: demo.id,
        sourceWalletId: demo.walletId,
        destinationWalletId: alice.walletId,
        createdAt: daysAgo(3),
        fraudScore: 55,
      },
      // Transaction BLOCKED - tentative de fraude
      {
        type: TransactionType.TRANSFER,
        amount: 8000,
        currency: 'EUR',
        status: TransactionStatus.BLOCKED,
        description: 'Transfert bloqué - montant suspect',
        userId: bob.id,
        sourceWalletId: bob.walletId,
        destinationWalletId: demo.walletId,
        createdAt: daysAgo(2),
        fraudScore: 92,
      },

      // === TRANSACTIONS RÉCENTES ===
      {
        type: TransactionType.TRANSFER,
        amount: 15,
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Café et croissants équipe',
        userId: alice.id,
        sourceWalletId: alice.walletId,
        destinationWalletId: bob.walletId,
        createdAt: daysAgo(1),
        fraudScore: 0,
      },
      {
        type: TransactionType.DEPOSIT,
        amount: 15, // Compense le transfert précédent pour garder le solde
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Petit rechargement',
        userId: alice.id,
        destinationWalletId: alice.walletId,
        createdAt: daysAgo(1),
        fraudScore: 0,
      },
      {
        type: TransactionType.WITHDRAWAL,
        amount: 15, // Bob retire ce qu'il a reçu
        currency: 'EUR',
        status: TransactionStatus.SUCCESS,
        description: 'Retrait rapide',
        userId: bob.id,
        sourceWalletId: bob.walletId,
        createdAt: daysAgo(0),
        fraudScore: 0,
      },
    ]

    for (const tx of transactions) {
      await prisma.transaction.create({
        data: {
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          status: tx.status,
          description: tx.description,
          userId: tx.userId,
          sourceWalletId: tx.sourceWalletId || null,
          destinationWalletId: tx.destinationWalletId || null,
          fraudScore: tx.fraudScore,
          isInterWallet: false,
          createdAt: tx.createdAt,
        },
      })
    }

    console.log(`  ✅ Created ${transactions.length} sample transactions`)

    // === MISE À JOUR DES SOLDES DES WALLETS ===
    // Calculés à partir des transactions SUCCESS uniquement
    await prisma.wallet.update({
      where: { id: alice.walletId },
      data: { balance: 1000 }, // 1500 - 100 - 200 + 50 - 250 + 15 - 15 = 1000
    })
    await prisma.wallet.update({
      where: { id: bob.walletId },
      data: { balance: 500 }, // 400 + 100 - 50 + 75 - 25 + 15 - 15 = 500
    })
    await prisma.wallet.update({
      where: { id: demo.walletId },
      data: { balance: 2500 }, // 3000 + 200 - 50 + 50 - 75 - 625 = 2500
    })

    console.log('  ✅ Updated wallet balances')
  }

  console.log('\n🎉 Seed completed!')
  console.log('\nTest accounts:')
  console.log('  📧 alice@test.com / password123 (1000€)')
  console.log('  📧 bob@test.com / password123 (500€)')
  console.log('  📧 demo@demo.com / demo1234 (2500€)')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
