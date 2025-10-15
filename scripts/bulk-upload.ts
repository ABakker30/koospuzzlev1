#!/usr/bin/env tsx
// Bulk upload shapes and solutions from local directories to Supabase
// Usage: npm run bulk-upload

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import * as dotenv from 'dotenv';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN; // Add this to .env.local temporarily

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Create Supabase client with access token if available
const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    headers: accessToken ? {
      Authorization: `Bearer ${accessToken}`
    } : {}
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Paths
const SHAPES_DIR = path.join(__dirname, '../public/data/containers/v1');
const SOLUTIONS_DIR = path.join(__dirname, '../public/data/Solutions');

interface UploadStats {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

async function uploadShape(filePath: string, stats: UploadStats) {
  const fileName = path.basename(filePath);
  console.log(`📦 Uploading shape: ${fileName}`);
  
  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Not authenticated. Please sign in first.');
    }

    // Read file
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    
    // Create blob
    const blob = new Blob([fileContent], { type: 'application/json' });
    const file = new File([blob], fileName, { type: 'application/json' });
    
    const id = uuid();
    const storagePath = `${user.id}/${id}-${fileName}`;
    
    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('shapes')
      .upload(storagePath, file);
    
    if (uploadError) throw uploadError;
    
    // Create database record
    const { error: dbError } = await supabase
      .from('shapes')
      .insert({
        id,
        user_id: user.id,
        name: fileName.replace('.fcc.json', '').replace('.json', ''),
        file_url: storagePath,
        size_bytes: Buffer.from(fileContent).length,
        metadata: {
          cellCount: data.cells?.length || 0,
          lattice: 'fcc'
        },
        format: 'legacy'
      });
    
    if (dbError) throw dbError;
    
    console.log(`  ✅ Success: ${fileName}`);
    stats.success++;
  } catch (error: any) {
    console.error(`  ❌ Failed: ${fileName} - ${error.message}`);
    stats.failed++;
    stats.errors.push(`${fileName}: ${error.message}`);
  }
}

async function uploadSolution(filePath: string, stats: UploadStats) {
  const fileName = path.basename(filePath);
  console.log(`🧩 Uploading solution: ${fileName}`);
  
  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Not authenticated. Please sign in first.');
    }

    // Read file
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    
    // Create blob
    const blob = new Blob([fileContent], { type: 'application/json' });
    const file = new File([blob], fileName, { type: 'application/json' });
    
    const id = uuid();
    const shapeId = 'unknown'; // We don't have shape linkage in the filename
    const storagePath = `${user.id}/${shapeId}/${Date.now()}-${fileName}`;
    
    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('solutions')
      .upload(storagePath, file);
    
    if (uploadError) throw uploadError;
    
    // Create database record
    const { error: dbError } = await supabase
      .from('solutions')
      .insert({
        id,
        user_id: user.id,
        shape_id: shapeId,
        name: fileName.replace('.json', ''),
        file_url: storagePath,
        size_bytes: Buffer.from(fileContent).length,
        metrics: {
          pieceCount: data.placements?.length || data.pieces?.length || 0,
          cellCount: data.container?.cells?.length || 0
        },
        format: 'legacy-solution'
      });
    
    if (dbError) throw dbError;
    
    console.log(`  ✅ Success: ${fileName}`);
    stats.success++;
  } catch (error: any) {
    console.error(`  ❌ Failed: ${fileName} - ${error.message}`);
    stats.failed++;
    stats.errors.push(`${fileName}: ${error.message}`);
  }
}

async function main() {
  console.log('🚀 Bulk Upload to Supabase Cloud Storage\n');
  
  // Check authentication
  if (!accessToken) {
    console.error('❌ No access token found in .env.local');
    console.error('   Add SUPABASE_ACCESS_TOKEN to .env.local\n');
    process.exit(1);
  }
  
  // Verify token by getting user
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    console.error('❌ Access token is invalid or expired!');
    console.error('   Error:', error?.message || 'No user found');
    console.error('   Get a new token from the browser console\n');
    process.exit(1);
  }
  
  console.log(`✅ Authenticated as: ${user.email}\n`);
  
  const shapeStats: UploadStats = { total: 0, success: 0, failed: 0, errors: [] };
  const solutionStats: UploadStats = { total: 0, success: 0, failed: 0, errors: [] };
  
  // Upload shapes
  console.log('📦 UPLOADING SHAPES\n');
  if (fs.existsSync(SHAPES_DIR)) {
    const files = fs.readdirSync(SHAPES_DIR)
      .filter(f => f.endsWith('.json') && f !== 'manifest.json')
      .map(f => path.join(SHAPES_DIR, f));
    
    shapeStats.total = files.length;
    console.log(`Found ${files.length} shape files\n`);
    
    for (const file of files) {
      await uploadShape(file, shapeStats);
    }
  } else {
    console.log(`❌ Shapes directory not found: ${SHAPES_DIR}\n`);
  }
  
  console.log('\n🧩 UPLOADING SOLUTIONS\n');
  if (fs.existsSync(SOLUTIONS_DIR)) {
    const files = fs.readdirSync(SOLUTIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(SOLUTIONS_DIR, f));
    
    solutionStats.total = files.length;
    console.log(`Found ${files.length} solution files\n`);
    
    for (const file of files) {
      await uploadSolution(file, solutionStats);
    }
  } else {
    console.log(`❌ Solutions directory not found: ${SOLUTIONS_DIR}\n`);
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 UPLOAD SUMMARY');
  console.log('='.repeat(60));
  console.log(`\n📦 SHAPES:`);
  console.log(`   Total:   ${shapeStats.total}`);
  console.log(`   Success: ${shapeStats.success}`);
  console.log(`   Failed:  ${shapeStats.failed}`);
  
  console.log(`\n🧩 SOLUTIONS:`);
  console.log(`   Total:   ${solutionStats.total}`);
  console.log(`   Success: ${solutionStats.success}`);
  console.log(`   Failed:  ${solutionStats.failed}`);
  
  if (shapeStats.errors.length > 0 || solutionStats.errors.length > 0) {
    console.log(`\n❌ ERRORS:`);
    [...shapeStats.errors, ...solutionStats.errors].forEach(err => {
      console.log(`   - ${err}`);
    });
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  if (shapeStats.failed > 0 || solutionStats.failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
