import nodemailer from 'nodemailer';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const EDGE_INVOKE_SECRET = (process.env.EDGE_INVOKE_SECRET || '').trim();
const WEBHOOK_SECRET = (process.env.WEBHOOK_SECRET || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

// Configuración SMTP
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'WeMatch <noreply@wematch.com>';
const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT_RAW = (process.env.SMTP_PORT || '').trim();
const SMTP_PORT = SMTP_PORT_RAW ? parseInt(SMTP_PORT_RAW, 10) : 587;
const SMTP_SECURE = (process.env.SMTP_SECURE || '').toLowerCase() === 'true';

function buildSmtpTransport() {
  if (SMTP_HOST) {
    const port = Number.isFinite(SMTP_PORT) ? SMTP_PORT : 587;
    const secure = SMTP_SECURE || port === 465;
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

// Transmisor SMTP de Nodemailer (Singleton)
const transporter = buildSmtpTransport();

/**
 * Envía un correo mediante SMTP directo (Nodemailer).
 */
async function sendMailSmtp(to: string, subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  if (!SMTP_USER || !SMTP_PASS) {
    const error = 'Faltan credenciales SMTP (SMTP_USER/SMTP_PASS). El correo no se enviará.';
    console.error(`[Mailer] ${error}`);
    return { sent: false, error };
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer] Error SMTP enviando a ${to}:`, msg);
    return { sent: false, error: msg };
  }
}

/**
 * Invoca la Edge Function por HTTP (sin JWT: la función debe tener verify_jwt = false).
 * Opcional: EDGE_INVOKE_SECRET en backend y en la función para autorizar solo este servidor.
 */
async function invokeEdgeFunction(name: string, body: Record<string, unknown>): Promise<{ sent: boolean; error?: string }> {
  if (!SUPABASE_URL) {
    return { sent: false, error: 'Falta SUPABASE_URL' };
  }
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (EDGE_INVOKE_SECRET || WEBHOOK_SECRET) {
    const edgeSecret = EDGE_INVOKE_SECRET || WEBHOOK_SECRET;
    const webhookSecret = WEBHOOK_SECRET || EDGE_INVOKE_SECRET;
    if (edgeSecret) headers['x-edge-invoke-secret'] = edgeSecret;
    if (webhookSecret) headers['x-webhook-secret'] = webhookSecret;
  }
  if (SUPABASE_SERVICE_ROLE_KEY) headers['Authorization'] = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let data: Record<string, unknown> | null = null;
    try {
      if (raw) data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (!res.ok) return { sent: false, error: raw || `HTTP ${res.status}` };
    }
    const errMsg = data && typeof data.error === 'string' ? data.error : data && typeof (data as { error?: { message?: string } }).error?.message === 'string' ? (data as { error: { message: string } }).error.message : null;
    if (data && data.ok === false && typeof data.error === 'string') {
      console.error('Edge Function', name, 'error:', data.error);
      return { sent: false, error: data.error };
    }
    if (errMsg) {
      console.error('Edge Function', name, 'error:', errMsg);
      return { sent: false, error: errMsg };
    }
    if (!res.ok) {
      const msg =
        (data && typeof data.error === 'string' ? data.error : null) ||
        (data && typeof (data as { message?: string }).message === 'string' ? (data as { message: string }).message : null) ||
        raw ||
        `HTTP ${res.status}`;
      return { sent: false, error: msg };
    }
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Edge Function', name, 'invoke error:', msg);
    return { sent: false, error: msg };
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<{ sent: boolean; error?: string }> {
  const subject = 'Restablecer contraseña — WeMatch';
  const html = `
    <div style="background-color: #000000; color: #FFFFFF; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px 20px; max-width: 600px; margin: 0 auto; line-height: 1.6;">
      
      <div style="text-align: center; margin-bottom: 40px;">
        <!-- Logo Oficial WeMatch -->
        <img src="https://oxowmfhnorxnabhzkcmi.supabase.co/storage/v1/object/public/public-assets/imagen_2026-04-22_105702379.png" alt="WeMatch" width="120" style="display: block; margin: 0 auto;" />
      </div>

      <div style="padding: 0 10px;">
        <p style="font-size: 16px; margin-bottom: 25px;">
          Hola,
        </p>

        <p style="font-size: 16px; margin-bottom: 25px;">
          Has solicitado restablecer tu contraseña en <strong>WeMatch</strong>. No te preocupes, nos pasa a todos.
        </p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          Haz clic en el siguiente botón para elegir una nueva contraseña (este enlace es válido por 1 hora):
        </p>

        <div style="margin-bottom: 35px; text-align: left;">
          <a href="${escapeHtml(resetUrl)}" style="display: inline-block; background-color: #F18F34; color: #000000; padding: 14px 28px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px;">
            Restablecer contraseña
          </a>
        </div>

        <p style="font-size: 14px; color: #AAAAAA; margin-bottom: 40px;">
          Si no has solicitado este cambio, puedes ignorar este correo con total tranquilidad. Tu contraseña actual no cambiará.
        </p>

        <p style="font-size: 16px; font-weight: bold; margin-bottom: 50px;">
          El equipo de WeMatch
        </p>

        <hr style="border: 0; border-top: 1px solid #333333; margin-bottom: 30px;" />

        <div style="text-align: center;">
          <p style="font-size: 11px; color: #666666;">
            © 2024 WeMatch Padel. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  `;
  return sendMailSmtp(to, subject, html);
}

export async function sendInviteEmail(to: string, inviteUrl: string, clubName: string): Promise<{ sent: boolean; error?: string }> {
  return invokeEdgeFunction('send-invitation-email', { to, inviteUrl, clubName });
}

export async function sendClubCrmEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ sent: boolean; error?: string }> {
  return invokeEdgeFunction('send-email', { to, subject, html });
}

export async function sendMatchmakingExpansionNudge(params: {
  playerId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<{ sent: boolean; error?: string }> {
  return invokeEdgeFunction('send-matchmaking-expansion', {
    player_id: params.playerId,
    title: params.title,
    body: params.body,
    data: params.data ?? {},
  });
}

export async function sendClubPortalInviteEmail(
  to: string,
  clubName: string,
  inviteUrl: string
): Promise<{ sent: boolean; error?: string }> {
  const subject = `Invitación al panel del club — ${clubName}`;
  const html = `
    <p>Hola,</p>
    <p>Has sido invitado/a al panel de gestión de <strong>${escapeHtml(clubName)}</strong> en WeMatch.</p>
    <p><a href="${escapeHtml(inviteUrl)}" style="color:#E31E24;font-weight:bold;">Aceptar invitación</a></p>
    <p>Si aún no tienes cuenta, regístrate en el panel con <strong>el mismo correo</strong> que recibió esta invitación; luego vuelve a abrir el enlace o pégalo en el navegador tras iniciar sesión.</p>
    <p>El enlace caduca en 7 días.</p>
  `;
  return sendMailSmtp(to, subject, html);
}

export async function sendStaffAccountEmail(
  to: string,
  staffName: string,
  clubName: string,
  plainPassword: string,
  loginUrl: string
): Promise<{ sent: boolean; error?: string }> {
  const subject = `Acceso al panel — ${clubName}`;
  const html = `
    <p>Hola ${escapeHtml(staffName)},</p>
    <p>Te han dado de alta en el personal de <strong>${escapeHtml(clubName)}</strong>.</p>
    <p>Puedes entrar aquí: <a href="${escapeHtml(loginUrl)}" style="color:#E31E24;font-weight:bold;">Iniciar sesión</a></p>
    <p><strong>Email:</strong> ${escapeHtml(to)}<br/>
    <strong>Contraseña temporal:</strong> ${escapeHtml(plainPassword)}</p>
    <p>Te recomendamos cambiar la contraseña cuando entres (si la opción está disponible).</p>
  `;
  return invokeEdgeFunction('send-email', { to, subject, html });
}

export async function syncPlayerVector(playerId: string): Promise<{ sent: boolean; error?: string }> {
  return invokeEdgeFunction('sync-player-vector', { player_id: playerId });
}

export async function sendRegistrationConfirmationEmail(
  to: string,
  name: string,
  confirmationUrl: string
): Promise<{ sent: boolean; error?: string }> {
  const subject = '¡Bienvenido a WeMatch! Confirma tu cuenta';
  const html = `
    <div style="background-color: #000000; color: #FFFFFF; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px 20px; max-width: 600px; margin: 0 auto; line-height: 1.6;">
      
      <div style="text-align: center; margin-bottom: 40px;">
        <!-- Logo Oficial WeMatch -->
        <img src="https://oxowmfhnorxnabhzkcmi.supabase.co/storage/v1/object/public/public-assets/imagen_2026-04-22_105702379.png" alt="WeMatch" width="120" style="display: block; margin: 0 auto;" />
      </div>

      <div style="padding: 0 10px;">
        <p style="font-size: 16px; margin-bottom: 25px;">
          Hola <span style="color: #F18F34; font-weight: bold;">${escapeHtml(name)}</span>,
        </p>

        <p style="font-size: 16px; margin-bottom: 25px;">
          ¡Gracias por unirte a <strong>WeMatch</strong>! Ya casi estás listo para empezar a reservar pistas y encontrar rivales de tu nivel.
        </p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          Para activar tu cuenta y asegurarnos de que tu correo es correcto, por favor haz clic en el siguiente enlace:
        </p>

        <div style="margin-bottom: 35px; text-align: left;">
          <a href="${escapeHtml(confirmationUrl)}" style="display: inline-block; background-color: #F18F34; color: #000000; padding: 14px 28px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 8px;">
            Confirmar mi correo electrónico
          </a>
        </div>

        <p style="font-size: 16px; margin-bottom: 20px;">
          Una vez confirmado, podrás:
        </p>

        <ul style="font-size: 16px; margin-bottom: 40px; padding-left: 20px; color: #FFFFFF; list-style-type: none;">
          <li style="margin-bottom: 12px; position: relative;">
            <span style="color: #F18F34; margin-right: 10px;">•</span> Configurar tu nivel de juego para partidas equilibradas.
          </li>
          <li style="margin-bottom: 12px; position: relative;">
            <span style="color: #F18F34; margin-right: 10px;">•</span> Explorar los clubes disponibles en tu zona.
          </li>
          <li style="margin-bottom: 12px; position: relative;">
            <span style="color: #F18F34; margin-right: 10px;">•</span> Unirte a partidas abiertas o crear tus propios retos.
          </li>
        </ul>

        <p style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">
          ¡Nos vemos pronto en la pista!
        </p>

        <p style="font-size: 16px; font-weight: bold; color: #F18F34; margin-bottom: 50px;">
          El equipo de WeMatch
        </p>

        <hr style="border: 0; border-top: 1px solid #333333; margin-bottom: 30px;" />

        <div style="text-align: center;">
          <p style="font-size: 13px; color: #AAAAAA; margin-bottom: 15px;">
            <strong>¿Tienes dudas?</strong> Estamos aquí para ayudarte.<br/>
            Escríbenos a <a href="mailto:soporte@wematch.com" style="color: #F18F34; text-decoration: none;">soporte@wematch.com</a>
          </p>

          <div style="margin-bottom: 25px;">
            <!-- Iconos sociales (Simulados con texto/emoji para máxima compatibilidad o links a imágenes si prefieres) -->
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/facebook-new.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/instagram-new.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/whatsapp.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/marker.png" width="20" height="20" /></a>
          </div>

          <p style="font-size: 11px; color: #666666;">
            © 2024 WeMatch Padel. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  `;
  return sendMailSmtp(to, subject, html);
}

export async function sendClubApplicationConfirmationEmail(
  to: string,
  clubName: string
): Promise<{ sent: boolean; error?: string }> {
  const subject = 'Solicitud de registro recibida — WeMatch';
  const html = `
    <div style="background-color: #000000; color: #FFFFFF; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px 20px; max-width: 600px; margin: 0 auto; line-height: 1.6;">
      
      <div style="text-align: center; margin-bottom: 40px;">
        <!-- Logo Oficial WeMatch -->
        <img src="https://oxowmfhnorxnabhzkcmi.supabase.co/storage/v1/object/public/public-assets/imagen_2026-04-22_105702379.png" alt="WeMatch" width="120" style="display: block; margin: 0 auto;" />
      </div>

      <div style="padding: 0 10px;">
        <p style="font-size: 16px; margin-bottom: 25px;">
          Estimados responsables de <span style="color: #F18F34; font-weight: bold;">${escapeHtml(clubName)}</span>,
        </p>

        <p style="font-size: 16px; margin-bottom: 25px;">
          Gracias por su interés en formar parte de la red de <strong>WeMatch</strong>. Hemos recibido correctamente su solicitud de registro.
        </p>

        <h3 style="color: #F18F34; font-size: 18px; margin-top: 40px; margin-bottom: 20px;">¿Qué sigue ahora?</h3>

        <p style="font-size: 16px; margin-bottom: 20px;">
          Nuestro equipo de administración revisará la información proporcionada para validar los datos del club. Este proceso suele tardar entre <strong>24 y 48 horas laborables</strong>.
        </p>

        <p style="font-size: 16px; margin-bottom: 40px;">
          Una vez que su perfil sea aprobado, recibirá un correo electrónico de confirmation con las instrucciones para configurar sus pistas, tarifas y horarios en el panel de gestión.
        </p>

        <p style="font-size: 16px; font-weight: bold; margin-bottom: 50px;">
          Atentamente,<br/>
          <span style="color: #F18F34;">El equipo de Administración de WeMatch.</span>
        </p>

        <hr style="border: 0; border-top: 1px solid #333333; margin-bottom: 30px;" />

        <div style="text-align: center;">
          <p style="font-size: 13px; color: #AAAAAA; margin-bottom: 15px;">
            <strong>¿Tienes dudas?</strong> Estamos aquí para ayudarte.<br/>
            Escríbenos a <a href="mailto:soporte@wematch.com" style="color: #F18F34; text-decoration: none;">soporte@wematch.com</a> o pásate por nuestro centro de ayuda en la app.
          </p>

          <div style="margin-bottom: 25px;">
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/facebook-new.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/instagram-new.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/whatsapp.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/marker.png" width="20" height="20" /></a>
          </div>

          <p style="font-size: 11px; color: #666666;">
            © 2024 WeMatch Padel. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  `;
  return sendMailSmtp(to, subject, html);
}

export async function sendClubApprovedEmail(
  to: string,
  managerName: string,
  clubName: string,
  inviteUrl: string
): Promise<{ sent: boolean; error?: string }> {
  const subject = '¡Tu club ha sido aprobado! — WeMatch';
  const html = `
    <div style="background-color: #000000; color: #FFFFFF; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px 20px; max-width: 600px; margin: 0 auto; line-height: 1.6;">
      
      <div style="text-align: center; margin-bottom: 40px;">
        <!-- Logo Oficial WeMatch -->
        <img src="https://oxowmfhnorxnabhzkcmi.supabase.co/storage/v1/object/public/public-assets/imagen_2026-04-22_105702379.png" alt="WeMatch" width="120" style="display: block; margin: 0 auto;" />
      </div>

      <div style="padding: 0 10px;">
        <p style="font-size: 16px; margin-bottom: 25px;">
          Hola <span style="color: #F18F34; font-weight: bold;">${escapeHtml(managerName)}</span>,
        </p>

        <p style="font-size: 16px; margin-bottom: 25px;">
          Nos complace informarle que la solicitud de <strong>${escapeHtml(clubName)}</strong> ha sido <strong style="color: #F18F34;">aprobada</strong> por nuestro equipo administrativo.
        </p>

        <p style="font-size: 18px; font-weight: bold; margin-bottom: 30px; text-align: center;">
          ¡Ya forman parte oficial de nuestra comunidad!
        </p>

        <p style="font-size: 16px; margin-bottom: 25px;">
          A partir de este momento, su club es visible para los jugadores, pero para empezar a recibir reservas debe completar la configuración inicial:
        </p>

        <div style="background-color: #111111; padding: 25px; border-radius: 12px; margin-bottom: 35px; border: 1px solid #222222;">
          <ol style="margin: 0; padding-left: 20px; font-size: 16px;">
            <li style="margin-bottom: 15px;">
              <strong>Acceda a su Panel:</strong> <a href="${escapeHtml(inviteUrl)}" style="color: #F18F34; font-weight: bold; text-decoration: underline;">Acceder a mi Panel de Gestión</a>
            </li>
            <li style="margin-bottom: 15px;">
              <strong>Defina sus Instalaciones:</strong> Añada el número de pistas, tipo de superficie y servicios adicionales.
            </li>
            <li>
              <strong>Configure su Calendario:</strong> Establezca sus franjas horarias y precios.
            </li>
          </ol>
        </div>

        <p style="font-size: 15px; color: #AAAAAA; margin-bottom: 30px;">
          Si necesita ayuda para dar sus primeros pasos en la plataforma, no dude en responder a este correo.
        </p>

        <p style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">
          ¡Bienvenidos y a llenar las pistas!
        </p>

        <p style="font-size: 16px; font-weight: bold; color: #F18F34; margin-bottom: 50px;">
          El equipo de WeMatch
        </p>

        <hr style="border: 0; border-top: 1px solid #333333; margin-bottom: 30px;" />

        <div style="text-align: center;">
          <p style="font-size: 13px; color: #AAAAAA; margin-bottom: 15px;">
            <strong>¿Tienes dudas?</strong> Estamos aquí para ayudarte.<br/>
            Escríbenos a <a href="mailto:soporte@wematch.com" style="color: #F18F34; text-decoration: none;">soporte@wematch.com</a>
          </p>

          <div style="margin-bottom: 25px;">
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/facebook-new.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/instagram-new.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/whatsapp.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/marker.png" width="20" height="20" /></a>
          </div>

          <p style="font-size: 11px; color: #666666;">
            © 2024 WeMatch Padel. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  `;
  return sendMailSmtp(to, subject, html);
}

export async function sendMatchJoinConfirmationEmail(
  to: string,
  playerName: string,
  clubName: string,
  matchDateStr: string,
  matchTimeStr: string,
  courtName: string,
  address: string
): Promise<{ sent: boolean; error?: string }> {
  const subject = '¡Te has unido a una partida! — WeMatch';
  const html = `
    <div style="background-color: #000000; color: #FFFFFF; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px 20px; max-width: 600px; margin: 0 auto; line-height: 1.6;">
      
      <div style="text-align: center; margin-bottom: 40px;">
        <!-- Logo Oficial WeMatch -->
        <img src="https://oxowmfhnorxnabhzkcmi.supabase.co/storage/v1/object/public/public-assets/imagen_2026-04-22_105702379.png" alt="WeMatch" width="120" style="display: block; margin: 0 auto;" />
      </div>

      <div style="padding: 0 10px;">
        <p style="font-size: 16px; margin-bottom: 25px;">
          Hola <span style="color: #F18F34; font-weight: bold;">${escapeHtml(playerName)}</span>,
        </p>

        <p style="font-size: 16px; margin-bottom: 25px;">
          ¡Listo! Te has unido correctamente a la partida. Aquí tienes todos los detalles para que no te pierdas nada:
        </p>

        <div style="background-color: #111111; padding: 25px; border-radius: 12px; margin-bottom: 35px; border: 1px solid #222222;">
          <h4 style="color: #F18F34; font-size: 18px; margin-top: 0; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">Detalles de la partida</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
            <tr>
              <td style="padding: 6px 0; color: #AAAAAA; width: 35%;"><strong>Club:</strong></td>
              <td style="padding: 6px 0; color: #FFFFFF;">${escapeHtml(clubName)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #AAAAAA;"><strong>Fecha:</strong></td>
              <td style="padding: 6px 0; color: #FFFFFF;">${escapeHtml(matchDateStr)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #AAAAAA;"><strong>Hora:</strong></td>
              <td style="padding: 6px 0; color: #FFFFFF;">${escapeHtml(matchTimeStr)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #AAAAAA;"><strong>Pista:</strong></td>
              <td style="padding: 6px 0; color: #FFFFFF;">${escapeHtml(courtName)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #AAAAAA; vertical-align: top;"><strong>Dirección:</strong></td>
              <td style="padding: 6px 0; color: #FFFFFF;">${escapeHtml(address)}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">
          ¡Que tengas un excelente partido!
        </p>

        <p style="font-size: 16px; font-weight: bold; color: #F18F34; margin-bottom: 50px;">
          El equipo de WeMatch
        </p>

        <hr style="border: 0; border-top: 1px solid #333333; margin-bottom: 30px;" />

        <div style="text-align: center;">
          <p style="font-size: 13px; color: #AAAAAA; margin-bottom: 15px;">
            <strong>¿Tienes dudas o necesitas ayuda?</strong><br/>
            Escríbenos a <a href="mailto:soporte@wematch.com" style="color: #F18F34; text-decoration: none;">soporte@wematch.com</a>
          </p>

          <div style="margin-bottom: 25px;">
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/facebook-new.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/instagram-new.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/whatsapp.png" width="20" height="20" /></a>
            <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://img.icons8.com/ios-filled/24/FFFFFF/marker.png" width="20" height="20" /></a>
          </div>

          <p style="font-size: 11px; color: #666666;">
            © 2024 WeMatch Padel. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  `;
  return sendMailSmtp(to, subject, html);
}

