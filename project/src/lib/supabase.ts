import { createClient } from '@supabase/supabase-js';

// Hardcoded keys to ensure Netlify Drop connects correctly
const supabaseUrl = 'https://fkprqyviozvkpvshdmox.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcHJxeXZpb3p2a3B2c2hkbW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDI5NjUsImV4cCI6MjA4NzYxODk2NX0.TRjHFrYYIMxHIC5q6xDXjYksk0X-rVYHXia_gsTugS8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- KEEP THESE TYPES BELOW SO YOUR APP DOESN'T BREAK ---
export type Transaction = {
  id: string;
  user_id: string;
  category_id: string | null;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  voice_transcript?: string;
  transaction_date: string;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  created_at: string;
};

export type Profile = {
  id: string;
  business_name: string;
  phone: string;
  created_at: string;
  updated_at: string;
};