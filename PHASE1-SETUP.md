# Phase 1 Setup Guide: Create Mode with Supabase

## ✅ What's Complete

Phase 1 of the migration is now **COMPLETE**:
- ✅ New `/create` route with simplified UI
- ✅ Action tracking (add/remove/undo + timing)
- ✅ Save flow with full metadata collection
- ✅ **Supabase database integration** (NEW!)
- ✅ Real puzzle URLs with UUIDs
- ✅ Movie recording with playback controls

## 🚀 Setup Instructions

### 1. Run Database Migration

Execute the SQL migration to create the `puzzles` and `solutions` tables:

```bash
# In your Supabase Dashboard SQL Editor, run:
supabase-puzzles-migration.sql
```

Or if using Supabase CLI:
```bash
supabase db push
```

### 2. Verify Environment Variables

Ensure your `.env` file has Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Test the Flow

1. **Navigate to `/create`**
2. **Create a puzzle** (add spheres - must be multiple of 4)
3. **Click Save** button
4. **Fill metadata:**
   - Your name (required)
   - Puzzle name (required)
   - Description (optional)
   - Challenge message (optional)
   - Visibility (public/private)
5. **Click "Save Puzzle"**
6. **Watch**: Automatic transition to playback mode
7. **Record** (optional): Create a movie
8. **Share**: Get puzzle URL

### 4. Verify Database

Check that your puzzle was saved:

```sql
-- In Supabase SQL Editor
SELECT id, name, creator_name, sphere_count, visibility, created_at 
FROM puzzles 
ORDER BY created_at DESC 
LIMIT 10;
```

## 📊 Database Schema

### Puzzles Table
- `id` - UUID (auto-generated)
- `name` - Puzzle title
- `creator_name` - Creator's name
- `description` - Optional description
- `challenge_message` - Optional challenge for solvers
- `visibility` - 'public' or 'private'
- `geometry` - JSONB array of IJK coordinates
- `actions` - JSONB array of creation actions with timestamps
- `preset_config` - JSONB environment settings
- `sphere_count` - Number of spheres
- `creation_time_ms` - Time spent creating
- `created_at` / `updated_at` - Timestamps

### Solutions Table (for Phase 2)
- Ready for Solve Mode implementation
- Stores solver actions and final geometry
- References puzzle_id

## 🔗 Puzzle URLs

Puzzles are accessible at:
```
https://koospuzzle.com/solve/{uuid}
```

Example:
```
https://koospuzzle.com/solve/123e4567-e89b-12d3-a456-426614174000
```

## 🎬 What Data is Stored

When you save a puzzle, we store:

1. **Geometry**: Complete IJK coordinates for all spheres
2. **Action History**: Full timeline for movie generation
   - ADD_SPHERE events
   - REMOVE_SPHERE events  
   - UNDO events
   - Timestamps for each action
3. **Environment**: Lighting, materials, effects settings
4. **Metadata**: Names, descriptions, visibility
5. **Stats**: Sphere count, creation time

## ⏭️ Next: Phase 2

Now that Phase 1 is complete, we're ready for:
- **Solve Mode** (`/solve/[id]`)
- Load puzzles from database
- Track solving actions
- Save solutions

## 🐛 Troubleshooting

### "Missing Supabase environment variables"
- Copy `.env.example` to `.env`
- Add your Supabase credentials

### "Failed to save puzzle: permission denied"
- Check RLS policies are created
- Verify the migration ran successfully
- Check Supabase logs

### "No data returned from Supabase"
- Table might not exist - run migration
- Check Supabase dashboard for errors

### Puzzle URL doesn't work yet
- Normal! Solve Mode (Phase 2) will implement puzzle loading
- URL is generated correctly, just not handled yet
