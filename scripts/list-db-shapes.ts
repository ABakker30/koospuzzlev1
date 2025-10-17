/**
 * Diagnostic script to list all shapes in database
 * Shows IDs, sizes, and metadata to help match with legacy files
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('📊 Fetching shapes from database...\n');

  const { data: shapes, error } = await supabase
    .from('contracts_shapes')
    .select('*')
    .order('size', { ascending: true });

  if (error) {
    console.error('❌ Error fetching shapes:', error);
    process.exit(1);
  }

  if (!shapes || shapes.length === 0) {
    console.log('⚠️  No shapes found in database');
    return;
  }

  console.log(`Found ${shapes.length} shapes:\n`);

  for (const shape of shapes) {
    const name = shape.metadata?.name || '(no name)';
    const shortId = shape.id.substring(0, 20);
    console.log(`${name.padEnd(25)} | ${shape.size} cells | ${shortId}...`);
  }

  console.log(`\n✅ Total: ${shapes.length} shapes`);
}

main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
