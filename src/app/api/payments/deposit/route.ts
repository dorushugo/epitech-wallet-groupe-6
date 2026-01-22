import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { stripe, STRIPE_CURRENCY } from '@/lib/stripe'
import { calculatePlatformFee } from '@/lib/platform-fee'
import { z } from 'zod'

const depositSchema = z.object({
  walletId: z.string().min(1, 'Wallet requis'),
  amount: z.number().positive('Montant doit être positif').min(5, 'Minimum 5€').max(1000, 'Maximum 1000€'),
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

    const { walletId, amount } = validation.data

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

    // Calculer les frais Stripe (1.5% + 0.25€ pour cartes EEE)
    const stripeFees = amount * 0.015 + 0.25
    // Calculer le frais de plateforme (1%)
    const platformFee = calculatePlatformFee(amount)
    // Montant total à payer par l'utilisateur
    const totalAmount = amount + stripeFees + platformFee

    // Convertir le montant total en centimes pour Stripe (EUR)
    const totalAmountInCents = Math.round(totalAmount * 100)

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
              description: `Ajout de ${amount.toFixed(2)}€ sur votre wallet`,
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
        amount: amount.toString(), // Montant à créditer sur le wallet (montant complet)
        stripeFees: stripeFees.toFixed(2),
        platformFee: platformFee.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
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
