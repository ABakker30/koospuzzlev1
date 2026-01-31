// Script to delete game mode solutions with incorrect placed_pieces format
// Run with: npx ts-node scripts/delete-broken-solutions.ts

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔍 Finding broken game mode solutions...');
  
  // First, preview what will be deleted
  const { data: toDelete, error: findError } = await supabase
    .from('solutions')
    .select('id, puzzle_id, solver_name, notes, created_at')
    .like('notes', 'Solved in Play Mode%');
  
  if (findError) {
    console.error('❌ Error finding solutions:', findError);
    process.exit(1);
  }
  
  if (!toDelete || toDelete.length === 0) {
    console.log('✅ No broken game mode solutions found.');
    return;
  }
  
  console.log(`\n📋 Found ${toDelete.length} solution(s) to delete:\n`);
  toDelete.forEach(s => {
    console.log(`  - ID: ${s.id}`);
    console.log(`    Puzzle: ${s.puzzle_id}`);
    console.log(`    Solver: ${s.solver_name}`);
    console.log(`    Created: ${s.created_at}\n`);
  });
  
  // Delete them
  const ids = toDelete.map(s => s.id);
  const { error: deleteError } = await supabase
    .from('solutions')
    .delete()
    .in('id', ids);
  
  if (deleteError) {
    console.error('❌ Error deleting solutions:', deleteError);
    process.exit(1);
  }
  
  console.log(`✅ Successfully deleted ${toDelete.length} broken solution(s).`);
}

main().catch(console.error);
