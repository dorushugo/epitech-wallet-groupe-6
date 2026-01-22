import { NextRequest, NextResponse } from 'next/server'
import { convertCurrency, getExchangeRate } from '@/lib/currency'
import { z } from 'zod'

const convertSchema = z.object({
  amount: z.string().or(z.number()),
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

    const validation = convertSchema.safeParse({
      amount: amount ? parseFloat(amount) : undefined,
      from,
      to,
    })

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Paramètres invalides' },
        { status: 400 }
      )
    }

    const { amount: amountNum, from: fromCurrency, to: toCurrency } = validation.data

    if (amountNum <= 0) {
      return NextResponse.json(
        { success: false, error: 'Le montant doit être positif' },
        { status: 400 }
      )
    }

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

    // Convertir le montant
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
