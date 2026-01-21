'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

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
  currency: string
  description?: string
  fraudScore?: number
  fraudReason?: string
  isInterWallet: boolean
  externalSystemUrl?: string
  sourceWallet?: { id: string; name: string }
  destinationWallet?: { id: string; name: string }
  createdAt: string
  executedAt?: string
}

export default function TransactionsPage() {
  const searchParams = useSearchParams()
  const action = searchParams.get('action')

  const [wallets, setWallets] = useState<Wallet[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [showSendModal, setShowSendModal] = useState(action === 'send')
  const [sendForm, setSendForm] = useState({
    sourceWalletId: '',
    destinationEmail: '',
    amount: '',
    description: '',
  })
  const [sendLoading, setSendLoading] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendSuccess, setSendSuccess] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [walletsRes, txRes] = await Promise.all([
        fetch('/api/wallets'),
        fetch('/api/transactions?limit=50'),
      ])

      const walletsData = await walletsRes.json()
      const txData = await txRes.json()

      if (walletsData.success) {
        setWallets(walletsData.wallets)
        if (walletsData.wallets.length > 0 && !sendForm.sourceWalletId) {
          setSendForm((prev) => ({ ...prev, sourceWalletId: walletsData.wallets[0].id }))
        }
      }
      if (txData.success) setTransactions(txData.transactions)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setSendError('')
    setSendSuccess('')
    setSendLoading(true)

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceWalletId: sendForm.sourceWalletId,
          destinationEmail: sendForm.destinationEmail,
          amount: parseFloat(sendForm.amount),
          description: sendForm.description,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setSendSuccess(`${sendForm.amount}€ envoyés avec succès!`)
        setSendForm((prev) => ({ ...prev, destinationEmail: '', amount: '', description: '' }))
        fetchData()
        setTimeout(() => {
          setShowSendModal(false)
          setSendSuccess('')
        }, 2000)
      } else {
        setSendError(data.error || 'Erreur lors du transfert')
      }
    } catch {
      setSendError('Erreur de connexion')
    } finally {
      setSendLoading(false)
    }
  }

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
      <div className="h-12 bg-gray-200 rounded-lg w-48"></div>
      <div className="h-96 bg-gray-200 rounded-xl"></div>
    </div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <button
          onClick={() => setShowSendModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          Nouvelle transaction
        </button>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fraude</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {new Date(tx.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      tx.isInterWallet ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {tx.isInterWallet ? '🌐 Inter-Wallet' : tx.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {tx.description || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(tx.status)}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {tx.fraudScore !== null && tx.fraudScore !== undefined ? (
                      <span className={`font-medium ${
                        tx.fraudScore >= 80 ? 'text-red-600' :
                        tx.fraudScore >= 50 ? 'text-orange-600' :
                        tx.fraudScore > 0 ? 'text-yellow-600' : 'text-green-600'
                      }`} title={tx.fraudReason || ''}>
                        {tx.fraudScore}/100
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(tx.amount, tx.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {transactions.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            Aucune transaction
          </div>
        )}
      </div>

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Envoyer de l'argent</h2>

            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Depuis
                </label>
                <select
                  value={sendForm.sourceWalletId}
                  onChange={(e) => setSendForm({ ...sendForm, sourceWalletId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} - {formatCurrency(w.balance, w.currency)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email du destinataire
                </label>
                <input
                  type="email"
                  value={sendForm.destinationEmail}
                  onChange={(e) => setSendForm({ ...sendForm, destinationEmail: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="destinataire@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Montant (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={sendForm.amount}
                  onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optionnel)
                </label>
                <input
                  type="text"
                  value={sendForm.description}
                  onChange={(e) => setSendForm({ ...sendForm, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Remboursement, cadeau..."
                />
              </div>

              {sendError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                  {sendError}
                </div>
              )}

              {sendSuccess && (
                <div className="p-3 bg-green-50 text-green-600 text-sm rounded-lg">
                  {sendSuccess}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={sendLoading}
                  className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {sendLoading ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
