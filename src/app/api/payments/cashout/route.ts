import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { processCashout } from '@/lib/payments'
import { z } from 'zod'

const cashoutSchema = z.object({
  walletId: z.string().min(1, 'Wallet requis'),
  amount: z.number().positive('Montant doit être positif').min(10, 'Minimum 10€'),
  method: z.enum(['bank_transfer'], {
    message: 'Méthode doit être bank_transfer',
  }),
  destination: z.string().min(1, 'Destination requise'),
  description: z.string().max(255).optional(),
})

// POST /api/payments/cashout - Initier un retrait
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
    const validation = cashoutSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0].message },
        { status: 400 }
      )
    }

    const { walletId, amount, method, destination, description } = validation.data

    // Valider l'IBAN
    // Validation basique de l'IBAN (format: 2 lettres + jusqu'à 34 caractères alphanumériques)
    const ibanRegex = /^[A-Z]{2}[0-9A-Z]{4,34}$/i
    if (!ibanRegex.test(destination.replace(/\s/g, ''))) {
      return NextResponse.json(
        { success: false, error: 'IBAN invalide' },
        { status: 400 }
      )
    }

    // Traiter le cashout
    const result = await processCashout({
      userId: user.id,
      walletId,
      amount,
      method,
      destination: destination.replace(/\s/g, ''), // Nettoyer l'IBAN
      description,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Erreur lors du retrait' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      payoutId: result.payoutId,
      transactionId: result.transactionId,
      message: 'Retrait initié avec succès',
    })
  } catch (error) {
    console.error('Cashout error:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
