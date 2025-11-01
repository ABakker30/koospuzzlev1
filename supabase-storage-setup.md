# Supabase Storage Setup for Puzzle Thumbnails

## 1. Create Storage Bucket

1. Open Supabase Dashboard → Storage
2. Click "New bucket"
3. Name: `puzzle-thumbnails`
4. Public bucket: **Yes** (thumbnails need to be publicly accessible)
5. Click "Create bucket"

## 2. Set Bucket Policies

After creating the bucket, set up RLS policies:

### Allow Public Read Access
```sql
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'puzzle-thumbnails' );
```

### Allow Authenticated Upload
```sql
CREATE POLICY "Authenticated users can upload thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'puzzle-thumbnails' );
```

### Allow Authenticated Update (for re-generating thumbnails)
```sql
CREATE POLICY "Authenticated users can update thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'puzzle-thumbnails' )
WITH CHECK ( bucket_id = 'puzzle-thumbnails' );
```

## 3. Add thumbnail_url column to puzzles table

Run the SQL migration:
```sql
ALTER TABLE puzzles 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
```

## 4. Test the Setup

1. Create a new puzzle in CreatePage
2. Check browser console for thumbnail capture logs
3. Verify thumbnail appears in Supabase Storage
4. Check that `puzzles.thumbnail_url` is populated

## 5. Generate Thumbnails for Existing Puzzles

For existing puzzles without thumbnails:
1. Go to CreatePage
2. Use browser dev tools to call: `window.loadExistingPuzzle('[puzzle-id]')`
3. Position/rotate as desired
4. Save the puzzle (will update with new thumbnail)

OR create a batch utility page to automate this process.
