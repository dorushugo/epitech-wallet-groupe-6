import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create test users
  const users = [
    {
      email: 'alice@test.com',
      password: 'password123',
      firstName: 'Alice',
      lastName: 'Martin',
      walletBalance: 1000,
    },
    {
      email: 'bob@test.com',
      password: 'password123',
      firstName: 'Bob',
      lastName: 'Dupont',
      walletBalance: 500,
    },
    {
      email: 'demo@demo.com',
      password: 'demo1234',
      firstName: 'Demo',
      lastName: 'User',
      walletBalance: 2500,
    },
  ]

  for (const userData of users) {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email },
    })

    if (existingUser) {
      console.log(`  ⏭️  User ${userData.email} already exists`)
      continue
    }

    const hashedPassword = await bcrypt.hash(userData.password, 12)

    const user = await prisma.user.create({
      data: {
        email: userData.email,
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        wallets: {
          create: {
            name: 'Wallet Principal',
            balance: userData.walletBalance,
            currency: 'EUR',
          },
        },
      },
      include: { wallets: true },
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
