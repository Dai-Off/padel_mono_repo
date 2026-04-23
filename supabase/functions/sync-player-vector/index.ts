/**
 * Edge Function: regenera embedding de un jugador y lo guarda en players_vector.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") || "text-embedding-3-small";
const EMBEDDING_MAX_CHARS = Number(Deno.env.get("EMBEDDING_MAX_CHARS") || "8000");

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-edge-invoke-secret",
};

function prettyKey(key: string): string {
  return key.replace(/_/g, " ").trim();
}

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

function buildContent(player: Record<string, unknown>): string {
  const name = [player.first_name, player.last_name].filter(Boolean).join(" ").trim() || "Jugador";
  const lines: string[] = [`Jugador: ${name}.`];

  const keys = Object.keys(player).sort();
  for (const key of keys) {
    if (key === "stripe_customer_id") continue;
    const value = player[key];
    if (value === null || value === undefined) continue;
    const prettyValue = stringifyValue(value).trim();
    if (!prettyValue) continue;
    lines.push(`${prettyKey(key)}: ${prettyValue}.`);
  }

  let content = lines.join("\n");
  if (content.length > EMBEDDING_MAX_CHARS) content = content.slice(0, EMBEDDING_MAX_CHARS);
  return content;
}

async function getEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.data?.[0]?.embedding;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const payload = await req.json();
    const id = payload.player_id || payload.id || (payload.record && payload.record.id);

    if (!id) return new Response(JSON.stringify({ error: "No player id" }), { status: 400, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: player, error: fetchErr } = await supabase.from("players").select("*").eq("id", id).maybeSingle();

    if (fetchErr || !player) {
      return new Response(JSON.stringify({ error: "Player not found" }), { status: 404, headers: corsHeaders });
    }

    const content = buildContent(player as Record<string, unknown>);
    const embedding = await getEmbedding(content);

    const { error: upErr } = await supabase.from("players_vector").upsert(
      {
        player_id: player.id,
        content,
        embedding,
        metadata: player,
      },
      { onConflict: "player_id" },
    );

    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, player_id: player.id }), { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync-player-vector] Error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
