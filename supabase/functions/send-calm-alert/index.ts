// Fonction Edge « send-calm-alert » (18/11/2026) : envoie la notification « [resto] est calme » aux comptes qui l'ont en favori.
// Appelée uniquement par le déclencheur reports_push_calm de la base, avec le secret partagé (en-tête x-hook-secret).
// Les clés VAPID sont créées ici au premier appel et gardées dans la table push_config (jamais dans l'appli).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const { data: rows } = await sb.from("push_config").select("key,value");
  const cfg: Record<string, string> = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  if (!cfg.hook_secret || req.headers.get("x-hook-secret") !== cfg.hook_secret) return json({ ok: false }, 403);

  if (!cfg.vapid_public || !cfg.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    await sb.from("push_config").upsert([
      { key: "vapid_public", value: k.publicKey },
      { key: "vapid_private", value: k.privateKey },
    ]);
    cfg.vapid_public = k.publicKey;
    cfg.vapid_private = k.privateKey;
  }
  const body = await req.json().catch(() => ({}));
  if (body.action === "init") return json({ ok: true });
  if (body.action !== "send" || !body.report_id) return json({ ok: false }, 400);

  webpush.setVapidDetails("mailto:contact.yadupeuple@gmail.com", cfg.vapid_public, cfg.vapid_private);
  const { data: targets, error } = await sb.rpc("push_targets", { p_report: body.report_id });
  if (error) return json({ ok: false, error: error.message }, 500);

  let sent = 0, removed = 0;
  await Promise.allSettled((targets || []).map(async (t: any) => {
    const where = t.service === "drive" ? `Le Drive de ${t.name}` : t.name;
    const payload = JSON.stringify({
      title: "Y'a du peuple ?",
      body: `${where} est calme en ce moment 🟢`,
      url: `./?r=${t.establishment_id}`,
      tag: `calm-${t.establishment_id}`,
    });
    try {
      await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 1800 });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await sb.from("push_subscriptions").delete().eq("endpoint", t.endpoint);
        removed++;
      }
    }
  }));
  return json({ ok: true, sent, removed });
});
