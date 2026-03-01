/*
  # Business Management Schema for Indian SMEs

  ## Overview
  This migration creates the foundational schema for a voice-enabled business management application
  tailored for Indian small and medium enterprises.

  ## New Tables

  ### 1. `profiles`
  User profile information extending Supabase auth.users
  - `id` (uuid, primary key) - Links to auth.users
  - `business_name` (text) - Name of the business
  - `phone` (text) - Contact phone number
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. `categories`
  Transaction categories for organizing business entries
  - `id` (uuid, primary key)
  - `user_id` (uuid) - Owner of the category
  - `name` (text) - Category name (e.g., "Sales", "Rent", "Supplies")
  - `type` (text) - Either "income" or "expense"
  - `color` (text) - Display color for UI
  - `created_at` (timestamptz)

  ### 3. `transactions`
  Core business transactions (income and expenses)
  - `id` (uuid, primary key)
  - `user_id` (uuid) - Transaction owner
  - `category_id` (uuid) - Related category
  - `amount` (numeric) - Transaction amount in INR
  - `type` (text) - "income" or "expense"
  - `description` (text) - Transaction description
  - `voice_transcript` (text) - Original voice input (optional)
  - `transaction_date` (date) - When transaction occurred
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 4. `voice_logs`
  Audit trail of all voice inputs
  - `id` (uuid, primary key)
  - `user_id` (uuid) - User who made the voice entry
  - `transcript` (text) - Voice transcription
  - `processed` (boolean) - Whether it was successfully processed
  - `created_at` (timestamptz)

  ## Security

  All tables have Row Level Security (RLS) enabled with the following policies:

  ### profiles
  - Users can view and update only their own profile
  - Users can insert their own profile on signup

  ### categories
  - Users can perform all operations on their own categories only

  ### transactions
  - Users can perform all operations on their own transactions only

  ### voice_logs
  - Users can view and insert their own voice logs only

  ## Notes
  - All monetary amounts are stored as numeric type for precision
  - Default categories are not pre-populated (will be created by user)
  - Timestamps use Indian Standard Time (IST) in application layer
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text DEFAULT '',
  phone text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  color text DEFAULT '#FF6B35',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own categories"
  ON categories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON categories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  description text DEFAULT '',
  voice_transcript text,
  transaction_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create voice_logs table
CREATE TABLE IF NOT EXISTS voice_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript text NOT NULL,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE voice_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voice logs"
  ON voice_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own voice logs"
  ON voice_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_voice_logs_user_id ON voice_logs(user_id);
