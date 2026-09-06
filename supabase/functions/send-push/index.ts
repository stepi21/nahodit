// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

// ----------------------------------------------------------------------------
// send-push
// ----------------------------------------------------------------------------
// Proč tohle existuje: appka chce poslat skutečnou push notifikaci na
// telefon i se zavřenou appkou -- prohlížeč posílání push zpráv umožňuje
// jen serveru s VAPID klíčem, nikdy přímo appce v prohlížeči. Stejný
// princip jako chmi-proxy/overpass-proxy -- appka běží na Supabase
// (server-server), appka drží tajné klíče mimo appku samotnou.
//
// Appka podporuje dva tvary vstupu:
// 1) Supabase Database Webhook (appka se spustí automaticky při INSERT
//    do sessions/catches -- appka pošle {table, record, ...}).
// 2) Přímé volání appky s hotovým textem -- appka to appka pošle sama
//    (denní výhled, viz krok B), s {group_id, title, body, url}.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Appka pošle notifikaci všem odběratelům dané skupiny (kromě volitelně
// vyloučeného uživatele -- typicky autora úlovku/výpravy, ten appce
// notifikaci o vlastní akci posílat nemá).
async function sendToGroup(groupId: string, title: string, body: string, url: string, excludeUserId: string | null) {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .eq("group_id", groupId);

  const targets = (subs || []).filter((s: any) => s.user_id !== excludeUserId);

  await Promise.all(
    targets.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          JSON.stringify({ title, body, url })
        );
      } catch (err: any) {
        // Push server vrátil 404/410 -- přihlášení k odběru už neplatí
        // (appka byla odinstalovaná, nebo appka appku dlouho neotevřela).
        // Appka takový záznam smaže, ať ho příště appka nezkouší znovu.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const payload = await req.json();

    // --- appka pozná Database Webhook podle tvaru {table, record} ---
    if (payload.table && payload.record) {
      const record = payload.record;
      if (payload.table === "sessions") {
        const { data: profile } = await admin
          .from("profiles").select("display_name").eq("id", record.user_id).maybeSingle();
        const who = profile?.display_name || "Někdo z party";
        await sendToGroup(
          record.group_id,
          `${who} založil výpravu`,
          record.title || record.revir || "Nová výprava",
          "/",
          record.user_id
        );
      } else if (payload.table === "catches") {
        const { data: session } = await admin
          .from("sessions").select("user_id").eq("id", record.session_id).maybeSingle();
        const authorId = session?.user_id || null;
        const { data: profile } = authorId
          ? await admin.from("profiles").select("display_name").eq("id", authorId).maybeSingle()
          : { data: null };
        const who = profile?.display_name || "Někdo z party";
        const lengthPart = record.length_cm ? ` (${record.length_cm} cm)` : "";
        await sendToGroup(
          record.group_id,
          `${who} chytil úlovek`,
          `${record.species || "Ryba"}${lengthPart}`,
          "/",
          authorId
        );
      }
      return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
    }

    // --- jinak appka bere přímé volání (krok B, denní výhled) ---
    const { group_id, title, body, url, exclude_user_id } = payload;
    if (!group_id || !title) {
      return new Response(JSON.stringify({ error: "Chybí group_id nebo title." }), { status: 400, headers: CORS_HEADERS });
    }
    await sendToGroup(group_id, title, body || "", url || "/", exclude_user_id || null);
    return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: CORS_HEADERS });
  }
});
