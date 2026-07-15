const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;

if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false }
    });
    console.log('Supabase client initialized');
} else {
    console.log('Supabase not configured — using local filesystem storage');
}

module.exports = supabase;
