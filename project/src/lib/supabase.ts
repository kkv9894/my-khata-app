import { createClient } from '@supabase/supabase-js'
import type {
  ProfileRecord,
  StaffAccessRecord,
  TransactionRecord,
  UdhaarCustomerRecord,
  UdhaarTransactionRecord,
} from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase environment variables are missing')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export type Transaction = TransactionRecord
export type Profile = ProfileRecord
export type StaffAccess = StaffAccessRecord
export type UdhaarCustomer = UdhaarCustomerRecord
export type UdhaarTransaction = UdhaarTransactionRecord

export type Category = {
  id: string
  user_id: string
  name: string
  type: 'income' | 'expense'
  color: string
  created_at: string
}