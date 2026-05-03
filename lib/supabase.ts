import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zlwolnvhtcnaosznllhf.supabase.co';
const supabaseKey = 'sb_publishable_DJjvnMYf0D830HyUfksi3g_v6yDby0e';

export const supabase = createClient(supabaseUrl, supabaseKey);