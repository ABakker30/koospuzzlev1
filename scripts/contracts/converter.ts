// scripts/contracts/converter.ts
// Converts legacy Supabase shapes and solutions to new contract format
// with deterministic IDs

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { canonicalizeShape, canonicalizeState, verifyIdempotency, KoosShape, KoosState } from './canonicalize.js';

// Load environment
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Initialize Supabase client with service role
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Conversion report structure
 */
interface ConversionReport {
  summary: {
    shapesIn: number;
    shapesOut: number;
    solutionsIn: number;
    solutionsOut: number;
    duplicatesCollapsed: number;
  };
  shapes: Array<{
    sourcePath: string;
    shapeId: string;
    cellsCount: number;
    status: 'converted' | 'duplicate' | 'skipped';
    reason?: string;
  }>;
  solutions: Array<{
    sourcePath: string;
    solutionId: string;
    shapeRef: string;
    placementsCount: number;
    status: 'converted' | 'duplicate' | 'skipped';
    reason?: string;
    full: boolean;
  }>;
  errors: Array<{
    sourcePath: string;
    message: string;
  }>;
  hashCheck: {
    rehashPasses: number;
    rehashFailures: number;
  };
}

/**
 * Legacy shape record from Supabase
 */
interface LegacyShape {
  id: string;
  file_url: string;
  name: string;
}

/**
 * Legacy solution record from Supabase
 */
interface LegacySolution {
  id: string;
  file_url: string;
  name?: string;
  shape_id?: string;
}

/**
 * Download and parse a JSON file from Supabase storage
 */
async function downloadJson(bucket: string, path: string): Promise<any> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  
  const text = await data.text();
  return JSON.parse(text);
}

/**
 * Upload a JSON file to Supabase storage
 */
async function uploadJson(bucket: string, path: string, data: any): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: 'application/json',
    upsert: true, // Overwrite if exists (idempotent)
  });
  
  if (error) throw error;
}

/**
 * Convert a legacy shape to the new contract format
 */
async function convertShape(legacy: LegacyShape, report: ConversionReport): Promise<KoosShape | null> {
  try {
    console.log(`  Processing shape: ${legacy.name} (${legacy.file_url})`);
    
    // Download legacy shape data
    const legacyData = await downloadJson('shapes', legacy.file_url);
    
    // Extract cells (assume legacy format has a cells array)
    const cells = legacyData.cells || legacyData.IJK || [];
    if (!Array.isArray(cells) || cells.length === 0) {
      throw new Error('Invalid or empty cells array');
    }
    
    // Canonicalize and compute ID
    const shape = canonicalizeShape({
      schema: 'koos.shape',
      version: 1,
      lattice: legacyData.lattice || 'fcc',
      cells,
    });
    
    // Verify idempotency
    const idempotent = verifyIdempotency(shape);
    if (idempotent) {
      report.hashCheck.rehashPasses++;
    } else {
      report.hashCheck.rehashFailures++;
      console.warn(`  ⚠️  Hash verification failed for ${legacy.name}`);
    }
    
    // Upload to new storage location
    const storagePath = `${shape.id}.shape.json`;
    await uploadJson('shapes', storagePath, shape);
    
    // Upsert to contracts_shapes table
    const { error: dbError } = await supabase
      .from('contracts_shapes')
      .upsert({
        id: shape.id,
        lattice: shape.lattice,
        cells: shape.cells,
        size: shape.cells.length,
      }, { onConflict: 'id' });
    
    if (dbError) throw dbError;
    
    report.shapes.push({
      sourcePath: legacy.file_url,
      shapeId: shape.id!,
      cellsCount: shape.cells.length,
      status: 'converted',
    });
    
    console.log(`  ✅ Converted: ${shape.id}`);
    return shape;
    
  } catch (err: any) {
    console.error(`  ❌ Error converting shape ${legacy.name}:`, err.message);
    report.errors.push({
      sourcePath: legacy.file_url,
      message: err.message,
    });
    return null;
  }
}

/**
 * Convert a legacy solution to the new contract format
 */
async function convertSolution(
  legacy: LegacySolution,
  shapeIdMap: Map<string, string>,
  report: ConversionReport
): Promise<KoosState | null> {
  try {
    console.log(`  Processing solution: ${legacy.name || legacy.id} (${legacy.file_url})`);
    
    // Download legacy solution data
    const legacyData = await downloadJson('solutions', legacy.file_url);
    
    // Find shape reference
    let shapeRef = '';
    if (legacy.shape_id && shapeIdMap.has(legacy.shape_id)) {
      shapeRef = shapeIdMap.get(legacy.shape_id)!;
    } else if (legacyData.shapeId) {
      shapeRef = legacyData.shapeId;
    } else {
      throw new Error('Missing shape reference');
    }
    
    // Extract placements
    const placements = legacyData.placements || legacyData.pieces || [];
    if (!Array.isArray(placements)) {
      throw new Error('Invalid placements array');
    }
    
    // Normalize placements to contract format
    const normalizedPlacements = placements.map((p: any) => ({
      pieceId: p.pieceId || p.id || p.name || 'UNKNOWN',
      anchorIJK: p.anchorIJK || p.position || [0, 0, 0],
      orientationIndex: p.orientationIndex ?? p.orientation ?? 0,
    }));
    
    // Canonicalize and compute ID
    const state = canonicalizeState({
      schema: 'koos.state',
      version: 1,
      shapeRef,
      placements: normalizedPlacements,
    });
    
    // Verify idempotency
    const idempotent = verifyIdempotency(state);
    if (idempotent) {
      report.hashCheck.rehashPasses++;
    } else {
      report.hashCheck.rehashFailures++;
      console.warn(`  ⚠️  Hash verification failed for ${legacy.name || legacy.id}`);
    }
    
    // Determine if full solution (has placements)
    const isFull = state.placements.length > 0;
    
    // Upload to new storage location
    const storagePath = `${state.id}.solution.json`;
    await uploadJson('solutions', storagePath, state);
    
    // Upsert to contracts_solutions table
    const { error: dbError } = await supabase
      .from('contracts_solutions')
      .upsert({
        id: state.id,
        shape_id: state.shapeRef,
        placements: state.placements,
        is_full: isFull,
      }, { onConflict: 'id' });
    
    if (dbError) throw dbError;
    
    report.solutions.push({
      sourcePath: legacy.file_url,
      solutionId: state.id!,
      shapeRef: state.shapeRef,
      placementsCount: state.placements.length,
      status: 'converted',
      full: isFull,
    });
    
    console.log(`  ✅ Converted: ${state.id}`);
    return state;
    
  } catch (err: any) {
    console.error(`  ❌ Error converting solution ${legacy.name || legacy.id}:`, err.message);
    report.errors.push({
      sourcePath: legacy.file_url,
      message: err.message,
    });
    return null;
  }
}

/**
 * Main conversion function
 */
async function runConversion(): Promise<ConversionReport> {
  console.log('🚀 Starting Contracts Conversion (Phase 1)\n');
  
  const report: ConversionReport = {
    summary: {
      shapesIn: 0,
      shapesOut: 0,
      solutionsIn: 0,
      solutionsOut: 0,
      duplicatesCollapsed: 0,
    },
    shapes: [],
    solutions: [],
    errors: [],
    hashCheck: {
      rehashPasses: 0,
      rehashFailures: 0,
    },
  };
  
  // Track shape ID mapping (legacy UUID -> new content hash)
  const shapeIdMap = new Map<string, string>();
  
  // Step 1: Convert shapes
  console.log('📦 Converting Shapes...');
  const { data: legacyShapes, error: shapesError } = await supabase
    .from('shapes')
    .select('id, file_url, name');
  
  if (shapesError) {
    console.error('❌ Error fetching shapes:', shapesError);
    throw shapesError;
  }
  
  report.summary.shapesIn = legacyShapes?.length || 0;
  console.log(`  Found ${report.summary.shapesIn} legacy shapes\n`);
  
  for (const legacyShape of legacyShapes || []) {
    const shape = await convertShape(legacyShape, report);
    if (shape) {
      shapeIdMap.set(legacyShape.id, shape.id!);
      report.summary.shapesOut++;
    }
  }
  
  console.log(`\n✅ Shapes conversion complete: ${report.summary.shapesOut}/${report.summary.shapesIn}\n`);
  
  // Step 2: Convert solutions
  console.log('🧩 Converting Solutions...');
  const { data: legacySolutions, error: solutionsError } = await supabase
    .from('solutions')
    .select('id, file_url, name, shape_id');
  
  if (solutionsError) {
    console.error('❌ Error fetching solutions:', solutionsError);
    throw solutionsError;
  }
  
  report.summary.solutionsIn = legacySolutions?.length || 0;
  console.log(`  Found ${report.summary.solutionsIn} legacy solutions\n`);
  
  for (const legacySolution of legacySolutions || []) {
    const state = await convertSolution(legacySolution, shapeIdMap, report);
    if (state) {
      report.summary.solutionsOut++;
    }
  }
  
  console.log(`\n✅ Solutions conversion complete: ${report.summary.solutionsOut}/${report.summary.solutionsIn}\n`);
  
  // Step 3: Check for duplicates (same ID from different sources)
  const uniqueShapeIds = new Set(report.shapes.map(s => s.shapeId));
  const uniqueSolutionIds = new Set(report.solutions.map(s => s.solutionId));
  
  report.summary.duplicatesCollapsed = 
    (report.summary.shapesOut - uniqueShapeIds.size) +
    (report.summary.solutionsOut - uniqueSolutionIds.size);
  
  if (report.summary.duplicatesCollapsed > 0) {
    console.log(`ℹ️  Collapsed ${report.summary.duplicatesCollapsed} duplicate(s)\n`);
  }
  
  return report;
}

/**
 * Save report to file and database
 */
async function saveReport(report: ConversionReport): Promise<void> {
  // Save to local file
  const reportPath = path.join(process.cwd(), 'public', 'data', 'contracts', 'convert-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to: ${reportPath}`);
  
  // Save to database
  const { error } = await supabase
    .from('contracts_convert_reports')
    .insert({
      summary: report.summary,
      shapes: report.shapes,
      solutions: report.solutions,
      errors: report.errors,
      hash_check: report.hashCheck,
    });
  
  if (error) {
    console.warn('⚠️  Could not save report to database:', error.message);
  } else {
    console.log('✅ Report saved to Supabase contracts_convert_reports table');
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    const report = await runConversion();
    
    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 CONVERSION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Shapes:     ${report.summary.shapesOut}/${report.summary.shapesIn} converted`);
    console.log(`Solutions:  ${report.summary.solutionsOut}/${report.summary.solutionsIn} converted`);
    console.log(`Duplicates: ${report.summary.duplicatesCollapsed} collapsed`);
    console.log(`Errors:     ${report.errors.length}`);
    console.log(`Hash Check: ${report.hashCheck.rehashPasses} passes, ${report.hashCheck.rehashFailures} failures`);
    console.log('='.repeat(60) + '\n');
    
    // Save report
    await saveReport(report);
    
    // Exit with error if there were failures
    if (report.errors.length > 0 || report.hashCheck.rehashFailures > 0) {
      console.error('⚠️  Conversion completed with errors. Review convert-report.json for details.');
      process.exit(1);
    }
    
    console.log('✅ Conversion completed successfully!\n');
    
  } catch (err: any) {
    console.error('\n❌ FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Export functions for testing
export { runConversion, saveReport };

// Run if executed directly (always run when script is executed)
main();
