import { prisma } from './prisma'
import { Decimal } from '@prisma/client/runtime/library'

const PLATFORM_FEE_RATE = 0.01 // 1%
const PLATFORM_WALLET_EMAIL = 'platform@wallet.system'

/**
 * Calcule le frais de plateforme (1% du montant)
 */
export function calculatePlatformFee(amount: number | Decimal): number {
  const amountNum = typeof amount === 'number' ? amount : Number(amount)
  return Math.round(amountNum * PLATFORM_FEE_RATE * 100) / 100 // Arrondi à 2 décimales
}

/**
 * Obtient ou crée le wallet système pour accumuler les frais de plateforme
 */
export async function getPlatformWallet(): Promise<{ id: string }> {
  // Chercher un utilisateur système (ou le créer s'il n'existe pas)
  let platformUser = await prisma.user.findUnique({
    where: { email: PLATFORM_WALLET_EMAIL },
    include: { wallets: { where: { isActive: true }, take: 1 } },
  })

  if (!platformUser) {
    // Créer l'utilisateur système et son wallet
    platformUser = await prisma.user.create({
      data: {
        email: PLATFORM_WALLET_EMAIL,
        password: 'system-wallet-secure-password-hash', // Ne sera jamais utilisé pour login
        wallets: {
          create: {
            name: 'Wallet Plateforme',
            balance: 0,
            currency: 'EUR',
            isActive: true,
          },
        },
      },
      include: { wallets: true },
    })
  }

  // S'assurer qu'il y a un wallet actif
  if (!platformUser.wallets || platformUser.wallets.length === 0) {
    const wallet = await prisma.wallet.create({
      data: {
        userId: platformUser.id,
        name: 'Wallet Plateforme',
        balance: 0,
        currency: 'EUR',
        isActive: true,
      },
    })
    return { id: wallet.id }
  }

  return { id: platformUser.wallets[0].id }
}

/**
 * Applique la marge de plateforme à une transaction
 * Retourne le montant net (après déduction de la marge) et la marge
 */
export function applyPlatformFee(amount: number | Decimal): {
  netAmount: number
  fee: number
} {
  const amountNum = typeof amount === 'number' ? amount : Number(amount)
  const fee = calculatePlatformFee(amountNum)
  const netAmount = amountNum - fee
  return { netAmount, fee }
}
