import { prisma } from './prisma'
import { Decimal } from '@prisma/client/runtime/library'

export interface FraudCheckResult {
  score: number
  decision: 'ACCEPTED' | 'REVIEW' | 'BLOCKED'
  reasons: string[]
  appliedRules: string[]
}

interface TransactionContext {
  userId: string
  amount: number
  type: string
  sourceWalletId?: string
  destinationWalletId?: string
  isInterWallet: boolean
  externalSystemUrl?: string
}

// Fraud detection engine with rule-based scoring
export async function checkFraud(context: TransactionContext): Promise<FraudCheckResult> {
  let score = 0
  const reasons: string[] = []
  const appliedRules: string[] = []

  // Get fraud rules from database
  const rules = await prisma.fraudRule.findMany({
    where: { isActive: true },
    orderBy: { priority: 'desc' },
  })

  // Apply each rule
  for (const rule of rules) {
    const ruleResult = await applyRule(rule, context)
    if (ruleResult.triggered) {
      score += rule.score
      reasons.push(ruleResult.reason)
      appliedRules.push(rule.name)

      // If any rule says BLOCK, immediately block
      if (rule.action === 'BLOCK' && ruleResult.triggered) {
        return {
          score: Math.min(score, 100),
          decision: 'BLOCKED',
          reasons,
          appliedRules,
        }
      }
    }
  }

  // Apply built-in rules if no custom rules exist
  if (rules.length === 0) {
    const builtInResult = await applyBuiltInRules(context)
    score = builtInResult.score
    reasons.push(...builtInResult.reasons)
    appliedRules.push(...builtInResult.appliedRules)
  }

  // Determine decision based on score
  let decision: 'ACCEPTED' | 'REVIEW' | 'BLOCKED'
  if (score >= 80) {
    decision = 'BLOCKED'
  } else if (score >= 50) {
    decision = 'REVIEW'
  } else {
    decision = 'ACCEPTED'
  }

  return {
    score: Math.min(score, 100),
    decision,
    reasons,
    appliedRules,
  }
}

async function applyRule(
  rule: { ruleType: string; condition: unknown; score: number },
  context: TransactionContext
): Promise<{ triggered: boolean; reason: string }> {
  const condition = rule.condition as Record<string, unknown>

  switch (rule.ruleType) {
    case 'AMOUNT_LIMIT': {
      const maxAmount = (condition.maxAmount as number) || 10000
      if (context.amount > maxAmount) {
        return {
          triggered: true,
          reason: `Montant (${context.amount}€) dépasse la limite de ${maxAmount}€`,
        }
      }
      break
    }

    case 'VELOCITY': {
      const maxTransactions = (condition.maxTransactions as number) || 10
      const timeWindowMinutes = (condition.timeWindowMinutes as number) || 60
      const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000)

      const recentCount = await prisma.transaction.count({
        where: {
          userId: context.userId,
          createdAt: { gte: since },
        },
      })

      if (recentCount >= maxTransactions) {
        return {
          triggered: true,
          reason: `${recentCount} transactions en ${timeWindowMinutes} minutes (limite: ${maxTransactions})`,
        }
      }
      break
    }

    case 'DAILY_LIMIT': {
      const maxDaily = (condition.maxDaily as number) || 5000
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)

      const dailyTotal = await prisma.transaction.aggregate({
        where: {
          userId: context.userId,
          createdAt: { gte: startOfDay },
          status: { in: ['SUCCESS', 'PENDING', 'PROCESSING'] },
        },
        _sum: { amount: true },
      })

      const total = Number(dailyTotal._sum.amount || 0) + context.amount
      if (total > maxDaily) {
        return {
          triggered: true,
          reason: `Total journalier (${total}€) dépasse la limite de ${maxDaily}€`,
        }
      }
      break
    }

    case 'NEW_ACCOUNT': {
      const minAgeDays = (condition.minAgeDays as number) || 7
      const user = await prisma.user.findUnique({
        where: { id: context.userId },
        select: { createdAt: true },
      })

      if (user) {
        const accountAgeDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        if (accountAgeDays < minAgeDays && context.amount > 500) {
          return {
            triggered: true,
            reason: `Compte créé il y a ${Math.floor(accountAgeDays)} jours (< ${minAgeDays}) avec montant élevé`,
          }
        }
      }
      break
    }

    case 'INTER_WALLET_SUSPICIOUS': {
      if (context.isInterWallet) {
        // Check if this is first inter-wallet transaction
        const interWalletCount = await prisma.transaction.count({
          where: {
            userId: context.userId,
            isInterWallet: true,
            status: 'SUCCESS',
          },
        })

        if (interWalletCount === 0 && context.amount > 200) {
          return {
            triggered: true,
            reason: `Première transaction inter-wallet avec montant élevé (${context.amount}€)`,
          }
        }
      }
      break
    }
  }

  return { triggered: false, reason: '' }
}

async function applyBuiltInRules(context: TransactionContext): Promise<{
  score: number
  reasons: string[]
  appliedRules: string[]
}> {
  let score = 0
  const reasons: string[] = []
  const appliedRules: string[] = []

  // Rule 1: High amount (> 5000€)
  if (context.amount > 5000) {
    score += 30
    reasons.push(`Montant élevé: ${context.amount}€`)
    appliedRules.push('HIGH_AMOUNT')
  }

  // Rule 2: Very high amount (> 10000€)
  if (context.amount > 10000) {
    score += 50
    reasons.push(`Montant très élevé: ${context.amount}€ (> 10000€)`)
    appliedRules.push('VERY_HIGH_AMOUNT')
  }

  // Rule 3: Velocity check (more than 5 transactions in last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recentTxCount = await prisma.transaction.count({
    where: {
      userId: context.userId,
      createdAt: { gte: oneHourAgo },
    },
  })

  if (recentTxCount > 5) {
    score += 20
    reasons.push(`${recentTxCount} transactions dans la dernière heure`)
    appliedRules.push('HIGH_VELOCITY')
  }

  // Rule 4: Daily limit check
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  
  const dailyAggregate = await prisma.transaction.aggregate({
    where: {
      userId: context.userId,
      createdAt: { gte: startOfDay },
      status: { in: ['SUCCESS', 'PENDING', 'PROCESSING'] },
    },
    _sum: { amount: true },
  })

  const dailyTotal = Number(dailyAggregate._sum.amount || 0) + context.amount
  if (dailyTotal > 10000) {
    score += 40
    reasons.push(`Total journalier élevé: ${dailyTotal}€`)
    appliedRules.push('DAILY_LIMIT_EXCEEDED')
  }

  // Rule 5: New account with high amount
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { createdAt: true },
  })

  if (user) {
    const accountAgeDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    if (accountAgeDays < 7 && context.amount > 1000) {
      score += 25
      reasons.push(`Compte récent (${Math.floor(accountAgeDays)} jours) avec montant > 1000€`)
      appliedRules.push('NEW_ACCOUNT_HIGH_AMOUNT')
    }
  }

  // Rule 6: Inter-wallet to unknown system
  if (context.isInterWallet && context.externalSystemUrl) {
    // First time to this system?
    const previousToSystem = await prisma.transaction.count({
      where: {
        userId: context.userId,
        isInterWallet: true,
        externalSystemUrl: context.externalSystemUrl,
        status: 'SUCCESS',
      },
    })

    if (previousToSystem === 0) {
      score += 15
      reasons.push(`Première transaction vers ce système externe`)
      appliedRules.push('NEW_EXTERNAL_SYSTEM')
    }
  }

  return { score, reasons, appliedRules }
}

// Initialize default fraud rules in database
export async function initializeFraudRules() {
  const existingRules = await prisma.fraudRule.count()
  if (existingRules > 0) return

  const defaultRules = [
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
  ]

  await prisma.fraudRule.createMany({
    data: defaultRules,
  })
}
