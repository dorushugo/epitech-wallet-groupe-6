'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function CheckoutReturnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const paymentIntent = searchParams.get('payment_intent')
    const sessionId = searchParams.get('payment_intent') // Pour Checkout Session, c'est le session_id
    const redirectStatus = searchParams.get('redirect_status')

    if (redirectStatus === 'succeeded') {
      setStatus('success')
      setMessage('Paiement réussi ! Votre wallet sera crédité sous peu.')
      // Rediriger vers /wallets après 3 secondes
      setTimeout(() => {
        router.push('/wallets')
      }, 3000)
    } else if (redirectStatus === 'canceled' || redirectStatus === 'failed') {
      setStatus('error')
      setMessage(
        redirectStatus === 'canceled'
          ? 'Paiement annulé. Vous pouvez réessayer.'
          : 'Le paiement a échoué. Veuillez réessayer.'
      )
    } else {
      // Si pas de redirect_status, vérifier si on a un session_id (format Checkout Session)
      if (sessionId) {
        setStatus('loading')
        setMessage('Vérification du statut du paiement...')
        // Le webhook devrait traiter le paiement, on attend un peu
        setTimeout(() => {
          setStatus('success')
          setMessage('Paiement en cours de traitement.')
          setTimeout(() => {
            router.push('/wallets')
          }, 2000)
        }, 2000)
      } else {
        setStatus('error')
        setMessage('Statut de paiement inconnu.')
      }
    }
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Traitement du paiement...</h2>
            <p className="text-gray-500">Veuillez patienter</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Paiement réussi !</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">Redirection en cours...</p>
            <button
              onClick={() => router.push('/wallets')}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              Aller aux wallets
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl text-red-600">✗</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Paiement échoué</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/deposit')}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Réessayer
              </button>
              <button
                onClick={() => router.push('/wallets')}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
              >
                Retour
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
