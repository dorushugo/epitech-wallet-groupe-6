import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const user = await getSession()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      )
    }

    // Get user with wallets
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        wallets: {
          where: { isActive: true },
        },
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: fullUser?.id,
        email: fullUser?.email,
        firstName: fullUser?.firstName,
        lastName: fullUser?.lastName,
        createdAt: fullUser?.createdAt,
      },
      wallets: fullUser?.wallets.map((w) => ({
        id: w.id,
        name: w.name,
        balance: Number(w.balance),
        currency: w.currency,
      })),
    })
  } catch (error) {
    console.error('Me error:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
