# Deploy AI Chat Feature

## Step 1: Install Supabase CLI
```powershell
# Install via npm (recommended)
npm install -g supabase

# OR via scoop (if you have scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

## Step 2: Login to Supabase
```powershell
supabase login
```
This will open a browser for authentication.

## Step 3: Link to Your Project
```powershell
cd "c:\Projects\Koos puzzle v1"
supabase link --project-ref cpblvcajrvlqatniceap
```

## Step 4: Set OpenAI API Key (Secret - Never Commit!)
```powershell
supabase secrets set OPENAI_API_KEY=your-actual-openai-key-here
```

## Step 5: Set OpenAI Model (Optional)
```powershell
supabase secrets set OPENAI_MODEL=gpt-4o-mini
```

## Step 6: Deploy the Edge Function
```powershell
supabase functions deploy ai-chat
```

## Step 7: Test the Deployment
```powershell
# Test with curl
curl -X POST https://cpblvcajrvlqatniceap.supabase.co/functions/v1/ai-chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"Hello!"}]}'
```

Or test in PowerShell:
```powershell
$body = @{
    messages = @(
        @{
            role = "user"
            content = "Hello!"
        }
    )
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://cpblvcajrvlqatniceap.supabase.co/functions/v1/ai-chat" -Method Post -Body $body -ContentType "application/json"
```

## Step 8: Commit Frontend Code
```powershell
git add .
git commit -m "v22.1.0 - Add AI chat assistant feature"
git tag v22.1.0
git push origin main
git push --tags
```

## Verify
1. Check function deployed: `supabase functions list`
2. View logs: `supabase functions logs ai-chat`
3. Open any Info modal on koospuzzle.com
4. Click "🤖 AI Help" button
5. Ask a question!

## Expected Response
When you test, you should get:
```json
{
  "text": "Hello! How can I help you with KOOS Puzzle today?"
}
```

## Security Note
⚠️ **IMPORTANT**: The OpenAI key is stored securely in Supabase secrets, NOT in git.
The key in this file will be deleted after deployment.
