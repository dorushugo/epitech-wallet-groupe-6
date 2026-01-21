import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  verifySignature,
  generateSignature,
  validateIncomingTransfer,
  processIncomingTransfer,
  InterWalletTransferRequest,
} from '@/lib/interwallet'

// POST /api/inter-wallet/transfer - Receive incoming inter-wallet transfer
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('X-Signature')
    const sourceSystem = request.headers.get('X-Source-System')

    if (!signature) {
      return NextResponse.json(
        { success: false, error: 'Missing signature' },
        { status: 400 }
      )
    }

    const payload: InterWalletTransferRequest = await request.json()

    // Log incoming request
    await prisma.interWalletLog.create({
      data: {
        direction: 'INCOMING',
        action: 'TRANSFER_REQUEST',
        externalSystemUrl: payload.sourceSystemUrl,
        externalWalletId: payload.sourceWalletId,
        rawPayload: payload as object,
        signature,
        signatureVerified: false,
      },
    })

    // Validate the transfer request
    const validation = await validateIncomingTransfer(payload, signature)

    if (!validation.valid) {
      // Update log with validation result
      await prisma.interWalletLog.updateMany({
        where: {
          rawPayload: { equals: payload as object },
          direction: 'INCOMING',
        },
        data: {
          signatureVerified: false,
          responseStatus: 400,
          responseBody: { success: false, error: validation.error } as object,
        },
      })

      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }

    // Process the transfer
    const result = await processIncomingTransfer(payload)

    // Update log with result
    await prisma.interWalletLog.updateMany({
      where: {
        rawPayload: { equals: payload as object },
        direction: 'INCOMING',
      },
      data: {
        signatureVerified: true,
        transactionId: result.transactionId,
        responseStatus: result.success ? 200 : 400,
        responseBody: result as object,
      },
    })

    if (result.success) {
      // Send acknowledgment
      const ackPayload = {
        transactionRef: payload.transactionRef,
        status: 'ACCEPTED',
        transactionId: result.transactionId,
        timestamp: new Date().toISOString(),
      }

      return NextResponse.json({
        success: true,
        ...ackPayload,
        signature: generateSignature(ackPayload),
      })
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    )
  } catch (error) {
    console.error('Inter-wallet transfer error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
