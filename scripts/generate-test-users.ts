/**
 * Test User Generation Script
 * 
 * Generates 100 test users with:
 * - Real names and email addresses (@testuser.generated domain)
 * - Profile avatars (using UI Avatars API)
 * - 3-10 solution duplicates per user
 * - Badge assignments (power law distribution)
 * - Puzzle likes (power law distribution)
 * 
 * Usage: npx ts-node scripts/generate-test-users.ts
 * 
 * All generated data is tracked and can be deleted using:
 * SELECT * FROM delete_test_batch('batch-uuid-here');
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';

// Configuration
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

// Test user configuration
const CONFIG = {
  userCount: 100,
  emailDomain: '@testuser.generated',
  solutionsPerUser: { min: 3, max: 10 },
  // Badge distribution (percentage of users who get each badge)
  badgeDistribution: {
    new_explorer: 1.0,      // 100% - everyone gets this
    solver_1: 0.80,         // 80%
    solver_2: 0.40,         // 40%
    solver_3: 0.10,         // 10%
    puzzle_maker_1: 0.30,   // 30%
    puzzle_maker_2: 0.10,   // 10%
    puzzle_maker_3: 0.03,   // 3%
    ai_challenger: 0.15,    // 15%
  },
  // Likes per user (power law: most users give few likes, some give many)
  likesPerUser: { min: 0, max: 25, powerLawExponent: 2 },
  // Account age distribution (days ago)
  accountAge: { min: 1, max: 365 },
};

// First names (diverse, international)
const FIRST_NAMES = [
  'James', 'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'William', 'Sophia', 'Oliver', 'Isabella',
  'Benjamin', 'Mia', 'Elijah', 'Charlotte', 'Lucas', 'Amelia', 'Mason', 'Harper', 'Logan', 'Evelyn',
  'Alexander', 'Abigail', 'Ethan', 'Emily', 'Jacob', 'Elizabeth', 'Michael', 'Sofia', 'Daniel', 'Avery',
  'Hiroshi', 'Yuki', 'Kenji', 'Sakura', 'Takeshi', 'Aiko', 'Ryu', 'Hana', 'Akira', 'Mei',
  'Wei', 'Xiao', 'Chen', 'Lin', 'Ming', 'Yan', 'Jun', 'Hui', 'Feng', 'Lei',
  'Raj', 'Priya', 'Arjun', 'Ananya', 'Vikram', 'Deepa', 'Sanjay', 'Kavita', 'Amit', 'Neha',
  'Mohammed', 'Fatima', 'Ahmed', 'Aisha', 'Omar', 'Layla', 'Yusuf', 'Zara', 'Ali', 'Noor',
  'Carlos', 'Maria', 'Diego', 'Sofia', 'Luis', 'Valentina', 'Miguel', 'Camila', 'Andres', 'Isabella',
  'Pierre', 'Marie', 'Jean', 'Sophie', 'Antoine', 'Camille', 'Nicolas', 'Chloe', 'Thomas', 'Emma',
  'Hans', 'Anna', 'Klaus', 'Lena', 'Stefan', 'Julia', 'Markus', 'Laura', 'Felix', 'Sarah',
];

// Last names (diverse, international)
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Tanaka', 'Yamamoto', 'Watanabe', 'Suzuki', 'Takahashi', 'Sato', 'Nakamura', 'Kobayashi', 'Kato', 'Ito',
  'Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou',
  'Patel', 'Sharma', 'Kumar', 'Singh', 'Gupta', 'Reddy', 'Rao', 'Kapoor', 'Verma', 'Joshi',
  'Al-Hassan', 'Al-Rashid', 'El-Amin', 'Mansour', 'Nasser', 'Khalil', 'Ibrahim', 'Hassan', 'Ali', 'Ahmed',
  'Fernandez', 'Torres', 'Rivera', 'Morales', 'Ortiz', 'Reyes', 'Cruz', 'Flores', 'Ramos', 'Diaz',
  'Dubois', 'Laurent', 'Bernard', 'Moreau', 'Lefebvre', 'Leroy', 'Roux', 'David', 'Bertrand', 'Morel',
  'Mueller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann',
];

// Utility functions
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function powerLawRandom(min: number, max: number, exponent: number): number {
  // Generate power law distributed random number (more values near min)
  const u = Math.random();
  const value = min + (max - min) * Math.pow(u, exponent);
  return Math.floor(value);
}

function generateUsername(firstName: string, lastName: string, index: number): string {
  const styles = [
    () => `${firstName}${lastName}`,
    () => `${firstName}_${lastName}`,
    () => `${firstName}${lastName}${randomInt(1, 99)}`,
    () => `${firstName.toLowerCase()}${lastName.charAt(0).toUpperCase()}`,
    () => `${firstName}${randomInt(100, 999)}`,
  ];
  return randomElement(styles)();
}

function generateAvatarUrl(firstName: string, lastName: string): string {
  // Use UI Avatars API for consistent, professional avatars
  const name = encodeURIComponent(`${firstName} ${lastName}`);
  const backgrounds = ['0D8ABC', '2E7D32', '6A1B9A', 'C62828', 'EF6C00', '1565C0', '00695C'];
  const bg = randomElement(backgrounds);
  return `https://ui-avatars.com/api/?name=${name}&background=${bg}&color=fff&size=128&bold=true`;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

interface TestUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  registeredAt: Date;
  lastActiveAt: Date;
}

interface GenerationStats {
  users: number;
  solutions: number;
  badges: number;
  likes: number;
}

async function generateUsers(count: number): Promise<TestUser[]> {
  const users: TestUser[] = [];
  const usedEmails = new Set<string>();
  const usedUsernames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const firstName = randomElement(FIRST_NAMES);
    const lastName = randomElement(LAST_NAMES);
    
    // Generate unique email
    let email: string;
    let attempts = 0;
    do {
      const suffix = attempts > 0 ? randomInt(1, 9999) : '';
      email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}${CONFIG.emailDomain}`;
      attempts++;
    } while (usedEmails.has(email) && attempts < 100);
    usedEmails.add(email);
    
    // Generate unique username
    let username: string;
    attempts = 0;
    do {
      username = generateUsername(firstName, lastName, i);
      attempts++;
    } while (usedUsernames.has(username.toLowerCase()) && attempts < 100);
    usedUsernames.add(username.toLowerCase());
    
    // Generate dates
    const accountAgeDays = randomInt(CONFIG.accountAge.min, CONFIG.accountAge.max);
    const registeredAt = daysAgo(accountAgeDays);
    const lastActiveDaysAgo = randomInt(0, Math.min(30, accountAgeDays));
    const lastActiveAt = daysAgo(lastActiveDaysAgo);
    
    users.push({
      id: uuid(),
      email,
      username,
      firstName,
      lastName,
      avatarUrl: generateAvatarUrl(firstName, lastName),
      registeredAt,
      lastActiveAt,
    });
  }

  return users;
}

async function createBatch(name: string): Promise<string> {
  const { data, error } = await supabase
    .from('test_generation_batches')
    .insert({ batch_name: name })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create batch: ${error.message}`);
  return data.id;
}

async function insertUsers(users: TestUser[], batchId: string): Promise<void> {
  console.log(`📝 Creating ${users.length} auth users...`);
  
  // Create auth users first (required for foreign key)
  for (const user of users) {
    const { error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: `TestUser${randomInt(10000, 99999)}!`,
      email_confirm: true,
      user_metadata: { 
        full_name: `${user.firstName} ${user.lastName}`,
        is_test_user: true 
      }
    });
    
    if (authError) {
      console.error(`  ⚠️ Failed to create auth user ${user.email}: ${authError.message}`);
      continue;
    }
  }
  
  // Get the created auth user IDs
  const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw new Error(`Failed to list users: ${listError.message}`);
  
  const authUserMap = new Map<string, string>();
  for (const authUser of authUsers.users) {
    if (authUser.email?.endsWith(CONFIG.emailDomain)) {
      authUserMap.set(authUser.email, authUser.id);
    }
  }
  
  console.log(`📝 Inserting ${users.length} user profiles...`);
  
  // Insert user profiles
  for (const user of users) {
    const authId = authUserMap.get(user.email);
    if (!authId) {
      console.error(`  ⚠️ No auth user found for ${user.email}`);
      continue;
    }
    
    // Update user ID to match auth ID
    user.id = authId;
    
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: authId,
        email: user.email,
        username: user.username,
        avatar_url: user.avatarUrl,
        preferredlanguage: 'English',
        termsaccepted: true,
      });
    
    if (profileError) {
      console.error(`  ⚠️ Failed to create profile for ${user.email}: ${profileError.message}`);
      continue;
    }
    
    // Track in test_users table
    await supabase
      .from('test_users')
      .insert({
        id: authId,
        batch_id: batchId,
        email: user.email,
        username: user.username,
      });
  }
}

async function duplicateSolutions(users: TestUser[]): Promise<number> {
  console.log(`📝 Duplicating solutions for ${users.length} users...`);
  
  // Get existing solutions to duplicate
  const { data: existingSolutions, error: solError } = await supabase
    .from('solutions')
    .select('*')
    .limit(200);
  
  if (solError || !existingSolutions?.length) {
    console.error('  ⚠️ No existing solutions to duplicate');
    return 0;
  }
  
  let totalSolutions = 0;
  
  for (const user of users) {
    const solutionCount = randomInt(CONFIG.solutionsPerUser.min, CONFIG.solutionsPerUser.max);
    
    for (let i = 0; i < solutionCount; i++) {
      const template = randomElement(existingSolutions);
      
      // Create new solution based on template (pure UUID, no prefix)
      const newSolutionId = uuid();
      const createdDaysAgo = randomInt(0, 
        Math.floor((Date.now() - user.registeredAt.getTime()) / (1000 * 60 * 60 * 24))
      );
      
      const { error: insertError } = await supabase
        .from('solutions')
        .insert({
          id: newSolutionId,
          puzzle_id: template.puzzle_id,
          solver_name: user.username,
          created_by: user.id,
          solution_type: 'manual',
          final_geometry: template.final_geometry,
          actions: template.actions,
          placed_pieces: template.placed_pieces,
          solve_time_ms: randomInt(30000, 600000), // 30s to 10min
          move_count: randomInt(5, 50),
          created_at: daysAgo(createdDaysAgo).toISOString(),
        });
      
      if (insertError) {
        console.error(`    ⚠️ Solution insert error: ${insertError.message}`);
      } else {
        totalSolutions++;
      }
    }
  }
  
  console.log(`  ✅ Created ${totalSolutions} solutions`);
  return totalSolutions;
}

async function assignBadges(users: TestUser[]): Promise<number> {
  console.log(`📝 Assigning badges to ${users.length} users...`);
  
  let totalBadges = 0;
  
  for (const user of users) {
    const badgesToAssign: string[] = [];
    
    for (const [badgeId, probability] of Object.entries(CONFIG.badgeDistribution)) {
      if (Math.random() < probability) {
        badgesToAssign.push(badgeId);
      }
    }
    
    for (const badgeId of badgesToAssign) {
      const earnedDaysAgo = randomInt(0,
        Math.floor((Date.now() - user.registeredAt.getTime()) / (1000 * 60 * 60 * 24))
      );
      
      const { error } = await supabase
        .from('user_badges')
        .insert({
          user_id: user.id,
          badge_id: badgeId,
          earned_at: daysAgo(earnedDaysAgo).toISOString(),
        });
      
      if (!error) {
        totalBadges++;
      }
    }
  }
  
  console.log(`  ✅ Assigned ${totalBadges} badges`);
  return totalBadges;
}

async function assignLikes(users: TestUser[]): Promise<number> {
  console.log(`📝 Assigning likes from ${users.length} users...`);
  
  // Get all solutions to like
  const { data: solutions, error: solError } = await supabase
    .from('solutions')
    .select('id')
    .limit(500);
  
  if (solError || !solutions?.length) {
    console.error('  ⚠️ No solutions to like');
    return 0;
  }
  
  let totalLikes = 0;
  
  for (const user of users) {
    const likeCount = powerLawRandom(
      CONFIG.likesPerUser.min,
      CONFIG.likesPerUser.max,
      CONFIG.likesPerUser.powerLawExponent
    );
    
    // Pick random solutions to like (without duplicates)
    const shuffled = [...solutions].sort(() => Math.random() - 0.5);
    const toLike = shuffled.slice(0, Math.min(likeCount, shuffled.length));
    
    for (const solution of toLike) {
      const { error } = await supabase
        .from('solution_likes')
        .insert({
          solution_id: solution.id,
          user_id: user.id,
        });
      
      if (error) {
        console.error(`    ⚠️ Like insert error: ${error.message}`);
      } else {
        totalLikes++;
        
        // Also update like_count on solution
        await supabase.rpc('increment_solution_likes', { p_solution_id: solution.id });
      }
    }
  }
  
  console.log(`  ✅ Created ${totalLikes} likes`);
  return totalLikes;
}

async function updateBatchStats(batchId: string, stats: GenerationStats): Promise<void> {
  await supabase
    .from('test_generation_batches')
    .update({
      user_count: stats.users,
      solutions_count: stats.solutions,
      badges_count: stats.badges,
      likes_count: stats.likes,
    })
    .eq('id', batchId);
}

async function main() {
  console.log('🚀 Starting test user generation...\n');
  console.log(`   Users to create: ${CONFIG.userCount}`);
  console.log(`   Solutions per user: ${CONFIG.solutionsPerUser.min}-${CONFIG.solutionsPerUser.max}`);
  console.log(`   Email domain: ${CONFIG.emailDomain}\n`);
  
  try {
    // Create batch
    const batchName = `Test Batch ${new Date().toISOString().split('T')[0]}`;
    const batchId = await createBatch(batchName);
    console.log(`📦 Created batch: ${batchId}\n`);
    
    // Generate user data
    const users = await generateUsers(CONFIG.userCount);
    console.log(`👥 Generated ${users.length} user profiles\n`);
    
    // Insert users
    await insertUsers(users, batchId);
    
    // Filter to only successfully created users
    const { data: createdUsers } = await supabase
      .from('test_users')
      .select('id, email, username')
      .eq('batch_id', batchId);
    
    const validUsers = users.filter(u => 
      createdUsers?.some(cu => cu.email === u.email)
    );
    
    console.log(`\n✅ Successfully created ${validUsers.length} users\n`);
    
    // Duplicate solutions
    const solutionsCount = await duplicateSolutions(validUsers);
    
    // Assign badges
    const badgesCount = await assignBadges(validUsers);
    
    // Assign likes
    const likesCount = await assignLikes(validUsers);
    
    // Update batch stats
    await updateBatchStats(batchId, {
      users: validUsers.length,
      solutions: solutionsCount,
      badges: badgesCount,
      likes: likesCount,
    });
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ GENERATION COMPLETE');
    console.log('='.repeat(50));
    console.log(`   Batch ID: ${batchId}`);
    console.log(`   Users: ${validUsers.length}`);
    console.log(`   Solutions: ${solutionsCount}`);
    console.log(`   Badges: ${badgesCount}`);
    console.log(`   Likes: ${likesCount}`);
    console.log('\n📌 To delete this batch, run:');
    console.log(`   SELECT * FROM delete_test_batch('${batchId}');`);
    
  } catch (error) {
    console.error('❌ Generation failed:', error);
    process.exit(1);
  }
}

main();
