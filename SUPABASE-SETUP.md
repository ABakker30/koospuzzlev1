# Supabase Integration Setup for Koospuzzle

This guide walks you through integrating Supabase authentication and cloud storage into your existing Koospuzzle application.

## 📋 Prerequisites

- Supabase account (free tier works): https://supabase.com
- Node.js and npm already installed (you have this ✅)

## 🚀 Setup Steps

### 1. Install Dependencies

```bash
npm install @supabase/supabase-js uuid
npm install -D @types/uuid
```

### 2. Create Supabase Project

1. Go to https://app.supabase.com
2. Click "New project"
3. Choose organization and region
4. Set database password (save it somewhere safe!)
5. Wait ~2 minutes for project to provision

### 3. Get Your Credentials

1. Go to Project Settings → API
2. Copy these two values:
   - **Project URL** (looks like: `https://abcdefgh.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### 4. Configure Environment Variables

Open `.env.local` (already created) and replace the placeholders:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6...
```

⚠️ **NEVER commit the service_role key to git!** Only use `anon` key in frontend.

### 5. Set Up Database

1. Go to SQL Editor in Supabase dashboard
2. Create a new query
3. Copy entire contents of `supabase-setup.sql` and paste it
4. Click "Run" (or press Ctrl+Enter)
5. Verify success (should see "Success. No rows returned")

### 6. Create Storage Buckets

1. Go to Storage → Create bucket
2. Create bucket named `shapes`
   - Set to **private** (only owner can access)
3. Create bucket named `solutions`
   - Set to **private**

The SQL script already created the storage policies!

### 7. Enable Authentication Providers

#### Email (Magic Link) - Recommended ✅
1. Go to Authentication → Providers
2. Email should already be enabled by default
3. Verify settings:
   - ✅ Enable Email provider
   - ✅ Confirm email: OFF (for faster testing)
   - ✅ Secure email change: ON

#### Google OAuth - Optional
1. Go to Authentication → Providers
2. Enable Google
3. Follow Supabase's guide to set up Google OAuth app
4. Add your authorized redirect URLs

### 8. Add Auth Component to Your App

The `AuthPanel` component is already created. You can add it to your existing pages:

**Option A: Add to all pages (recommended)**
```tsx
// src/App.tsx - at the top of your layout
import AuthPanel from './components/AuthPanel';

// Inside your app component
<AuthPanel />
{/* rest of your app */}
```

**Option B: Add to specific pages**
```tsx
import AuthPanel from '../components/AuthPanel';

// At the top of ShapeEditorPage, ManualPuzzlePage, etc.
<AuthPanel />
```

### 9. Test Everything

1. Start your dev server: `npm run dev`
2. You should see the auth panel
3. Enter your email and click "Send magic link"
4. Check your email inbox
5. Click the magic link
6. You should be signed in!

## 📁 Files Created

```
.env.local                      # Your credentials (DON'T commit!)
supabase-setup.sql             # Database schema
SUPABASE-SETUP.md              # This file

src/
├── lib/
│   └── supabase.ts            # Supabase client setup
├── api/
│   ├── shapes.ts              # Shape upload/download API
│   └── solutions.ts           # Solution upload/download API
└── components/
    └── AuthPanel.tsx          # Sign in/out UI component
```

## 🎯 Usage Examples

### Upload a Shape

```typescript
import { uploadShape } from './api/shapes';

// In your file upload handler
const handleUpload = async (file: File) => {
  try {
    const shape = await uploadShape(file, 'My Shape', { 
      cellCount: 40,
      lattice: 'fcc' 
    });
    console.log('Uploaded:', shape);
  } catch (error) {
    console.error('Upload failed:', error);
    alert('Please sign in to upload shapes');
  }
};
```

### List User's Shapes

```typescript
import { listShapes, getShapeSignedUrl } from './api/shapes';

const loadMyShapes = async () => {
  const shapes = await listShapes();
  
  for (const shape of shapes) {
    // Get a temporary download URL (expires in 2 minutes)
    const downloadUrl = await getShapeSignedUrl(shape.file_url);
    
    // Fetch and load the file
    const response = await fetch(downloadUrl);
    const data = await response.json();
    
    console.log('Shape data:', data);
  }
};
```

### Upload a Solution

```typescript
import { uploadSolution } from './api/solutions';

const handleSolutionUpload = async (shapeId: string, solutionFile: File) => {
  const solution = await uploadSolution(shapeId, solutionFile, 'Solution 1', {
    pieceCount: 12,
    solverTime: 1234
  });
  console.log('Solution uploaded:', solution);
};
```

## 🔐 Security Notes

✅ **What's Protected:**
- Users can ONLY see/edit their own shapes and solutions
- Row Level Security (RLS) enforces this at the database level
- Storage policies ensure users can only access files under `{userId}/`

✅ **Best Practices:**
- Never commit `.env.local` to git (already in .gitignore)
- Only use `anon` key in frontend code
- Keep `service_role` key secure (server-side only)
- Signed URLs expire automatically (default: 2-5 minutes)

## 🐛 Troubleshooting

### "Invalid API key"
- Check `.env.local` has correct values
- Restart dev server after changing .env
- Verify you copied the **anon** key, not service_role

### "User not authenticated"
- Make sure AuthPanel is rendered in your app
- Check browser console for auth errors
- Try signing out and back in

### "Storage bucket not found"
- Verify you created both `shapes` and `solutions` buckets
- Check bucket names are exact (lowercase)

### "Row Level Security policy violation"
- Make sure you ran the full SQL setup script
- Verify policies exist: Storage → Policies

## 🔄 Integration with Existing Code

Your existing code in `ShapeFileService.ts` loads from GitHub. The new Supabase code is **separate** and doesn't break anything:

- **GitHub shapes** → public, read-only (existing code)
- **User shapes** → private, user-uploaded (new Supabase code)

You can show both in your UI:
- Public shapes from GitHub (for beginners)
- Personal shapes from Supabase (for signed-in users)

## 📚 Next Steps

1. **Integrate into Shape Editor**: Add upload button after user saves
2. **Integrate into Solution Viewer**: Show user's solutions in dropdown
3. **Add My Shapes page**: Browse and manage uploaded shapes
4. **Add Cloud indicator**: Show which shapes are local vs cloud

## 🆘 Need Help?

- Supabase Docs: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- Check browser console for detailed error messages

---

**Status: ✅ Ready to Install**

Run `npm install @supabase/supabase-js uuid` and follow the steps above!
