# Contracts Conversion System

This directory contains the converter that migrates legacy Supabase shapes and solutions to the new deterministic ID-based contract format.

## Overview

The converter implements the specifications from:
- `public/data/contracts/overview.md` - Contract schemas
- `public/data/contracts/id-hashing.md` - Deterministic ID computation
- `public/data/contracts/convert.config.json` - Configuration
- `public/data/contracts/report.schema.json` - Report format

## Files

- **`canonicalize.ts`** - Canonicalization and SHA256 hashing utilities
- **`converter.ts`** - Main conversion script with Supabase integration
- **`validate.test.ts`** - Unit tests for canonicalization logic
- **`README.md`** - This documentation

## Prerequisites

### 1. Run SQL Migration

First, create the new contract tables in Supabase:

```bash
# Run the SQL in your Supabase SQL Editor
# File: supabase-contracts-migration.sql
```

This creates:
- `contracts_shapes` - Content-addressed shapes
- `contracts_solutions` - Content-addressed solutions/states
- `contracts_convert_reports` - Conversion audit trail

### 2. Add Service Role Key

Add your Supabase service role key to `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**⚠️ SECURITY**: Never commit the service role key to git. It has full database access.

Get your service role key from:
- Supabase Dashboard → Settings → API → `service_role` key

### 3. Verify Storage Buckets

Ensure these storage buckets exist in Supabase:
- `shapes` - For legacy and new shape files
- `solutions` - For legacy and new solution files

## Running the Converter

### Test the Canonicalization Logic

```bash
npm run test:contracts
```

This runs unit tests to verify:
- Deterministic ID generation
- Cell sorting and deduplication
- Placement normalization and sorting
- Idempotency checks

### Run the Full Conversion

```bash
npm run convert:contracts
```

This will:
1. ✅ Fetch all legacy shapes from `shapes` table
2. ✅ Canonicalize each shape with deterministic ID
3. ✅ Upload to `shapes/<id>.shape.json` storage
4. ✅ Upsert to `contracts_shapes` table
5. ✅ Fetch all legacy solutions from `solutions` table
6. ✅ Canonicalize each solution with deterministic ID
7. ✅ Upload to `solutions/<id>.solution.json` storage
8. ✅ Upsert to `contracts_solutions` table
9. ✅ Verify idempotency (re-hash check)
10. ✅ Generate conversion report
11. ✅ Save report to `public/data/contracts/convert-report.json`
12. ✅ Save report to `contracts_convert_reports` table

## Output

### Conversion Report

The converter produces a detailed report matching `report.schema.json`:

```json
{
  "summary": {
    "shapesIn": 10,
    "shapesOut": 9,
    "solutionsIn": 25,
    "solutionsOut": 23,
    "duplicatesCollapsed": 3
  },
  "shapes": [
    {
      "sourcePath": "dev-user/1234567890-shape.json",
      "shapeId": "sha256:abc123...",
      "cellsCount": 25,
      "status": "converted"
    }
  ],
  "solutions": [
    {
      "sourcePath": "dev-user/shape-id/1234567890-solution.json",
      "solutionId": "sha256:def456...",
      "shapeRef": "sha256:abc123...",
      "placementsCount": 25,
      "status": "converted",
      "full": true
    }
  ],
  "errors": [],
  "hashCheck": {
    "rehashPasses": 32,
    "rehashFailures": 0
  }
}
```

### Exit Codes

- **0** - Conversion succeeded with no errors
- **1** - Conversion failed or had errors/hash failures

## Idempotency

The converter is **idempotent** - running it multiple times produces identical results:

- Same content → same deterministic ID
- Re-running the converter updates existing records (upsert)
- No duplicates are created
- IDs are verified by re-hashing after conversion

## Validation Checklist

After running the converter:

- [ ] Report shows 0 errors
- [ ] `hashCheck.rehashFailures` is 0
- [ ] All shapes accessible in `contracts_shapes` table
- [ ] All solutions accessible in `contracts_solutions` table
- [ ] Storage buckets contain `<id>.shape.json` and `<id>.solution.json` files
- [ ] Re-running produces same IDs (test with 10 random samples)

## Schema Details

### `contracts_shapes` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | `sha256:<hash>` - Content-addressed ID |
| `lattice` | text | Lattice type (`fcc`, `bcc`, etc.) |
| `cells` | jsonb | `[[i,j,k], ...]` sorted lexicographically |
| `size` | int | Number of cells (for filtering) |
| `created_at` | timestamptz | Creation timestamp |

### `contracts_solutions` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | `sha256:<hash>` - Content-addressed ID |
| `shape_id` | text | References the shape (shapeRef) |
| `placements` | jsonb | Sorted placements array |
| `is_full` | boolean | True if all pieces placed |
| `created_at` | timestamptz | Creation timestamp |

### `contracts_convert_reports` Table

| Column | Type | Description |
|--------|------|-------------|
| `run_id` | uuid (PK) | Unique run identifier |
| `summary` | jsonb | Conversion summary stats |
| `shapes` | jsonb | Shape conversion records |
| `solutions` | jsonb | Solution conversion records |
| `errors` | jsonb | Error records |
| `hash_check` | jsonb | Idempotency verification results |
| `created_at` | timestamptz | Conversion timestamp |

## Troubleshooting

### Missing Service Role Key

**Error**: `Missing Supabase credentials in .env.local`

**Solution**: Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`

### Table Does Not Exist

**Error**: `relation "contracts_shapes" does not exist`

**Solution**: Run `supabase-contracts-migration.sql` in Supabase SQL Editor

### Hash Verification Failures

**Error**: `rehashFailures > 0` in report

**Solution**: Check canonicalization logic for bugs. The hash should be deterministic.

### Storage Upload Failures

**Error**: `Error uploading to storage`

**Solution**: 
- Verify storage buckets exist
- Check storage policies allow uploads
- Ensure service role key has proper permissions

## Next Steps

After successful conversion:

1. **Verify Data**: Spot-check converted shapes and solutions
2. **Update App**: Modify app to read from new contract tables
3. **Migrate References**: Update any code referencing old UUID-based IDs
4. **Archive Legacy**: Keep legacy tables/storage for rollback safety
5. **Deploy**: Test in staging before production deployment

## Safety Notes

- **No Data Loss**: Converter does not delete legacy data
- **Idempotent**: Safe to re-run multiple times
- **Service Role**: Uses service-role key for unrestricted access
- **Audit Trail**: All conversions logged in `contracts_convert_reports`

---

For questions or issues, see:
- `public/data/contracts/overview.md`
- `public/data/contracts/id-hashing.md`
