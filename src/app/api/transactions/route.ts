import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { checkFraud } from '@/lib/fraud'
import { sendInterWalletTransfer } from '@/lib/interwallet'
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

    const where: Record<string, unknown> = { userId: user.id }
    if (status) where.status = status
    if (type) where.type = type

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
  destinationWalletId: z.string().optional(),
  destinationEmail: z.string().email().optional(),
  amount: z.number().positive('Montant doit être positif'),
  description: z.string().max(255).optional(),
  // Inter-wallet fields
  isInterWallet: z.boolean().default(false),
  externalSystemUrl: z.string().url().optional(),
  externalWalletId: z.string().optional(),
})

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
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      )
    }

    const data = validation.data

    // Verify source wallet ownership
    const sourceWallet = await prisma.wallet.findFirst({
      where: {
        id: data.sourceWalletId,
        userId: user.id,
        isActive: true,
      },
    })

    if (!sourceWallet) {
      return NextResponse.json(
        { success: false, error: 'Wallet source non trouvé' },
        { status: 404 }
      )
    }

    // Check balance
    if (Number(sourceWallet.balance) < data.amount) {
      return NextResponse.json(
        { success: false, error: 'Solde insuffisant' },
        { status: 400 }
      )
    }

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
  sourceWallet: { id: string; currency: string; balance: unknown },
  data: z.infer<typeof transferSchema>,
  fraudResult: { score: number; decision: string; reasons: string[] }
) {
  // Find destination wallet
  let destinationWallet

  if (data.destinationWalletId) {
    destinationWallet = await prisma.wallet.findFirst({
      where: { id: data.destinationWalletId, isActive: true },
    })
  } else if (data.destinationEmail) {
    const destUser = await prisma.user.findUnique({
      where: { email: data.destinationEmail },
      include: {
        wallets: {
          where: { isActive: true, currency: sourceWallet.currency },
          take: 1,
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

  if (destinationWallet.id === sourceWallet.id) {
    return NextResponse.json(
      { success: false, error: 'Impossible de transférer vers le même wallet' },
      { status: 400 }
    )
  }

  // Determine status based on fraud check
  const status = fraudResult.decision === 'REVIEW' ? 'REVIEW' : 'SUCCESS'

  // Execute transaction atomically
  const result = await prisma.$transaction(async (tx) => {
    // Debit source wallet
    await tx.wallet.update({
      where: { id: sourceWallet.id },
      data: { balance: { decrement: data.amount } },
    })

    // Credit destination wallet (only if not in review)
    if (status === 'SUCCESS') {
      await tx.wallet.update({
        where: { id: destinationWallet.id },
        data: { balance: { increment: data.amount } },
      })
    }

    // Create transaction record
    const transaction = await tx.transaction.create({
      data: {
        userId,
        sourceWalletId: sourceWallet.id,
        destinationWalletId: destinationWallet.id,
        amount: data.amount,
        currency: sourceWallet.currency,
        type: 'TRANSFER',
        status,
        fraudScore: fraudResult.score,
        fraudReason: fraudResult.reasons.length > 0 ? fraudResult.reasons.join('; ') : null,
        description: data.description,
        executedAt: status === 'SUCCESS' ? new Date() : null,
      },
    })

    // Log transaction steps
    await tx.transactionLog.createMany({
      data: [
        { transactionId: transaction.id, step: 'VALIDATION', status: 'SUCCESS', data: { amount: data.amount } },
        { transactionId: transaction.id, step: 'FRAUD_CHECK', status: 'SUCCESS', data: fraudResult },
        { transactionId: transaction.id, step: 'DEBIT', status: 'SUCCESS', data: { walletId: sourceWallet.id } },
        { transactionId: transaction.id, step: 'CREDIT', status: status === 'SUCCESS' ? 'SUCCESS' : 'PENDING', data: { walletId: destinationWallet.id } },
      ],
    })

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
  // Debit source wallet first
  await prisma.wallet.update({
    where: { id: sourceWallet.id },
    data: { balance: { decrement: data.amount } },
  })

  // Create pending transaction
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      sourceWalletId: sourceWallet.id,
      amount: data.amount,
      currency: sourceWallet.currency,
      type: 'INTER_WALLET',
      status: 'PENDING',
      fraudScore: fraudResult.score,
      fraudReason: fraudResult.reasons.length > 0 ? fraudResult.reasons.join('; ') : null,
      isInterWallet: true,
      externalSystemUrl: data.externalSystemUrl,
      externalWalletId: data.externalWalletId,
      description: data.description,
    },
  })

  // Send to external system
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
    // Rollback: refund source wallet
    await prisma.wallet.update({
      where: { id: sourceWallet.id },
      data: { balance: { increment: data.amount } },
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
