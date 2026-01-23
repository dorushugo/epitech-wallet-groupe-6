import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { checkFraud } from '@/lib/fraud'
import { sendInterWalletTransfer } from '@/lib/interwallet'
import { calculatePlatformFee, getPlatformWallet } from '@/lib/platform-fee'
import { convertCurrency } from '@/lib/currency'
import { Decimal } from '@prisma/client/runtime/library'
import { z } from 'zod'
import { TransactionStatus } from '@prisma/client'

// GET /api/transactions - Get transaction history
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status') as TransactionStatus | null
    const type = searchParams.get('type')
    const walletId = searchParams.get('walletId')

    const where: Record<string, unknown> = { userId: user.id }
    if (status) where.status = status
    if (type) where.type = type
    if (walletId) {
      where.OR = [
        { sourceWalletId: walletId },
        { destinationWalletId: walletId },
      ]
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sourceWallet: { select: { id: true, name: true } },
          destinationWallet: { select: { id: true, name: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        amount: Number(t.amount),
        platformFee: t.platformFee ? Number(t.platformFee) : null,
        currency: t.currency,
        description: t.description,
        fraudScore: t.fraudScore,
        fraudReason: t.fraudReason,
        isInterWallet: t.isInterWallet,
        externalSystemUrl: t.externalSystemUrl,
        sourceWallet: t.sourceWallet,
        destinationWallet: t.destinationWallet,
        createdAt: t.createdAt,
        executedAt: t.executedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get transactions error:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

const transferSchema = z.object({
  sourceWalletId: z.string().min(1, 'Wallet source requis'),
  destinationWalletId: z.string().min(1, 'Wallet destinataire requis').optional(),
  destinationEmail: z.string().email().optional(),
  amount: z.number().positive('Montant doit être positif'),
  destinationCurrency: z.string().length(3).optional(), // Devise du wallet de destination (montant saisi dans cette devise)
  description: z.string().max(255).optional(),
  // Inter-wallet fields
  isInterWallet: z.boolean().default(false),
  externalSystemUrl: z.string().url().optional(),
  externalWalletId: z.string().optional(),
}).refine(
  (data) => data.destinationWalletId || data.destinationEmail,
  { message: 'destinationWalletId ou destinationEmail requis' }
)

// POST /api/transactions - Create a new transaction
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validation = transferSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0].message },
        { status: 400 }
      )
    }

    const data = validation.data

    // Verify source wallet ownership (avec userId pour vérifier si même utilisateur)
    const sourceWallet = await prisma.wallet.findFirst({
      where: {
        id: data.sourceWalletId,
        userId: user.id,
        isActive: true,
      },
      select: {
        id: true,
        currency: true,
        balance: true,
        userId: true,
      },
    })

    if (!sourceWallet) {
      return NextResponse.json(
        { success: false, error: 'Wallet source non trouvé' },
        { status: 404 }
      )
    }

    // Note: Les frais de plateforme seront calculés dans handleLocalTransfer
    // en fonction de si les wallets appartiennent au même utilisateur ou non.
    // On vérifie juste le solde pour le montant de base ici.
    // Le check final avec frais sera fait dans handleLocalTransfer après avoir déterminé
    // si c'est le même utilisateur.

    // Run fraud check
    const fraudResult = await checkFraud({
      userId: user.id,
      amount: data.amount,
      type: data.isInterWallet ? 'INTER_WALLET' : 'TRANSFER',
      sourceWalletId: data.sourceWalletId,
      destinationWalletId: data.destinationWalletId,
      isInterWallet: data.isInterWallet,
      externalSystemUrl: data.externalSystemUrl,
    })

    // Handle blocked transactions
    if (fraudResult.decision === 'BLOCKED') {
      const blockedTx = await prisma.transaction.create({
        data: {
          userId: user.id,
          sourceWalletId: data.sourceWalletId,
          destinationWalletId: data.destinationWalletId,
          amount: data.amount,
          currency: sourceWallet.currency,
          type: data.isInterWallet ? 'INTER_WALLET' : 'TRANSFER',
          status: 'BLOCKED',
          fraudScore: fraudResult.score,
          fraudReason: fraudResult.reasons.join('; '),
          isInterWallet: data.isInterWallet,
          externalSystemUrl: data.externalSystemUrl,
          externalWalletId: data.externalWalletId,
          description: data.description,
        },
      })

      return NextResponse.json({
        success: false,
        error: 'Transaction bloquée par la détection de fraude',
        transaction: {
          id: blockedTx.id,
          status: 'BLOCKED',
          fraudScore: fraudResult.score,
          fraudReasons: fraudResult.reasons,
        },
      }, { status: 403 })
    }

    // Handle inter-wallet transactions
    if (data.isInterWallet && data.externalSystemUrl && data.externalWalletId) {
      return handleInterWalletTransfer(user.id, sourceWallet, data, fraudResult)
    }

    // Handle local transfers
    return handleLocalTransfer(user.id, sourceWallet, data, fraudResult)
  } catch (error) {
    console.error('Create transaction error:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

async function handleLocalTransfer(
  userId: string,
  sourceWallet: { id: string; currency: string; balance: unknown; userId: string },
  data: z.infer<typeof transferSchema>,
  fraudResult: { score: number; decision: string; reasons: string[] }
) {
  // Find destination wallet (avec userId pour vérifier si même utilisateur)
  let destinationWallet

  if (data.destinationWalletId) {
    // Utiliser directement le wallet ID fourni
    destinationWallet = await prisma.wallet.findFirst({
      where: { id: data.destinationWalletId, isActive: true },
      select: {
        id: true,
        currency: true,
        userId: true,
      },
    })
  } else if (data.destinationEmail) {
    // Fallback: chercher par email (pour compatibilité)
    const destUser = await prisma.user.findUnique({
      where: { email: data.destinationEmail },
      include: {
        wallets: {
          where: { isActive: true },
          take: 1,
          select: {
            id: true,
            currency: true,
            userId: true,
          },
        },
      },
    })
    destinationWallet = destUser?.wallets[0]
  }

  if (!destinationWallet) {
    return NextResponse.json(
      { success: false, error: 'Wallet destinataire non trouvé' },
      { status: 404 }
    )
  }

  // Vérifier qu'on ne transfère pas vers le même wallet
  if (destinationWallet.id === sourceWallet.id) {
    return NextResponse.json(
      { success: false, error: 'Impossible de transférer vers le même wallet' },
      { status: 400 }
    )
  }

  // Vérifier si les deux wallets appartiennent au même utilisateur
  const isSameUser = sourceWallet.userId === destinationWallet.userId

  // Le montant reçu est dans la devise de destination (ou source si identique)
  // On doit le convertir vers la devise source pour le débit
  const amountInDestinationCurrency = data.amount // Montant dans la devise de destination
  let amountToDebit = data.amount // Montant à débiter dans la devise source
  let exchangeRate = 1

  if (destinationWallet.currency !== sourceWallet.currency) {
    // Vérifier que la devise de destination correspond
    const expectedCurrency = data.destinationCurrency || destinationWallet.currency
    if (expectedCurrency !== destinationWallet.currency) {
      return NextResponse.json(
        { success: false, error: 'La devise du montant ne correspond pas au wallet de destination' },
        { status: 400 }
      )
    }

    // Convertir depuis la devise de destination vers la devise source
    try {
      amountToDebit = await convertCurrency(
        amountInDestinationCurrency,
        destinationWallet.currency,
        sourceWallet.currency
      )
      exchangeRate = amountToDebit / amountInDestinationCurrency
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Erreur de conversion de devise' },
        { status: 400 }
      )
    }
  }

  // Calculer la marge de plateforme (1% sur le montant à débiter dans la devise source)
  // PAS de frais si les deux wallets appartiennent au même utilisateur
  const platformFeeInSourceCurrency = isSameUser ? 0 : calculatePlatformFee(amountToDebit)
  const totalDebit = amountToDebit + platformFeeInSourceCurrency

  // Obtenir le wallet système (toujours en EUR) seulement si on a des frais
  let platformWallet = null
  let platformWalletData = null
  let platformFeeInEUR = 0

  if (!isSameUser && platformFeeInSourceCurrency > 0) {
    platformWallet = await getPlatformWallet()
    platformWalletData = await prisma.wallet.findUnique({
      where: { id: platformWallet.id },
    })

    // Convertir les frais de plateforme en EUR si nécessaire (le wallet système est en EUR)
    platformFeeInEUR = platformFeeInSourceCurrency
    if (sourceWallet.currency !== 'EUR' && platformWalletData?.currency === 'EUR') {
      try {
        platformFeeInEUR = await convertCurrency(
          platformFeeInSourceCurrency,
          sourceWallet.currency,
          'EUR'
        )
      } catch {
        return NextResponse.json(
          { success: false, error: 'Erreur de conversion des frais de plateforme' },
          { status: 400 }
        )
      }
    }
  }

  // Vérifier le solde avant de procéder (montant + frais si applicable)
  if (Number(sourceWallet.balance) < totalDebit) {
    return NextResponse.json(
      { 
        success: false, 
        error: isSameUser 
          ? 'Solde insuffisant' 
          : 'Solde insuffisant (montant + frais de plateforme)' 
      },
      { status: 400 }
    )
  }

  // Determine status based on fraud check
  const status = fraudResult.decision === 'REVIEW' ? 'REVIEW' : 'SUCCESS'

  // Execute transaction atomically
  const result = await prisma.$transaction(async (tx) => {
    // Debit source wallet (montant + marge dans la devise source)
    await tx.wallet.update({
      where: { id: sourceWallet.id },
      data: { balance: { decrement: totalDebit } },
    })

    // Credit destination wallet avec le montant dans sa devise (only if not in review)
    if (status === 'SUCCESS') {
      await tx.wallet.update({
        where: { id: destinationWallet.id },
        data: { balance: { increment: amountInDestinationCurrency } },
      })

      // Créditer le wallet système avec le frais de plateforme (en EUR) seulement si ce n'est pas le même utilisateur
      if (!isSameUser && platformWallet && platformFeeInEUR > 0) {
        await tx.wallet.update({
          where: { id: platformWallet.id },
          data: { balance: { increment: platformFeeInEUR } },
        })
      }
    }

    // Create transaction record
    const transaction = await tx.transaction.create({
      data: {
        userId,
        sourceWalletId: sourceWallet.id,
        destinationWalletId: destinationWallet.id,
        amount: amountInDestinationCurrency, // Montant dans la devise de destination (ce qui sera reçu)
        platformFee: new Decimal(platformFeeInEUR), // Frais en EUR (devise du wallet système)
        currency: destinationWallet.currency, // Devise du montant reçu
        type: 'TRANSFER',
        status,
        fraudScore: fraudResult.score,
        fraudReason: fraudResult.reasons.length > 0 ? fraudResult.reasons.join('; ') : null,
        metadata: {
          sourceCurrency: sourceWallet.currency,
          destinationCurrency: destinationWallet.currency,
          amountDebited: amountToDebit, // Montant débité dans la devise source
          amountCredited: amountInDestinationCurrency, // Montant crédité dans la devise destination
          platformFeeInSourceCurrency: platformFeeInSourceCurrency, // Frais dans la devise source (0 si même utilisateur)
          platformFeeInEUR: platformFeeInEUR, // Frais convertis en EUR (0 si même utilisateur)
          exchangeRate: exchangeRate,
          totalDebit: totalDebit,
          isSameUser: isSameUser, // Indique si c'est un transfert entre wallets du même utilisateur
        },
        description: data.description,
        executedAt: status === 'SUCCESS' ? new Date() : null,
      },
    })

    // Log transaction steps
    const logs = [
      { transactionId: transaction.id, step: 'VALIDATION', status: 'SUCCESS', data: { amount: data.amount } as object },
      { transactionId: transaction.id, step: 'FRAUD_CHECK', status: 'SUCCESS', data: fraudResult as object },
      { transactionId: transaction.id, step: 'DEBIT', status: 'SUCCESS', data: { walletId: sourceWallet.id, amount: totalDebit } as object },
      { transactionId: transaction.id, step: 'CREDIT', status: status === 'SUCCESS' ? 'SUCCESS' : 'PENDING', data: { walletId: destinationWallet.id, amount: amountInDestinationCurrency } as object },
    ]

    // Ajouter le log PLATFORM_FEE seulement si on a des frais (pas le même utilisateur)
    if (!isSameUser && platformWallet && platformFeeInEUR > 0) {
      logs.push({
        transactionId: transaction.id,
        step: 'PLATFORM_FEE',
        status: status === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
        data: { platformWalletId: platformWallet.id, fee: platformFeeInEUR } as object,
      })
    }

    await tx.transactionLog.createMany({ data: logs })

    return transaction
  })

  // Get updated balance
  const updatedWallet = await prisma.wallet.findUnique({
    where: { id: sourceWallet.id },
  })

  return NextResponse.json({
    success: true,
    transaction: {
      id: result.id,
      status: result.status,
      amount: Number(result.amount),
      currency: result.currency,
      fraudScore: result.fraudScore,
      createdAt: result.createdAt,
      executedAt: result.executedAt,
    },
    newBalance: Number(updatedWallet?.balance),
  })
}

async function handleInterWalletTransfer(
  userId: string,
  sourceWallet: { id: string; currency: string; balance: unknown },
  data: z.infer<typeof transferSchema>,
  fraudResult: { score: number; decision: string; reasons: string[] }
) {
  // Calculer le frais de plateforme (1%)
  const platformFeeNum = calculatePlatformFee(data.amount)
  const platformFee = new Decimal(platformFeeNum)
  const totalDebit = data.amount + platformFeeNum

  // Obtenir le wallet système
  const platformWallet = await getPlatformWallet()

  // Debit source wallet (montant + marge) et créditer le wallet système atomiquement
  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { id: sourceWallet.id },
      data: { balance: { decrement: totalDebit } },
    })

    // Créditer le wallet système avec la marge
    await tx.wallet.update({
      where: { id: platformWallet.id },
      data: { balance: { increment: platformFee } },
    })
  })

  // Create pending transaction
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      sourceWalletId: sourceWallet.id,
      amount: data.amount,
      platformFee: platformFee,
      currency: sourceWallet.currency,
      type: 'INTER_WALLET',
      status: 'PENDING',
      fraudScore: fraudResult.score,
      fraudReason: fraudResult.reasons.length > 0 ? fraudResult.reasons.join('; ') : null,
      isInterWallet: true,
      externalSystemUrl: data.externalSystemUrl,
      externalWalletId: data.externalWalletId,
      description: data.description,
      metadata: {
        totalDebit: totalDebit,
      },
    },
  })

  // Send to external system (montant net seulement)
  const interWalletResult = await sendInterWalletTransfer(
    data.externalSystemUrl!,
    data.externalWalletId!,
    data.amount,
    sourceWallet.currency,
    sourceWallet.id,
    data.description
  )

  if (interWalletResult.success) {
    // Update transaction with reference
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'PROCESSING',
        interWalletRef: interWalletResult.transactionRef,
      },
    })

    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: 'PROCESSING',
        interWalletRef: interWalletResult.transactionRef,
        amount: data.amount,
        currency: sourceWallet.currency,
      },
      message: 'Transaction inter-wallet en cours de traitement',
    })
  } else {
    // Rollback: refund source wallet (montant + marge) et débiter le wallet système
    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: sourceWallet.id },
        data: { balance: { increment: totalDebit } },
      })

      // Débiter le wallet système (remboursement du frais de plateforme)
      await tx.wallet.update({
        where: { id: platformWallet.id },
        data: { balance: { decrement: platformFeeNum } },
      })
    })

    // Mark transaction as failed
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED' },
    })

    return NextResponse.json({
      success: false,
      error: interWalletResult.error || 'Échec de la transaction inter-wallet',
      transaction: { id: transaction.id, status: 'FAILED' },
    }, { status: 400 })
  }
}
