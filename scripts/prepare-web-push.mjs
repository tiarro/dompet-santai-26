// Creates local deployment inputs without printing secrets. Existing keys stay
// stable: rotating VAPID keys invalidates subscriptions on existing devices.
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
process.loadEnvFile('.env')
const projectUrl = process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
if (!projectUrl || new URL(projectUrl).protocol !== 'https:') throw new Error('Configure the Supabase project URL first.')
const directory = new URL('../.cache/web-push/', import.meta.url)
await mkdir(directory, { recursive: true })
const secretsFile = new URL('secrets.env', directory)
try { await readFile(secretsFile) } catch {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = privateKey.export({ format: 'jwk' })
  const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url')
  await writeFile(secretsFile, `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${jwk.d}\nVAPID_SUBJECT=${projectUrl}\nPUSH_CRON_SECRET=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 })
}
const secrets = Object.fromEntries((await readFile(secretsFile, 'utf8')).trim().split('\n').map(line => line.split(/=(.*)/s).slice(0, 2)))
if (secrets.VAPID_SUBJECT === 'undefined') {
  secrets.VAPID_SUBJECT = projectUrl
  await writeFile(secretsFile, Object.entries(secrets).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
}
const literal = value => "'" + value.replaceAll("'", "''") + "'"
const vault = Object.entries({ daily_reminders_project_url: projectUrl,
  daily_reminders_cron_secret: secrets.PUSH_CRON_SECRET }).map(([name, value]) => `do $$ declare existing uuid; begin
  select id into existing from vault.secrets where name = ${literal(name)};
  if existing is null then perform vault.create_secret(${literal(value)}, ${literal(name)});
  else perform vault.update_secret(existing, ${literal(value)}, ${literal(name)}); end if;
end $$;`).join('\n')
await writeFile(new URL('configure-vault.sql', directory), vault + '\n', { mode: 0o600 })
// Dashboard deploy accepts one file; bundle only our local helper module.
const entry = await readFile(new URL('../supabase/functions/daily-reminders/index.ts', import.meta.url), 'utf8')
const core = await readFile(new URL('../supabase/functions/daily-reminders/core.ts', import.meta.url), 'utf8')
await writeFile(new URL('dashboard-index.ts', directory), entry.replace("import { deliveryResult, pushPayload, validateSubscription } from './core.ts'", core.replaceAll('export ', '')))
console.log('Web Push deployment inputs prepared in .cache/web-push/. No secrets printed. Keep this folder private.')
