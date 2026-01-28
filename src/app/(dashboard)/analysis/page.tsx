'use client'

import { useState } from 'react'
import MarkdownRenderer from '@/app/components/MarkdownRenderer'

// Types pour le persona
interface Persona {
  type: string
  emoji: string
  title: string
  subtitle: string
  description: string
  strengths: string[]
  improvements: string[]
  riskLevel: 'low' | 'medium' | 'high'
  activityLevel: 'low' | 'medium' | 'high'
  savingsScore: number
}

export default function AnalysisPage() {
  const [hasStarted, setHasStarted] = useState(false)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [completion, setCompletion] = useState('')
  const [isLoadingPersona, setIsLoadingPersona] = useState(false)
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const handleAnalyze = async () => {
    setHasStarted(true)
    setIsLoadingPersona(true)
    setIsLoadingAnalysis(true)
    setPersona(null)
    setCompletion('')
    setError(null)

    try {
      // 1. Charger le persona
      const personaRes = await fetch('/api/ai/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (personaRes.ok) {
        const personaData = await personaRes.json()
        if (personaData.success) {
          setPersona(personaData.persona)
        }
      }
      setIsLoadingPersona(false)

      // 2. Charger l'analyse textuelle en streaming
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Stream non disponible')
      }

      const decoder = new TextDecoder()
      let text = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        text += decoder.decode(value, { stream: true })
        setCompletion(text)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Erreur inconnue'))
    } finally {
      setIsLoadingPersona(false)
      setIsLoadingAnalysis(false)
    }
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600 bg-green-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      case 'high': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getActivityColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-blue-600 bg-blue-100'
      case 'medium': return 'text-purple-600 bg-purple-100'
      case 'high': return 'text-orange-600 bg-orange-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getPersonaGradient = (type: string) => {
    switch (type) {
      case 'econome_prudent': return 'from-emerald-500 to-teal-600'
      case 'stratege_equilibre': return 'from-blue-500 to-indigo-600'
      case 'dynamique_actif': return 'from-orange-500 to-red-500'
      case 'investisseur_audacieux': return 'from-purple-500 to-pink-600'
      case 'tranquille_serein': return 'from-cyan-500 to-blue-500'
      case 'profil_a_surveiller': return 'from-red-500 to-rose-600'
      default: return 'from-gray-500 to-gray-600'
    }
  }

  const isLoading = isLoadingPersona || isLoadingAnalysis

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analyse IA</h1>
        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Analyse en cours...
            </>
          ) : (
            <>
              <span>🤖</span>
              {hasStarted ? 'Relancer l\'analyse' : 'Lancer l\'analyse'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg">
          <p className="font-medium">Erreur lors de l'analyse</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      )}

      {/* État initial */}
      {!hasStarted && !isLoading && (
        <div className="bg-white rounded-xl shadow-sm p-8">
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🤖</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Analysez vos finances</h2>
            <p className="text-gray-500 max-w-md mx-auto">
              L'IA analysera vos wallets et transactions pour créer votre profil financier personnalisé.
            </p>
          </div>
        </div>
      )}

      {/* Chargement du persona */}
      {isLoadingPersona && !persona && (
        <div className="bg-white rounded-xl shadow-sm p-8">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent mx-auto"></div>
              <p className="text-gray-500 mt-4">Création de votre profil...</p>
            </div>
          </div>
        </div>
      )}

      {/* Carte Persona */}
      {persona && (
        <div className={`bg-gradient-to-br ${getPersonaGradient(persona.type)} rounded-2xl p-6 text-white shadow-lg`}>
          <div className="flex flex-col md:flex-row gap-6">
            {/* Gauche: Info principale */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-5xl">{persona.emoji}</span>
                <div>
                  <h2 className="text-2xl font-bold">{persona.title}</h2>
                  <p className="text-white/80">{persona.subtitle}</p>
                </div>
              </div>
              <p className="text-white/90 mb-4">{persona.description}</p>
              
              {/* Points forts */}
              <div className="mb-3">
                <p className="text-sm font-semibold text-white/70 mb-2">Tes points forts</p>
                <div className="flex flex-wrap gap-2">
                  {persona.strengths.map((s, i) => (
                    <span key={i} className="px-3 py-1 bg-white/20 rounded-full text-sm">
                      ✓ {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Axes d'amélioration */}
              {persona.improvements.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-white/70 mb-2">À améliorer</p>
                  <div className="flex flex-wrap gap-2">
                    {persona.improvements.map((s, i) => (
                      <span key={i} className="px-3 py-1 bg-white/10 rounded-full text-sm">
                        → {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Droite: Métriques */}
            <div className="flex flex-row md:flex-col gap-3 md:w-40">
              {/* Score d'épargne */}
              <div className="flex-1 bg-white/10 rounded-xl p-4 text-center">
                <p className="text-xs text-white/70 mb-1">Score épargne</p>
                <p className="text-3xl font-bold">{persona.savingsScore}</p>
                <p className="text-xs text-white/70">/100</p>
              </div>
              
              {/* Niveau de risque */}
              <div className="flex-1 bg-white/10 rounded-xl p-4 text-center">
                <p className="text-xs text-white/70 mb-1">Risque</p>
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(persona.riskLevel)}`}>
                  {persona.riskLevel === 'low' ? 'Faible' : persona.riskLevel === 'medium' ? 'Modéré' : 'Élevé'}
                </span>
              </div>
              
              {/* Niveau d'activité */}
              <div className="flex-1 bg-white/10 rounded-xl p-4 text-center">
                <p className="text-xs text-white/70 mb-1">Activité</p>
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getActivityColor(persona.activityLevel)}`}>
                  {persona.activityLevel === 'low' ? 'Calme' : persona.activityLevel === 'medium' ? 'Modérée' : 'Intense'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analyse textuelle */}
      {(completion || isLoadingAnalysis) && persona && (
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-white text-sm">🤖</span>
              </div>
              <span className="font-medium text-gray-900">Analyse détaillée</span>
              {isLoadingAnalysis && (
                <span className="text-xs text-blue-600 animate-pulse ml-2">En train d'écrire...</span>
              )}
            </div>
            
            {completion ? (
              <>
                <MarkdownRenderer content={completion} />
                {isLoadingAnalysis && (
                  <span className="inline-block w-2 h-5 bg-blue-600 animate-pulse rounded-sm"></span>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
