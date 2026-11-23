const fs = require('node:fs')
const assert = require('node:assert/strict')
const { PGlite } = require('@electric-sql/pglite')

async function main() {
  const db = new PGlite()
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      insert into auth.users values('${a}'),('${b}');`)
    await db.exec(fs.readFileSync('supabase/migrations/20261123032704_create_notification_reads.sql', 'utf8'))
    const asUser = async id => { await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]) }
    const insert = (id, key, time = '2026-11-23T00:00:00Z') => db.query(`insert into public.notification_reads(user_id, read_key, read_at) values($1,$2,$3)
      on conflict(user_id,read_key) do nothing`, [id, key, time])
    await asUser(a)
    const key = JSON.stringify(['bill', 'internet', '2026-11-23', 'today'])
    await insert(a, key)
    await insert(a, key, '2026-11-24T00:00:00Z')
    let rows = (await db.query('select * from public.notification_reads')).rows
    assert.equal(rows.length, 1)
    assert.equal(new Date(rows[0].read_at).toISOString(), '2026-11-23T00:00:00.000Z')
    await insert(a, JSON.stringify(['bill', 'internet', '2026-11-23', 'late']))
    assert.equal((await db.query('select * from public.notification_reads')).rows.length, 2)
    console.log('PASS: idempotent inserts preserve timestamps and distinct reminder stages')
    await asUser(b)
    assert.equal((await db.query('select * from public.notification_reads')).rows.length, 0)
    await assert.rejects(insert(a, 'forged'), error => error.code === '42501')
    await insert(b, key)
    assert.equal((await db.query('select * from public.notification_reads')).rows.length, 1)
    await assert.rejects(db.query('update public.notification_reads set user_id=$1', [a]), error => error.code === '42501')
    await assert.rejects(db.query('delete from public.notification_reads'), error => error.code === '42501')
    await assert.rejects(insert(b, ''), error => error.code === '23514')
    await assert.rejects(insert(b, 'é'.repeat(257)), error => error.code === '23514')
    await assert.rejects(insert(b, 'infinite', 'infinity'), error => error.code === '23514')
    console.log('PASS: RLS blocks cross-account reads/writes; update/delete and invalid data rejected')
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from public.notification_reads'), error => error.code === '42501')
    await assert.rejects(insert(b, 'anonymous'), error => error.code === '42501')
    await db.exec('reset role')
    await db.query('delete from auth.users where id=$1', [b])
    assert.equal((await db.query('select * from public.notification_reads where user_id=$1', [b])).rows.length, 0)
    console.log('PASS: anonymous access denied; account deletion cascades only its markers')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
