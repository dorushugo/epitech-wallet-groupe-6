'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Wallet {
  id: string
  name: string
  balance: number
  currency: string
}

interface Transaction {
  id: string
  type: string
  status: string
  amount: number
  platformFee?: number | null
  currency: string
  description?: string
  fraudScore?: number
  isInterWallet: boolean
  createdAt: string
}

export default function DashboardPage() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [walletsRes, txRes] = await Promise.all([
        fetch('/api/wallets'),
        fetch('/api/transactions?limit=5'),
      ])

      const walletsData = await walletsRes.json()
      const txData = await txRes.json()

      if (walletsData.success) setWallets(walletsData.wallets)
      if (txData.success) setTransactions(txData.transactions)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0)

  const formatCurrency = (amount: number, currency = 'EUR') => {
    return amount.toLocaleString('fr-FR', { style: 'currency', currency })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS': return 'bg-green-100 text-green-700'
      case 'PENDING': case 'PROCESSING': return 'bg-yellow-100 text-yellow-700'
      case 'FAILED': return 'bg-red-100 text-red-700'
      case 'BLOCKED': return 'bg-red-100 text-red-700'
      case 'REVIEW': return 'bg-orange-100 text-orange-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-32 bg-gray-200 rounded-xl"></div>
      <div className="h-64 bg-gray-200 rounded-xl"></div>
    </div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-2">
          <Link
            href="/transactions?action=send"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Envoyer
          </Link>
          <Link
            href="/inter-wallet"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
          >
            Inter-Wallet
          </Link>
        </div>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
        <p className="text-blue-100 text-sm">Solde total</p>
        <p className="text-4xl font-bold mt-1">{formatCurrency(totalBalance)}</p>
        <div className="mt-4 flex gap-3 flex-wrap">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="bg-white/10 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-100">{wallet.name}</p>
              <p className="font-semibold">{formatCurrency(wallet.balance, wallet.currency)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/transactions?action=send" className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition text-center">
          <span className="text-2xl">💸</span>
          <p className="text-sm font-medium text-gray-700 mt-2">Envoyer</p>
        </Link>
        <Link href="/wallets" className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition text-center">
          <span className="text-2xl">💰</span>
          <p className="text-sm font-medium text-gray-700 mt-2">Wallets</p>
        </Link>
        <Link href="/inter-wallet" className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition text-center">
          <span className="text-2xl">🌐</span>
          <p className="text-sm font-medium text-gray-700 mt-2">Inter-Wallet</p>
        </Link>
        <Link href="/transactions" className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition text-center">
          <span className="text-2xl">📋</span>
          <p className="text-sm font-medium text-gray-700 mt-2">Historique</p>
        </Link>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Transactions récentes</h2>
          <Link href="/transactions" className="text-sm text-blue-600 hover:underline">
            Voir tout
          </Link>
        </div>

        {transactions.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {transactions.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    tx.type === 'TRANSFER' ? 'bg-blue-100' : 
                    tx.type === 'INTER_WALLET' ? 'bg-purple-100' : 'bg-gray-100'
                  }`}>
                    <span>{tx.isInterWallet ? '🌐' : '💸'}</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {tx.description || tx.type}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(tx.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    {formatCurrency(tx.amount, tx.currency)}
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(tx.status)}`}>
                      {tx.status}
                    </span>
                    {tx.fraudScore !== null && tx.fraudScore !== undefined && tx.fraudScore > 0 && (
                      <span className="text-xs text-orange-600" title="Score de fraude">
                        ⚠️ {tx.fraudScore}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            Aucune transaction
          </div>
        )}
      </div>
    </div>
  )
}
