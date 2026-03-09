export type SupportedLanguage = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml';

export type TransactionType = 'income' | 'expense';
export type TransactionCategoryLabel =
  | 'Food'
  | 'Fuel'
  | 'Salary'
  | 'Rent'
  | 'Sales'
  | 'Shopping'
  | 'Groceries'
  | 'Transport'
  | 'Healthcare'
  | 'Utilities'
  | 'Entertainment'
  | 'Education'
  | 'General';

export interface TransactionRecord {
  id: string;
  user_id: string;
  category_id: string | null;
  category_label: TransactionCategoryLabel | null;
  amount: number;
  type: TransactionType;
  description: string;
  voice_transcript: string | null;
  transaction_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type RoleKind = 'owner' | 'staff';

export interface ProfileRecord {
  id: string;
  business_name: string;
  full_name: string;
  shop_name: string;
  phone: string;
  role: RoleKind;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffAccessRecord {
  id: string;
  owner_id: string;
  staff_email: string;
  staff_user_id: string | null;
  status: 'pending' | 'active' | 'revoked';
  created_at: string;
  updated_at: string;
}

export interface UdhaarCustomerRecord {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  total_credit: number;
  total_paid: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface UdhaarTransactionRecord {
  id: string;
  customer_id: string;
  user_id: string;
  type: 'credit' | 'payment';
  amount: number;
  note: string;
  created_at: string;
}

export interface PendingSaveResult {
  success: boolean;
  offline?: boolean;
  error?: string;
}
