# Movie Thumbnails Setup Guide

## Overview
This guide sets up automatic thumbnail capture when saving movies to the gallery.

## Features
- 📸 Captures canvas screenshot as thumbnail (JPEG, 80% quality)
- ☁️ Uploads to Supabase Storage
- 🔗 Saves public URL to movies table
- ✨ Automatic - happens when user clicks "Save to Gallery"

---

## Setup Steps

### 1. Run SQL Migration
Run `supabase-add-movie-thumbnails.sql` in Supabase SQL Editor:
- Adds `thumbnail_url` column to movies table
- Adds index for faster lookups
- Sets up storage policies

### 2. Create Storage Bucket
Go to **Supabase Dashboard → Storage**:

**Bucket Configuration:**
- Name: `movie-thumbnails`
- Public: ✅ Yes
- File size limit: `5 MB`
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`

**Steps:**
1. Click "New bucket"
2. Name it exactly: `movie-thumbnails`
3. Toggle "Public bucket" ON
4. Click "Create bucket"

### 3. Verify Storage Policies
The SQL migration creates these policies:
- ✅ Public can view thumbnails
- ✅ Anyone can upload (dev mode)
- ✅ Anyone can update (for upsert)
- ✅ Anyone can delete (for cleanup)

Check in **Storage → movie-thumbnails → Policies**

---

## How It Works

### Save Flow:
```
1. User clicks "Save to Gallery"
   ↓
2. Capture canvas as JPEG thumbnail
   ↓
3. Save movie record to database
   ↓
4. Upload thumbnail to storage
   ↓
5. Update movie record with thumbnail_url
   ✓ Done!
```

### Code Flow:
```typescript
// 1. Capture thumbnail
const thumbnailData = await captureThumbnail();

// 2. Save movie
const { data } = await supabase.from('movies').insert({...});

// 3. Upload thumbnail
const thumbnailUrl = await uploadThumbnail(thumbnailData, data.id);

// 4. Update movie with thumbnail URL
await supabase.from('movies')
  .update({ thumbnail_url: thumbnailUrl })
  .eq('id', data.id);
```

---

## File Structure

### Storage Path:
```
movie-thumbnails/
  └── thumbnails/
      ├── {movie-id-1}.jpg
      ├── {movie-id-2}.jpg
      └── {movie-id-3}.jpg
```

### Database:
```sql
movies
  - id (uuid)
  - thumbnail_url (text) ← Public URL
  - puzzle_id
  - solution_id
  - effect_type
  - ...
```

---

## Testing

### 1. Save a Movie:
1. Go to `/solve/{puzzle-id}`
2. Run auto-solve
3. Play an effect (Turntable/Gravity/Reveal)
4. Fill out credits modal
5. Click "Save to Gallery"

### 2. Check Console:
You should see:
```
📸 Capturing thumbnail...
✅ Movie saved to gallery: {id}
📤 Uploading thumbnail for movie: {id}
✅ Thumbnail uploaded: {public-url}
✅ Thumbnail URL saved to database
```

### 3. Verify in Database:
```sql
SELECT id, title, thumbnail_url 
FROM movies 
WHERE thumbnail_url IS NOT NULL;
```

### 4. Check Storage:
- Go to **Storage → movie-thumbnails → thumbnails/**
- You should see `.jpg` files

---

## Troubleshooting

### "Bucket not found"
- Create the `movie-thumbnails` bucket in Supabase Dashboard

### "Permission denied"
- Check storage policies are enabled
- Make sure bucket is public

### "No canvas found"
- Make sure effect is playing when saving
- Canvas must be visible

### Thumbnail not updating in DB
- Check console for SQL errors
- Verify column exists: `SELECT thumbnail_url FROM movies LIMIT 1;`

---

## Future Enhancements

- [ ] Add retry logic for failed uploads
- [ ] Generate multiple thumbnail sizes (small/medium/large)
- [ ] Add thumbnail preview in credits modal
- [ ] Compress thumbnails more aggressively
- [ ] Add watermark or branding to thumbnails

---

## Notes

- Thumbnails are **JPEG at 80% quality** for smaller file sizes
- File naming: `{movie-id}.jpg`
- **Upsert is enabled** - thumbnails can be re-uploaded
- Non-blocking: Movie saves even if thumbnail fails
