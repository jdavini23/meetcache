import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sdplmnetwrlossumnmeb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Fg0wAL5W9oTfRG0xPBbMdw_i3t56c9F';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
