import { createHash } from 'node:crypto'
import type { Page } from '@playwright/test'

type SnapshotPayload = Record<string, any>

const expenseCategories = [
  ['food', 'Makan & Minum', 'restaurant'],
  ['transport', 'Transportasi', 'directions_car'],
  ['shopping', 'Belanja', 'shopping_bag'],
  ['bills', 'Tagihan', 'receipt_long'],
  ['entertainment', 'Hiburan', 'movie'],
  ['other', 'Lainnya', 'more_horiz'],
] as const
const incomeCategories = [
  ['salary', 'Gaji', 'work'],
  ['bonus', 'Bonus', 'redeem'],
  ['business', 'Usaha', 'storefront'],
  ['other', 'Lainnya', 'more_horiz'],
] as const

function dataUrlBuffer(dataUrl: string) {
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
}

function wireFromLegacy(raw: Record<string, string | null>, owner: string): SnapshotPayload {
  const settings = raw.settings ? JSON.parse(raw.settings) : {
    openingBalances: { cash: 450000, bank: 6500000, ewallet: 1500000, savings: 0 },
    activeAccounts: ['cash', 'bank', 'ewallet'],
    theme: 'system',
    reminders: { notes: false, time: '20:00', savings: true },
    revision: 0,
  }
  const notes = raw.notes ? JSON.parse(raw.notes) : []
  const budgets = raw.budgets ? JSON.parse(raw.budgets) : []
  const custom = raw.categories ? JSON.parse(raw.categories) : []
  const savings = raw.savings ? JSON.parse(raw.savings) : { version: 1, goals: [], movements: [] }
  const categories = [
    ...expenseCategories.map(([code, label, icon]) => ({ type: 'expense', code, label, icon, is_system: true })),
    ...incomeCategories.map(([code, label, icon]) => ({ type: 'income', code, label, icon, is_system: true })),
    ...custom.map((item: any) => ({ type: item.type, code: item.id, label: item.label, icon: item.icon, archived: !!item.archived, is_system: false })),
  ]
  return {
    profile: { id: owner, username: 'Rani', bio: '', gender: '', onboarding_goal: 'all', payday: '25', onboarding_balance: 8450000, onboarding_accounts: ['cash', 'bank', 'ewallet'], onboarding_completed_at: '2026-01-01T00:00:00Z' },
    settings: {
      theme: settings.theme ?? 'system',
      notes_reminders: !!settings.reminders?.notes,
      reminder_time: (settings.reminders?.time ?? '20:00') + ':00',
      savings_reminders: settings.reminders?.savings !== false,
      revision: settings.revision ?? 0,
    },
    wallets: Object.entries(settings.openingBalances ?? {}).map(([code, opening_balance]) => ({
      code, opening_balance, active: (settings.activeAccounts ?? []).includes(code),
    })),
    categories,
    transactions: notes.map((note: any) => ({
      id: note.id, type: note.type, amount: note.amount, category_type: note.type, category_code: note.category,
      account_code: note.account, occurred_on: note.date, description: note.description ?? '',
      receipt_name: note.receipt?.name ?? null, receipt_path: note.receipt ? owner + '/' + note.id + '.jpg' : null,
      revision: 1, created_at: note.createdAt,
    })),
    budgets: budgets.map((budget: any) => ({
      month_start: budget.month + '-01', category_code: budget.category, limit_amount: budget.limit,
      default_account: budget.defaultAccount ?? null,
    })),
    goals: (savings.goals ?? []).map((goal: any) => ({
      id: goal.id, name: goal.name, target: goal.target, icon: goal.icon, deadline: goal.deadline || null,
      reminder_day: goal.reminderDay ?? 0, archived: !!goal.archived, deleted: !!goal.deleted,
      revision: goal.revision ?? 1, created_at: goal.createdAt,
    })),
    movements: (savings.movements ?? []).map((movement: any) => ({
      id: movement.id, goal_id: movement.goalId, direction: movement.direction, amount: movement.amount,
      account_code: movement.account, movement_date: movement.date, description: movement.description ?? '',
      created_at: movement.createdAt,
    })),
  }
}

function withFingerprint(snapshot: SnapshotPayload) {
  return { ...snapshot, _meta: { fingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') } }
}

function wireFromPayload(payload: SnapshotPayload, owner: string) {
  return {
    ...payload,
    profile: {
      ...(payload.profile ?? {}),
      id: owner,
      onboarding_completed_at: payload.profile?.onboarding_completed ? new Date().toISOString() : null,
    },
  }
}

async function legacyRaw(page: Page, owner: string) {
  return page.evaluate(id => {
    const read = (kind: string) => localStorage.getItem('dompet-santai-' + kind + '-v1:' + id)
    return {
      notes: read('notes'), budgets: read('budgets'), categories: read('categories'),
      savings: read('savings'), settings: read('settings'),
    }
  }, owner)
}

async function mirrorPayload(page: Page, payload: SnapshotPayload, owner: string, receiptData: Map<string, Buffer>) {
  const transactions = payload.transactions ?? []
  const receipts = transactions.map((item: any) => {
    const body = receiptData.get(String(item.receipt_path ?? ''))
    return {
      name: item.receipt_name,
      dataUrl: body ? 'data:image/jpeg;base64,' + body.toString('base64') : undefined,
    }
  })
  await page.evaluate(({ payload, owner, receipts }) => {
    const write = (kind: string, value: unknown) => localStorage.setItem('dompet-santai-' + kind + '-v1:' + owner, JSON.stringify(value))
    write('notes', (payload.transactions ?? []).map((item: any, index: number) => ({
      id: item.id, type: item.type, amount: Number(item.amount), category: item.category_code,
      account: item.account_code, date: item.occurred_on, description: item.description ?? '',
      createdAt: item.created_at, ...(receipts[index]?.dataUrl ? { receipt: { name: receipts[index].name, dataUrl: receipts[index].dataUrl } } : {}),
    })))
    write('budgets', (payload.budgets ?? []).map((item: any) => ({
      month: String(item.month_start).slice(0, 7), category: item.category_code, limit: Number(item.limit_amount),
      ...(item.default_account ? { defaultAccount: item.default_account } : {}),
    })))
    write('categories', (payload.categories ?? []).filter((item: any) => !item.is_system).map((item: any) => ({
      id: item.code, type: item.type, label: item.label, icon: item.icon, ...(item.archived ? { archived: true } : {}),
    })))
    write('savings', {
      version: 1,
      goals: (payload.goals ?? []).map((item: any) => ({
        id: item.id, name: item.name, target: Number(item.target), icon: item.icon, deadline: item.deadline ?? '',
        reminderDay: Number(item.reminder_day) || 0, archived: !!item.archived, deleted: !!item.deleted,
        revision: Number(item.revision) || 1, createdAt: item.created_at,
      })),
      movements: (payload.movements ?? []).map((item: any) => ({
        id: item.id, goalId: item.goal_id, direction: item.direction, amount: Number(item.amount),
        account: item.account_code, date: item.movement_date, description: item.description ?? '', createdAt: item.created_at,
      })),
    })
    const wallets = Object.fromEntries((payload.wallets ?? []).map((item: any) => [item.code, Number(item.opening_balance)]))
    const activeAccounts = (payload.wallets ?? []).filter((item: any) => item.active).map((item: any) => item.code)
    write('settings', {
      version: 1, revision: Number(payload.settings?.revision) || 0, openingBalances: wallets,
      activeAccounts: activeAccounts.length ? activeAccounts : ['cash', 'bank', 'ewallet'],
      theme: payload.settings?.theme ?? 'system',
      reminders: {
        notes: !!payload.settings?.notes_reminders,
        time: String(payload.settings?.reminder_time ?? '20:00').slice(0, 5),
        savings: payload.settings?.savings_reminders !== false,
      },
    })
  }, { payload, owner, receipts })
}

export async function mockFinanceApi(page: Page, owner: string) {
  const receipts = new Map<string, Buffer>()
  await page.route('**/rest/v1/rpc/get_finance_snapshot', async route => {
    try {
      const raw = await legacyRaw(page, owner)
      const snapshot = wireFromLegacy(raw, owner)
      for (const note of JSON.parse(raw.notes ?? '[]')) {
        if (note.receipt?.dataUrl) receipts.set(owner + '/' + note.id + '.jpg', dataUrlBuffer(note.receipt.dataUrl))
      }
      await route.fulfill({ json: withFingerprint(snapshot) })
    } catch {
      await route.fulfill({ status: 500, json: { message: 'Catatan di browser belum bisa dibaca.' } })
    }
  })
  await page.route('**/rest/v1/rpc/replace_finance_snapshot', async route => {
    const body = route.request().postDataJSON()
    const payload = body.payload as SnapshotPayload
    if (!payload || !payload._meta?.expected_fingerprint) { await route.fulfill({ status: 400, json: { message: 'RPC requires payload and fingerprint' } }); return }
    const current = withFingerprint(wireFromLegacy(await legacyRaw(page, owner), owner))
    if (payload._meta.expected_fingerprint !== current._meta.fingerprint) { await route.fulfill({ status: 409, json: { code: '40001', message: 'Cloud changed' } }); return }
    try {
      await mirrorPayload(page, payload, owner, receipts)
      const raw = await legacyRaw(page, owner)
      // The legacy adapter returns owner/note-id.jpg paths. Make uploaded
      // bytes available at those paths before the write response is mapped.
      for (const note of JSON.parse(raw.notes ?? '[]')) {
        if (note.receipt?.dataUrl) receipts.set(owner + '/' + note.id + '.jpg', dataUrlBuffer(note.receipt.dataUrl))
      }
      await route.fulfill({ json: withFingerprint(wireFromLegacy(raw, owner)) })
    } catch {
      await route.fulfill({ status: 500, json: { message: 'Perubahan belum tersimpan.' } })
    }
  })
  await page.route('**/storage/v1/object/receipts/**', async route => {
    const url = new URL(route.request().url())
    const marker = '/storage/v1/object/receipts/'
    const path = decodeURIComponent(url.pathname.slice(url.pathname.indexOf(marker) + marker.length))
    if (route.request().method() === 'DELETE') {
      receipts.delete(path)
      await route.fulfill({ json: [] })
      return
    }
    const body = route.request().postDataBuffer()
    if (body) receipts.set(path, body)
    await route.fulfill({ json: { Key: path } })
  })
  await page.route('**/storage/v1/object/sign/receipts/**', async route => {
    const url = new URL(route.request().url())
    const marker = '/storage/v1/object/sign/receipts/'
    const encodedPath = url.pathname.slice(url.pathname.indexOf(marker) + marker.length)
    const path = decodeURIComponent(decodeURIComponent(encodedPath))
    if (route.request().method() === 'GET' && url.searchParams.get('e2e') === '1') {
      const body = receipts.get(path)
      if (!body) { await route.fulfill({ status: 404 }); return }
      await route.fulfill({ status: 200, contentType: 'image/jpeg', body })
      return
    }
    // storage-js expects the API's `signedURL` field and builds the final URL
    // from it; returning `signedUrl` here bypasses that transformation.
    await route.fulfill({ json: { signedURL: '/object/sign/receipts/' + encodeURIComponent(path) + '?e2e=1' } })
  })
  await page.route('http://localhost:3000/__e2e_receipt/**', async route => {
    const url = new URL(route.request().url())
    const path = decodeURIComponent(url.pathname.slice('/__e2e_receipt/'.length))
    const body = receipts.get(path)
    if (!body) {
      await route.fulfill({ status: 404 })
      return
    }
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body })
  })
}
