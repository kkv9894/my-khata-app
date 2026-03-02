import { createClient } from '@supabase/supabase-js';

// --- FIXED: Added quotes around the URL and Key ---
const supabaseUrl = 'https://knvwywragxiaignvdgmq.supabase.co'; 
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtudnd5d3JhZ3hpYWlnbnZkZ21xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzYwMTUsImV4cCI6MjA4ODA1MjAxNX0.RU5rSxYz3E5TQ9pdem56EnC1fIF1bVwNk78BYnuLoU8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- DO NOT CHANGE THE TYPES BELOW (THEY KEEP THE APP RUNNING) ---
export type Transaction = {
  id: string;
  user_id?: string;
  category_id?: string | null;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  voice_transcript?: string;
  transaction_date?: string;
  created_at?: string;
  updated_at?: string;
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
