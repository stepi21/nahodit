import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function moonPhaseName(dateStr: string): string | null {
  if (!dateStr) return null;
  const synodic = 29.53058867;
  const known = new Date("2000-01-06T18:14:00Z").getTime();
  const target = new Date(`${dateStr}T12:00:00Z`).getTime();
  const days = (target - known) / 86400000;
  let phase = (days % synodic) / synodic;
  if (phase < 0) phase += 1;
  const names = ["Nov", "Dorůstající srpek", "První čtvrť", "Dorůstající měsíc", "Úplněk", "Couvající měsíc", "Poslední čtvrť", "Couvající srpek"];
  return names[Math.round(phase * 8) % 8];
}

const PRESSURE_BUCKETS = [
  { key: "<1000 hPa", test: (p: number) => p < 1000 },
  { key: "1000–1010 hPa", test: (p: number) => p >= 1000 && p < 1010 },
  { key: "1010–1020 hPa", test: (p: number) => p >= 1010 && p < 1020 },
  { key: "1020+ hPa", test: (p: number) => p >= 1020 },
];
function pressureBucketKey(p: number | null): string | null {
  if (p == null) return null;
  return PRESSURE_BUCKETS.find((b) => b.test(p))?.key ?? null;
}
function trendKey(trend: number | null): string | null {
  if (trend == null) return null;
  return trend > 0 ? "roste" : trend < 0 ? "klesá" : "stabilní";
}

// Stejný výpočet jako scoreCategoryIndex v Dashboard.jsx (appka to
// tady musí mít samostatně, protože appka toto běží na serveru, ne
// v appce v prohlížeči).
function scoreCategoryIndex(category: string, sessionsData: any[], today: any) {
  const byMoon: Record<string, number> = {}, byPressure: Record<string, number> = {}, byTrend: Record<string, number> = {}, bySpa: Record<string, number> = {};
  let total = 0;
  sessionsData.forEach((s) => {
    (s.catches || []).forEach((c: any) => {
      if (c.category !== category) return;
      total += 1;
      const dateStr = c.caught_at ? c.caught_at.slice(0, 10) : s.session_date;
      const phase = dateStr ? moonPhaseName(dateStr) : null;
      if (phase) byMoon[phase] = (byMoon[phase] || 0) + 1;
      const p = c.weather_pressure_hpa ?? s.weather_pressure_hpa;
      if (p != null && p !== "") {
        const bk = pressureBucketKey(p);
        if (bk) byPressure[bk] = (byPressure[bk] || 0) + 1;
      }
      const trend = c.weather_pressure_trend ?? s.weather_pressure_trend;
      const tk = trendKey(trend);
      if (tk) byTrend[tk] = (byTrend[tk] || 0) + 1;
      const sessionSpa = s.water_stations?.length > 0 ? s.water_stations[0].spa_level : s.water_spa_level;
      const spa = c.water_spa_level ?? sessionSpa;
      if (spa != null) bySpa[String(spa)] = (bySpa[String(spa)] || 0) + 1;
    });
  });
  if (total < 8) return { status: "not_enough_data", total };

  function signalScore(byBucket: Record<string, number>, todayKey: string | null) {
    if (todayKey == null) return null;
    const bucketCount = Object.keys(byBucket).length;
    if (bucketCount === 0) return null;
    const matched = byBucket[todayKey] || 0;
    const sumMatched = Object.values(byBucket).reduce((a, b) => a + b, 0);
    if (sumMatched === 0) return null;
    const ratio = matched / sumMatched;
    const expected = 1 / bucketCount;
    return ratio / expected;
  }

  const scores = [
    signalScore(byMoon, today.moonPhase),
    signalScore(byPressure, today.pressureBucket),
    signalScore(byTrend, today.trendLabel),
    signalScore(bySpa, today.spaLevel != null ? String(today.spaLevel) : null),
  ].filter((v) => v != null) as number[];

  if (scores.length === 0) return { status: "not_enough_data", total };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const level = avg >= 1.2 ? "vysoká" : avg >= 0.8 ? "střední" : "nízká";
  return { status: "ready", level, total };
}

function mostFrequentLocationRef(sessionsData: any[]) {
  const points = sessionsData.filter((s) => s.lat != null && s.lng != null);
  if (points.length === 0) return { lat: 49.8, lng: 15.5 };
  const groups: Record<string, any[]> = {};
  points.forEach((s) => {
    const key = (s.revir || s.title || "").trim().toLowerCase() || `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`;
    (groups[key] = groups[key] || []).push(s);
  });
  const top = Object.values(groups).sort((a, b) => b.length - a.length)[0];
  return {
    lat: top.reduce((sum, p) => sum + p.lat, 0) / top.length,
    lng: top.reduce((sum, p) => sum + p.lng, 0) / top.length,
  };
}

// Open-Meteo appka volá přímo -- appka teď běží na serveru, ne
// v appce v prohlížeči, takže appce CORS omezení vůbec nevadí.
async function fetchPressureSeries(lat: number, lng: number, fromDateStr: string, toDateStr: string) {
  const params = new URLSearchParams({
    latitude: String(lat), longitude: String(lng),
    hourly: "surface_pressure",
    timezone: "Europe/Prague",
    start_date: fromDateStr, end_date: toDateStr,
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) throw new Error("Open-Meteo appka neodpověděla.");
  const data = await res.json();
  return data?.hourly;
}

async function fetchChmiStations() {
  const res = await fetch("https://opendata.chmi.cz/hydrology/now/metadata/meta1.json");
  if (!res.ok) throw new Error("ČHМÚ metadata appka nesehnala.");
  const json = await res.json();
  const table = json?.data?.data;
  const cols = table.header.split(",");
  const iObjID = cols.indexOf("objID"), iName = cols.indexOf("STATION_NAME"), iStream = cols.indexOf("STREAM_NAME");
  const iLat = cols.indexOf("GEOGR1"), iLng = cols.indexOf("GEOGR2");
  const iDryH = cols.indexOf("DRYH"), iSpa1H = cols.indexOf("SPA1H"), iSpa2H = cols.indexOf("SPA2H"), iSpa3H = cols.indexOf("SPA3H");
  const iDryQ = cols.indexOf("DRYQ"), iSpa1Q = cols.indexOf("SPA1Q"), iSpa2Q = cols.indexOf("SPA2Q"), iSpa3Q = cols.indexOf("SPA3Q");
  return table.values.map((row: any[]) => ({
    objID: row[iObjID], name: row[iName], stream: row[iStream], lat: row[iLat], lng: row[iLng],
    thresholds: {
      dryH: row[iDryH], spa1H: row[iSpa1H], spa2H: row[iSpa2H], spa3H: row[iSpa3H],
      dryQ: row[iDryQ], spa1Q: row[iSpa1Q], spa2Q: row[iSpa2Q], spa3Q: row[iSpa3Q],
    },
  }));
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function classifySpaLevel(level_cm: number | null, flow_m3s: number | null, thresholds: any) {
  if (!thresholds) return null;
  if (level_cm != null && (thresholds.spa1H != null || thresholds.dryH != null)) {
    if (thresholds.spa3H != null && level_cm >= thresholds.spa3H) return 3;
    if (thresholds.spa2H != null && level_cm >= thresholds.spa2H) return 2;
    if (thresholds.spa1H != null && level_cm >= thresholds.spa1H) return 1;
    if (thresholds.dryH != null && level_cm <= thresholds.dryH) return -1;
    return 0;
  }
  if (flow_m3s != null && (thresholds.spa1Q != null || thresholds.dryQ != null)) {
    if (thresholds.spa3Q != null && flow_m3s >= thresholds.spa3Q) return 3;
    if (thresholds.spa2Q != null && flow_m3s >= thresholds.spa2Q) return 2;
    if (thresholds.spa1Q != null && flow_m3s >= thresholds.spa1Q) return 1;
    if (thresholds.dryQ != null && flow_m3s <= thresholds.dryQ) return -1;
    return 0;
  }
  return null;
}

async function fetchTodaySpaLevel(station: any): Promise<number | null> {
  try {
    const res = await fetch(`https://opendata.chmi.cz/hydrology/now/data/${station.objID}_H.json`).catch(() => null);
    // appka bere jen aktuální (dnešní) hodnotu vodního stavu.
    if (!res || !res.ok) return null;
    const json = await res.json();
    const ts = json?.data?.data;
    const lastRow = ts?.values?.[ts.values.length - 1];
    const level = lastRow ? Number(lastRow[1]) : null;
    return classifySpaLevel(level, null, station.thresholds);
  } catch {
    return null;
  }
}

async function sendPush(groupId: string, title: string, body: string) {
  await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ group_id: groupId, title, body, url: "/" }),
  });
}

Deno.serve(async (_req: Request) => {
  try {
    const { data: subGroups } = await admin.from("push_subscriptions").select("group_id");
    const groupIds: string[] = Array.from(new Set((subGroups || []).map((s: any) => s.group_id)));

    const DAY_LABELS = ["dnes", "zítra", "pozítří"];
    const results: any[] = [];

    for (const groupId of groupIds) {
      const { data: sessionsData } = await admin
        .from("sessions")
        .select("id, user_id, lat, lng, revir, title, session_date, weather_pressure_hpa, weather_pressure_trend, water_spa_level, water_stations, catches(category, caught_at, weather_pressure_hpa, weather_pressure_trend, water_spa_level)")
        .eq("group_id", groupId);
      if (!sessionsData || sessionsData.length === 0) continue;

      const ref = mostFrequentLocationRef(sessionsData);

      let spaLevelToday: number | null = null;
      try {
        const stations = await fetchChmiStations();
        const nearest = stations
          .map((s: any) => ({ ...s, distanceKm: haversineKm(ref.lat, ref.lng, s.lat, s.lng) }))
          .sort((a: any, b: any) => a.distanceKm - b.distanceKm)[0];
        if (nearest) spaLevelToday = await fetchTodaySpaLevel(nearest);
      } catch {
        // ČHМÚ appka nesehnala -- appka jede dál bez vodního stavu.
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const endStr = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      let hourly: any = null;
      try {
        hourly = await fetchPressureSeries(ref.lat, ref.lng, shiftDate(todayStr, -1), endStr);
      } catch {
        // Open-Meteo appka nesehnala -- appka jede dál jen s fází měsíce.
      }

      const days = [];
      let anyHigh = false;
      for (let offset = 0; offset < 3; offset++) {
        const dateStr = shiftDate(todayStr, offset);
        const moonPhase = moonPhaseName(dateStr);
        let pressureBucket = null, trendLabel = null;
        if (hourly?.time) {
          const idx = hourly.time.indexOf(`${dateStr}T12:00`);
          const prevIdx = hourly.time.indexOf(`${shiftDate(dateStr, -1)}T12:00`);
          if (idx !== -1) {
            const pressure = hourly.surface_pressure[idx];
            pressureBucket = pressureBucketKey(pressure);
            if (prevIdx !== -1) trendLabel = trendKey(Math.round((pressure - hourly.surface_pressure[prevIdx]) * 10) / 10);
          }
        }
        const dayInfo = { moonPhase, pressureBucket, trendLabel, spaLevel: offset === 0 ? spaLevelToday : null };
        const dravec = scoreCategoryIndex("dravec", sessionsData, dayInfo);
        const bila = scoreCategoryIndex("bila", sessionsData, dayInfo);
        if (dravec.status === "ready" && dravec.level === "vysoká") anyHigh = true;
        if (bila.status === "ready" && bila.level === "vysoká") anyHigh = true;
        days.push({ label: DAY_LABELS[offset], dravec, bila });
      }

      if (anyHigh) {
        const parts = days
          .filter((d) => (d.dravec.status === "ready" && d.dravec.level === "vysoká") || (d.bila.status === "ready" && d.bila.level === "vysoká"))
          .map((d) => {
            const cats: string[] = [];
            if (d.dravec.status === "ready" && d.dravec.level === "vysoká") cats.push("dravec");
            if (d.bila.status === "ready" && d.bila.level === "vysoká") cats.push("bílá ryba");
            return `${d.label}: ${cats.join(" a ")}`;
          });
        await sendPush(groupId, "Slušná šance na ryby", parts.join(" · "));
      }
      results.push({ groupId, anyHigh });
    }

    return new Response(JSON.stringify({ ok: true, checked: results.length, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500 });
  }
});

function shiftDate(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
