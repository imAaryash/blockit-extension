# Extension Packaging Instructions

## 📦 How to Package for Distribution (Without Exposing Source Code)

Chrome allows you to pack extensions into `.crx` files which are compiled packages that don't expose your source code.

### Step 1: Pack Extension Using Chrome

1. **Open Chrome Extensions Page**
   - Type `chrome://extensions/` in address bar
   - Or Menu → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle "Developer mode" switch (top-right corner)

3. **Pack Extension**
   - Click **"Pack extension"** button
   - Extension root directory: Browse to your extension folder
     ```
     C:\D_DRIVE\AARYASH\Code_PlayGround\blockit-pc\focus-extension
     ```
   - Private key file: **Leave EMPTY** (first time only)
   - Click **"Pack Extension"**

4. **Chrome Creates Two Files**
   - `focus-extension.crx` - The packaged extension ✅
   - `focus-extension.pem` - Private key (KEEP SECRET!) 🔒

### Step 2: Prepare for Distribution

1. **Rename CRX File**
   ```powershell
   Rename-Item "focus-extension.crx" "blockit-extension-v1.0.0.crx"
   ```

2. **Secure the PEM File**
   - **NEVER** share or commit the `.pem` file
   - **NEVER** upload to GitHub
   - **KEEP** it safe for future updates
   - Store in secure location (password manager, encrypted drive)

3. **Add to .gitignore** (if using Git)
   ```
   *.pem
   *.crx
   ```

### Step 3: Upload to GitHub Releases

1. **Create New Release**
   - Go to: `https://github.com/YOUR_USERNAME/blockit-extension/releases/new`
   - Tag version: `v1.0.0`
   - Release title: `BlockIt v1.0.0 - Initial Release`

2. **Add Release Description**
   ```markdown
   ## 🎯 BlockIt Focus Extension v1.0.0
   
   ### Installation
   
   **Method 1: Drag & Drop (Easiest)**
   1. Download `blockit-extension-v1.0.0.crx`
   2. Open Chrome: `chrome://extensions/`
   3. Enable "Developer mode"
   4. Drag the .crx file into the extensions page
   5. Click "Add extension"
   
   **Method 2: Manual Install**
   1. Download `blockit-extension-v1.0.0.crx`
   2. Open Chrome: `chrome://extensions/`
   3. Enable "Developer mode"
   4. Click "Load unpacked" (if .crx doesn't work)
   5. Extract .crx and select folder
   
   ### Features
   - ⏱️ Focus mode with custom timers
   - 🏆 Leaderboard and stats tracking
   - 👥 Friends system with real-time activity
   - 💬 Community chat
   - 🎨 Customizable themes
   
   ### Requirements
   - Chrome browser (or Chromium-based)
   - Internet connection for sync features
   
   See README for full documentation!
   ```

3. **Upload Files**
   - Attach: `blockit-extension-v1.0.0.crx`
   - Click **"Publish release"**

### User Installation Instructions

**For Your Users:**

1. Download the `.crx` file from Releases
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Drag the `.crx` file into the page
5. Click "Add extension" when prompted

**Note:** Users may see "This extension is not listed in the Chrome Web Store" - this is normal for unpublished extensions.

### Step 4: Update Extension (Future Versions)

1. **Update Code**
   - Make your changes
   - Update version in `manifest.json` (e.g., `1.0.1`)

2. **Pack with Same Key**
   - `chrome://extensions/` → "Pack extension"
   - Extension root directory: Same folder
   - **Private key file**: Browse to your saved `.pem` file
   - Click "Pack Extension"

3. **This Ensures:**
   - Same extension ID
   - Users can update without reinstalling
   - Settings/data preserved

4. **Distribute**
   - Rename to `blockit-extension-v1.0.1.crx`
   - Create new GitHub release
   - Upload new `.crx` file

## 🔒 Security Best Practices

### Protect Your Private Key (.pem)

✅ **DO:**
- Keep `.pem` file in secure location
- Back up to encrypted storage
- Use for all future updates
- Add `*.pem` to `.gitignore`

❌ **DON'T:**
- Commit to Git/GitHub
- Share publicly
- Email or message to anyone
- Store in cloud without encryption

### Why the Private Key Matters

- **Same ID**: Ensures extension keeps same ID
- **Updates**: Users can update without reinstalling
- **Trust**: Users won't see "different extension" warning

## 📋 Pre-Release Checklist

- [ ] Test all features work
- [ ] Verify server connection
- [ ] Check manifest.json version
- [ ] Update README with any changes
- [ ] Test installation process
- [ ] Verify icons display correctly
- [ ] Test on fresh Chrome profile
- [ ] Check for console errors
- [ ] Verify all pages load
- [ ] Test registration/login flow
- [ ] Test focus mode blocking
- [ ] Test friend system
- [ ] Test community chat
- [ ] Test leaderboard
- [ ] Verify stats sync

## 🎯 Distribution Checklist

- [ ] Package created (ZIP)
- [ ] GitHub release published
- [ ] README updated
- [ ] Installation instructions clear
- [ ] Screenshots added
- [ ] Version number updated
- [ ] Changelog created
- [ ] Support links added
- [ ] License file included
- [ ] Privacy policy included

## 📊 Version Numbering

Format: `vMAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes
- **MINOR**: New features
- **PATCH**: Bug fixes

Examples:
- `v1.0.0` - Initial release
- `v1.1.0` - Added dark mode
- `v1.1.1` - Fixed chat bug

## 🚀 After Release

1. **Announce Release**
   - Update README with download link
   - Post on social media
   - Share in relevant communities

2. **Monitor Issues**
   - Check GitHub issues
   - Respond to user feedback
   - Fix critical bugs quickly

3. **Plan Next Version**
   - Gather feature requests
   - Prioritize improvements
   - Update roadmap

---

**Remember**: Test thoroughly before each release! 🧪
