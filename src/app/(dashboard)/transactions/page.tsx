'use client'

import { useEffect, useState, useCallback } from 'react'
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
  platformFee?: number | null
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
  const [filters, setFilters] = useState({
    walletId: searchParams.get('walletId') || '',
    type: searchParams.get('type') || '',
    status: searchParams.get('status') || '',
  })
  const [sendForm, setSendForm] = useState({
    sourceWalletId: '',
    destinationEmail: '',
    destinationWalletId: '',
    amount: '',
    description: '',
  })
  const [destinationWallets, setDestinationWallets] = useState<Wallet[]>([])
  const [loadingDestinationWallets, setLoadingDestinationWallets] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendSuccess, setSendSuccess] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams()
      queryParams.set('limit', '50')
      if (filters.walletId) queryParams.set('walletId', filters.walletId)
      if (filters.type) queryParams.set('type', filters.type)
      if (filters.status) queryParams.set('status', filters.status)

      const [walletsRes, txRes] = await Promise.all([
        fetch('/api/wallets'),
        fetch(`/api/transactions?${queryParams.toString()}`),
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
  }, [filters, sendForm.sourceWalletId])

  useEffect(() => {
    fetchData()
  }, [filters, fetchData])

  // Charger les wallets du destinataire quand l'email change
  useEffect(() => {
    const loadDestinationWallets = async () => {
      if (!sendForm.destinationEmail || !sendForm.destinationEmail.includes('@')) {
        setDestinationWallets([])
        setSendForm((prev) => ({ ...prev, destinationWalletId: '' }))
        return
      }

      setLoadingDestinationWallets(true)
      try {
        const res = await fetch(`/api/wallets?email=${encodeURIComponent(sendForm.destinationEmail)}`)
        const data = await res.json()
        if (data.success) {
          setDestinationWallets(data.wallets)
          // Si un seul wallet, le sélectionner automatiquement
          if (data.wallets.length === 1) {
            setSendForm((prev) => ({ ...prev, destinationWalletId: data.wallets[0].id }))
          } else {
            setSendForm((prev) => ({ ...prev, destinationWalletId: '' }))
          }
        } else {
          setDestinationWallets([])
          setSendForm((prev) => ({ ...prev, destinationWalletId: '' }))
        }
      } catch (error) {
        console.error('Failed to load destination wallets:', error)
        setDestinationWallets([])
        setSendForm((prev) => ({ ...prev, destinationWalletId: '' }))
      } finally {
        setLoadingDestinationWallets(false)
      }
    }

    // Debounce pour éviter trop de requêtes
    const timeoutId = setTimeout(loadDestinationWallets, 500)
    return () => clearTimeout(timeoutId)
  }, [sendForm.destinationEmail])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setSendError('')
    setSendSuccess('')
    setSendLoading(true)

    try {
      if (!sendForm.destinationWalletId) {
        setSendError('Veuillez sélectionner un wallet de destination')
        setSendLoading(false)
        return
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceWalletId: sendForm.sourceWalletId,
          destinationWalletId: sendForm.destinationWalletId,
          amount: parseFloat(sendForm.amount),
          description: sendForm.description,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setSendSuccess(`${sendForm.amount}€ envoyés avec succès!`)
        setSendForm((prev) => ({ ...prev, destinationEmail: '', destinationWalletId: '', amount: '', description: '' }))
        setDestinationWallets([])
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

  const calculatePlatformFee = (amount: number): number => {
    // Marge de plateforme: 1%
    return Math.round(amount * 0.01 * 100) / 100
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

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wallet
            </label>
            <select
              value={filters.walletId}
              onChange={(e) => setFilters({ ...filters, walletId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous les wallets</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous les types</option>
              <option value="DEPOSIT">Dépôt</option>
              <option value="WITHDRAWAL">Retrait</option>
              <option value="TRANSFER">Transfert</option>
              <option value="INTER_WALLET">Inter-Wallet</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Statut
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous les statuts</option>
              <option value="SUCCESS">Succès</option>
              <option value="PENDING">En attente</option>
              <option value="PROCESSING">En traitement</option>
              <option value="FAILED">Échoué</option>
              <option value="BLOCKED">Bloqué</option>
            </select>
          </div>
        </div>
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
            <h2 className="text-xl font-bold text-gray-900 mb-4">Envoyer de l&apos;argent</h2>

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
                  onChange={(e) => setSendForm({ ...sendForm, destinationEmail: e.target.value, destinationWalletId: '' })}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="destinataire@email.com"
                />
                {loadingDestinationWallets && (
                  <p className="mt-1 text-xs text-gray-500">Chargement des wallets...</p>
                )}
              </div>

              {destinationWallets.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Wallet de destination
                  </label>
                  <select
                    value={sendForm.destinationWalletId}
                    onChange={(e) => setSendForm({ ...sendForm, destinationWalletId: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sélectionner un wallet</option>
                    {destinationWallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.currency})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {sendForm.destinationEmail && !loadingDestinationWallets && destinationWallets.length === 0 && sendForm.destinationEmail.includes('@') && (
                <div className="p-3 bg-yellow-50 text-yellow-600 text-sm rounded-lg">
                  Aucun wallet trouvé pour cet email
                </div>
              )}

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

              {/* Résumé avec marge */}
              {sendForm.amount && parseFloat(sendForm.amount) > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Montant envoyé</span>
                    <span className="font-medium">{formatCurrency(parseFloat(sendForm.amount))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Frais de plateforme (1%)</span>
                    <span className="font-medium">{formatCurrency(calculatePlatformFee(parseFloat(sendForm.amount)))}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between">
                    <span className="font-semibold text-gray-900">Total débité</span>
                    <span className="font-bold text-lg text-gray-900">
                      {formatCurrency(parseFloat(sendForm.amount) + calculatePlatformFee(parseFloat(sendForm.amount)))}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Le destinataire recevra {formatCurrency(parseFloat(sendForm.amount))}
                  </div>
                </div>
              )}

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
                  disabled={sendLoading || !sendForm.destinationWalletId}
                  className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
