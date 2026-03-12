import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthError, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AccountType = 'personal' | 'business'

interface AuthContextType {
  user: User | null
  loading: boolean
  accountType: AccountType
  signUp: (
    email: string,
    password: string,
    businessName: string,
    phone: string,
    accountType?: AccountType
  ) => Promise<{ error: AuthError | Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const accountType: AccountType =
    (user?.user_metadata?.account_type as AccountType) ?? 'business'

  useEffect(() => {
    let isMounted = true

    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!isMounted) return

      setUser(session?.user ?? null)
      setLoading(false)
    }

    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signUp = async (
    email: string,
    password: string,
    businessName: string,
    phone: string,
    accountType: AccountType = 'business'
  ) => {
    const cleanEmail = email.trim().toLowerCase()
    const cleanBusinessName = businessName.trim() || cleanEmail.split('@')[0]
    const cleanPhone = phone.trim()

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanBusinessName,
          account_type: accountType,
        },
      },
    })

    if (error) {
      return { error }
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: cleanBusinessName,
        phone: cleanPhone,
        role: 'owner',
        owner_id: null,
      })

      if (profileError) {
        return { error: new Error(profileError.message) }
      }
    }

    return { error: null }
  }

  const signIn = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })
    return { error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  return (
    <AuthContext.Provider value={{ user, loading, accountType, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}