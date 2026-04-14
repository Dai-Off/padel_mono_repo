import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-edge-invoke-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

/** Stub listo para Expo/FCM: ahora solo valida y devuelve ok. */
Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("EDGE_INVOKE_SECRET");
    if (secret && secret.length > 0) {
      const headerSecret = req.headers.get("x-edge-invoke-secret");
      if (headerSecret !== secret) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
    }

    let raw: Record<string, unknown>;
    try {
      raw = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const playerId = typeof raw.player_id === "string" ? raw.player_id : null;
    if (!playerId) {
      return json({ ok: false, error: "player_id required" }, 400);
    }

    return json({ ok: true, delivered: false });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "error" }, 500);
  }
});
