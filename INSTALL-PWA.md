# Installation Instructions for PWA Cache Busting

## ⚠️ Manual Installation Required

Due to npm SSL errors, you'll need to install the dependencies manually:

```bash
npm install -D vite-plugin-pwa@latest workbox-window@latest
```

## ✅ What's Already Configured

All configuration files have been updated:

1. **netlify.toml** - Cache control headers
2. **vite.config.ts** - PWA plugin with Service Worker
3. **package.json** - Version updated to 32.1.0
4. **App.tsx** - UpdateNotification component added
5. **Services created:**
   - `src/services/versionCheck.ts`
   - `src/components/UpdateNotification.tsx`

## 🚀 After Installing Dependencies

1. **Test locally:**
   ```bash
   npm run build
   npx serve dist
   ```

2. **Open in browser** and check:
   - Service Worker registers (DevTools > Application > Service Workers)
   - Cache headers are correct (DevTools > Network)

3. **Test update flow:**
   - Change version in package.json
   - Rebuild
   - Refresh browser → Update notification should appear

4. **Deploy to Netlify:**
   ```bash
   git add -A
   git commit -m "feat: PWA cache busting with auto-update"
   git push origin main
   ```

## 📋 Verification Checklist

After deployment, verify:

- [ ] Service Worker active in DevTools > Application
- [ ] `index.html` has `Cache-Control: max-age=300`
- [ ] Assets have `Cache-Control: max-age=31536000, immutable`
- [ ] `sw.js` has `Cache-Control: no-cache`
- [ ] Update notification appears when version changes

## 🎉 Benefits

- ✅ Users automatically get updates without clearing cache
- ✅ Fast load times with aggressive asset caching
- ✅ Works offline (PWA features)
- ✅ Smooth update experience with notification
- ✅ Mobile-friendly (iOS & Android)

## 📚 Documentation

See `CACHE-BUSTING-SETUP.md` for complete documentation on:
- How it works
- Customization options
- Troubleshooting
- Testing procedures
