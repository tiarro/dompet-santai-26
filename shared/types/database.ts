export interface Database {
  public: {
    Tables: {
      transactions: {
        Row: {
          id: string
          type: 'income' | 'expense'
          title: string
          amount: number
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          type: 'income' | 'expense'
          title: string
          amount: number
          occurred_at?: string
          created_at?: string
        }
        Update: {
          type?: 'income' | 'expense'
          title?: string
          amount?: number
          occurred_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type TransactionRow = Database['public']['Tables']['transactions']['Row']
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert']
