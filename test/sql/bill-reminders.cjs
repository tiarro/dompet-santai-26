// node test/sql/bill-reminders.cjs <absolute path to @electric-sql/pglite>
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite')
async function test() {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`)
    for (const name of ['20261008000000_create_finance_cloud_storage.sql', '20261015100313_create_bill_reminders.sql']) await db.exec(fs.readFileSync('supabase/migrations/' + name, 'utf8'))
    const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
    await db.exec(`insert into auth.users values('${a}'),('${b}');set role authenticated;`)
    const owner = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
    await owner(a)
    const snapshot = async () => (await db.query('select public.get_finance_snapshot() as data')).rows[0].data
    const before = await snapshot()
    const insert = async (date, recurrence = 'monthly') => (await db.query("insert into public.bill_reminders(user_id,name,amount,due_on,recurrence,anchor_day,category_code,account_code) values(auth.uid(),'Internet',100000,$1,$2,31,'bills','bank') returning *", [date, recurrence])).rows[0]
    const complete = bill => db.query('select public.complete_bill_reminder($1,$2)', [bill.id, bill.revision])
    const next = async series => (await db.query("select * from public.bill_reminders where series_id=$1 and status='pending'", [series])).rows[0]
    const date = value => new Date(value).toISOString().slice(0, 10)
    const first = await insert('2028-01-31'); await complete(first)
    let pending = await next(first.series_id)
    assert.equal(date(pending.due_on), '2028-02-29')
    await complete(pending); pending = await next(first.series_id)
    assert.equal(date(pending.due_on), '2028-03-31')
    for (const [from, to] of [['2027-01-31', '2027-02-28'], ['2026-12-31', '2027-01-31']]) {
      const bill = await insert(from); await complete(bill)
      assert.equal(date((await next(bill.series_id)).due_on), to)
    }
    console.log('PASS: leap/non-leap February, day 31 and year rollover')
    const count = async () => (await db.query('select count(*)::int as n from public.bill_reminders')).rows[0].n
    const originalCount = await count()
    await assert.rejects(complete(first), e => e.code === '40001')
    assert.equal(await count(), originalCount)
    console.log('PASS: duplicate completion rejected')
    const once = await insert('2026-10-15', 'once'); await complete(once)
    assert.equal(await count(), originalCount + 1); assert.equal(await next(once.series_id), undefined)
    assert.deepEqual(await snapshot(), before)
    console.log('PASS: one-time completion; all financial data unchanged')
    await db.query('update public.bill_reminders set revision=revision+1 where id=$1', [pending.id])
    await assert.rejects(complete(pending), e => e.code === '40001')
    await owner(b)
    assert.equal((await db.query('select * from public.bill_reminders')).rows.length, 0)
    await assert.rejects(complete(pending), e => e.code === '40001')
    assert.equal((await db.query('delete from public.bill_reminders where id=$1 returning id', [pending.id])).rows.length, 0)
    await assert.rejects(db.query("insert into public.bill_reminders(user_id,name,amount,due_on,recurrence,anchor_day,category_code,account_code) values($1,'Forged',1,'2026-01-01','once',1,'bills','bank')", [a]), e => e.code === '42501')
    console.log('PASS: stale revision and cross-account access rejected')
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from public.bill_reminders'), e => e.code === '42501')
    console.log('PASS: anonymous access denied')
  } finally { await db.close() }
}
test().catch(error => { console.error(error); process.exitCode = 1 })
