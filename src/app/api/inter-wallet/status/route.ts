import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifySignature, generateSignature, InterWalletStatusRequest } from '@/lib/interwallet'

// POST /api/inter-wallet/status - Check status of an inter-wallet transaction
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('X-Signature')

    if (!signature) {
      return NextResponse.json(
        { success: false, error: 'Missing signature' },
        { status: 400 }
      )
    }

    const payload: InterWalletStatusRequest = await request.json()

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
        action: 'STATUS_CHECK',
        externalSystemUrl: payload.sourceSystemUrl,
        rawPayload: payload as object,
        signature,
        signatureVerified: true,
      },
    })

    // Find the transaction by reference
    const transaction = await prisma.transaction.findUnique({
      where: { interWalletRef: payload.transactionRef },
      include: {
        logs: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      )
    }

    const responsePayload = {
      transactionRef: payload.transactionRef,
      status: transaction.status,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      createdAt: transaction.createdAt.toISOString(),
      executedAt: transaction.executedAt?.toISOString() || null,
      steps: transaction.logs.map((log) => ({
        step: log.step,
        status: log.status,
        timestamp: log.createdAt.toISOString(),
      })),
    }

    return NextResponse.json({
      success: true,
      ...responsePayload,
      signature: generateSignature(responsePayload),
    })
  } catch (error) {
    console.error('Inter-wallet status error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/inter-wallet/status - Public endpoint to get system info
export async function GET() {
  const { getSystemInfo } = await import('@/lib/interwallet')
  return NextResponse.json(getSystemInfo())
}
