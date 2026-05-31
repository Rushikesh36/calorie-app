// Simple test script to insert a pending daily_log row using Supabase.
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.error('Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    process.exit(2);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const insert = {
      raw_input: 'Script test item',
      quantity: null,
      display_name: 'Script Test Item',
      status: 'pending',
    };

    console.log('Inserting test row...', insert);
    const { data, error } = await supabase.from('daily_logs').insert(insert).select('*').single();
    if (error) {
      console.error('Insert failed:', error);
      process.exit(1);
    }
    console.log('Insert succeeded:', data);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

main();
