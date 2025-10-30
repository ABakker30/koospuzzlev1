// Import existing shape files into puzzles table
// Run with: npx tsx scripts/import-shapes-to-puzzles.ts

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface IJK {
  i: number;
  j: number;
  k: number;
}

interface ContainerV2 {
  schema: string;
  name: string;
  cid?: string;
  cells: number[][]; // Format: [[i,j,k], ...]
  meta?: {
    designer?: string;
    date?: string;
    description?: string;
  };
}

async function importShapesToPuzzles() {
  console.log('🚀 Importing shapes to puzzles table...\n');
  
  // Path to shapes directory
  const shapesDir = path.join(process.cwd(), 'public', 'data', 'containers', 'v1');
  
  if (!fs.existsSync(shapesDir)) {
    console.error('❌ Shapes directory not found:', shapesDir);
    return;
  }
  
  // Find all .fcc.json files (skip manifest and subdirectories for now)
  const allFiles = fs.readdirSync(shapesDir);
  const files = allFiles.filter(f => f.endsWith('.fcc.json') && !f.includes('manifest'));
  console.log(`📁 Found ${files.length} shape files\n`);
  
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const file of files) {
    try {
      const filePath = path.join(shapesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const container: ContainerV2 = JSON.parse(content);
      
      if (!container.cells || container.cells.length === 0) {
        console.log(`⏭️  Skipping ${file} (no cells)`);
        skipped++;
        continue;
      }
      
      // Convert [[i,j,k], ...] to [{i,j,k}, ...]
      const geometry: IJK[] = container.cells.map(([i, j, k]) => ({ i, j, k }));
      
      const name = container.name || file.replace('.fcc.json', '');
      const cellCount = geometry.length;
      const designer = container.meta?.designer || 'Legacy Import';
      const description = container.meta?.description || `Imported from ${file}`;
      
      // Check if already imported
      const { data: existing } = await supabase
        .from('puzzles')
        .select('id')
        .eq('name', name)
        .single();
      
      if (existing) {
        console.log(`⏭️  Skipping ${name} (already exists)`);
        skipped++;
        continue;
      }
      
      // Import to puzzles table
      const { data, error } = await supabase
        .from('puzzles')
        .insert({
          name: name,
          creator_name: designer,
          description: description,
          challenge_message: `Can you solve this ${cellCount}-cell puzzle?`,
          visibility: 'public',
          geometry: geometry,
          actions: [],
          sphere_count: cellCount
        })
        .select()
        .single();
      
      if (error) {
        console.error(`❌ Error importing ${name}:`, error.message);
        errors++;
      } else {
        console.log(`✅ Imported ${name} (${cellCount} cells) - ID: ${data.id}`);
        console.log(`   URL: http://localhost:5173/solve/${data.id}`);
        imported++;
      }
      
    } catch (err: any) {
      console.error(`❌ Error processing ${file}:`, err.message);
      errors++;
    }
  }
  
  console.log('\n📊 Import Summary:');
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📁 Total: ${files.length}`);
}

// Run import
importShapesToPuzzles()
  .then(() => {
    console.log('\n✅ Import complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Import failed:', err);
    process.exit(1);
  });
