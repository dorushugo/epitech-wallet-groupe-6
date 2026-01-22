'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'

// Importer le CSS de Swagger UI de manière statique
// Next.js gère automatiquement l'injection du CSS
import 'swagger-ui-react/swagger-ui.css'

// Charger Swagger UI uniquement côté client
// Note: swagger-ui-react doit être installé via `bun install`
const SwaggerUI = dynamic(
  () => import('swagger-ui-react'),
  { 
    ssr: false,
    loading: () => (
      <div className="p-8 text-center text-gray-500">
        Chargement de la documentation...
      </div>
    )
  }
)

export default function ApiDocsPage() {
  useEffect(() => {
    // Supprimer les warnings React en mode strict pour swagger-ui-react
    // C'est un problème connu de la bibliothèque, pas de notre code
    const originalError = console.error
    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('UNSAFE_componentWillReceiveProps')
      ) {
        return
      }
      originalError.apply(console, args)
    }

    return () => {
      console.error = originalError
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Documentation API</h1>
          <p className="text-sm text-gray-600 mt-1">
            Documentation complète de l&apos;API Digital Wallet - Groupe 6
          </p>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div id="swagger-ui-wrapper">
            <SwaggerUI
              url="/api/openapi"
              deepLinking={true}
              displayOperationId={false}
              defaultModelsExpandDepth={2}
              defaultModelExpandDepth={2}
              docExpansion="list"
              filter={true}
              showExtensions={true}
              showCommonExtensions={true}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
