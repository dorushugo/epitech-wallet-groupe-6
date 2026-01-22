import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { z } from 'zod'

// GET /api/wallets - Get all wallets for current user
export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const wallets = await prisma.wallet.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      success: true,
      wallets: wallets.map((w) => ({
        id: w.id,
        name: w.name,
        balance: Number(w.balance),
        currency: w.currency,
        createdAt: w.createdAt,
      })),
    })
  } catch (error) {
    console.error('Get wallets error:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

const createWalletSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(50),
  currency: z.enum(['EUR', 'USD', 'GBP']).default('EUR'),
})

// POST /api/wallets - Create a new wallet
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
    const validation = createWalletSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0].message },
        { status: 400 }
      )
    }

    const { name, currency } = validation.data

    // Check wallet limit (max 5 wallets per user)
    const walletCount = await prisma.wallet.count({
      where: { userId: user.id, isActive: true },
    })

    if (walletCount >= 5) {
      return NextResponse.json(
        { success: false, error: 'Limite de 5 wallets atteinte' },
        { status: 400 }
      )
    }

    const wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        name,
        currency,
        balance: 0,
      },
    })

    return NextResponse.json({
      success: true,
      wallet: {
        id: wallet.id,
        name: wallet.name,
        balance: Number(wallet.balance),
        currency: wallet.currency,
        createdAt: wallet.createdAt,
      },
    })
  } catch (error) {
    console.error('Create wallet error:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
