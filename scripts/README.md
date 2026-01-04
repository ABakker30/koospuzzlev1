# Test Data Generation Scripts

Scripts for generating and managing test user data for KOOS Puzzle.

## Prerequisites

1. Set environment variables:
   ```bash
   export SUPABASE_URL="your-supabase-url"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ```

2. Run the migration first:
   ```sql
   -- In Supabase SQL Editor, run:
   -- supabase/migrations/20260104_test_users_tracking.sql
   ```

## Generate Test Users

Creates 100 test users with:
- Real names and unique email addresses (`@testuser.generated` domain)
- Profile avatars (via UI Avatars API)
- 3-10 solution duplicates per user
- Badges (power law distribution)
- Puzzle likes (power law distribution)

```bash
npx ts-node scripts/generate-test-users.ts
```

### Configuration

Edit `CONFIG` in `generate-test-users.ts` to adjust:
- `userCount`: Number of users to generate (default: 100)
- `solutionsPerUser`: Min/max solutions per user
- `badgeDistribution`: Percentage of users receiving each badge
- `likesPerUser`: Power law distribution for likes

## Delete Test Batch

### List all batches:
```bash
npx ts-node scripts/delete-test-batch.ts --list
```

### Delete a specific batch:
```bash
npx ts-node scripts/delete-test-batch.ts <batch-uuid>
```

This will delete:
- All auth users in the batch
- All user profiles
- All solutions created by test users
- All badges assigned to test users
- All likes from test users
- The batch tracking records

## Database Tables

The scripts use these tracking tables:

### `test_generation_batches`
Tracks each generation run with summary stats.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Batch identifier |
| batch_name | TEXT | Human-readable name |
| user_count | INTEGER | Users in batch |
| solutions_count | INTEGER | Solutions created |
| badges_count | INTEGER | Badges assigned |
| likes_count | INTEGER | Likes created |
| created_at | TIMESTAMP | When generated |

### `test_users`
Links individual test users to their batch.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | User ID (matches auth.users) |
| batch_id | UUID | Parent batch |
| email | TEXT | User email |
| username | TEXT | User display name |

## Identifying Test Users

Test users can be identified by:
1. Email domain: `@testuser.generated`
2. Presence in `test_users` table
3. `user_metadata.is_test_user = true` in auth.users

## SQL Functions

### Delete batch via SQL:
```sql
SELECT * FROM delete_test_batch('batch-uuid-here');
```

### List batches via SQL:
```sql
SELECT * FROM list_test_batches();
```

## Avatar URLs

Avatars are generated using [UI Avatars](https://ui-avatars.com/):
- Format: `https://ui-avatars.com/api/?name=First+Last&background=COLOR&color=fff&size=128&bold=true`
- Random background colors for variety
- Consistent for same name (deterministic)
