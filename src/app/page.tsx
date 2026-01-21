import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-3xl font-bold">W</span>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Digital Wallet
        </h1>
        <p className="text-gray-500 mb-8">
          Groupe 6 - Protocole Inter-Wallets
        </p>

        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Se connecter
          </Link>
          <Link
            href="/register"
            className="block w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
          >
            Créer un compte
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Fonctionnalités</h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div className="bg-gray-50 p-2 rounded">💸 Transferts locaux</div>
            <div className="bg-gray-50 p-2 rounded">🌐 Inter-wallets</div>
            <div className="bg-gray-50 p-2 rounded">🛡️ Anti-fraude</div>
            <div className="bg-gray-50 p-2 rounded">📊 Historique</div>
          </div>
        </div>
      </div>
    </div>
  )
}
