import { describe, expect, test, beforeAll } from 'bun:test'
import { hashPassword, verifyPassword, generateToken, verifyToken, type JWTPayload } from '../src/lib/auth'

describe('Auth Module', () => {
  describe('hashPassword', () => {
    test('should hash a password', async () => {
      const password = 'mySecurePassword123'
      const hash = await hashPassword(password)
      
      expect(hash).toBeDefined()
      expect(hash).not.toBe(password)
      expect(hash.length).toBeGreaterThan(20)
    })

    test('should generate different hashes for same password (due to salt)', async () => {
      const password = 'samePassword'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)
      
      expect(hash1).not.toBe(hash2)
    })

    test('should handle empty password', async () => {
      const hash = await hashPassword('')
      expect(hash).toBeDefined()
      expect(hash.length).toBeGreaterThan(0)
    })

    test('should handle special characters', async () => {
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      const hash = await hashPassword(password)
      expect(hash).toBeDefined()
    })

    test('should handle unicode characters', async () => {
      const password = 'パスワード🔐'
      const hash = await hashPassword(password)
      expect(hash).toBeDefined()
    })
  })

  describe('verifyPassword', () => {
    test('should return true for correct password', async () => {
      const password = 'correctPassword123'
      const hash = await hashPassword(password)
      
      const isValid = await verifyPassword(password, hash)
      expect(isValid).toBe(true)
    })

    test('should return false for incorrect password', async () => {
      const password = 'correctPassword123'
      const wrongPassword = 'wrongPassword456'
      const hash = await hashPassword(password)
      
      const isValid = await verifyPassword(wrongPassword, hash)
      expect(isValid).toBe(false)
    })

    test('should be case sensitive', async () => {
      const password = 'CaseSensitive'
      const hash = await hashPassword(password)
      
      const isValid = await verifyPassword('casesensitive', hash)
      expect(isValid).toBe(false)
    })

    test('should handle whitespace correctly', async () => {
      const password = 'password with spaces'
      const hash = await hashPassword(password)
      
      expect(await verifyPassword('password with spaces', hash)).toBe(true)
      expect(await verifyPassword('passwordwithspaces', hash)).toBe(false)
      expect(await verifyPassword(' password with spaces', hash)).toBe(false)
    })
  })

  describe('generateToken', () => {
    test('should generate a valid JWT token', () => {
      const payload: JWTPayload = {
        userId: 'user-123',
        email: 'test@example.com',
      }
      
      const token = generateToken(payload)
      
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      // JWT has 3 parts separated by dots
      expect(token.split('.').length).toBe(3)
    })

    test('should include payload data in token', () => {
      const payload: JWTPayload = {
        userId: 'user-456',
        email: 'user@test.com',
      }
      
      const token = generateToken(payload)
      const decoded = verifyToken(token)
      
      expect(decoded).not.toBeNull()
      expect(decoded?.userId).toBe(payload.userId)
      expect(decoded?.email).toBe(payload.email)
    })

    test('should generate different tokens for different payloads', () => {
      const token1 = generateToken({ userId: 'user-1', email: 'a@test.com' })
      const token2 = generateToken({ userId: 'user-2', email: 'b@test.com' })
      
      expect(token1).not.toBe(token2)
    })
  })

  describe('verifyToken', () => {
    test('should verify a valid token', () => {
      const payload: JWTPayload = {
        userId: 'verify-user',
        email: 'verify@example.com',
      }
      
      const token = generateToken(payload)
      const decoded = verifyToken(token)
      
      expect(decoded).not.toBeNull()
      expect(decoded?.userId).toBe(payload.userId)
      expect(decoded?.email).toBe(payload.email)
    })

    test('should return null for invalid token', () => {
      const decoded = verifyToken('invalid.token.here')
      expect(decoded).toBeNull()
    })

    test('should return null for empty token', () => {
      const decoded = verifyToken('')
      expect(decoded).toBeNull()
    })

    test('should return null for malformed token', () => {
      const decoded = verifyToken('not-a-jwt')
      expect(decoded).toBeNull()
    })

    test('should return null for tampered token', () => {
      const payload: JWTPayload = {
        userId: 'user-id',
        email: 'email@test.com',
      }
      
      const token = generateToken(payload)
      // Tamper with the token by modifying a character
      const tamperedToken = token.slice(0, -5) + 'XXXXX'
      
      const decoded = verifyToken(tamperedToken)
      expect(decoded).toBeNull()
    })
  })

  describe('Password + Token Integration', () => {
    test('full authentication flow', async () => {
      // 1. Hash password at registration
      const rawPassword = 'UserPassword123!'
      const hashedPassword = await hashPassword(rawPassword)
      
      // 2. Verify password at login
      const isPasswordValid = await verifyPassword(rawPassword, hashedPassword)
      expect(isPasswordValid).toBe(true)
      
      // 3. Generate token after successful login
      const payload: JWTPayload = {
        userId: 'integration-user',
        email: 'integration@test.com',
      }
      const token = generateToken(payload)
      
      // 4. Verify token for authenticated requests
      const decoded = verifyToken(token)
      expect(decoded).not.toBeNull()
      expect(decoded?.userId).toBe(payload.userId)
    })
  })
})
