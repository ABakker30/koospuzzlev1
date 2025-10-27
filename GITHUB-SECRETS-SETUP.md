# GitHub Secrets Setup for Deployment

## Issue
The production deployment fails with `supabaseUrl is required` error because GitHub Actions needs access to Supabase credentials.

## Solution: Add GitHub Repository Secrets

### Step 1: Get Your Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings** → **API**
4. Copy the following values:
   - **Project URL** (e.g., `https://your-project.supabase.co`)
   - **anon/public key** (long string starting with `eyJ...`)

### Step 2: Add Secrets to GitHub Repository

1. Go to your GitHub repository: https://github.com/ABakker30/koospuzzlev1
2. Click **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret** and add each of the following:

#### Secret 1: VITE_SUPABASE_URL
- **Name:** `VITE_SUPABASE_URL`
- **Value:** Your Supabase project URL
- Example: `https://abcdefghijklmnop.supabase.co`

#### Secret 2: VITE_SUPABASE_ANON_KEY
- **Name:** `VITE_SUPABASE_ANON_KEY`
- **Value:** Your Supabase anon/public key
- Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

#### Secret 3: VITE_SUPABASE_FUNCTION_URL
- **Name:** `VITE_SUPABASE_FUNCTION_URL`
- **Value:** Your Supabase Functions URL
- Example: `https://abcdefghijklmnop.supabase.co/functions/v1`

### Step 3: Verify Setup

1. After adding all three secrets, trigger a new deployment:
   - Make a small commit and push to `main` branch, OR
   - Go to **Actions** tab → Select **Deploy to koospuzzle.com** workflow → Click **Run workflow**

2. Check deployment status:
   - Go to **Actions** tab
   - Watch the build process
   - Verify the "Build editor" step succeeds (it will use the secrets)

3. Test the site:
   - Visit https://koospuzzle.com
   - Open browser console (F12)
   - Check for the `supabaseUrl is required` error
   - ✅ Should be gone!

## What Features Need Supabase?

- **AI Help Modal** (AI chat feature on Info Modal)
- **User authentication** (if implemented)
- **Data persistence** (shape storage, solutions, etc.)

## Local Development

For local development, create a `.env` file (copy from `.env.example`) with the same variables:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_SUPABASE_FUNCTION_URL=https://your-project.supabase.co/functions/v1
```

**Note:** Never commit the `.env` file to git (it's already in `.gitignore`)!

## Troubleshooting

### Error: "supabaseUrl is required"
- ✗ GitHub secrets are not set
- ✓ Follow Step 2 above to add secrets

### Build succeeds but error persists
- Check that secret names match exactly (case-sensitive)
- Verify secrets don't have extra spaces or quotes
- Re-trigger deployment after fixing secrets

### Where to find secrets in GitHub
Settings → Secrets and variables → Actions → Repository secrets
