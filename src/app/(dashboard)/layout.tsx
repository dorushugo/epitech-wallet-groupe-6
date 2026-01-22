'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { User, LogOut, ChevronDown } from 'lucide-react'

interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
}

interface Wallet {
  id: string
  name: string
  balance: number
  currency: string
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [totalBalanceInEUR, setTotalBalanceInEUR] = useState<number | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include', // Inclure les cookies dans la requête
        cache: 'no-store', // Ne pas mettre en cache pour toujours vérifier la session
      })
      
      if (!res.ok) {
        // Si 401, rediriger vers login
        if (res.status === 401) {
          router.push('/login')
          return
        }
        throw new Error('Failed to fetch user')
      }

      const data = await res.json()

      if (data.success) {
        setUser(data.user)
        setWallets(data.wallets || [])
      } else {
        router.push('/login')
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
      // Ne pas rediriger immédiatement en cas d'erreur réseau
      // Laisser l'utilisateur voir la page avec un état de chargement
      // Seulement rediriger si c'est vraiment une erreur d'auth
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (wallets.length > 0) {
      calculateTotalBalance()
    } else {
      setTotalBalanceInEUR(0)
    }
  }, [wallets])

  const calculateTotalBalance = async () => {
    try {
      // Convertir tous les soldes en EUR
      const conversions = await Promise.all(
        wallets.map(async (wallet) => {
          if (wallet.currency === 'EUR') {
            return wallet.balance
          }
          try {
            const response = await fetch(
              `/api/currency/convert?amount=${wallet.balance}&from=${wallet.currency}&to=EUR`
            )
            const data = await response.json()
            if (data.success) {
              return data.convertedAmount
            }
            return 0
          } catch (error) {
            console.error(`Failed to convert ${wallet.currency} to EUR:`, error)
            return 0
          }
        })
      )
      const total = conversions.reduce((sum, amount) => sum + amount, 0)
      setTotalBalanceInEUR(total)
    } catch (error) {
      console.error('Failed to calculate total balance:', error)
      // Fallback: additionner seulement les EUR
      const total = wallets
        .filter((w) => w.currency === 'EUR')
        .reduce((sum, w) => sum + w.balance, 0)
      setTotalBalanceInEUR(total)
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserMenu])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/wallets', label: 'Wallets', icon: '💰' },
    { href: '/transactions', label: 'Transactions', icon: '📋' },
    { href: '/inter-wallet', label: 'Inter-Wallet', icon: '🌐', beta: true },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold">W</span>
                </div>
                <span className="font-bold text-gray-900">Digital Wallet</span>
              </Link>

              <nav className="hidden md:flex gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1 ${
                      pathname === item.href
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {item.beta && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-semibold">
                        BETA
                      </span>
                    )}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {totalBalanceInEUR !== null
                    ? totalBalanceInEUR.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
                    : '...'}
                </p>
              </div>
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
                >
                  <User className="w-5 h-5" />
                  <span className="hidden sm:inline">{user?.firstName || user?.email?.split('@')[0]}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">{user?.firstName || 'Utilisateur'}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <nav className="md:hidden bg-white border-b border-gray-200 px-4 py-2 flex gap-2 overflow-x-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex items-center gap-1 ${
              pathname === item.href
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.beta && (
              <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-semibold">
                BETA
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
