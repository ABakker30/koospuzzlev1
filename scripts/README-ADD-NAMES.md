# Add Shape Names Script

This script adds friendly names to shapes in the database by reading legacy shape files and matching them by content hash.

## What It Does

1. **Reads Legacy Files**: Scans `public/data/containers/v1/` for `.fcc.json` files
2. **Calculates Hashes**: Computes SHA256 hash for each shape (matches database ID)
3. **Extracts Names**: Converts filenames to friendly names (e.g., `Shape_1` → "Shape 1")
4. **Updates Database**: Adds names to the `metadata` column in `contracts_shapes` table

## Name Extraction Examples

| Filename | Friendly Name |
|----------|---------------|
| `Shape_1.fcc.json` | "Shape 1" |
| `hollow_pyramid.fcc.json` | "Hollow Pyramid" |
| `16 cell container.fcc.json` | "16 Cell Container" |
| `Shape_100cells.fcc.json` | "Shape 100cells" |

## Usage

### Prerequisites

1. Ensure you have a `.env.local` file with Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_url_here
   VITE_SUPABASE_ANON_KEY=your_key_here
   ```

2. Ensure shapes are already in the database (run bulk upload if needed)

### Run the Script

```bash
npm run add-shape-names
```

### Expected Output

```
🚀 Starting batch shape name update...

📂 Reading shapes from: C:\Projects\Koos puzzle v1\public\data\containers\v1

✅ Processed: Shape_1.fcc.json → Shape 1 (sha256:41c8b83c...)
✅ Processed: hollow_pyramid.fcc.json → Hollow Pyramid (sha256:8c03eb11...)
...

📝 Updating 28 shapes in database...

✅ Updated: Shape 1
✅ Updated: Hollow Pyramid
⚠️  Shape not found in DB: Shape 99 (sha256:deadbeef...)
...

📊 Summary:
   ✅ Successfully updated: 25
   ⚠️  Not found in DB: 3
   ❌ Errors: 0

✅ Batch update complete!
```

## Result

After running the script, the Browse Shapes modal will display friendly names:

**Before:**
- "Shape sha256:41c8b83c..."

**After:**
- "Shape 1"
- "Hollow Pyramid"
- "16 Cell Container"

## Metadata Structure

The script updates the `metadata` JSON column with:

```json
{
  "name": "Shape 1",
  "originalFilename": "Shape_1.fcc.json"
}
```

## Troubleshooting

### "Not found in DB"
- Shape hasn't been uploaded to database yet
- Run bulk upload first: `npm run bulk-upload`

### "Missing Supabase credentials"
- Check `.env.local` file exists
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set

### "Failed to process file"
- File may not be valid JSON
- Check file format matches legacy `.fcc.json` structure

## Notes

- Script is idempotent: safe to run multiple times
- Won't overwrite existing names (change script if you want to force update)
- Hash calculation matches the content-addressed ID format in database
