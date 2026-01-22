'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Wallet {
  id: string
  name: string
  balance: number
  currency: string
}

interface Payout {
  id: string
  amount: number
  currency: string
  method: string
  status: string
  destination: string
  createdAt: string
}

interface Transaction {
  id: string
  amount: number
  currency: string
  status: string
  createdAt: string
}

export default function CashoutPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [method] = useState<'bank_transfer'>('bank_transfer')
  const [destination, setDestination] = useState('')
  const [accountName, setAccountName] = useState('')
  const [description, setDescription] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const fetchPayouts = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams()
      queryParams.set('type', 'WITHDRAWAL')
      if (selectedWalletId) {
        queryParams.set('walletId', selectedWalletId)
      }
      const res = await fetch(`/api/transactions?${queryParams.toString()}`)
      const data = await res.json()
      if (data.success) {
        // Convertir les transactions en format payout pour l'affichage
        const payoutsData = data.transactions.map((tx: Transaction) => ({
          id: tx.id,
          amount: tx.amount,
          currency: tx.currency,
          method: 'bank_transfer', // Par défaut
          status: tx.status === 'SUCCESS' ? 'paid' : tx.status === 'FAILED' ? 'failed' : 'pending',
          destination: '****', // Masqué pour la sécurité
          createdAt: tx.createdAt,
        }))
        setPayouts(payoutsData)
      }
    } catch (error) {
      console.error('Failed to fetch payouts:', error)
    }
  }, [selectedWalletId])

  const fetchWallets = async () => {
    try {
      const res = await fetch('/api/wallets')
      const data = await res.json()
      if (data.success && data.wallets.length > 0) {
        setWallets(data.wallets)
        setSelectedWalletId(data.wallets[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch wallets:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWallets()
  }, [])

  useEffect(() => {
    if (selectedWalletId) {
      fetchPayouts()
    }
  }, [selectedWalletId, fetchPayouts])

  useEffect(() => {
    const walletIdParam = searchParams.get('walletId')
    if (walletIdParam && wallets.length > 0) {
      const walletExists = wallets.find((w) => w.id === walletIdParam)
      if (walletExists) {
        setSelectedWalletId(walletIdParam)
      }
    }
  }, [searchParams, wallets])

  const calculateFees = (): number => {
    // Frais de traitement: 0.25€ pour virement bancaire
    return 0.25
  }

  const calculatePlatformFee = (amount: number): number => {
    // Marge de plateforme: 1%
    return Math.round(amount * 0.01 * 100) / 100
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setProcessing(true)

    if (!selectedWalletId) {
      setError('Veuillez sélectionner un wallet')
      setProcessing(false)
      return
    }

    const cashoutAmount = typeof amount === 'number' ? amount : parseFloat(amount as string)

    if (!cashoutAmount || cashoutAmount < 10) {
      setError('Montant minimum: 10€')
      setProcessing(false)
      return
    }

    const selectedWallet = wallets.find((w) => w.id === selectedWalletId)
    if (!selectedWallet) {
      setError('Wallet non trouvé')
      setProcessing(false)
      return
    }

    const platformFee = calculatePlatformFee(cashoutAmount)
    const fees = calculateFees()
    const totalDebit = cashoutAmount + platformFee + fees

    if (totalDebit > selectedWallet.balance) {
      setError(`Solde insuffisant (montant + frais: ${formatCurrency(totalDebit)})`)
      setProcessing(false)
      return
    }

    if (!destination || destination.trim().length === 0) {
      setError('Destination requise')
      setProcessing(false)
      return
    }

    if (!accountName) {
      setError('Nom du compte requis')
      setProcessing(false)
      return
    }

    try {
      const res = await fetch('/api/payments/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: selectedWalletId,
          amount: cashoutAmount,
          method,
          destination: destination.replace(/\s/g, ''), // Nettoyer l'IBAN
          description: description || undefined,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Erreur lors du retrait')
        setProcessing(false)
        return
      }

      // Réinitialiser le formulaire
      setAmount('')
      setDestination('')
      setAccountName('')
      setDescription('')

      // Rafraîchir les données
      fetchWallets()
      fetchPayouts()

      // Afficher un message de succès
      alert('Retrait initié avec succès !')
    } catch (err) {
      console.error('Cashout error:', err)
      setError('Erreur de connexion')
      setProcessing(false)
    } finally {
      setProcessing(false)
    }
  }

  const formatCurrency = (amount: number, currency = 'EUR') => {
    return amount.toLocaleString('fr-FR', { style: 'currency', currency })
  }

  const formatIBAN = (iban: string): string => {
    // Formater l'IBAN par groupes de 4 caractères
    return iban.replace(/(.{4})/g, '$1 ').trim()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700'
      case 'pending':
        return 'bg-yellow-100 text-yellow-700'
      case 'failed':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Payé'
      case 'pending':
        return 'En attente'
      case 'failed':
        return 'Échoué'
      default:
        return status
    }
  }

  const selectedWallet = wallets.find((w) => w.id === selectedWalletId)
  const cashoutAmount = typeof amount === 'number' ? amount : parseFloat(amount as string) || 0
  const fees = cashoutAmount > 0 ? calculateFees() : 0
  const platformFee = cashoutAmount > 0 ? calculatePlatformFee(cashoutAmount) : 0
  const totalDebit = cashoutAmount + platformFee + fees // Montant total débité du wallet (montant + frais plateforme + frais traitement)
  const netAmount = cashoutAmount // Montant reçu par l'utilisateur (exactement ce qui a été input)

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-12 bg-gray-200 rounded-lg w-48"></div>
        <div className="bg-white rounded-xl p-6 space-y-4">
          <div className="h-10 bg-gray-200 rounded-lg"></div>
          <div className="h-10 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    )
  }

  if (wallets.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 text-center">
        <p className="text-gray-500 mb-4">Aucun wallet disponible.</p>
        <button
          onClick={() => router.push('/wallets')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          Créer un wallet
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Retirer des fonds</h1>
        <p className="text-gray-500 mt-1">Retirez de l&apos;argent de votre wallet</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulaire de retrait */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Nouveau retrait</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Sélection du wallet */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Wallet
              </label>
              <select
                value={selectedWalletId}
                onChange={(e) => setSelectedWalletId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} - {formatCurrency(wallet.balance, wallet.currency)}
                  </option>
                ))}
              </select>
            </div>

            {/* Montant */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Montant (minimum 10€)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  const value = e.target.value === '' ? '' : parseFloat(e.target.value)
                  setAmount(value)
                  setError('')
                }}
                min="10"
                step="0.01"
                placeholder="0.00"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* IBAN */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                IBAN
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => {
                  // Nettoyer et formater l'IBAN
                  const cleaned = e.target.value.replace(/\s/g, '').toUpperCase()
                  setDestination(cleaned)
                  setError('')
                }}
                placeholder="FR76 1234 5678 9012 3456 7890 123"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                required
              />
              {destination && (
                <p className="mt-1 text-xs text-gray-500">
                  Formaté: {formatIBAN(destination)}
                </p>
              )}
            </div>

            {/* Nom du compte */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du compte
              </label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Jean Dupont"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Description optionnelle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optionnel)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Retrait pour..."
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                maxLength={255}
              />
            </div>

            {/* Résumé */}
            {cashoutAmount > 0 && selectedWallet && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Montant à recevoir</span>
                  <span className="font-medium">{formatCurrency(cashoutAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Frais de plateforme (1%)</span>
                  <span className="font-medium">{formatCurrency(platformFee)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Frais de traitement</span>
                  <span className="font-medium">{formatCurrency(fees)}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="font-semibold text-gray-900">Total débité</span>
                  <span className="font-bold text-lg text-gray-900">{formatCurrency(totalDebit)}</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Vous recevrez {formatCurrency(netAmount)}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
            )}

            <button
              type="submit"
              disabled={
                processing ||
                !amount ||
                cashoutAmount < 10 ||
                !destination ||
                !accountName ||
                (selectedWallet && totalDebit > selectedWallet.balance)
              }
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? 'Traitement...' : 'Initier le retrait'}
            </button>
          </form>
        </div>

        {/* Historique des retraits */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Historique des retraits</h2>
          {payouts.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucun retrait effectué</p>
          ) : (
            <div className="space-y-3">
              {payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {formatCurrency(payout.amount, payout.currency)}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(
                          payout.status
                        )}`}
                      >
                        {getStatusLabel(payout.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Virement bancaire - {payout.destination}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(payout.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
