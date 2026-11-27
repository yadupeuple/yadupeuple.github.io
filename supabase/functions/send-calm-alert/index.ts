// Fonction Edge « send-calm-alert » (18/11/2026) : envoie la notification « [resto] est calme » aux comptes qui l'ont en favori.
// Appelée par le déclencheur reports_push_calm de la base, avec le secret partagé (en-tête x-hook-secret).
// 27/11/2026 : action « test » appelée depuis l'appli (Réglages › Alertes) par un compte connecté : envoie une notification
// de test à SES propres abonnements seulement (jeton de connexion vérifié ici, 5 tests par jour et par compte, table push_tests).
// Les clés VAPID sont créées ici au premier appel et gardées dans la table push_config (jamais dans l'appli).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

async function vapid(cfg: Record<string, string>) {
  if (!cfg.vapid_public || !cfg.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    await sb.from("push_config").upsert([
      { key: "vapid_public", value: k.publicKey },
      { key: "vapid_private", value: k.privateKey },
    ]);
    cfg.vapid_public = k.publicKey;
    cfg.vapid_private = k.privateKey;
  }
  webpush.setVapidDetails("mailto:contact.yadupeuple@gmail.com", cfg.vapid_public, cfg.vapid_private);
}

async function sendAll(targets: any[], payloadFor: (t: any) => string) {
  let sent = 0, removed = 0, failed = 0;
  await Promise.allSettled(targets.map(async (t) => {
    try {
      await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payloadFor(t), { TTL: 1800 });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await sb.from("push_subscriptions").delete().eq("endpoint", t.endpoint);
        removed++;
      } else failed++;
    }
  }));
  return { sent, removed, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const { data: rows } = await sb.from("push_config").select("key,value");
  const cfg: Record<string, string> = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  const body = await req.json().catch(() => ({}));

  // --- Test depuis l'appli : uniquement vers les abonnements du compte connecté ---
  if (body.action === "test") {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = jwt ? await sb.auth.getUser(jwt) : { data: null };
    const uid = u?.user?.id;
    if (!uid) return json({ ok: false, message: "Connecte-toi pour tester les alertes." }, 401);
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { count } = await sb.from("push_tests").select("user_id", { count: "exact", head: true }).eq("user_id", uid).gte("sent_at", since);
    if ((count || 0) >= 5) return json({ ok: false, message: "Tu as déjà fait 5 tests aujourd'hui : réessaie demain." });
    let q = sb.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", uid);
    if (typeof body.endpoint === "string" && body.endpoint) q = q.eq("endpoint", body.endpoint);
    const { data: subs } = await q;
    if (!subs || !subs.length) return json({ ok: false, message: "Ce téléphone n'est pas abonné : touche « Activer les alertes »." });
    await sb.from("push_tests").insert({ user_id: uid });
    await vapid(cfg);
    const r = await sendAll(subs, () => JSON.stringify({
      title: "Y'a du peuple ?",
      body: "Les alertes marchent sur ce téléphone ✅ Tu seras prévenu quand un de tes favoris est calme.",
      url: "./",
      tag: "test",
    }));
    return json({ ok: r.sent > 0, ...r, message: r.sent > 0 ? "Notification envoyée : elle arrive dans quelques secondes." : "L'envoi a échoué : désactive puis réactive les alertes." });
  }

  // --- Appel du déclencheur de la base (secret partagé) ---
  if (!cfg.hook_secret || req.headers.get("x-hook-secret") !== cfg.hook_secret) return json({ ok: false }, 403);
  await vapid(cfg);
  if (body.action === "init") return json({ ok: true });
  if (body.action !== "send" || !body.report_id) return json({ ok: false }, 400);

  const { data: targets, error } = await sb.rpc("push_targets", { p_report: body.report_id });
  if (error) return json({ ok: false, error: error.message }, 500);
  const r = await sendAll(targets || [], (t) => {
    const where = t.service === "drive" ? `Le Drive de ${t.name}` : t.name;
    return JSON.stringify({
      title: "Y'a du peuple ?",
      body: `${where} est calme en ce moment 🟢`,
      url: `./?r=${t.establishment_id}`,
      tag: `calm-${t.establishment_id}`,
    });
  });
  return json({ ok: true, ...r });
});
