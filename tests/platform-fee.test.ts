import { describe, expect, test } from 'bun:test'
import { calculatePlatformFee, applyPlatformFee } from '../src/lib/platform-fee'
import { Decimal } from '@prisma/client/runtime/library'

describe('Platform Fee Module', () => {
  describe('calculatePlatformFee', () => {
    test('should calculate 1% fee for a standard amount', () => {
      const fee = calculatePlatformFee(100)
      expect(fee).toBe(1)
    })

    test('should calculate 1% fee for a large amount', () => {
      const fee = calculatePlatformFee(10000)
      expect(fee).toBe(100)
    })

    test('should return 0 for zero amount', () => {
      const fee = calculatePlatformFee(0)
      expect(fee).toBe(0)
    })

    test('should round to 2 decimal places', () => {
      // 123.45 * 0.01 = 1.2345 → arrondi à 1.23
      const fee = calculatePlatformFee(123.45)
      expect(fee).toBe(1.23)
    })

    test('should handle Decimal type from Prisma', () => {
      const decimalAmount = new Decimal(500)
      const fee = calculatePlatformFee(decimalAmount)
      expect(fee).toBe(5)
    })

    test('should handle small amounts correctly', () => {
      // 0.50 * 0.01 = 0.005 → arrondi à 0.01
      const fee = calculatePlatformFee(0.5)
      expect(fee).toBe(0.01)
    })

    test('should handle amounts with many decimals', () => {
      // 99.99 * 0.01 = 0.9999 → arrondi à 1.00
      const fee = calculatePlatformFee(99.99)
      expect(fee).toBe(1)
    })
  })

  describe('applyPlatformFee', () => {
    test('should return correct net amount and fee for 100€', () => {
      const result = applyPlatformFee(100)
      expect(result.fee).toBe(1)
      expect(result.netAmount).toBe(99)
    })

    test('should return correct net amount and fee for 1000€', () => {
      const result = applyPlatformFee(1000)
      expect(result.fee).toBe(10)
      expect(result.netAmount).toBe(990)
    })

    test('should return zero fee for zero amount', () => {
      const result = applyPlatformFee(0)
      expect(result.fee).toBe(0)
      expect(result.netAmount).toBe(0)
    })

    test('should handle Decimal type from Prisma', () => {
      const decimalAmount = new Decimal(250)
      const result = applyPlatformFee(decimalAmount)
      expect(result.fee).toBe(2.5)
      expect(result.netAmount).toBe(247.5)
    })

    test('should ensure netAmount + fee = original amount', () => {
      const original = 567.89
      const result = applyPlatformFee(original)
      // Due to rounding, we check with tolerance
      expect(result.fee + result.netAmount).toBeCloseTo(original, 2)
    })

    test('should handle edge case with very small amount', () => {
      const result = applyPlatformFee(1)
      expect(result.fee).toBe(0.01)
      expect(result.netAmount).toBe(0.99)
    })
  })
})
