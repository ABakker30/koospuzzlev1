# ☀️ Morning Test Guide - Movie Mode

**Quick Start Testing Checklist**

---

## 🚀 First Things First

1. **Start Dev Server**
   ```bash
   npm run dev
   ```

2. **Open Browser**
   - Navigate to any puzzle in solve mode
   - Example: `http://localhost:5173/solve/some-puzzle-id`

3. **Look for Three Mode Buttons**
   - Should see: [👤 Manual] [🤖 Automated] [🎬 Movie]
   - Movie button should be purple when selected

---

## ✅ 5-Minute Smoke Test

### **Test 1: Turntable Effect (Simplest)**
1. Click **🎬 Movie** mode button
2. Click **✨ Select Effect** dropdown
3. Click **🔄 Turntable**
4. Modal opens → Keep defaults → Click **Save**
5. TransportBar appears with ▶️ Play button
6. Click **▶️ Play**
7. **Expected:** Puzzle smoothly rotates 360 degrees
8. **Pass if:** No jitter, smooth rotation, completes and stops

### **Test 2: Reveal Effect**
1. While in Movie mode
2. Click **🗑️ Clear Effect** (if previous effect active)
3. Select **✨ Reveal** from dropdown
4. Configure → Save
5. Click **▶️ Play**
6. **Expected:** Pieces appear one by one, rotating
7. **Pass if:** Smooth animation, proper reveal order

### **Test 3: Gravity Effect**
1. Clear effect if needed
2. Select **🌍 Gravity**
3. Configure → Save
4. Click **▶️ Play**
5. **Expected:** Pieces fall with physics simulation
6. **Pass if:** Smooth physics, pieces collide properly

---

## 🎥 Recording Test

1. Activate **Turntable** effect (fastest test)
2. Click **⬤ Record** button in TransportBar
3. Recording settings modal appears
4. Click **Start Recording**
5. Click **▶️ Play**
6. Wait for effect to complete (~10-20 seconds)
7. **Expected:** WebM file auto-downloads
8. **Open downloaded file:**
   - Should be smooth 30 FPS
   - No jitter or lag
   - Full effect captured

---

## 🐛 Common Issues & Fixes

### **Issue: "Effect dropdown not showing"**
- **Check:** Are you in Movie mode? (purple button)
- **Fix:** Click 🎬 Movie button

### **Issue: "TransportBar not appearing"**
- **Check:** Have you saved an effect?
- **Fix:** Select effect from dropdown and save config

### **Issue: "Console errors about EffectContext"**
- **Check:** Is puzzle loaded? (not loading state)
- **Fix:** Wait for puzzle to fully load

### **Issue: "Jittery playback"**
- **Check:** Browser performance
- **Possible cause:** React re-renders (shouldn't happen!)
- **Debug:** Check console for excessive logs

### **Issue: "Recording not starting"**
- **Check:** Browser supports MediaRecorder API
- **Fix:** Use Chrome, Edge, or Firefox

---

## 📝 Bug Report Template

If something doesn't work:

```
**What I Did:**
1. Clicked Movie mode
2. Selected Turntable effect
3. Clicked Play

**What Happened:**
[Describe the issue]

**Console Errors:**
[Copy any red errors from console]

**Browser:**
Chrome/Firefox/Edge [version]
```

---

## ✨ Success Criteria

**✅ Core Movie Mode Working:**
- [ ] Mode selector works (3 buttons)
- [ ] Effects dropdown appears in Movie mode
- [ ] All 3 effects can be activated
- [ ] TransportBar shows when effect active
- [ ] Play button works - smooth animation
- [ ] Stop button works - returns to start
- [ ] Recording produces downloadable WebM file
- [ ] No jitter during playback
- [ ] No jitter during recording

**If all checked → Phase 1-3 SUCCESS! 🎉**

---

## 🔍 Advanced Testing (If Basic Works)

### **State Transitions**
- [ ] Switch Manual → Movie → works
- [ ] Switch Movie → Automated → effect clears
- [ ] Switch Movie → Manual → effect clears
- [ ] Activate effect, switch mode → cleanup happens

### **Effect Switching**
- [ ] Activate Turntable → works
- [ ] Switch to Reveal → old effect clears, new works
- [ ] Switch to Gravity → old effect clears, new works

### **Edge Cases**
- [ ] Click outside dropdown → closes
- [ ] Open effect modal → cancel → nothing breaks
- [ ] Play effect → pause → resume → works
- [ ] Record while paused → should prevent

---

## 🎯 Next Phase Preview

**If everything works, we'll add:**
1. Credits modal with customization
2. URL params (share movies via link)
3. Auto-play from shared URLs
4. Database integration (save movies)
5. Movie Gallery (discover others' movies)

**But first: Make sure core works!** 🚀

---

## 💬 Report Back

**Morning message template:**

```
✅ Tested Movie Mode - Results:
- Turntable: [PASS/FAIL]
- Reveal: [PASS/FAIL]
- Gravity: [PASS/FAIL]
- Recording: [PASS/FAIL]
- Smoothness: [PASS/FAIL]

Issues found:
[List any bugs or issues]

Ready for Phase 4?
```

Good luck! 🍀
