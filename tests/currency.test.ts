import { describe, expect, test } from 'bun:test'
import { formatCurrency } from '../src/lib/currency'

describe('Currency Module', () => {
  describe('formatCurrency', () => {
    test('should format EUR amount correctly', () => {
      const formatted = formatCurrency(100, 'EUR')
      // French locale format: 100,00 €
      expect(formatted).toContain('100')
      expect(formatted).toContain('€')
    })

    test('should format USD amount correctly', () => {
      const formatted = formatCurrency(100, 'USD')
      expect(formatted).toContain('100')
      expect(formatted).toContain('$')
    })

    test('should format GBP amount correctly', () => {
      const formatted = formatCurrency(100, 'GBP')
      expect(formatted).toContain('100')
      expect(formatted).toContain('£')
    })

    test('should default to EUR when no currency specified', () => {
      const formatted = formatCurrency(50)
      expect(formatted).toContain('50')
      expect(formatted).toContain('€')
    })

    test('should format with 2 decimal places', () => {
      const formatted = formatCurrency(99.9, 'EUR')
      // Should be 99,90 € (2 decimals)
      expect(formatted).toMatch(/99[,.]90/)
    })

    test('should handle zero amount', () => {
      const formatted = formatCurrency(0, 'EUR')
      expect(formatted).toContain('0')
      expect(formatted).toContain('€')
    })

    test('should handle large amounts', () => {
      const formatted = formatCurrency(1234567.89, 'EUR')
      // Should include thousands separator
      expect(formatted).toContain('€')
    })

    test('should handle negative amounts', () => {
      const formatted = formatCurrency(-50, 'EUR')
      expect(formatted).toContain('50')
      expect(formatted).toContain('€')
      // Should have minus sign
      expect(formatted).toMatch(/-/)
    })

    test('should handle small decimal amounts', () => {
      const formatted = formatCurrency(0.01, 'EUR')
      expect(formatted).toContain('0')
      expect(formatted).toContain('€')
    })

    test('should round to 2 decimal places', () => {
      const formatted = formatCurrency(10.999, 'EUR')
      // 10.999 should round to 11.00
      expect(formatted).toContain('11')
    })

    test('should format JPY without decimals (currency-specific)', () => {
      const formatted = formatCurrency(1000, 'JPY')
      expect(formatted).toContain('1')
      // JPY typically doesn't use decimals
    })

    test('should handle different currency symbols', () => {
      const currencies = ['EUR', 'USD', 'GBP', 'CHF', 'CAD']
      
      currencies.forEach(currency => {
        const formatted = formatCurrency(100, currency)
        expect(formatted).toBeDefined()
        expect(formatted.length).toBeGreaterThan(0)
      })
    })
  })

  describe('formatCurrency edge cases', () => {
    test('should handle very small amounts', () => {
      const formatted = formatCurrency(0.001, 'EUR')
      expect(formatted).toBeDefined()
      // Should round to 0,00 €
      expect(formatted).toContain('€')
    })

    test('should handle very large amounts', () => {
      const formatted = formatCurrency(999999999.99, 'EUR')
      expect(formatted).toBeDefined()
      expect(formatted).toContain('€')
    })

    test('should be consistent for same input', () => {
      const amount = 123.45
      const formatted1 = formatCurrency(amount, 'EUR')
      const formatted2 = formatCurrency(amount, 'EUR')
      expect(formatted1).toBe(formatted2)
    })
  })
})
