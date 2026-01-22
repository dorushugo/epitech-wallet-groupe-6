import { prisma } from './prisma'
import { stripe, STRIPE_CURRENCY } from './stripe'
import { checkFraud } from './fraud'
import { calculatePlatformFee, getPlatformWallet } from './platform-fee'
import { Decimal } from '@prisma/client/runtime/library'

/**
 * Traite un dépôt réussi (appelé depuis le webhook)
 * Crédite le wallet et crée une transaction DEPOSIT
 */
export async function processDeposit(paymentIntentId: string): Promise<{
  success: boolean
  error?: string
  transactionId?: string
}> {
  try {
    // Récupérer le PaymentIntent depuis Stripe
    const stripePaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    // Trouver le PaymentIntent en DB
    const paymentIntent = await prisma.paymentIntent.findUnique({
      where: { stripePaymentId: paymentIntentId },
      include: { wallet: true, user: true },
    })

    if (!paymentIntent) {
      return { success: false, error: 'PaymentIntent not found in database' }
    }

    // Vérifier qu'il n'a pas déjà été traité (idempotence)
    if (paymentIntent.status === 'succeeded') {
      return {
        success: true,
        transactionId: paymentIntent.transactionId || undefined,
      }
    }

    // Vérifier que le paiement Stripe est bien réussi
    if (stripePaymentIntent.status !== 'succeeded') {
      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: 'failed' },
      })
      return { success: false, error: 'Payment not succeeded in Stripe' }
    }

    // Calculer le frais de plateforme (1%) - déjà inclus dans le paiement Stripe
    const platformFeeNum = calculatePlatformFee(paymentIntent.amount)
    const platformFee = new Decimal(platformFeeNum)

    // Obtenir le wallet système
    const platformWallet = await getPlatformWallet()

    // Traiter le dépôt atomiquement
    const result = await prisma.$transaction(async (tx) => {
      // Créditer le wallet utilisateur avec le montant complet (l'utilisateur a déjà payé le frais)
      await tx.wallet.update({
        where: { id: paymentIntent.walletId },
        data: {
          balance: {
            increment: paymentIntent.amount,
          },
        },
      })

      // Créditer le wallet système avec le frais de plateforme
      await tx.wallet.update({
        where: { id: platformWallet.id },
        data: {
          balance: {
            increment: platformFeeNum,
          },
        },
      })

      // Créer une Transaction de type DEPOSIT avec status SUCCESS
      const transaction = await tx.transaction.create({
        data: {
          userId: paymentIntent.userId,
          destinationWalletId: paymentIntent.walletId,
          amount: paymentIntent.amount,
          platformFee: platformFee,
          currency: paymentIntent.currency,
          type: 'DEPOSIT',
          status: 'SUCCESS',
          description: `Dépôt via Stripe (${paymentIntentId})`,
          executedAt: new Date(),
          metadata: {
            stripePaymentIntentId: paymentIntentId,
            paymentIntentId: paymentIntent.id,
          },
        },
      })

      // Mettre à jour le PaymentIntent
      await tx.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: {
          status: 'succeeded',
          transactionId: transaction.id,
        },
      })

      // Log transaction steps
      await tx.transactionLog.createMany({
        data: [
          {
            transactionId: transaction.id,
            step: 'PAYMENT_RECEIVED',
            status: 'SUCCESS',
            data: { paymentIntentId: paymentIntentId },
          },
          {
            transactionId: transaction.id,
            step: 'WALLET_CREDIT',
            status: 'SUCCESS',
            data: { walletId: paymentIntent.walletId, amount: Number(paymentIntent.amount) },
          },
          {
            transactionId: transaction.id,
            step: 'PLATFORM_FEE',
            status: 'SUCCESS',
            data: { platformWalletId: platformWallet.id, fee: platformFee },
          },
        ],
      })

      return transaction
    })

    return { success: true, transactionId: result.id }
  } catch (error) {
    console.error('Process deposit error:', error)
    return { success: false, error: 'Failed to process deposit' }
  }
}

/**
 * Traite un cashout (retrait)
 * Débite le wallet et crée un Payout Stripe
 */
export async function processCashout(params: {
  userId: string
  walletId: string
  amount: number
  method: 'bank_transfer' | 'card'
  destination: string
  description?: string
}): Promise<{
  success: boolean
  error?: string
  payoutId?: string
  transactionId?: string
}> {
  try {
    const { userId, walletId, amount, method, destination, description } = params

    // Vérifier la propriété du wallet
    const wallet = await prisma.wallet.findFirst({
      where: {
        id: walletId,
        userId,
        isActive: true,
      },
    })

    if (!wallet) {
      return { success: false, error: 'Wallet not found or not owned by user' }
    }

    // Calculer le frais de plateforme (1%)
    const platformFeeNum = calculatePlatformFee(amount)
    const platformFee = new Decimal(platformFeeNum)
    const totalDebit = amount + platformFeeNum

    // Vérifier le solde (montant demandé + marge)
    if (Number(wallet.balance) < totalDebit) {
      return { success: false, error: 'Solde insuffisant (montant + frais de plateforme)' }
    }

    // Appliquer la détection de fraude pour les montants importants
    if (amount > 500) {
      const fraudResult = await checkFraud({
        userId,
        amount,
        type: 'WITHDRAWAL',
        sourceWalletId: walletId,
        isInterWallet: false,
      })

      if (fraudResult.decision === 'BLOCKED') {
        return {
          success: false,
          error: 'Transaction bloquée par la détection de fraude',
        }
      }
    }

    // Créer le Payout Stripe
    let stripePayoutId: string | null = null

    try {
      // Pour les virements bancaires, utiliser Stripe Payouts
      if (method === 'bank_transfer') {
        // Note: Stripe Payouts nécessite un compte Connect ou un compte standard avec vérification
        // Pour l'instant, on crée juste l'enregistrement en DB
        // En production, il faudra configurer Stripe Connect ou utiliser l'API Payouts
        stripePayoutId = null // À implémenter avec Stripe Connect/Payouts
      } else if (method === 'card') {
        // Pour les cartes, utiliser Stripe Transfers (nécessite Connect)
        stripePayoutId = null // À implémenter avec Stripe Connect
      }
    } catch (stripeError) {
      console.error('Stripe payout creation error:', stripeError)
      // On continue quand même pour créer l'enregistrement en DB
    }

    // Obtenir le wallet système
    const platformWallet = await getPlatformWallet()

    // Traiter le cashout atomiquement
    const result = await prisma.$transaction(async (tx) => {
      // Débiter le wallet utilisateur (montant demandé + marge)
      await tx.wallet.update({
        where: { id: walletId },
        data: {
          balance: {
            decrement: totalDebit,
          },
        },
      })

      // Créditer le wallet système avec le frais de plateforme
      await tx.wallet.update({
        where: { id: platformWallet.id },
        data: {
          balance: {
            increment: platformFeeNum,
          },
        },
      })

      // Créer le Payout en DB (montant net envoyé à l'utilisateur)
      const payout = await tx.payout.create({
        data: {
          userId,
          walletId,
          stripePayoutId,
          amount,
          currency: wallet.currency,
          method,
          destination,
          status: stripePayoutId ? 'pending' : 'pending',
          metadata: {
            description,
          },
        },
      })

      // Créer Transaction WITHDRAWAL avec status PENDING
      const transaction = await tx.transaction.create({
        data: {
          userId,
          sourceWalletId: walletId,
          amount,
          platformFee: platformFee,
          currency: wallet.currency,
          type: 'WITHDRAWAL',
          status: 'PENDING',
          description: description || `Retrait ${method === 'bank_transfer' ? 'virement bancaire' : 'carte'}`,
          metadata: {
            payoutId: payout.id,
            method,
            destination: destination.substring(0, 4) + '****', // Masquer les infos sensibles
            totalDebit: totalDebit,
          },
        },
      })

      // Lier le payout à la transaction
      await tx.payout.update({
        where: { id: payout.id },
        data: { transactionId: transaction.id },
      })

      // Log transaction steps
      await tx.transactionLog.createMany({
        data: [
          {
            transactionId: transaction.id,
            step: 'WALLET_DEBIT',
            status: 'SUCCESS',
            data: { walletId, amount: totalDebit },
          },
          {
            transactionId: transaction.id,
            step: 'PLATFORM_FEE',
            status: 'SUCCESS',
            data: { platformWalletId: platformWallet.id, fee: platformFee },
          },
          {
            transactionId: transaction.id,
            step: 'PAYOUT_CREATED',
            status: 'SUCCESS',
            data: { payoutId: payout.id, method, netAmount: amount },
          },
        ],
      })

      return { payout, transaction }
    })

    return {
      success: true,
      payoutId: result.payout.id,
      transactionId: result.transaction.id,
    }
  } catch (error) {
    console.error('Process cashout error:', error)
    return { success: false, error: 'Failed to process cashout' }
  }
}

/**
 * Traite un payout réussi (appelé depuis le webhook)
 */
export async function processPayoutSuccess(payoutId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const payout = await prisma.payout.findUnique({
      where: { stripePayoutId: payoutId },
      include: { transaction: true },
    })

    if (!payout) {
      return { success: false, error: 'Payout not found' }
    }

    if (payout.status === 'paid') {
      return { success: true } // Déjà traité
    }

    // Mettre à jour le statut
    await prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: payout.id },
        data: { status: 'paid' },
      })

      if (payout.transactionId) {
        await tx.transaction.update({
          where: { id: payout.transactionId },
          data: {
            status: 'SUCCESS',
            executedAt: new Date(),
          },
        })

        await tx.transactionLog.create({
          data: {
            transactionId: payout.transactionId,
            step: 'PAYOUT_COMPLETED',
            status: 'SUCCESS',
            data: { payoutId },
          },
        })
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Process payout success error:', error)
    return { success: false, error: 'Failed to process payout success' }
  }
}

/**
 * Traite un payout échoué (appelé depuis le webhook)
 * Rembourse le wallet
 */
export async function processPayoutFailed(payoutId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const payout = await prisma.payout.findUnique({
      where: { stripePayoutId: payoutId },
      include: { transaction: true, wallet: true },
    })

    if (!payout) {
      return { success: false, error: 'Payout not found' }
    }

    if (payout.status === 'failed') {
      return { success: true } // Déjà traité
    }

    // Récupérer la transaction pour obtenir la marge
    const transaction = payout.transactionId
      ? await prisma.transaction.findUnique({
          where: { id: payout.transactionId },
        })
      : null

    const platformFee = transaction?.platformFee ? Number(transaction.platformFee) : 0
    const totalRefund = Number(payout.amount) + platformFee

    // Obtenir le wallet système
    const platformWallet = await getPlatformWallet()

    // Rembourser le wallet atomiquement
    await prisma.$transaction(async (tx) => {
      // Rembourser le wallet (montant + marge)
      await tx.wallet.update({
        where: { id: payout.walletId },
        data: {
          balance: {
            increment: totalRefund,
          },
        },
      })

      // Débiter le wallet système (remboursement de la marge)
      if (platformFee > 0) {
        await tx.wallet.update({
          where: { id: platformWallet.id },
          data: {
            balance: {
              decrement: platformFee,
            },
          },
        })
      }

      // Mettre à jour le payout
      await tx.payout.update({
        where: { id: payout.id },
        data: { status: 'failed' },
      })

      if (payout.transactionId) {
        await tx.transaction.update({
          where: { id: payout.transactionId },
          data: {
            status: 'FAILED',
          },
        })

        await tx.transactionLog.create({
          data: {
            transactionId: payout.transactionId,
            step: 'PAYOUT_FAILED',
            status: 'FAILED',
            data: { payoutId, refunded: true, totalRefund, platformFeeRefunded: platformFee },
          },
        })
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Process payout failed error:', error)
    return { success: false, error: 'Failed to process payout failure' }
  }
}
