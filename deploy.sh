#!/bin/bash

# Deploy Koos Puzzle v1 to koospuzzle.com
# This script builds the project and deploys it via Netlify

echo "🚀 Starting deployment to koospuzzle.com..."

# Build the project
echo "📦 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"

# Deploy to Netlify (requires NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID environment variables)
echo "🌐 Deploying to Netlify..."
npx netlify-cli deploy --prod --dir=dist

if [ $? -eq 0 ]; then
    echo "🎉 Deployment successful!"
    echo "🔗 Your site should be live at: https://koospuzzle.com"
else
    echo "❌ Deployment failed!"
    exit 1
fi
