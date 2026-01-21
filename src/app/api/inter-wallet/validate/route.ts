import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifySignature, generateSignature, InterWalletValidateRequest } from '@/lib/interwallet'

// POST /api/inter-wallet/validate - Validate/confirm a pending inter-wallet transfer
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('X-Signature')

    if (!signature) {
      return NextResponse.json(
        { success: false, error: 'Missing signature' },
        { status: 400 }
      )
    }

    const payload: InterWalletValidateRequest = await request.json()

    // Verify signature
    const isValid = verifySignature(payload, signature)
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Log the request
    await prisma.interWalletLog.create({
      data: {
        direction: 'INCOMING',
        action: 'VALIDATE',
        externalSystemUrl: payload.sourceSystemUrl,
        rawPayload: payload as object,
        signature,
        signatureVerified: true,
      },
    })

    // Find the transaction by reference
    const transaction = await prisma.transaction.findUnique({
      where: { interWalletRef: payload.transactionRef },
    })

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      )
    }

    // Update transaction status based on validation result
    if (payload.status === 'ACCEPTED') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'SUCCESS',
          executedAt: new Date(),
        },
      })

      // Log the step
      await prisma.transactionLog.create({
        data: {
          transactionId: transaction.id,
          step: 'EXTERNAL_VALIDATION',
          status: 'SUCCESS',
          data: { validatedBy: payload.sourceSystemUrl },
        },
      })

      return NextResponse.json({
        success: true,
        transactionRef: payload.transactionRef,
        status: 'SUCCESS',
        message: 'Transaction validated successfully',
      })
    } else {
      // Rejected - refund the source wallet
      if (transaction.sourceWalletId) {
        await prisma.wallet.update({
          where: { id: transaction.sourceWalletId },
          data: { balance: { increment: Number(transaction.amount) } },
        })
      }

      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          metadata: {
            ...(transaction.metadata as object || {}),
            rejectionReason: payload.reason,
          },
        },
      })

      // Log the step
      await prisma.transactionLog.create({
        data: {
          transactionId: transaction.id,
          step: 'EXTERNAL_VALIDATION',
          status: 'FAILED',
          error: payload.reason,
          data: { rejectedBy: payload.sourceSystemUrl },
        },
      })

      return NextResponse.json({
        success: true,
        transactionRef: payload.transactionRef,
        status: 'REJECTED',
        message: 'Transaction rejected, funds refunded',
      })
    }
  } catch (error) {
    console.error('Inter-wallet validate error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
