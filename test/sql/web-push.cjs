const fs = require('node:fs')
const assert = require('node:assert/strict')
const { PGlite } = require('@electric-sql/pglite')

async function main() {
  const db = new PGlite()
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create table public.user_settings(user_id uuid primary key,notes_reminders boolean,reminder_time time);
      create table public.transactions(id uuid default gen_random_uuid(),user_id uuid,occurred_on date);
      grant select on public.user_settings,public.transactions to service_role;
      insert into auth.users values('${a}'),('${b}');
      insert into user_settings values('${a}',true,'20:00'),('${b}',true,'20:00');`)
    await db.exec(fs.readFileSync('supabase/migrations/20261123050648_create_web_push_reminders.sql', 'utf8'))
    const insert = async (owner, timezone, name) => (await db.query(`insert into push_subscriptions(user_id,endpoint,p256dh,auth,timezone)
      values($1,$2,$3,$4,$5) returning id`, [owner, 'https://fcm.googleapis.com/fcm/send/' + name, 'B'.repeat(87), 'A'.repeat(22), timezone])).rows[0].id
    const first = await insert(a, 'Asia/Jakarta', 'one'), second = await insert(b, 'Asia/Makassar', 'two')
    await assert.rejects(insert(a, 'invalid/zone', 'invalid'), e => e.code === '23514')
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false)`)
    assert.equal((await db.query('select * from push_subscriptions')).rows.length, 1)
    await assert.rejects(insert(a, 'UTC', 'forged'), e => e.code === '42501')
    await assert.rejects(db.query('select * from claim_due_note_push()'), e => e.code === '42501')
    assert.equal((await db.query('delete from push_subscriptions where id=$1 returning id', [second])).rows.length, 0)
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from push_subscriptions'), e => e.code === '42501')
    await assert.rejects(db.query('select * from push_deliveries'), e => e.code === '42501')
    console.log('PASS SQL: owner-only reads/deletes, anonymous denial, server-only writes/claims, timezone validation')
    await db.exec('set role service_role')
    const claim = async time => (await db.query('select * from claim_due_note_push($1,100)', [time])).rows
    assert.equal((await claim('2026-11-23T11:59:00Z')).length, 0)
    const east = await claim('2026-11-23T12:00:00Z')
    assert.equal(east.length, 1); assert.equal(east[0].user_id, b)
    assert.equal((await claim('2026-11-23T12:01:00Z')).length, 0)
    await db.query("update push_deliveries set status='sent' where subscription_id=$1", [second])
    const west = await claim('2026-11-23T13:00:00Z')
    assert.equal(west.length, 1); assert.equal(west[0].user_id, a)
    assert.equal(new Date(west[0].expires_at).toISOString(), '2026-11-23T17:00:00.000Z')
    assert.equal((await claim('2026-11-23T13:01:00Z')).length, 0)
    const retry = await claim('2026-11-23T13:05:00Z')
    assert.equal(retry.length, 1); assert.notEqual(retry[0].lease_token, west[0].lease_token)
    assert.equal((await claim('2026-11-23T13:10:00Z')).length, 1)
    assert.equal((await claim('2026-11-23T13:15:00Z')).length, 0)
    console.log('PASS SQL: timezone schedules, daily dedupe, claim leases, retry limit and midnight expiry')
    await db.exec('reset role')
    await db.query('insert into transactions(user_id,occurred_on) values($1,$2)', [a, '2026-11-24'])
    await db.query('update user_settings set notes_reminders=false where user_id=$1', [b])
    await db.exec('set role service_role')
    assert.equal((await claim('2026-11-24T13:00:00Z')).length, 0)
    await db.exec('reset role')
    await db.query('delete from transactions')
    await db.exec('set role service_role')
    assert.equal((await claim('2026-11-24T13:00:00Z')).length, 1)
    await db.exec('reset role')
    await db.query('delete from auth.users where id=$1', [a])
    assert.equal((await db.query('select * from push_deliveries where subscription_id=$1', [first])).rows.length, 0)
    console.log('PASS SQL: skip recorded/disabled users, next-day eligibility and cascading account deletion')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
