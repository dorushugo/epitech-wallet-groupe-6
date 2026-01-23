import { NextRequest, NextResponse } from 'next/server'
import { convertCurrency, getExchangeRate } from '@/lib/currency'
import { z } from 'zod'

const convertSchema = z.object({
  amount: z.number().positive('Le montant doit être un nombre positif'),
  from: z.string().length(3),
  to: z.string().length(3),
})

// GET /api/currency/convert - Convertir un montant entre deux devises
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const amount = searchParams.get('amount')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!amount || !from || !to) {
      return NextResponse.json(
        { success: false, error: 'Paramètres manquants (amount, from, to requis)' },
        { status: 400 }
      )
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { success: false, error: 'Le montant doit être un nombre positif' },
        { status: 400 }
      )
    }

    const validation = convertSchema.safeParse({
      amount: amountNum,
      from,
      to,
    })

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0].message || 'Paramètres invalides' },
        { status: 400 }
      )
    }

    const { from: fromCurrency, to: toCurrency } = validation.data

    // Si les devises sont identiques, pas de conversion
    if (fromCurrency === toCurrency) {
      return NextResponse.json({
        success: true,
        convertedAmount: amountNum,
        exchangeRate: 1,
        from: fromCurrency,
        to: toCurrency,
      })
    }

    // Convertir le montant (amountNum est maintenant garanti d'être un number)
    const convertedAmount = await convertCurrency(amountNum, fromCurrency, toCurrency)
    const exchangeRate = await getExchangeRate(fromCurrency, toCurrency)

    return NextResponse.json({
      success: true,
      convertedAmount,
      exchangeRate,
      from: fromCurrency,
      to: toCurrency,
    })
  } catch (error) {
    console.error('Currency conversion API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur de conversion',
      },
      { status: 500 }
    )
  }
}
