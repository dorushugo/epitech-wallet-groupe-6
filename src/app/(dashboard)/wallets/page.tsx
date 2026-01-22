'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Wallet {
  id: string
  name: string
  balance: number
  currency: string
  createdAt: string
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', currency: 'EUR' })
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    fetchWallets()
  }, [])

  const fetchWallets = async () => {
    try {
      const res = await fetch('/api/wallets')
      const data = await res.json()
      if (data.success) setWallets(data.wallets)
    } catch (error) {
      console.error('Failed to fetch wallets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    setCreateLoading(true)

    try {
      const res = await fetch('/api/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })

      const data = await res.json()

      if (data.success) {
        fetchWallets()
        setShowCreateModal(false)
        setCreateForm({ name: '', currency: 'EUR' })
      } else {
        setCreateError(data.error || 'Erreur lors de la création')
      }
    } catch {
      setCreateError('Erreur de connexion')
    } finally {
      setCreateLoading(false)
    }
  }

  const formatCurrency = (amount: number, currency = 'EUR') => {
    return amount.toLocaleString('fr-FR', { style: 'currency', currency })
  }

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0)

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-12 bg-gray-200 rounded-lg w-48"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-40 bg-gray-200 rounded-xl"></div>
        <div className="h-40 bg-gray-200 rounded-xl"></div>
      </div>
    </div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Wallets</h1>
          <p className="text-gray-500">Total: {formatCurrency(totalBalance)}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          disabled={wallets.length >= 5}
        >
          + Nouveau Wallet
        </button>
      </div>

      {/* Wallets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {wallets.map((wallet, index) => (
          <Link
            key={wallet.id}
            href={`/wallets/${wallet.id}`}
            className={`rounded-2xl p-6 text-white cursor-pointer transition-transform hover:scale-105 ${
              index === 0 ? 'bg-gradient-to-br from-blue-600 to-indigo-600' :
              index === 1 ? 'bg-gradient-to-br from-purple-600 to-pink-600' :
              index === 2 ? 'bg-gradient-to-br from-green-600 to-teal-600' :
              'bg-gradient-to-br from-orange-500 to-red-500'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-white/80 text-sm">{wallet.name}</p>
                <p className="text-3xl font-bold mt-1">
                  {formatCurrency(wallet.balance, wallet.currency)}
                </p>
              </div>
              <span className="text-2xl">💰</span>
            </div>

            <div className="flex items-center justify-between text-white/60 text-xs">
              <span>ID: {wallet.id.slice(0, 8)}...</span>
              <span>{wallet.currency}</span>
            </div>
          </Link>
        ))}
      </div>

      {wallets.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center">
          <p className="text-gray-500">Aucun wallet. Créez-en un pour commencer.</p>
        </div>
      )}

      {wallets.length >= 5 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
          ⚠️ Limite de 5 wallets atteinte
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Créer un wallet</h2>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du wallet
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Épargne, Vacances..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Devise
                </label>
                <select
                  value={createForm.currency}
                  onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="EUR">EUR - Euro</option>
                  <option value="USD">USD - Dollar</option>
                  <option value="GBP">GBP - Livre Sterling</option>
                </select>
              </div>

              {createError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                  {createError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {createLoading ? 'Création...' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
