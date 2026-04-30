import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data, error } = await supabase
    .from('players')
    .select('id, first_name, last_name, email, elo_rating, mu, liga')
    .lt('elo_rating', 3)
    .order('mu', { ascending: false })
    .limit(30);
    
  if (error) {
    console.error(error);
  } else {
    data.forEach(p => {
        if (p.first_name) {
             console.log(`ID: ${p.id} | Email: ${p.email} | Name: ${p.first_name} ${p.last_name} | ELO Rating: ${p.elo_rating} | mu: ${p.mu}`);
        }
    });
  }
}
run();
