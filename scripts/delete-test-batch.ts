/**
 * Delete Test Batch Script
 * 
 * Deletes a test user generation batch and all related data.
 * 
 * Usage: npx ts-node scripts/delete-test-batch.ts <batch-id>
 * 
 * Or list all batches: npx ts-node scripts/delete-test-batch.ts --list
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables:');
  console.error('   VITE_SUPABASE_URL or SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function listBatches() {
  console.log('📋 Test Generation Batches:\n');
  
  const { data, error } = await supabase
    .from('test_generation_batches')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('❌ Failed to list batches:', error.message);
    return;
  }
  
  if (!data?.length) {
    console.log('   No test batches found.');
    return;
  }
  
  console.log('   ID                                   | Name                    | Users | Solutions | Badges | Likes | Created');
  console.log('   ' + '-'.repeat(120));
  
  for (const batch of data) {
    const date = new Date(batch.created_at).toLocaleDateString();
    console.log(
      `   ${batch.id} | ${batch.batch_name.padEnd(23)} | ${String(batch.user_count).padStart(5)} | ${String(batch.solutions_count).padStart(9)} | ${String(batch.badges_count).padStart(6)} | ${String(batch.likes_count).padStart(5)} | ${date}`
    );
  }
  
  console.log('\n📌 To delete a batch, run:');
  console.log('   npx ts-node scripts/delete-test-batch.ts <batch-id>');
}

async function deleteBatch(batchId: string) {
  console.log(`🗑️  Deleting batch: ${batchId}\n`);
  
  // Get batch info first
  const { data: batch, error: batchError } = await supabase
    .from('test_generation_batches')
    .select('*')
    .eq('id', batchId)
    .single();
  
  if (batchError || !batch) {
    console.error('❌ Batch not found:', batchId);
    return;
  }
  
  console.log(`   Batch: ${batch.batch_name}`);
  console.log(`   Users: ${batch.user_count}`);
  console.log(`   Solutions: ${batch.solutions_count}`);
  console.log(`   Badges: ${batch.badges_count}`);
  console.log(`   Likes: ${batch.likes_count}\n`);
  
  // Get test user IDs
  const { data: testUsers } = await supabase
    .from('test_users')
    .select('id, email')
    .eq('batch_id', batchId);
  
  if (!testUsers?.length) {
    console.log('⚠️  No test users found in this batch');
    
    // Still delete the batch record
    await supabase
      .from('test_generation_batches')
      .delete()
      .eq('id', batchId);
    
    console.log('✅ Batch record deleted');
    return;
  }
  
  const userIds = testUsers.map(u => u.id);
  console.log(`📝 Deleting data for ${userIds.length} users...\n`);
  
  // Delete solution_likes
  const { count: likesCount } = await supabase
    .from('solution_likes')
    .delete({ count: 'exact' })
    .in('user_id', userIds);
  console.log(`   Deleted ${likesCount || 0} likes`);
  
  // Delete user_badges
  const { count: badgesCount } = await supabase
    .from('user_badges')
    .delete({ count: 'exact' })
    .in('user_id', userIds);
  console.log(`   Deleted ${badgesCount || 0} badges`);
  
  // Delete solutions
  const { count: solutionsCount } = await supabase
    .from('solutions')
    .delete({ count: 'exact' })
    .in('created_by', userIds);
  console.log(`   Deleted ${solutionsCount || 0} solutions`);
  
  // Delete user profiles
  const { count: profilesCount } = await supabase
    .from('users')
    .delete({ count: 'exact' })
    .in('id', userIds);
  console.log(`   Deleted ${profilesCount || 0} user profiles`);
  
  // Delete auth users
  let authDeleted = 0;
  for (const user of testUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (!error) authDeleted++;
  }
  console.log(`   Deleted ${authDeleted} auth users`);
  
  // Delete test_users records and batch
  await supabase
    .from('test_users')
    .delete()
    .eq('batch_id', batchId);
  
  await supabase
    .from('test_generation_batches')
    .delete()
    .eq('id', batchId);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ BATCH DELETED SUCCESSFULLY');
  console.log('='.repeat(50));
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--list' || args[0] === '-l') {
    await listBatches();
  } else {
    const batchId = args[0];
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(batchId)) {
      console.error('❌ Invalid batch ID format. Expected UUID.');
      console.log('\n📋 Use --list to see available batches');
      process.exit(1);
    }
    
    await deleteBatch(batchId);
  }
}

main();
