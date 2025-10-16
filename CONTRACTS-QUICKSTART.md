# 🧩 Contracts Conversion - Quickstart Guide

## What This Does

Converts all legacy shapes and solutions in Supabase to the new deterministic ID-based contract format:
- **Before**: UUID-based IDs (e.g., `f9d3e847-0db1-46a4-949a-84b3ceed8d09`)
- **After**: Content-addressed IDs (e.g., `sha256:abc123...`) - same content = same ID

## Step 1: Run SQL Migration

1. Open [Supabase SQL Editor](https://app.supabase.com/project/YOUR_PROJECT/sql)
2. Copy contents of `supabase-contracts-migration.sql`
3. Run the SQL
4. Verify tables created:
   - `contracts_shapes`
   - `contracts_solutions`
   - `contracts_convert_reports`

## Step 2: Add Service Role Key

1. Go to [Supabase Dashboard → Settings → API](https://app.supabase.com/project/YOUR_PROJECT/settings/api)
2. Copy the `service_role` key (NOT the `anon` key)
3. Add to `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...your_service_role_key_here
```

**⚠️ NEVER commit this key to git!**

## Step 3: Run Tests (Optional but Recommended)

```bash
npm run test:contracts
```

This verifies the canonicalization logic works correctly.

## Step 4: Run Conversion

```bash
npm run convert:contracts
```

Watch the output:
- ✅ Shapes converted
- ✅ Solutions converted
- ✅ Idempotency verified
- ✅ Report generated

## Step 5: Check Results

### Console Output
```
🚀 Starting Contracts Conversion (Phase 1)

📦 Converting Shapes...
  Found 10 legacy shapes

  Processing shape: MyShape.json (dev-user/1234567890-MyShape.json)
  ✅ Converted: sha256:abc123...

✅ Shapes conversion complete: 10/10

🧩 Converting Solutions...
  Found 25 legacy solutions

  Processing solution: MySolution.json (dev-user/shape-id/1234567890-MySolution.json)
  ✅ Converted: sha256:def456...

✅ Solutions conversion complete: 25/25

============================================================
📊 CONVERSION SUMMARY
============================================================
Shapes:     10/10 converted
Solutions:  25/25 converted
Duplicates: 0 collapsed
Errors:     0
Hash Check: 35 passes, 0 failures
============================================================

📄 Report saved to: public/data/contracts/convert-report.json
✅ Report saved to Supabase contracts_convert_reports table

✅ Conversion completed successfully!
```

### Report File

Check `public/data/contracts/convert-report.json`:

```json
{
  "summary": {
    "shapesIn": 10,
    "shapesOut": 10,
    "solutionsIn": 25,
    "solutionsOut": 25,
    "duplicatesCollapsed": 0
  },
  "errors": [],
  "hashCheck": {
    "rehashPasses": 35,
    "rehashFailures": 0
  }
}
```

### Supabase Verification

1. **Check Tables**:
   ```sql
   SELECT COUNT(*) FROM contracts_shapes;
   SELECT COUNT(*) FROM contracts_solutions;
   SELECT * FROM contracts_convert_reports ORDER BY created_at DESC LIMIT 1;
   ```

2. **Check Storage**:
   - Go to Storage → `shapes` bucket
   - Look for files like `sha256:abc123....shape.json`
   - Go to Storage → `solutions` bucket
   - Look for files like `sha256:def456....solution.json`

## Exit Criteria (All Must Pass)

- ✅ Report shows 0 errors
- ✅ `hashCheck.rehashFailures` is 0
- ✅ All shapes accessible in `contracts_shapes` table
- ✅ All solutions accessible in `contracts_solutions` table
- ✅ Storage buckets contain new JSON files
- ✅ Re-running converter produces identical IDs

## Idempotency Test

Run the converter twice and compare IDs:

```bash
# First run
npm run convert:contracts > run1.log

# Second run
npm run convert:contracts > run2.log

# Compare - should show identical IDs
diff run1.log run2.log
```

**Expected**: No differences in IDs (timestamps will differ)

## Troubleshooting

### ❌ Missing Service Role Key
**Solution**: Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`

### ❌ Table Does Not Exist
**Solution**: Run `supabase-contracts-migration.sql` in Supabase SQL Editor

### ❌ Hash Verification Failures
**Solution**: Check canonicalization logic - IDs should be deterministic

### ❌ No Legacy Data Found
**Solution**: Ensure `shapes` and `solutions` tables have data

## What Happens to Legacy Data?

**Nothing!** The converter:
- ✅ Does NOT delete legacy tables
- ✅ Does NOT delete legacy storage files
- ✅ Does NOT modify legacy records
- ✅ Only creates NEW tables and files

Legacy data remains intact for rollback safety.

## Next Steps After Conversion

1. **Verify**: Spot-check converted shapes and solutions
2. **Test**: Verify app works with new contract format
3. **Deploy**: Push changes to production
4. **Archive**: (Optional) Mark legacy tables as deprecated
5. **Monitor**: Watch for any issues in production

## Files Created

- `supabase-contracts-migration.sql` - SQL migration
- `scripts/contracts/canonicalize.ts` - Hashing utilities
- `scripts/contracts/converter.ts` - Main converter
- `scripts/contracts/validate.test.ts` - Unit tests
- `scripts/contracts/README.md` - Detailed documentation
- `public/data/contracts/convert-report.json` - Conversion report

## Documentation

For detailed information, see:
- `scripts/contracts/README.md` - Full documentation
- `public/data/contracts/overview.md` - Contract schemas
- `public/data/contracts/id-hashing.md` - ID computation rules

---

**Ready?** Run `npm run convert:contracts` to start! 🚀
