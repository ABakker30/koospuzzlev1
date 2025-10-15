# Complete Windsurf Instructions - Supabase Integration

## ✅ Files Already Created

All necessary files have been generated and are ready to use:

```
📦 Koospuzzle Project
├── .env.local                          ← ADD YOUR CREDENTIALS HERE
├── supabase-setup.sql                  ← Run in Supabase SQL Editor
├── SUPABASE-SETUP.md                   ← Full setup guide
│
├── src/
│   ├── lib/
│   │   └── supabase.ts                 ← Client initialization ✅
│   ├── api/
│   │   ├── shapes.ts                   ← Upload/list shapes ✅
│   │   └── solutions.ts                ← Upload/list solutions ✅
│   └── components/
│       └── AuthPanel.tsx               ← Sign in/out UI ✅
```

## 🔑 Credentials You Need

Go to your Supabase project dashboard:
1. **Project Settings** → **API** tab

Copy these TWO values into `.env.local`:

```env
# Replace these placeholders with your actual values:
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Where to find them:
- **VITE_SUPABASE_URL**: Under "Project URL" (looks like `https://abcdef123.supabase.co`)
- **VITE_SUPABASE_ANON_KEY**: Under "Project API keys" → **anon** **public** (NOT service_role!)

⚠️ **CRITICAL**: Use the `anon` key, NOT the `service_role` key!

## 🚀 Quick Start (5 minutes)

### Step 1: Install Dependencies
```bash
npm install @supabase/supabase-js uuid
npm install -D @types/uuid
```

### Step 2: Supabase Dashboard Setup

#### A. Run Database Setup
1. Open Supabase Dashboard → SQL Editor
2. Create new query
3. Copy entire `supabase-setup.sql` file contents
4. Paste and click "Run"
5. Should see "Success. No rows returned"

#### B. Create Storage Buckets
1. Go to **Storage** → Click "Create bucket"
2. Create bucket: `shapes` (make it **private**)
3. Create bucket: `solutions` (make it **private**)

#### C. Enable Email Auth
1. Go to **Authentication** → **Providers**
2. Verify **Email** is enabled (should be by default)
3. Done!

#### D. (Optional) Enable Google OAuth
1. Authentication → Providers → Enable Google
2. Follow Supabase's Google setup wizard
3. Add redirect URL: `http://localhost:5173/` for dev

### Step 3: Add Credentials
1. Open `.env.local`
2. Replace `YOUR_SUPABASE_PROJECT_URL` with your actual URL
3. Replace `YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE` with your anon key
4. Save file

### Step 4: Test It!
```bash
npm run dev
```

## 🎯 How to Use in Your Code

### Add Authentication Panel

Add to any page where you want auth:

```tsx
import AuthPanel from '../components/AuthPanel';

function YourPage() {
  return (
    <div>
      <AuthPanel />
      {/* Rest of your page */}
    </div>
  );
}
```

### Upload a Shape File

```tsx
import { uploadShape } from '../api/shapes';

async function handleFileUpload(file: File) {
  try {
    const shape = await uploadShape(file, 'My Cool Shape', {
      cellCount: 40,
      lattice: 'fcc'
    });
    console.log('✅ Uploaded:', shape);
    alert('Shape uploaded successfully!');
  } catch (error) {
    console.error('❌ Upload failed:', error);
    alert('Please sign in first');
  }
}
```

### List User's Shapes

```tsx
import { listShapes, getShapeSignedUrl } from '../api/shapes';

async function loadUserShapes() {
  const shapes = await listShapes();
  console.log('User has', shapes.length, 'shapes');
  
  // Get download URL for first shape
  if (shapes.length > 0) {
    const url = await getShapeSignedUrl(shapes[0].file_url);
    // Now fetch and load: const res = await fetch(url);
  }
}
```

### Upload a Solution

```tsx
import { uploadSolution } from '../api/solutions';

async function handleSolutionUpload(shapeId: string, file: File) {
  const solution = await uploadSolution(shapeId, file, 'Solution 1', {
    pieceCount: 12,
    timeToSolve: 1234
  });
  console.log('✅ Solution uploaded:', solution);
}
```

## 🔒 Security Features (Already Built-In)

✅ **Row Level Security (RLS)**: Users can ONLY see their own data
✅ **Storage Policies**: Users can ONLY access files under their `{userId}/` prefix
✅ **Signed URLs**: Download links expire automatically (2-5 minutes)
✅ **No Service Keys Exposed**: Only safe `anon` key used in frontend

## 📊 Database Schema

Your Supabase database now has:

### Tables
- **profiles**: User display names (optional)
- **shapes**: Container files (FCC JSON)
- **solutions**: Solver outputs (ZIPs, videos, JSON)

### Storage Buckets
- **shapes**: User-uploaded container files
- **solutions**: User-uploaded solution files

### Key Features
- Automatic user ID prefixing: `{userId}/{fileId}-{filename}`
- Format versioning support
- Flexible metadata (JSONB columns)
- Conversion tracking (legacy → new formats)

## 🧪 Testing Checklist

1. **Sign In Flow**
   - [ ] Enter email → "Magic link sent" message
   - [ ] Check email → click link → redirected back signed in
   - [ ] See "Signed in as YOUR-EMAIL" in AuthPanel

2. **Upload Flow**
   - [ ] Try uploading without sign in → Should fail with error
   - [ ] Sign in → upload file → Should succeed
   - [ ] Check Supabase Storage → See file under your user ID

3. **List Flow**
   - [ ] Call `listShapes()` → Should return your uploads
   - [ ] Call `getShapeSignedUrl()` → Should return working URL
   - [ ] Fetch URL → Should download file contents

4. **Security**
   - [ ] Sign out → Try upload → Should fail
   - [ ] Sign in as different user → Can't see other user's files

## 🐛 Common Issues

### "Authentication required"
➡️ Make sure user is signed in before calling upload/list functions

### "Bucket not found"
➡️ Create `shapes` and `solutions` buckets in Supabase Storage UI

### "Policy violation"
➡️ Run the complete `supabase-setup.sql` script in SQL Editor

### ".env changes not working"
➡️ Restart dev server after editing `.env.local`

### "CORS error"
➡️ Add your dev URL to Supabase → Authentication → URL Configuration

## 🎨 Integration Examples

### Shape Editor: Add Cloud Save Button

```tsx
// In ShapeEditorPage.tsx
import { uploadShape } from '../api/shapes';

function ShapeEditorPage() {
  const handleCloudSave = async () => {
    if (!user) {
      alert('Please sign in to save to cloud');
      return;
    }
    
    const blob = new Blob([JSON.stringify(shapeFile)], { type: 'application/json' });
    const file = new File([blob], `${shapeName}.fcc.json`);
    
    await uploadShape(file, shapeName, { cellCount: cells.length });
    alert('Saved to cloud!');
  };
  
  return (
    <div>
      <button onClick={handleCloudSave}>💾 Save to Cloud</button>
    </div>
  );
}
```

### Load Modal: Show Cloud Shapes

```tsx
// In LoadShapeModal.tsx
import { listShapes, getShapeSignedUrl } from '../api/shapes';

const [cloudShapes, setCloudShapes] = useState([]);

useEffect(() => {
  listShapes().then(setCloudShapes);
}, []);

// In your UI:
<div>
  <h3>My Cloud Shapes</h3>
  {cloudShapes.map(shape => (
    <button key={shape.id} onClick={async () => {
      const url = await getShapeSignedUrl(shape.file_url);
      const res = await fetch(url);
      const data = await res.json();
      onLoaded(data);
    }}>
      {shape.name}
    </button>
  ))}
</div>
```

## ✅ Success Criteria

When everything works, you should be able to:

1. ✅ Sign in with email (magic link)
2. ✅ Upload a shape → See it in Supabase Storage
3. ✅ List shapes → See only your uploads
4. ✅ Download shape → Get working signed URL
5. ✅ Sign out → Can't access protected features
6. ✅ Different user → Can't see your files (RLS working)

## 📚 Resources

- **Supabase Docs**: https://supabase.com/docs
- **Auth Guide**: https://supabase.com/docs/guides/auth
- **Storage Guide**: https://supabase.com/docs/guides/storage
- **RLS Guide**: https://supabase.com/docs/guides/auth/row-level-security

---

## 🎉 Ready to Go!

You now have:
- ✅ Complete authentication system
- ✅ Cloud file storage (shapes + solutions)
- ✅ User-specific data isolation
- ✅ Secure signed URLs
- ✅ Production-ready security policies

All code is written and ready. Just add your credentials and run!

**Current Project Status: v15.12.0** (Shape Editor fixes deployed)
**Next Step: Supabase Integration** ← You are here!
