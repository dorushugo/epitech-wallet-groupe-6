'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Wallet {
  id: string
  name: string
  balance: number
  currency: string
}


const PREDEFINED_AMOUNTS = [5, 10, 25, 50, 100]

export default function DepositPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [isCustomAmount, setIsCustomAmount] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchWallets()
  }, [])

  useEffect(() => {
    const walletIdParam = searchParams.get('walletId')
    if (walletIdParam && wallets.length > 0) {
      const walletExists = wallets.find((w) => w.id === walletIdParam)
      if (walletExists) {
        setSelectedWalletId(walletIdParam)
      }
    }
  }, [searchParams, wallets])

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

  const calculateFees = (amount: number): number => {
    // Frais Stripe: 1.5% + 0.25€ pour cartes EEE
    // Note: Le 0.25€ fixe devrait être converti, mais pour simplifier l'affichage,
    // on l'affiche tel quel (la conversion réelle se fait côté serveur)
    return amount * 0.015 + 0.25
  }

  const calculatePlatformFee = (amount: number): number => {
    // Marge de plateforme: 1%
    return Math.round(amount * 0.01 * 100) / 100
  }

  const handleAmountSelect = (selectedAmount: number) => {
    setAmount(selectedAmount)
    setIsCustomAmount(false)
    setError('')
  }

  const handleCustomAmountClick = () => {
    setIsCustomAmount(true)
    setAmount('')
    setError('')
  }

  const handleCustomAmountChange = (value: string) => {
    const numValue = value === '' ? '' : parseFloat(value)
    setAmount(numValue)
    setError('')
    // Si l'utilisateur entre un montant qui correspond à un prédéfini, désélectionner le mode personnalisé
    if (typeof numValue === 'number' && PREDEFINED_AMOUNTS.includes(numValue)) {
      setIsCustomAmount(false)
    }
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

    const depositAmount = typeof amount === 'number' ? amount : parseFloat(amount as string)

    if (!depositAmount || depositAmount < 5 || depositAmount > 1000) {
      setError('Montant invalide (min: 5€, max: 1000€)')
      setProcessing(false)
      return
    }

    try {
      // Créer le PaymentIntent
      const selectedWallet = wallets.find((w) => w.id === selectedWalletId)
      if (!selectedWallet) {
        setError('Wallet non trouvé')
        setProcessing(false)
        return
      }

      const res = await fetch('/api/payments/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: selectedWalletId,
          amount: depositAmount,
          currency: selectedWallet.currency, // Devise du wallet
        }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Erreur lors de la création du paiement')
        setProcessing(false)
        return
      }

      // Rediriger vers Stripe Checkout
      if (data.url) {
        window.location.href = data.url
      } else {
        setError('URL de checkout non disponible')
        setProcessing(false)
      }
    } catch (err) {
      console.error('Deposit error:', err)
      setError('Erreur de connexion')
      setProcessing(false)
    }
  }

  const formatCurrency = (amount: number, currency = 'EUR') => {
    return amount.toLocaleString('fr-FR', { style: 'currency', currency })
  }

  const depositAmount = typeof amount === 'number' ? amount : parseFloat(amount as string) || 0
  const fees = depositAmount > 0 ? calculateFees(depositAmount) : 0
  const platformFee = depositAmount > 0 ? calculatePlatformFee(depositAmount) : 0
  const total = depositAmount + fees + platformFee // Montant total à payer (incluant frais Stripe + frais plateforme)

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
        <h1 className="text-2xl font-bold text-gray-900">Créditer un wallet</h1>
        <p className="text-gray-500 mt-1">Ajoutez des fonds à votre wallet via Stripe</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sélection du wallet */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wallet à créditer
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

          {/* Sélection du montant - Unifiée */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Montant à créditer
              {(() => {
                const selectedWallet = wallets.find((w) => w.id === selectedWalletId)
                return selectedWallet ? ` (${selectedWallet.currency})` : ''
              })()}
            </label>
            <div className="space-y-3">
              {/* Boutons prédéfinis + Personnalisé */}
              <div className="grid grid-cols-6 gap-2">
                {PREDEFINED_AMOUNTS.map((predefinedAmount) => (
                  <button
                    key={predefinedAmount}
                    type="button"
                    onClick={() => handleAmountSelect(predefinedAmount)}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition ${
                      amount === predefinedAmount && !isCustomAmount
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {predefinedAmount}€
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleCustomAmountClick}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition ${
                    isCustomAmount
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Personnalisé
                </button>
              </div>
              {/* Input personnalisé - toujours visible mais activé seulement si "Personnalisé" est sélectionné */}
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => handleCustomAmountChange(e.target.value)}
                  onFocus={() => setIsCustomAmount(true)}
                  min="5"
                  max="1000"
                  step="0.01"
                  placeholder={isCustomAmount ? "Entrez un montant" : "Ou entrez un montant personnalisé"}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 transition ${
                    isCustomAmount
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Résumé */}
          {depositAmount > 0 && (() => {
            const selectedWallet = wallets.find((w) => w.id === selectedWalletId)
            const walletCurrency = selectedWallet?.currency || 'EUR'
            return (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Montant à créditer</span>
                  <span className="font-medium">{formatCurrency(depositAmount, walletCurrency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Frais Stripe (1.5% + 0.25€)</span>
                  <span className="font-medium">{formatCurrency(fees, walletCurrency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Frais de plateforme (1%)</span>
                  <span className="font-medium">{formatCurrency(platformFee, walletCurrency)}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="font-semibold text-gray-900">Total à payer</span>
                  <span className="font-bold text-lg text-gray-900">{formatCurrency(total, walletCurrency)}</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Vous recevrez {formatCurrency(depositAmount, walletCurrency)} sur votre wallet
                </div>
              </div>
            )
          })()}

          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}

          <button
            type="submit"
            disabled={processing || !amount || depositAmount < 5 || depositAmount > 1000}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Traitement...' : 'Payer avec Stripe'}
          </button>
        </form>
      </div>
    </div>
  )
}
