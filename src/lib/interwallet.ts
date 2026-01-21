import crypto from 'crypto'
import { prisma } from './prisma'

const HMAC_SECRET = process.env.INTERWALLET_HMAC_SECRET || 'default-hmac-secret'
const SYSTEM_URL = process.env.INTERWALLET_SYSTEM_URL || 'http://localhost:3000'
const SYSTEM_NAME = process.env.INTERWALLET_SYSTEM_NAME || 'Groupe6-Wallet'

export interface InterWalletTransferRequest {
  transactionRef: string
  sourceSystemUrl: string
  sourceSystemName: string
  sourceWalletId: string
  destinationWalletId: string
  amount: number
  currency: string
  description?: string
  timestamp: string
}

export interface InterWalletValidateRequest {
  transactionRef: string
  sourceSystemUrl: string
  status: 'ACCEPTED' | 'REJECTED'
  reason?: string
  timestamp: string
}

export interface InterWalletStatusRequest {
  transactionRef: string
  sourceSystemUrl: string
  timestamp: string
}

// Generate HMAC-SHA256 signature for payload
export function generateSignature(payload: object): string {
  const payloadString = JSON.stringify(payload)
  return crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payloadString)
    .digest('hex')
}

// Verify HMAC-SHA256 signature
export function verifySignature(payload: object, signature: string): boolean {
  const expectedSignature = generateSignature(payload)
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

// Generate unique transaction reference
export function generateTransactionRef(): string {
  const timestamp = Date.now().toString(36)
  const random = crypto.randomBytes(8).toString('hex')
  return `${SYSTEM_NAME}-${timestamp}-${random}`
}

// Send inter-wallet transfer request to external system
export async function sendInterWalletTransfer(
  destinationSystemUrl: string,
  destinationWalletId: string,
  amount: number,
  currency: string,
  sourceWalletId: string,
  description?: string
): Promise<{ success: boolean; transactionRef?: string; error?: string }> {
  const transactionRef = generateTransactionRef()
  
  const payload: InterWalletTransferRequest = {
    transactionRef,
    sourceSystemUrl: SYSTEM_URL,
    sourceSystemName: SYSTEM_NAME,
    sourceWalletId,
    destinationWalletId,
    amount,
    currency,
    description,
    timestamp: new Date().toISOString(),
  }

  const signature = generateSignature(payload)

  try {
    const response = await fetch(`${destinationSystemUrl}/api/inter-wallet/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Source-System': SYSTEM_URL,
      },
      body: JSON.stringify(payload),
    })

    const responseBody = await response.json()

    // Log the request
    await prisma.interWalletLog.create({
      data: {
        direction: 'OUTGOING',
        action: 'TRANSFER_REQUEST',
        externalSystemUrl: destinationSystemUrl,
        externalWalletId: destinationWalletId,
        rawPayload: payload as object,
        signature,
        responseStatus: response.status,
        responseBody: responseBody as object,
      },
    })

    if (response.ok && responseBody.success) {
      return { success: true, transactionRef }
    }

    return { success: false, error: responseBody.error || 'Transfer failed' }
  } catch (error) {
    console.error('Inter-wallet transfer error:', error)
    return { success: false, error: 'Network error' }
  }
}

// Check status of inter-wallet transaction
export async function checkInterWalletStatus(
  externalSystemUrl: string,
  transactionRef: string
): Promise<{ status: string; details?: object }> {
  const payload: InterWalletStatusRequest = {
    transactionRef,
    sourceSystemUrl: SYSTEM_URL,
    timestamp: new Date().toISOString(),
  }

  const signature = generateSignature(payload)

  try {
    const response = await fetch(`${externalSystemUrl}/api/inter-wallet/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Source-System': SYSTEM_URL,
      },
      body: JSON.stringify(payload),
    })

    const responseBody = await response.json()

    // Log the request
    await prisma.interWalletLog.create({
      data: {
        direction: 'OUTGOING',
        action: 'STATUS_CHECK',
        externalSystemUrl,
        rawPayload: payload as object,
        signature,
        responseStatus: response.status,
        responseBody: responseBody as object,
      },
    })

    return {
      status: responseBody.status || 'UNKNOWN',
      details: responseBody,
    }
  } catch (error) {
    console.error('Inter-wallet status check error:', error)
    return { status: 'ERROR' }
  }
}

// Validate incoming inter-wallet transfer
export async function validateIncomingTransfer(
  payload: InterWalletTransferRequest,
  signature: string
): Promise<{ valid: boolean; error?: string }> {
  // Verify signature
  const isValidSignature = verifySignature(payload, signature)
  
  if (!isValidSignature) {
    return { valid: false, error: 'Invalid signature' }
  }

  // Check if destination wallet exists
  const wallet = await prisma.wallet.findUnique({
    where: { id: payload.destinationWalletId },
  })

  if (!wallet) {
    return { valid: false, error: 'Destination wallet not found' }
  }

  if (!wallet.isActive) {
    return { valid: false, error: 'Destination wallet is inactive' }
  }

  // Check if transaction ref is unique
  const existingTx = await prisma.transaction.findUnique({
    where: { interWalletRef: payload.transactionRef },
  })

  if (existingTx) {
    return { valid: false, error: 'Transaction already processed' }
  }

  return { valid: true }
}

// Process incoming inter-wallet transfer
export async function processIncomingTransfer(
  payload: InterWalletTransferRequest
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  try {
    // Find destination wallet
    const wallet = await prisma.wallet.findUnique({
      where: { id: payload.destinationWalletId },
      include: { user: true },
    })

    if (!wallet) {
      return { success: false, error: 'Wallet not found' }
    }

    // Create transaction and credit wallet atomically
    const result = await prisma.$transaction(async (tx) => {
      // Create incoming transaction
      const transaction = await tx.transaction.create({
        data: {
          userId: wallet.userId,
          destinationWalletId: wallet.id,
          amount: payload.amount,
          currency: payload.currency,
          type: 'INTER_WALLET',
          status: 'SUCCESS',
          isInterWallet: true,
          externalWalletId: payload.sourceWalletId,
          externalSystemUrl: payload.sourceSystemUrl,
          interWalletRef: payload.transactionRef,
          description: payload.description || `Reçu de ${payload.sourceSystemName}`,
          executedAt: new Date(),
        },
      })

      // Credit wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            increment: payload.amount,
          },
        },
      })

      return transaction
    })

    return { success: true, transactionId: result.id }
  } catch (error) {
    console.error('Process incoming transfer error:', error)
    return { success: false, error: 'Processing failed' }
  }
}

// Get system info for external systems
export function getSystemInfo() {
  return {
    systemUrl: SYSTEM_URL,
    systemName: SYSTEM_NAME,
    protocolVersion: '1.0',
    supportedCurrencies: ['EUR'],
    endpoints: {
      transfer: '/api/inter-wallet/transfer',
      validate: '/api/inter-wallet/validate',
      status: '/api/inter-wallet/status',
    },
  }
}
