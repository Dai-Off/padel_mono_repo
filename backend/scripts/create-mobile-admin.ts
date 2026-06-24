/**
 * Crea o promueve un usuario como admin de webapp-wechat (tabla `mobile_admins`).
 * Independiente de public.admins (panel web-app). No modifica jugadores ni dueños de club.
 *
 * Uso:
 *   npm run mobile-admin:create -- --email admin@example.com --password "TuPass123!"
 *   npm run mobile-admin:create -- --email existente@example.com
 *   npm run mobile-admin:create -- --list
 *   npm run mobile-admin:create -- --remove --email user@example.com
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl?.trim() || !supabaseServiceKey?.trim()) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type CliArgs = {
  email?: string;
  password?: string;
  name?: string;
  list: boolean;
  remove: boolean;
  resetPassword: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { list: false, remove: false, resetPassword: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') out.list = true;
    else if (arg === '--remove') out.remove = true;
    else if (arg === '--reset-password') out.resetPassword = true;
    else if (arg === '--email') out.email = argv[++i]?.trim().toLowerCase();
    else if (arg === '--password') out.password = argv[++i];
    else if (arg === '--name') out.name = argv[++i]?.trim();
  }
  return out;
}

async function assertMobileAdminsTable() {
  const { error } = await supabase.from('mobile_admins').select('id').limit(1);
  const missing =
    error &&
    (error.message.includes('does not exist') ||
      error.message.includes('schema cache') ||
      error.code === '42P01');
  if (missing) {
    console.error('La tabla mobile_admins no existe. Aplicá la migración en Supabase SQL Editor:');
    console.error('  backend/db/084_mobile_admins.sql');
    console.error('O con connection string: npm run mobile-admin:migrate');
    process.exit(1);
  }
  if (error) throw new Error(error.message);
}

async function findAuthUserByEmail(email: string) {
  let page = 1;
  const perPage = 200;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data.users ?? [];
    const hit = users.find((u) => u.email?.trim().toLowerCase() === email);
    if (hit) return hit;
    if (users.length < perPage) break;
    page++;
  }
  return null;
}

async function listMobileAdmins() {
  await assertMobileAdminsTable();
  const { data: rows, error } = await supabase
    .from('mobile_admins')
    .select('id, auth_user_id, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  if (!rows?.length) {
    console.log('No hay admins en public.mobile_admins.');
    return;
  }

  console.log(`Mobile admins (${rows.length}):`);
  for (const row of rows) {
    const authUserId = String((row as { auth_user_id: string }).auth_user_id);
    const { data: userData } = await supabase.auth.admin.getUserById(authUserId);
    const email = userData.user?.email ?? '(sin email)';
    console.log(`- ${email}  mobile_admin_id=${(row as { id: string }).id}`);
  }
}

async function removeMobileAdmin(email: string) {
  await assertMobileAdminsTable();
  const authUser = await findAuthUserByEmail(email);
  if (!authUser) {
    console.error(`No existe usuario Auth: ${email}`);
    process.exit(1);
  }
  const { data, error } = await supabase
    .from('mobile_admins')
    .delete()
    .eq('auth_user_id', authUser.id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) {
    console.log(`${email} no era mobile admin.`);
  } else {
    console.log(`Mobile admin removido: ${email}`);
  }
}

async function createMobileAdmin(args: CliArgs) {
  await assertMobileAdminsTable();
  const email = args.email?.trim().toLowerCase();
  if (!email) {
    console.error('Falta --email. Ejemplo: npm run mobile-admin:create -- --email admin@wematch.com --password "MiPass123!"');
    process.exit(1);
  }

  let authUser = await findAuthUserByEmail(email);

  if (!authUser) {
    if (!args.password) {
      console.error(`No existe usuario Auth con email ${email}. Pasá --password para crearlo.`);
      process.exit(1);
    }
    if (args.password.length < 8) {
      console.error('La contraseña debe tener al menos 8 caracteres.');
      process.exit(1);
    }

    console.log(`Creando usuario Auth: ${email}`);
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: args.password,
      email_confirm: true,
      user_metadata: args.name ? { full_name: args.name } : { full_name: 'WeMatch Mobile Admin' },
    });
    if (error) throw new Error(error.message);
    authUser = data.user ?? null;
    if (!authUser?.id) throw new Error('No se pudo crear el usuario en Auth');
  } else if (args.resetPassword && args.password) {
    if (args.password.length < 8) {
      console.error('La contraseña debe tener al menos 8 caracteres.');
      process.exit(1);
    }
    const { error } = await supabase.auth.admin.updateUserById(authUser.id, { password: args.password });
    if (error) throw new Error(error.message);
    console.log('Contraseña actualizada.');
  }

  const authUserId = authUser.id;
  const { data: existing, error: existingErr } = await supabase
    .from('mobile_admins')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);

  if (existing?.id) {
    console.log(`El usuario ya es mobile admin (mobile_admin_id=${existing.id}).`);
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from('mobile_admins')
      .insert([{ auth_user_id: authUserId }])
      .select('id')
      .single();
    if (insertErr) throw new Error(insertErr.message);
    console.log(`Mobile admin creado: mobile_admin_id=${inserted.id}`);
  }

  console.log('\nListo. Iniciá sesión en webapp-wechat (puerto 5174):');
  console.log(`  Email: ${email}`);
  console.log('\nNota: esto NO otorga acceso al panel /admin de web-app.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    await listMobileAdmins();
    return;
  }
  if (args.remove) {
    const email = args.email?.trim().toLowerCase();
    if (!email) {
      console.error('Falta --email para --remove');
      process.exit(1);
    }
    await removeMobileAdmin(email);
    return;
  }
  await createMobileAdmin(args);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
