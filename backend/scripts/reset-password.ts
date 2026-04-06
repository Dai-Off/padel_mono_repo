import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetPassword() {
  const email = 'tradebotg@gmail.com';
  const newPassword = 'PadelUser2026!';

  console.log(`Resetting password for ${email}...`);

  const { data: { users } } = await supabase.auth.admin.listUsers();
  const user = users.find(u => u.email === email);

  if (!user) {
    console.error('User not found');
    return;
  }

  const { data, error } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: newPassword }
  );

  if (error) {
    console.error('Error resetting password:', error.message);
  } else {
    console.log(`Password reset successfully for ${email}`);
    console.log(`New Password: ${newPassword}`);
  }
}

resetPassword();
