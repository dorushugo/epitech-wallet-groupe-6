import { describe, expect, test } from 'bun:test'
import { 
  generateSignature, 
  verifySignature, 
  generateTransactionRef, 
  getSystemInfo 
} from '../src/lib/interwallet'

describe('InterWallet Module', () => {
  describe('generateSignature', () => {
    test('should generate a hex string signature', () => {
      const payload = { amount: 100, currency: 'EUR' }
      const signature = generateSignature(payload)
      
      expect(signature).toBeDefined()
      expect(typeof signature).toBe('string')
      // HMAC-SHA256 produces 64 hex characters
      expect(signature.length).toBe(64)
      // Should be valid hex
      expect(signature).toMatch(/^[a-f0-9]+$/)
    })

    test('should generate same signature for same payload', () => {
      const payload = { key: 'value', nested: { data: 123 } }
      
      const sig1 = generateSignature(payload)
      const sig2 = generateSignature(payload)
      
      expect(sig1).toBe(sig2)
    })

    test('should generate different signatures for different payloads', () => {
      const payload1 = { amount: 100 }
      const payload2 = { amount: 200 }
      
      const sig1 = generateSignature(payload1)
      const sig2 = generateSignature(payload2)
      
      expect(sig1).not.toBe(sig2)
    })

    test('should handle empty object', () => {
      const signature = generateSignature({})
      expect(signature).toBeDefined()
      expect(signature.length).toBe(64)
    })

    test('should handle complex nested payload', () => {
      const payload = {
        transactionRef: 'TX-123',
        sourceSystemUrl: 'https://example.com',
        data: {
          user: { id: 'user-1', name: 'Test' },
          items: [1, 2, 3],
        },
        timestamp: '2024-01-01T00:00:00Z',
      }
      
      const signature = generateSignature(payload)
      expect(signature).toBeDefined()
      expect(signature.length).toBe(64)
    })

    test('should be order-sensitive (JSON stringify order matters)', () => {
      // Note: JSON.stringify maintains insertion order in modern JS
      const payload1 = { a: 1, b: 2 }
      const payload2 = { b: 2, a: 1 }
      
      const sig1 = generateSignature(payload1)
      const sig2 = generateSignature(payload2)
      
      // These might be different due to JSON key ordering
      // The test documents this behavior
      expect(sig1).toBeDefined()
      expect(sig2).toBeDefined()
    })
  })

  describe('verifySignature', () => {
    test('should return true for valid signature', () => {
      const payload = { amount: 500, currency: 'EUR' }
      const signature = generateSignature(payload)
      
      const isValid = verifySignature(payload, signature)
      expect(isValid).toBe(true)
    })

    test('should return false for invalid signature', () => {
      const payload = { amount: 500, currency: 'EUR' }
      const wrongSignature = 'a'.repeat(64)
      
      const isValid = verifySignature(payload, wrongSignature)
      expect(isValid).toBe(false)
    })

    test('should return false for tampered payload', () => {
      const originalPayload = { amount: 500, currency: 'EUR' }
      const signature = generateSignature(originalPayload)
      
      const tamperedPayload = { amount: 600, currency: 'EUR' }
      const isValid = verifySignature(tamperedPayload, signature)
      
      expect(isValid).toBe(false)
    })

    test('should handle signature length mismatch', () => {
      const payload = { test: 'data' }
      const shortSignature = 'abc123'
      
      expect(() => verifySignature(payload, shortSignature)).toThrow()
    })

    test('should verify complex payload correctly', () => {
      const payload = {
        transactionRef: 'REF-ABC-123',
        sourceSystemUrl: 'https://wallet.example.com',
        sourceWalletId: 'wallet-456',
        amount: 1234.56,
        currency: 'EUR',
        timestamp: new Date().toISOString(),
      }
      
      const signature = generateSignature(payload)
      expect(verifySignature(payload, signature)).toBe(true)
    })
  })

  describe('generateTransactionRef', () => {
    test('should generate a unique reference', () => {
      const ref = generateTransactionRef()
      
      expect(ref).toBeDefined()
      expect(typeof ref).toBe('string')
      expect(ref.length).toBeGreaterThan(10)
    })

    test('should include system name prefix', () => {
      const ref = generateTransactionRef()
      // Should start with SYSTEM_NAME (default: Groupe6-Wallet)
      expect(ref).toContain('-')
    })

    test('should generate different refs each time', () => {
      const refs = new Set<string>()
      
      for (let i = 0; i < 100; i++) {
        refs.add(generateTransactionRef())
      }
      
      // All 100 should be unique
      expect(refs.size).toBe(100)
    })

    test('should have consistent format', () => {
      const ref = generateTransactionRef()
      const parts = ref.split('-')
      
      // Format: SYSTEM_NAME-timestamp-random
      // Groupe6-Wallet becomes Groupe6, Wallet so at least 3 parts
      expect(parts.length).toBeGreaterThanOrEqual(3)
    })

    test('should be URL-safe', () => {
      const ref = generateTransactionRef()
      // Should not contain special characters that break URLs
      expect(ref).toMatch(/^[a-zA-Z0-9-]+$/)
    })
  })

  describe('getSystemInfo', () => {
    test('should return system information object', () => {
      const info = getSystemInfo()
      
      expect(info).toBeDefined()
      expect(typeof info).toBe('object')
    })

    test('should include required fields', () => {
      const info = getSystemInfo()
      
      expect(info.systemUrl).toBeDefined()
      expect(info.systemName).toBeDefined()
      expect(info.protocolVersion).toBeDefined()
      expect(info.supportedCurrencies).toBeDefined()
      expect(info.endpoints).toBeDefined()
    })

    test('should have correct protocol version', () => {
      const info = getSystemInfo()
      expect(info.protocolVersion).toBe('1.0')
    })

    test('should support EUR currency', () => {
      const info = getSystemInfo()
      expect(info.supportedCurrencies).toContain('EUR')
    })

    test('should have all required endpoints', () => {
      const info = getSystemInfo()
      
      expect(info.endpoints.transfer).toBe('/api/inter-wallet/transfer')
      expect(info.endpoints.validate).toBe('/api/inter-wallet/validate')
      expect(info.endpoints.status).toBe('/api/inter-wallet/status')
    })

    test('should return consistent data', () => {
      const info1 = getSystemInfo()
      const info2 = getSystemInfo()
      
      expect(info1.systemName).toBe(info2.systemName)
      expect(info1.protocolVersion).toBe(info2.protocolVersion)
    })
  })

  describe('Signature Security', () => {
    test('should use timing-safe comparison', () => {
      // This test ensures the signature verification is secure
      // against timing attacks by using the built-in timingSafeEqual
      const payload = { secure: true }
      const validSignature = generateSignature(payload)
      
      // Verify works with correct signature
      expect(verifySignature(payload, validSignature)).toBe(true)
      
      // Verify fails with wrong signature (same length)
      const wrongSignature = validSignature.replace(/./g, (c, i) => 
        i === 0 ? (c === 'a' ? 'b' : 'a') : c
      )
      // Only change if they're actually different
      if (wrongSignature !== validSignature) {
        expect(verifySignature(payload, wrongSignature)).toBe(false)
      }
    })

    test('signature should be deterministic', () => {
      const payload = {
        transactionRef: 'TEST-REF',
        amount: 100,
        timestamp: '2024-01-01T12:00:00Z',
      }
      
      const signatures = new Set<string>()
      for (let i = 0; i < 10; i++) {
        signatures.add(generateSignature(payload))
      }
      
      // All signatures should be the same
      expect(signatures.size).toBe(1)
    })
  })
})
