import { createOpenAI } from '@ai-sdk/openai'

// Client Scaleway AI (compatible OpenAI chat API)
export const scaleway = createOpenAI({
  baseURL: process.env.SCALEWAY_BASE_URL || 'https://api.scaleway.ai/1b77b89d-64d5-4e7b-a68c-99bc7a7f1169/v1',
  apiKey: process.env.SCALEWAY_API_KEY || '',
  compatibility: 'compatible',
})

// Modèle par défaut - utiliser .chat() pour forcer l'API chat/completions
export const scalewayModel = scaleway.chat(process.env.SCALEWAY_MODEL || 'qwen3-235b-a22b-instruct-2507')

// Types pour l'analyse
export interface TransactionForAnalysis {
  id: string
  type: string
  status: string
  amount: number
  currency: string
  description?: string | null
  fraudScore?: number | null
  isInterWallet: boolean
  createdAt: Date | string
}

export interface WalletForAnalysis {
  id: string
  name: string
  balance: number
  currency: string
}

// Prompt système pour l'analyse financière personnalisée
export const FINANCIAL_ANALYSIS_SYSTEM_PROMPT = `Tu es un assistant financier personnel et bienveillant. Tu t'adresses DIRECTEMENT à l'utilisateur (tutoiement), comme un conseiller personnel de confiance.

IMPORTANT: Le profil persona de l'utilisateur est déjà affiché dans une carte dédiée. Ne le répète PAS. Concentre-toi sur l'analyse détaillée.

## Structure de ta réponse

### 1. Salutation
Commence par une salutation courte et chaleureuse avec le prénom.

### 2. Bilan financier
Analyse rapide et claire :
- Résumé de la situation (solde, tendance)
- Flux du mois (entrées vs sorties)
- Points notables

### 3. Analyse des transactions
Commente les transactions importantes ou récurrentes. Utilise un tableau si pertinent.

### 4. Alertes sécurité (si nécessaire)
Si des transactions à risque sont détectées, explique clairement le problème et ce qu'il doit faire.

### 5. Mes conseils
2-3 recommandations concrètes, courtes et actionnables.

## Règles
- Tutoie TOUJOURS l'utilisateur
- Sois concis et direct
- Utilise des emojis avec parcimonie (1-2 par section max)
- Mets en valeur le positif avant le négatif
- Pas de blabla : va droit au but
- Français uniquement`
