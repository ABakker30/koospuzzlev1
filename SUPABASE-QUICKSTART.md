# 🚀 Supabase Quick Start (2 Minutes)

## ✅ Already Done
- [x] Dependencies installed (`@supabase/supabase-js`, `uuid`)
- [x] Credentials added to `.env.local`
- [x] Test page created at `/supabase-test`

## 🎯 Do These Now (In Supabase Dashboard)

### 1. Run SQL Setup
1. Go to: https://app.supabase.com/project/cpblvcajrvlqatniceap/sql/new
2. Open `supabase-setup.sql` in your editor
3. Copy ALL contents
4. Paste into SQL editor
5. Click **"Run"** (or Ctrl+Enter)
6. ✅ Should see "Success. No rows returned"

### 2. Create Storage Buckets
1. Go to: https://app.supabase.com/project/cpblvcajrvlqatniceap/storage/buckets
2. Click **"New bucket"**
3. Name: `shapes`, Select **Private**, Click "Create"
4. Click **"New bucket"** again
5. Name: `solutions`, Select **Private**, Click "Create"

### 3. Configure Auth URLs
1. Go to: https://app.supabase.com/project/cpblvcajrvlqatniceap/auth/url-configuration
2. Under **"Redirect URLs"**, add:
   - `http://localhost:5173/*`
   - `https://koospuzzle.com/*`
3. Click **"Save"**

### 4. Verify Email Auth
1. Go to: https://app.supabase.com/project/cpblvcajrvlqatniceap/auth/providers
2. ✅ Verify **Email** is enabled (should be by default)

## 🧪 Test It!

```bash
npm run dev
```

Then visit: **http://localhost:5173/supabase-test**

### Test Steps:
1. ✅ Sign in with your email (magic link)
2. ✅ Upload a test file
3. ✅ Check console for signed URL
4. ✅ Click "Download" button → file downloads
5. ✅ Go to Supabase Storage → see your file
6. ✅ Go to Table Editor → see your row

## ✅ Checklist

Database:
- [ ] SQL script executed successfully
- [ ] Tables created: `profiles`, `shapes`, `solutions`
- [ ] RLS policies visible in Table Editor

Storage:
- [ ] Bucket `shapes` created (Private)
- [ ] Bucket `solutions` created (Private)
- [ ] Storage policies visible in bucket settings

Auth:
- [ ] Email provider enabled
- [ ] Redirect URLs configured
- [ ] Magic link received and works

Test:
- [ ] Can sign in
- [ ] Can upload shape
- [ ] Can download shape
- [ ] Signed URL works

## 🐛 Common Issues

**"Not authenticated"**
→ Sign in first using AuthPanel

**"Bucket not found"**
→ Create `shapes` and `solutions` buckets in Storage

**"Policy violation"**
→ Run the SQL script completely

**Magic link doesn't work**
→ Add your dev URL to Auth → Redirect URLs

**Env vars not working**
→ Restart dev server after editing `.env.local`

## 📚 Next Steps

Once test passes:
- Integrate upload into Shape Editor
- Show cloud shapes in Browse modal
- Add delete functionality
- Deploy to production

---

**Status:** ⏳ Waiting for Supabase setup
**Test Page:** http://localhost:5173/supabase-test
