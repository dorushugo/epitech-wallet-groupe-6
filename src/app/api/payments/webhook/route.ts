import { NextRequest, NextResponse } from 'next/server'
import { stripe, STRIPE_CURRENCY } from '@/lib/stripe'
import { processDeposit, processPayoutSuccess, processPayoutFailed } from '@/lib/payments'
import Stripe from 'stripe'

// Désactiver le body parsing pour cette route (Stripe a besoin du raw body)
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    )
  }

  let event: Stripe.Event

  try {
    // Valider la signature Stripe (sécurité critique)
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const error = err as Error
    console.error('Webhook signature verification failed:', error.message)
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${error.message}` },
      { status: 400 }
    )
  }

  // Gérer les événements
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        console.log('Checkout session completed:', session.id)

        // Récupérer le PaymentIntent depuis la session
        if (session.payment_intent && typeof session.payment_intent === 'string') {
          const paymentIntentId = session.payment_intent

          // Vérifier si le PaymentIntent existe déjà en DB, sinon le créer
          const { prisma } = await import('@/lib/prisma')
          const existingPaymentIntent = await prisma.paymentIntent.findUnique({
            where: { stripePaymentId: paymentIntentId },
          })

          if (!existingPaymentIntent && session.metadata) {
            // Créer le PaymentIntent en DB depuis les métadonnées de la session
            await prisma.paymentIntent.create({
              data: {
                userId: session.metadata.userId,
                walletId: session.metadata.walletId,
                stripePaymentId: paymentIntentId,
                amount: parseFloat(session.metadata.amount || '0'),
                currency: STRIPE_CURRENCY,
                status: 'pending',
                metadata: {
                  sessionId: session.id,
                },
              },
            })
          }

          // Traiter le dépôt
          const result = await processDeposit(paymentIntentId)

          if (!result.success) {
            console.error('Failed to process deposit:', result.error)
            return NextResponse.json({
              received: true,
              processed: false,
              error: result.error,
            })
          }

          return NextResponse.json({
            received: true,
            processed: true,
            transactionId: result.transactionId,
          })
        }

        return NextResponse.json({ received: true })
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('PaymentIntent succeeded:', paymentIntent.id)

        const result = await processDeposit(paymentIntent.id)

        if (!result.success) {
          console.error('Failed to process deposit:', result.error)
          // Retourner 200 pour éviter que Stripe ne réessaie indéfiniment
          // On log l'erreur pour investigation manuelle
          return NextResponse.json({
            received: true,
            processed: false,
            error: result.error,
          })
        }

        return NextResponse.json({
          received: true,
          processed: true,
          transactionId: result.transactionId,
        })
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('PaymentIntent failed:', paymentIntent.id)

        // Marquer le PaymentIntent comme failed en DB
        const { prisma } = await import('@/lib/prisma')
        await prisma.paymentIntent.updateMany({
          where: { stripePaymentId: paymentIntent.id },
          data: { status: 'failed' },
        })

        return NextResponse.json({ received: true })
      }

      case 'payout.paid': {
        const payout = event.data.object as Stripe.Payout
        console.log('Payout paid:', payout.id)

        const result = await processPayoutSuccess(payout.id)

        if (!result.success) {
          console.error('Failed to process payout success:', result.error)
          return NextResponse.json({
            received: true,
            processed: false,
            error: result.error,
          })
        }

        return NextResponse.json({ received: true, processed: true })
      }

      case 'payout.failed': {
        const payout = event.data.object as Stripe.Payout
        console.log('Payout failed:', payout.id)

        const result = await processPayoutFailed(payout.id)

        if (!result.success) {
          console.error('Failed to process payout failure:', result.error)
          return NextResponse.json({
            received: true,
            processed: false,
            error: result.error,
          })
        }

        return NextResponse.json({ received: true, processed: true })
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
        return NextResponse.json({ received: true, unhandled: true })
    }
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
