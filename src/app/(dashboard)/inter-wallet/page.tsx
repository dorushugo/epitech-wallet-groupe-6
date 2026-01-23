'use client'

import { useEffect, useState } from 'react'

interface Wallet {
  id: string
  name: string
  balance: number
  currency: string
}

interface SystemInfo {
  systemUrl: string
  systemName: string
  protocolVersion: string
  supportedCurrencies: string[]
  endpoints: {
    transfer: string
    validate: string
    status: string
  }
}

export default function InterWalletPage() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTransferModal, setShowTransferModal] = useState(false)
  
  const [transferForm, setTransferForm] = useState({
    sourceWalletId: '',
    externalSystemUrl: '',
    externalWalletId: '',
    amount: '',
    description: '',
  })
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferResult, setTransferResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [walletsRes, infoRes] = await Promise.all([
        fetch('/api/wallets'),
        fetch('/api/inter-wallet/status'),
      ])

      const walletsData = await walletsRes.json()
      const infoData = await infoRes.json()

      if (walletsData.success) {
        setWallets(walletsData.wallets)
        if (walletsData.wallets.length > 0) {
          setTransferForm((prev) => ({ ...prev, sourceWalletId: walletsData.wallets[0].id }))
        }
      }
      setSystemInfo(infoData)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    setTransferLoading(true)
    setTransferResult(null)

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceWalletId: transferForm.sourceWalletId,
          amount: parseFloat(transferForm.amount),
          description: transferForm.description,
          isInterWallet: true,
          externalSystemUrl: transferForm.externalSystemUrl,
          externalWalletId: transferForm.externalWalletId,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setTransferResult({ success: true, message: data.message || 'Transaction inter-wallet initiée!' })
        fetchData()
      } else {
        setTransferResult({ success: false, message: data.error || 'Erreur lors du transfert' })
      }
    } catch {
      setTransferResult({ success: false, message: 'Erreur de connexion' })
    } finally {
      setTransferLoading(false)
    }
  }

  const formatCurrency = (amount: number, currency = 'EUR') => {
    return amount.toLocaleString('fr-FR', { style: 'currency', currency })
  }

  const calculatePlatformFee = (amount: number): number => {
    // Marge de plateforme: 1%
    return Math.round(amount * 0.01 * 100) / 100
  }

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-12 bg-gray-200 rounded-lg w-48"></div>
      <div className="h-64 bg-gray-200 rounded-xl"></div>
    </div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inter-Wallet Protocol</h1>
        <button
          onClick={() => setShowTransferModal(true)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition"
        >
          🌐 Nouveau transfert inter-wallet
        </button>
      </div>

      {/* System Info */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Informations du système</h2>
        
        {systemInfo && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Nom du système</p>
              <p className="font-medium text-gray-900">{systemInfo.systemName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">URL du système</p>
              <p className="font-mono text-sm text-gray-900">{systemInfo.systemUrl}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Version du protocole</p>
              <p className="font-medium text-gray-900">{systemInfo.protocolVersion}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Devises supportées</p>
              <p className="font-medium text-gray-900">{systemInfo.supportedCurrencies.join(', ')}</p>
            </div>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Endpoints disponibles</h3>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">POST</span>
              <span className="text-gray-600">{systemInfo?.endpoints.transfer}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">POST</span>
              <span className="text-gray-600">{systemInfo?.endpoints.validate}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">POST</span>
              <span className="text-gray-600">{systemInfo?.endpoints.status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet IDs for sharing */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Vos Wallet IDs</h2>
        <p className="text-sm text-gray-500 mb-4">
          Partagez ces IDs avec d&apos;autres systèmes pour recevoir des transferts inter-wallets.
        </p>
        
        <div className="space-y-3">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{wallet.name}</p>
                <p className="text-sm text-gray-500">{formatCurrency(wallet.balance, wallet.currency)}</p>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-gray-200 px-2 py-1 rounded">{wallet.id}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(wallet.id)}
                  className="p-1 hover:bg-gray-200 rounded"
                  title="Copier"
                >
                  📋
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Protocol Documentation */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Documentation du protocole</h2>
        
        <div className="prose prose-sm max-w-none">
          <h3 className="text-base font-medium text-gray-900">Format de requête (POST /api/inter-wallet/transfer)</h3>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
{`{
  "transactionRef": "Groupe6-xxxx-xxxxxxxx",
  "sourceSystemUrl": "http://localhost:3000",
  "sourceSystemName": "Groupe6-Wallet",
  "sourceWalletId": "source-wallet-id",
  "destinationWalletId": "dest-wallet-id",
  "amount": 100.00,
  "currency": "EUR",
  "description": "Test transfer",
  "timestamp": "2024-01-20T12:00:00.000Z"
}

Headers:
  X-Signature: <HMAC-SHA256 signature>
  X-Source-System: <source system URL>`}
          </pre>

          <h3 className="text-base font-medium text-gray-900 mt-6">Signature HMAC-SHA256</h3>
          <p className="text-gray-600">
            La signature est calculée sur le JSON stringify du payload avec la clé secrète partagée.
          </p>
        </div>
      </div>

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">🌐 Transfert Inter-Wallet</h2>

            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Wallet source
                </label>
                <select
                  value={transferForm.sourceWalletId}
                  onChange={(e) => setTransferForm({ ...transferForm, sourceWalletId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                  URL du système distant
                </label>
                <input
                  type="url"
                  value={transferForm.externalSystemUrl}
                  onChange={(e) => setTransferForm({ ...transferForm, externalSystemUrl: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="https://autre-groupe.example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID du wallet destinataire
                </label>
                <input
                  type="text"
                  value={transferForm.externalWalletId}
                  onChange={(e) => setTransferForm({ ...transferForm, externalWalletId: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="clxxxxx..."
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
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={transferForm.description}
                  onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="Paiement inter-système"
                />
              </div>

              {/* Résumé avec marge */}
              {transferForm.amount && parseFloat(transferForm.amount) > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Montant envoyé</span>
                    <span className="font-medium">{formatCurrency(parseFloat(transferForm.amount))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Frais de plateforme (1%)</span>
                    <span className="font-medium">{formatCurrency(calculatePlatformFee(parseFloat(transferForm.amount)))}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between">
                    <span className="font-semibold text-gray-900">Total débité</span>
                    <span className="font-bold text-lg text-gray-900">
                      {formatCurrency(parseFloat(transferForm.amount) + calculatePlatformFee(parseFloat(transferForm.amount)))}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Le wallet externe recevra {formatCurrency(parseFloat(transferForm.amount))}
                  </div>
                </div>
              )}

              {transferResult && (
                <div className={`p-3 text-sm rounded-lg ${
                  transferResult.success ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                }`}>
                  {transferResult.message}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowTransferModal(false)
                    setTransferResult(null)
                  }}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={transferLoading}
                  className="flex-1 py-3 px-4 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition disabled:opacity-50"
                >
                  {transferLoading ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
