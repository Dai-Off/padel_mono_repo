import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-edge-invoke-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("EDGE_INVOKE_SECRET");
    if (secret && secret.length > 0) {
      const headerSecret = req.headers.get("x-edge-invoke-secret");
      if (headerSecret !== secret) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "onboarding@resend.dev";

    if (!RESEND_API_KEY) {
      return json({ ok: false, error: "Missing RESEND_API_KEY" });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" });
    }

    const body =
      raw && typeof raw === "object" && raw !== null && "body" in raw && typeof (raw as { body: unknown }).body === "object"
        ? (raw as { body: Record<string, unknown> }).body
        : (raw as Record<string, unknown>);

    const to = typeof body?.to === "string" ? body.to.trim() : "";
    const inviteUrl = typeof body?.inviteUrl === "string" ? body.inviteUrl.trim() : "";
    const clubName = typeof body?.clubName === "string" ? body.clubName.trim() : "";

    if (!to || !inviteUrl || !clubName) {
      return json({ ok: false, error: "Missing fields: to, inviteUrl, clubName" });
    }

    const html = `
      <h2>Invitación a ${clubName}</h2>
      <p>Fuiste invitado a unirte al club.</p>
      <p>
        <a href="${inviteUrl}"
           style="background:#000;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;">
           Aceptar invitación
        </a>
      </p>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to,
        subject: `Invitación a ${clubName}`,
        html,
      }),
    });

    const text = await res.text();
    let resendData: unknown = null;
    try {
      resendData = text ? JSON.parse(text) : null;
    } catch {
      resendData = { raw: text };
    }

    if (!res.ok) {
      const errMsg =
        resendData && typeof resendData === "object" && resendData !== null && "message" in resendData && typeof (resendData as { message: unknown }).message === "string"
          ? (resendData as { message: string }).message
          : text || `Resend returned ${res.status}`;
      return json({ ok: false, error: errMsg });
    }

    const id =
      resendData && typeof resendData === "object" && resendData !== null && "id" in resendData && typeof (resendData as { id: unknown }).id === "string"
        ? (resendData as { id: string }).id
        : undefined;
    return json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message });
  }
});
