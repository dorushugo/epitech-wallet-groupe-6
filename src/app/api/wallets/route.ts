import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { z } from 'zod'

// GET /api/wallets - Get all wallets for current user or for a user by email
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
    const email = searchParams.get('email')

    // Si un email est fourni, récupérer les wallets de cet utilisateur (pour les transferts)
    if (email) {
      const targetUser = await prisma.user.findUnique({
        where: { email },
        include: {
          wallets: {
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      })

      if (!targetUser) {
        return NextResponse.json(
          { success: false, error: 'Utilisateur non trouvé' },
          { status: 404 }
        )
      }

      // Retourner les wallets sans le solde (pour la sécurité)
      return NextResponse.json({
        success: true,
        wallets: targetUser.wallets.map((w) => ({
          id: w.id,
          name: w.name,
          currency: w.currency,
          createdAt: w.createdAt,
        })),
      })
    }

    // Sinon, retourner les wallets de l'utilisateur connecté
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
