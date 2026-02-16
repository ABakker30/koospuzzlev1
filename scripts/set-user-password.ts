/**
 * Set a password on a Supabase user (for dev/localhost testing)
 * 
 * Usage: npx ts-node scripts/set-user-password.ts <email> <password>
 * Example: npx ts-node scripts/set-user-password.ts antonbakker30@gmail.com mydevpass123
 * 
 * Requires: SUPABASE_SERVICE_ROLE_KEY environment variable
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables:');
  console.error('   VITE_SUPABASE_URL or SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: npx ts-node scripts/set-user-password.ts <email> <password>');
  console.error('Example: npx ts-node scripts/set-user-password.ts antonbakker30@gmail.com mydevpass123');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  // If email is 'list', just list all users
  if (email === 'list') {
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error('❌ Failed to list users:', listError.message);
      process.exit(1);
    }
    console.log(`Found ${users.length} auth users:`);
    users.forEach(u => console.log(`  ${u.email || '(no email)'} — ${u.id}`));
    return;
  }

  // Find user by email in auth (paginate to find all)
  let allUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (listError) {
      console.error('❌ Failed to list users:', listError.message);
      process.exit(1);
    }
    allUsers.push(...users);
    if (users.length < 100) break;
    page++;
  }

  console.log(`Scanned ${allUsers.length} auth users`);
  let user = allUsers.find(u => u.email === email);

  if (!user) {
    // User exists in auth (createUser said so) but listUsers didn't find them
    // Try to get the user ID from public.users and update password directly
    const { data: dbUser } = await supabase
      .from('users')
      .select('id, username, email')
      .eq('email', email)
      .single();

    if (dbUser) {
      console.log(`Found in public.users: ${dbUser.username} (${dbUser.id}). Trying to set password by ID...`);
      const { error: updateError } = await supabase.auth.admin.updateUserById(dbUser.id, { password });
      if (updateError) {
        console.error('❌ Failed to set password by DB user ID:', updateError.message);
        // Last resort: try to find via getUserById
        console.log('Trying alternative approach...');
        // List all auth users and find by partial match
        allUsers.forEach(u => {
          if (u.email?.includes('antonbakker') || u.email?.includes('bakker')) {
            console.log(`  Possible match: ${u.email} — ${u.id}`);
          }
        });
        process.exit(1);
      }
      console.log(`✅ Password set for ${email} (via DB user ID). Login at /login.`);
      return;
    }

    console.error(`❌ User ${email} not found in auth or public.users`);
    process.exit(1);
  }

  console.log(`Found auth user: ${user.email} (${user.id})`);

  // Set password
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (updateError) {
    console.error('❌ Failed to set password:', updateError.message);
    process.exit(1);
  }

  console.log(`✅ Password set for ${email}. You can now login at /login with email + password.`);
}

main();
