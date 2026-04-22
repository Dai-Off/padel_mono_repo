import { Resend } from "npm:resend";

Deno.serve(async (req) => {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), { status: 500 });
  }

  const resend = new Resend(RESEND_API_KEY);
  const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "onboarding@resend.dev";

  try {
    const raw = await req.json();
    // Soporta tanto payloads directos como envueltos en una propiedad 'body'
    const body = raw && typeof raw === "object" && raw !== null && "body" in raw && typeof (raw as { body: unknown }).body === "object"
      ? (raw as { body: Record<string, unknown> }).body
      : (raw as Record<string, unknown>);

    const { to, subject, html } = body as { to: string; subject: string; html: string };

    if (!to || !subject || !html) {
      console.error("Missing fields in request body:", body);
      return new Response(JSON.stringify({ error: "Missing fields (to, subject, html)" }), { status: 400 });
    }

    console.log(`[send-email] Intentando enviar a: ${to} desde: ${MAIL_FROM}`);

    const { data, error } = await resend.emails.send({
      from: MAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      html: html,
    });

    if (error) {
      console.error("[send-email] Error de Resend:", error);
      return new Response(JSON.stringify({ ok: false, error }), { 
        status: 400, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    console.log("[send-email] Correo enviado con éxito:", data?.id);
    return new Response(JSON.stringify({ ok: true, data }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });

  } catch (err) {
    console.error("[send-email] Error interno:", err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), { 
      status: 500, 
      headers: { "Content-Type": "application/json" } 
    });
  }
});
