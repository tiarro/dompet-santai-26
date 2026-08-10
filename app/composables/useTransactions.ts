import type { Database, TransactionInsert, TransactionRow } from '#shared/types/database'

export function useTransactions() {
  const supabase = useSupabaseClient<Database>()

  const list = async (): Promise<TransactionRow[]> => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('occurred_at', { ascending: false })

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
