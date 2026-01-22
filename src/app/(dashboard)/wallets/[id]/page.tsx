'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Banknote } from 'lucide-react'

interface Wallet {
  id: string
  name: string
  balance: number
  currency: string
  createdAt: string
}

interface Transaction {
  id: string
  type: string
  status: string
  amount: number
  platformFee?: number | null
  currency: string
  description: string | null
  createdAt: string
  sourceWallet: { id: string; name: string } | null
  destinationWallet: { id: string; name: string } | null
}

export default function WalletDetailPage() {
  const router = useRouter()
  const params = useParams()
  const walletId = params.id as string

  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/wallets')
      const data = await res.json()
      if (data.success) {
        const foundWallet = data.wallets.find((w: Wallet) => w.id === walletId)
        if (foundWallet) {
          setWallet(foundWallet)
        } else {
          router.push('/wallets')
        }
      }
    } catch (error) {
      console.error('Failed to fetch wallet:', error)
      router.push('/wallets')
    } finally {
      setLoading(false)
    }
  }, [walletId, router])

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch(`/api/transactions?walletId=${walletId}&limit=10`)
      const data = await res.json()
      if (data.success) {
        setTransactions(data.transactions)
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
    }
  }, [walletId])

  useEffect(() => {
    if (walletId) {
      fetchWallet()
      fetchTransactions()
    }
  }, [walletId, fetchWallet, fetchTransactions])

  const formatCurrency = (amount: number, currency = 'EUR') => {
    return amount.toLocaleString('fr-FR', { style: 'currency', currency })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-100 text-green-700'
      case 'PENDING':
      case 'PROCESSING':
        return 'bg-yellow-100 text-yellow-700'
      case 'FAILED':
      case 'BLOCKED':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return 'Dépôt'
      case 'WITHDRAWAL':
        return 'Retrait'
      case 'TRANSFER':
        return 'Transfert'
      case 'INTER_WALLET':
        return 'Inter-Wallet'
      default:
        return type
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-12 bg-gray-200 rounded-lg w-48"></div>
        <div className="bg-white rounded-xl p-6 space-y-4">
          <div className="h-40 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    )
  }

  if (!wallet) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/wallets"
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{wallet.name}</h1>
          <p className="text-gray-500">Détails du wallet</p>
        </div>
      </div>

      {/* Wallet Card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-white/80 text-sm mb-1">{wallet.name}</p>
            <p className="text-4xl font-bold">
              {formatCurrency(wallet.balance, wallet.currency)}
            </p>
          </div>
          <span className="text-3xl">💰</span>
        </div>
        <div className="flex items-center justify-between text-white/60 text-xs">
          <span>ID: {wallet.id.slice(0, 8)}...</span>
          <span>{wallet.currency}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => router.push(`/deposit?walletId=${walletId}`)}
          className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition"
        >
          <CreditCard className="w-5 h-5" />
          Créditer ce wallet
        </button>
        <button
          onClick={() => router.push(`/cashout?walletId=${walletId}`)}
          className="flex items-center justify-center gap-2 px-6 py-4 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
        >
          <Banknote className="w-5 h-5" />
          Retirer des fonds
        </button>
      </div>

      {/* Transactions récentes */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Transactions récentes</h2>
          <Link
            href={`/transactions?walletId=${walletId}`}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Voir tout
          </Link>
        </div>
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">Aucune transaction</p>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">
                      {getTypeLabel(tx.type)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(
                        tx.status
                      )}`}
                    >
                      {tx.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {tx.description || 'Sans description'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(tx.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      tx.type === 'DEPOSIT' || tx.destinationWallet?.id === walletId
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {tx.type === 'DEPOSIT' || tx.destinationWallet?.id === walletId ? '+' : '-'}
                    {formatCurrency(tx.amount, tx.currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
