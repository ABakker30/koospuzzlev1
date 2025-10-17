/**
 * Batch script to add friendly names to shapes in the database
 * Reads shape files from public/data/containers/v1 and updates metadata
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

// Supabase connection
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface LegacyShape {
  lattice: string;
  cells: [number, number, number][];
}

interface ShapeMapping {
  filename: string;
  friendlyName: string;
  hash: string;
  size: number;
}

/**
 * Calculate SHA256 hash of shape (matching the ID format in database)
 */
function calculateShapeHash(shape: LegacyShape): string {
  // Normalize: sort cells lexicographically
  const sortedCells = [...shape.cells].sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[2] - b[2];
  });

  // Create canonical JSON representation
  const canonical = JSON.stringify({
    lattice: shape.lattice,
    cells: sortedCells
  });

  // Calculate hash
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Extract friendly name from filename
 */
function extractFriendlyName(filename: string): string {
  // Remove extension
  let name = filename.replace('.fcc.json', '');
  
  // Convert underscores to spaces
  name = name.replace(/_/g, ' ');
  
  // Capitalize first letter of each word
  name = name.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
  
  return name;
}

/**
 * Read all shape files and create mappings
 */
function readShapeFiles(dirPath: string): ShapeMapping[] {
  const mappings: ShapeMapping[] = [];
  const files = readdirSync(dirPath);

  for (const filename of files) {
    // Skip non-JSON files
    if (!filename.endsWith('.fcc.json')) continue;

    try {
      const filePath = join(dirPath, filename);
      const content = readFileSync(filePath, 'utf-8');
      const shape: LegacyShape = JSON.parse(content);

      const hash = calculateShapeHash(shape);
      const friendlyName = extractFriendlyName(filename);

      mappings.push({
        filename,
        friendlyName,
        hash,
        size: shape.cells.length
      });

      console.log(`✅ Processed: ${filename} → ${friendlyName} (${hash.substring(0, 16)}...)`);
    } catch (error) {
      console.error(`❌ Failed to process ${filename}:`, error);
    }
  }

  return mappings;
}

/**
 * Update database with friendly names
 */
async function updateDatabase(mappings: ShapeMapping[]) {
  console.log(`\n📝 Updating ${mappings.length} shapes in database...`);

  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  for (const mapping of mappings) {
    try {
      // Check if shape exists
      const { data: existing, error: fetchError } = await supabase
        .from('contracts_shapes')
        .select('id, metadata')
        .eq('id', mapping.hash)
        .single();

      if (fetchError || !existing) {
        console.log(`⚠️  Shape not found in DB: ${mapping.friendlyName} (${mapping.hash.substring(0, 16)}...)`);
        notFoundCount++;
        continue;
      }

      // Update metadata with friendly name
      const metadata = existing.metadata || {};
      metadata.name = mapping.friendlyName;
      metadata.originalFilename = mapping.filename;

      const { error: updateError } = await supabase
        .from('contracts_shapes')
        .update({ metadata })
        .eq('id', mapping.hash);

      if (updateError) {
        console.error(`❌ Failed to update ${mapping.friendlyName}:`, updateError);
        errorCount++;
      } else {
        console.log(`✅ Updated: ${mapping.friendlyName}`);
        successCount++;
      }
    } catch (error) {
      console.error(`❌ Error updating ${mapping.friendlyName}:`, error);
      errorCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Successfully updated: ${successCount}`);
  console.log(`   ⚠️  Not found in DB: ${notFoundCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting batch shape name update...\n');

  // Validate Supabase connection
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  // Read shape files
  const shapesDir = join(process.cwd(), 'public', 'data', 'containers', 'v1');
  console.log(`📂 Reading shapes from: ${shapesDir}\n`);
  
  const mappings = readShapeFiles(shapesDir);
  console.log(`\n📋 Found ${mappings.length} shape files to process`);

  // Update database
  await updateDatabase(mappings);

  console.log('\n✅ Batch update complete!');
}

// Run the script
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
