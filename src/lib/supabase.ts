import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// These placeholders keep the static site renderable before local environment
// variables are configured. Any request will safely fail with a visible error.
export const supabase = createClient(
  supabaseUrl || 'https://unconfigured.supabase.co',
  supabasePublishableKey || 'unconfigured-publishable-key',
);
