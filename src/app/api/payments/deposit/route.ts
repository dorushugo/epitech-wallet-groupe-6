import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { stripe, STRIPE_CURRENCY } from '@/lib/stripe'
import { calculatePlatformFee } from '@/lib/platform-fee'
import { convertCurrency } from '@/lib/currency'
import { z } from 'zod'

const depositSchema = z.object({
  walletId: z.string().min(1, 'Wallet requis'),
  amount: z.number().positive('Montant doit être positif').min(5, 'Minimum 5€').max(1000, 'Maximum 1000€'),
  currency: z.string().length(3).optional(), // Devise du wallet (montant saisi dans cette devise)
})

// POST /api/payments/deposit - Créer un PaymentIntent Stripe
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
    const validation = depositSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0].message },
        { status: 400 }
      )
    }

    const { walletId, amount, currency } = validation.data

    // Vérifier la propriété du wallet
    const wallet = await prisma.wallet.findFirst({
      where: {
        id: walletId,
        userId: user.id,
        isActive: true,
      },
    })

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'Wallet non trouvé' },
        { status: 404 }
      )
    }

    // Vérifier que la devise correspond
    const walletCurrency = currency || wallet.currency
    if (walletCurrency !== wallet.currency) {
      return NextResponse.json(
        { success: false, error: 'La devise ne correspond pas au wallet' },
        { status: 400 }
      )
    }

    // Le montant est dans la devise du wallet
    // On doit le convertir en EUR pour Stripe si nécessaire
    let amountInEUR = amount
    let exchangeRate = 1
    if (walletCurrency !== STRIPE_CURRENCY) {
      try {
        amountInEUR = await convertCurrency(amount, walletCurrency, STRIPE_CURRENCY)
        exchangeRate = amountInEUR / amount
      } catch (error) {
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : 'Erreur de conversion de devise' },
          { status: 400 }
        )
      }
    }

    // Calculer les frais Stripe (1.5% + 0.25€ pour cartes EEE)
    // Les frais sont calculés sur le montant dans la devise du wallet
    // Le 0.25€ fixe doit être converti dans la devise du wallet
    const fixedFeeInWalletCurrency = walletCurrency === 'EUR' 
      ? 0.25 
      : await convertCurrency(0.25, 'EUR', walletCurrency)
    const stripeFeesInWalletCurrency = amount * 0.015 + fixedFeeInWalletCurrency
    // Calculer le frais de plateforme (1%) - dans la devise du wallet
    const platformFeeInWalletCurrency = calculatePlatformFee(amount)
    // Montant total à payer par l'utilisateur - dans la devise du wallet
    const totalAmountInWalletCurrency = amount + stripeFeesInWalletCurrency + platformFeeInWalletCurrency

    // Convertir le total en EUR pour Stripe
    let totalAmountInEUR = totalAmountInWalletCurrency
    if (walletCurrency !== STRIPE_CURRENCY) {
      totalAmountInEUR = await convertCurrency(totalAmountInWalletCurrency, walletCurrency, STRIPE_CURRENCY)
    }

    // Convertir le montant total en centimes pour Stripe
    const totalAmountInCents = Math.round(totalAmountInEUR * 100)

    // Déterminer l'URL de base depuis les headers de la requête
    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = `${protocol}://${host}`
    const successUrl = `${baseUrl}/deposit/checkout?payment_intent={CHECKOUT_SESSION_ID}&redirect_status=succeeded`
    const cancelUrl = `${baseUrl}/deposit/checkout?redirect_status=canceled`

    // Créer une Checkout Session Stripe avec le montant total (incluant les frais)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: user.email, // Pré-remplir l'email dans Stripe Checkout
      line_items: [
        {
          price_data: {
            currency: STRIPE_CURRENCY.toLowerCase(),
            product_data: {
              name: `Crédit wallet: ${wallet.name}`,
              description: `Ajout de ${amount.toFixed(2)} ${walletCurrency} sur votre wallet`,
            },
            unit_amount: totalAmountInCents, // Montant total incluant les frais
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: user.id,
        walletId: wallet.id,
        walletName: wallet.name,
        amount: amount.toString(), // Montant à créditer sur le wallet (dans la devise du wallet)
        currency: walletCurrency, // Devise du wallet
        amountInEUR: amountInEUR.toFixed(2), // Montant en EUR pour Stripe
        exchangeRate: exchangeRate.toFixed(4),
        stripeFees: stripeFeesInWalletCurrency.toFixed(2),
        platformFee: platformFeeInWalletCurrency.toFixed(2),
        totalAmount: totalAmountInWalletCurrency.toFixed(2),
        totalAmountInEUR: totalAmountInEUR.toFixed(2),
      },
    })

    // Créer le PaymentIntent en DB (on utilisera le payment_intent de la session)
    // Note: Le PaymentIntent sera créé automatiquement par Stripe lors du checkout
    // On l'enregistrera via le webhook quand le paiement sera confirmé

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    })
  } catch (error) {
    console.error('Create deposit error:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la création du paiement' },
      { status: 500 }
    )
  }
}
