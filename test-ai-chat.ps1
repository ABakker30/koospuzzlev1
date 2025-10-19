# Test AI Chat Edge Function

$body = @{
    messages = @(
        @{
            role = "user"
            content = "Hello!"
        }
    )
} | ConvertTo-Json

Write-Host "Testing AI Chat endpoint..."
Write-Host "URL: https://cpblvcajrvlqatniceap.supabase.co/functions/v1/quick-responder"
Write-Host ""

try {
    $headers = @{
        "Content-Type" = "application/json"
        "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwYmx2Y2FqcnZscWF0bmljZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDQ4NDAsImV4cCI6MjA3NjEyMDg0MH0.lWimZhDPx8zdmTSDeQEj3qSxzM63KwHsELIb9nGZ69M"
        "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwYmx2Y2FqcnZscWF0bmljZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDQ4NDAsImV4cCI6MjA3NjEyMDg0MH0.lWimZhDPx8zdmTSDeQEj3qSxzM63KwHsELIb9nGZ69M"
    }
    $response = Invoke-RestMethod -Uri "https://cpblvcajrvlqatniceap.supabase.co/functions/v1/quick-responder" -Method Post -Body $body -Headers $headers
    Write-Host "✅ SUCCESS!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    Write-Host $response.text
} catch {
    Write-Host "❌ ERROR!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)"
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host ""
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body:" -ForegroundColor Yellow
        Write-Host $responseBody
    }
}
