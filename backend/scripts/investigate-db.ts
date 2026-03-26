import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    // 1. Get the club Padel Club Madrid
    const { data: clubs, error: clubsError } = await supabase
        .from('clubs')
        .select('*')
        .ilike('name', '%Padel Club Madrid%');
    
    if (clubsError) {
        console.error('Error fetching clubs:', clubsError);
        return;
    }
    console.log('Clubs found:');
    console.log(JSON.stringify(clubs, null, 2));

    if (!clubs || clubs.length === 0) {
        console.log('No club found matching "Padel Club Madrid". Trying to list all clubs:');
        const { data: allClubs } = await supabase.from('clubs').select('id, name');
        console.log(JSON.stringify(allClubs, null, 2));
        return;
    }

    const club = clubs[0];
    const clubId = club.id;

    // 2. Get courts for the club
    const { data: courts, error: courtsError } = await supabase
        .from('courts')
        .select('id, name')
        .eq('club_id', clubId);
        
    if (courtsError) {
        console.error('Error fetching courts:', courtsError);
        return;
    }
    console.log('Courts for club:');
    console.log(JSON.stringify(courts, null, 2));

    // 3. Get some players
    const { data: players, error: playersError } = await supabase
        .from('players')
        .select('id, email, first_name, last_name')
        .limit(10);
        
    if (playersError) {
        console.error('Error fetching players:', playersError);
        return;
    }
    console.log('Players found:');
    console.log(JSON.stringify(players, null, 2));
}

main().catch(console.error);
