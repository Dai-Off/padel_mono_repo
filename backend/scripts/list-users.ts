import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRoles() {
  const emails = [
    'martiingadeea1996@gmail.com',
    'tradebotg@gmail.com',
    'testpadelweb@gmail.com',
    'meiller.marcos@gmail.com'
  ];

  console.log('Checking roles for confirmed users...');

  for (const email of emails) {
    console.log(`\nEmail: ${email}`);
    
    const { data: player } = await supabase.from('players').select('id').eq('email', email).maybeSingle();
    const { data: owner } = await supabase.from('club_owners').select('id').eq('email', email).maybeSingle();
    const { data: admin } = await supabase.from('admins').select('id').eq('email', email).maybeSingle();

    if (player) console.log(`- Role: Player (ID: ${player.id})`);
    if (owner) console.log(`- Role: Club Owner (ID: ${owner.id})`);
    if (admin) console.log(`- Role: Admin (ID: ${admin.id})`);
    
    if (!player && !owner && !admin) {
        // Check by auth_user_id just in case email doesn't match in profile table
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const user = users.find(u => u.email === email);
        if (user) {
            const { data: p2 } = await supabase.from('players').select('id').eq('auth_user_id', user.id).maybeSingle();
            if (p2) console.log(`- Role: Player (by ID: ${p2.id})`);
        }
    }
  }
}

checkRoles();
