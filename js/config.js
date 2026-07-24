/*
 * Supabase connection. Both values are safe to publish (they identify the
 * project; they grant no data access by themselves — every read/write is
 * gated server-side on the family passphrase, which is NOT stored here).
 * Each phone enters the passphrase once in Settings; it lives only on-device.
 *
 *   url:     Supabase Dashboard → Project Settings → Data API → Project URL
 *   anonKey: publishable key (sb_publishable_...) or legacy anon key.
 *            NEVER the service_role / secret key.
 */
const SUPABASE_CONFIG = {
  url: 'https://prgtejmpcnwqvsfqdebz.supabase.co',
  anonKey: 'sb_publishable_69OsxH1lqvRrpLSLUf3jNw_bPugyFW0',
};
