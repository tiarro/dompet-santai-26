import type { Database, TransactionInsert, TransactionRow } from '#shared/types/database'

// Compatibility access for callers that need the normalized transactions table.
// The application ledger itself uses useCloudFinance() so the snapshot RPC remains
// the single read/write path for the complete finance state.
export function useTransactions() {
  const supabase = useSupabaseClient<Database>()

  const list = async (): Promise<TransactionRow[]> => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  }

  const create = async (transaction: TransactionInsert): Promise<TransactionRow> => {
    const { data, error } = await supabase
      .from('transactions')
      .insert(transaction)
      .select()
      .single()

    if (error) throw error
    return data
  }

  return { list, create }
}