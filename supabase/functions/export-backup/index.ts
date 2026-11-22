// Fonction Edge « export-backup » (22/11/2026) : renvoie toutes les données de la base (JSON) pour la copie quotidienne
// vers un dépôt GitHub PRIVÉ (workflow du dépôt de sauvegarde). Protégée par le secret partagé backup_secret (en-tête x-backup-secret).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const { data: rows } = await sb.from("push_config").select("value").eq("key", "backup_secret").maybeSingle();
  const secret = rows?.value;
  if (!secret || req.headers.get("x-backup-secret") !== secret) return json({ ok: false }, 403);
  const { data, error } = await sb.rpc("backup_export");
  if (error) return json({ ok: false, error: error.message }, 500);
  return json(data);
});
