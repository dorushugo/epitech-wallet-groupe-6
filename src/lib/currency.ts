/**
 * Module de conversion de devises
 * Utilise ExchangeRate-API (gratuit jusqu'à 1500 requêtes/mois)
 * Alternative: Fixer.io, Open Exchange Rates
 */

const EXCHANGE_RATE_API_URL = 'https://api.exchangerate-api.com/v4/latest'

interface ExchangeRates {
  [currency: string]: number
}

interface ExchangeRateResponse {
  base: string
  date: string
  rates: ExchangeRates
}

// Cache des taux de change (valide 1 heure)
let cachedRates: {
  base: string
  rates: ExchangeRates
  timestamp: number
} | null = null

const CACHE_DURATION = 60 * 60 * 1000 // 1 heure

/**
 * Récupère les taux de change depuis l'API
 */
async function fetchExchangeRates(baseCurrency: string = 'EUR'): Promise<ExchangeRates> {
  // Vérifier le cache
  if (cachedRates && cachedRates.base === baseCurrency) {
    const age = Date.now() - cachedRates.timestamp
    if (age < CACHE_DURATION) {
      return cachedRates.rates
    }
  }

  try {
    const response = await fetch(`${EXCHANGE_RATE_API_URL}/${baseCurrency}`)
    
    if (!response.ok) {
      throw new Error(`ExchangeRate API error: ${response.statusText}`)
    }

    const data: ExchangeRateResponse = await response.json()
    
    // Mettre en cache
    cachedRates = {
      base: baseCurrency,
      rates: data.rates,
      timestamp: Date.now(),
    }

    return data.rates
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error)
    
    // En cas d'erreur, utiliser le cache même s'il est expiré
    if (cachedRates && cachedRates.base === baseCurrency) {
      console.warn('Using expired cache due to API error')
      return cachedRates.rates
    }
    
    throw error
  }
}

/**
 * Convertit un montant d'une devise à une autre
 * @param amount Montant à convertir
 * @param fromCurrency Devise source (ex: 'EUR')
 * @param toCurrency Devise cible (ex: 'USD')
 * @returns Montant converti arrondi à 2 décimales
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  // Si les devises sont identiques, pas de conversion
  if (fromCurrency === toCurrency) {
    return amount
  }

  try {
    const rates = await fetchExchangeRates(fromCurrency)
    const rate = rates[toCurrency]

    if (!rate) {
      throw new Error(`Taux de change non trouvé pour ${toCurrency}`)
    }

    const convertedAmount = amount * rate
    // Arrondir à 2 décimales
    return Math.round(convertedAmount * 100) / 100
  } catch (error) {
    console.error('Currency conversion error:', error)
    throw new Error(`Impossible de convertir ${fromCurrency} vers ${toCurrency}`)
  }
}

/**
 * Récupère le taux de change entre deux devises
 * @param fromCurrency Devise source
 * @param toCurrency Devise cible
 * @returns Taux de change
 */
export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency === toCurrency) {
    return 1
  }

  try {
    const rates = await fetchExchangeRates(fromCurrency)
    const rate = rates[toCurrency]

    if (!rate) {
      throw new Error(`Taux de change non trouvé pour ${toCurrency}`)
    }

    return rate
  } catch (error) {
    console.error('Get exchange rate error:', error)
    throw new Error(`Impossible de récupérer le taux de change ${fromCurrency}/${toCurrency}`)
  }
}

/**
 * Formate un montant avec sa devise
 */
export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return amount.toLocaleString('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
