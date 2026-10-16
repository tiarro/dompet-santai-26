export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      bill_reminders: {
        Row: { id: string; user_id: string; series_id: string; name: string; amount: number; estimated: boolean; due_on: string; recurrence: 'once' | 'monthly'; anchor_day: number; category_code: string; account_code: string; status: 'pending' | 'paid'; paid_at: string | null; revision: number; created_at: string }
        Insert: Partial<Database['public']['Tables']['bill_reminders']['Row']> & { user_id: string; name: string; amount: number; due_on: string; recurrence: 'once' | 'monthly'; anchor_day: number; category_code: string; account_code: string }
        Update: Partial<Database['public']['Tables']['bill_reminders']['Row']>
        Relationships: []
      }
      profiles: {
        Row: { id: string; username: string; bio: string; gender: string; onboarding_goal: string; payday: string; onboarding_balance: number; onboarding_accounts: string[]; onboarding_completed_at: string | null; created_at: string; updated_at: string }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string }
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
        Relationships: []
      }
      user_settings: {
        Row: { user_id: string; theme: 'light' | 'dark' | 'system'; notes_reminders: boolean; reminder_time: string; savings_reminders: boolean; revision: number; updated_at: string }
        Insert: Partial<Database['public']['Tables']['user_settings']['Row']> & { user_id: string }
        Update: Partial<Database['public']['Tables']['user_settings']['Row']>
        Relationships: []
      }
      wallets: {
        Row: { user_id: string; code: string; opening_balance: number; active: boolean; updated_at: string }
        Insert: Partial<Database['public']['Tables']['wallets']['Row']> & { user_id: string; code: string }
        Update: Partial<Database['public']['Tables']['wallets']['Row']>
        Relationships: []
      }
      categories: {
        Row: { id: string; user_id: string; type: 'income' | 'expense'; code: string; label: string; icon: string; archived: boolean; is_system: boolean; updated_at: string }
        Insert: Partial<Database['public']['Tables']['categories']['Row']> & { user_id: string; type: 'income' | 'expense'; code: string; label: string; icon: string }
        Update: Partial<Database['public']['Tables']['categories']['Row']>
        Relationships: []
      }
      transactions: {
        Row: { id: string; user_id: string; type: 'income' | 'expense'; amount: number; category_type: 'income' | 'expense'; category_code: string; account_code: string; occurred_on: string; description: string; receipt_name: string | null; receipt_path: string | null; revision: number; created_at: string; updated_at: string }
        Insert: Partial<Database['public']['Tables']['transactions']['Row']> & { id: string; user_id: string; type: 'income' | 'expense'; amount: number; category_type: 'income' | 'expense'; category_code: string; account_code: string; occurred_on: string }
        Update: Partial<Database['public']['Tables']['transactions']['Row']>
        Relationships: []
      }
      budgets: {
        Row: { id: string; user_id: string; month_start: string; category_code: string; limit_amount: number; default_account: string | null; updated_at: string }
        Insert: Partial<Database['public']['Tables']['budgets']['Row']> & { user_id: string; month_start: string; category_code: string; limit_amount: number }
        Update: Partial<Database['public']['Tables']['budgets']['Row']>
        Relationships: []
      }
      savings_goals: {
        Row: { id: string; user_id: string; name: string; target: number; icon: string; deadline: string | null; reminder_day: number; archived: boolean; deleted: boolean; revision: number; created_at: string; updated_at: string }
        Insert: Partial<Database['public']['Tables']['savings_goals']['Row']> & { id: string; user_id: string; name: string; target: number; icon: string }
        Update: Partial<Database['public']['Tables']['savings_goals']['Row']>
        Relationships: []
      }
      savings_movements: {
        Row: { id: string; user_id: string; goal_id: string; direction: 'deposit' | 'withdraw'; amount: number; account_code: string; movement_date: string; description: string; created_at: string }
        Insert: Partial<Database['public']['Tables']['savings_movements']['Row']> & { id: string; user_id: string; goal_id: string; direction: 'deposit' | 'withdraw'; amount: number; account_code: string; movement_date: string }
        Update: Partial<Database['public']['Tables']['savings_movements']['Row']>
        Relationships: []
      }
      finance_migrations: {
        Row: { user_id: string; version: number; source_fingerprint: string; status: 'completed' | 'failed'; counts: Json; completed_at: string | null }
        Insert: Partial<Database['public']['Tables']['finance_migrations']['Row']> & { user_id: string; version: number; source_fingerprint: string; status: 'completed' | 'failed' }
        Update: Partial<Database['public']['Tables']['finance_migrations']['Row']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      complete_bill_reminder: { Args: { bill_id: string; expected_revision: number }; Returns: Json }
      get_finance_snapshot: { Args: Record<string, never>; Returns: Json }
      replace_finance_snapshot: { Args: { payload: Json }; Returns: Json }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type TransactionRow = Database['public']['Tables']['transactions']['Row']
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert']

