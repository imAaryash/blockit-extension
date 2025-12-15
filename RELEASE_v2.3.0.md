# 🎉 Focus Mode v2.3.0 - Shop System & Enhanced Chat

## 🛍️ Major Features

### Shop System - Customize Your Profile!
Transform your profile with our brand new **Point-Based Shop**! Earn points by staying focused and spend them on exclusive decorations.

**What's Available:**
- 🎨 **9 Avatar Decorations** (100-500 points) - Stylish frames around your profile picture
- 🎴 **8 Name Banners** (100-450 points) - Colorful backgrounds for your user cards
- ✨ **3 Profile Effects** (200-400 points) - Stunning frames for your profile modal

**Shop Features:**
- 👀 **Live Preview System** - See exactly how decorations look before buying
- 💰 **Smart Purchase Management** - All purchases saved permanently
- ⚡ **One-Click Equip** - Switch between owned decorations instantly
- 🏷️ **Visual Status** - Clear indicators for owned and equipped items
- 🔒 **Point Validation** - Can't buy what you can't afford!

### Enhanced @ Mentions in Chat
Mention your friends with style! Now featuring **intelligent autocomplete**.

**New Features:**
- 🔍 **Smart Dropdown** - Type `@` to see online users instantly
- 👥 **User Profiles** - See avatar, display name, and username
- 💙 **Blue Highlights** - @mentions appear in beautiful blue
- 🔔 **Desktop Notifications** - Get notified when someone mentions you
- ⚡ **Quick Select** - Click to auto-complete mentions

## ✨ Visual Enhancements

### Better Decorations Display
- 🎭 **Activity Feed Decorations** - See friends' avatar and banner decorations in live activity
- 📍 **Online Users First** - Friends and activity lists now prioritize online users
- 📏 **Improved Preview Sizing**:
  - Avatar decoration: 120px (was 80px) - no more cutoffs!
  - Name banner card: Fixed 70px height with your actual info
  - Profile effect: 180px (was 120px) - stunning display
- 👤 **Dynamic Previews** - Shop previews show YOUR avatar and username

### Privacy & Polish
- 🔒 **Stealth Mode** - Browser tab now shows "ChatGPT" for discretion
- 💬 **Compact Design** - @ mention dropdown is sleek and efficient (280px wide)
- 🎨 **Better Contrast** - Text shadows ensure readability on all backgrounds

## 🎯 How to Earn Points

**Base Rate:** 1 point per minute of focused work

**Bonuses:**
- ⏱️ **Duration Bonus:** +20 points for 1+ hour sessions
- 🔥 **Streak Bonus:** +50 points for 7+ day streaks
- 🏆 **Max Combo:** 160 points (90-min session + 7-day streak!)

**Example Earnings:**
- 15-min session = 15 points
- 60-min session = 80 points (with bonus)
- 90-min session (7-day streak) = 160 points (max!)

**Level Up:** Every 500 points = New Level 🎊

## 🔧 Technical Improvements

### Backend Updates
- ✅ New endpoint: `POST /users/purchase-effect`
- ✅ Enhanced `/friends/activity` with decoration fields
- ✅ Permanent purchase storage in `purchasedEffects` array
- ✅ Real-time point updates with validation

### Frontend Enhancements
- 🚀 Fresh data from API (no stale cache)
- 📊 Smart online user sorting
- 🎨 Improved decoration rendering
- 💾 Better local storage sync

### Bug Fixes
- ✅ Fixed points showing 0 instead of actual balance
- ✅ Fixed avatar decoration positioning
- ✅ Fixed name banner not showing user info
- ✅ Fixed profile effect stretching
- ✅ Fixed purchase persistence after refresh
- ✅ Fixed API endpoint URL construction

## 📦 Installation

### New Users:
1. Download `focus-extension-v2.3.0.zip`
2. Extract to a folder
3. Open Chrome → Extensions (`chrome://extensions`)
4. Enable "Developer mode"
5. Click "Load unpacked" → Select extracted folder
6. Done! 🎉

### Existing Users:

**Option 1: Automatic Update (Git Users)**
```bash
# Run in extension folder
update.bat
```

**Option 2: Manual Update**
```bash
# Run in extension folder
update-manual.bat
```
Or download the latest release and replace your files.

**Don't Forget:** Click "Reload" button in Chrome Extensions after updating!

## 🎨 Screenshots

### Shop System
[Shop preview showing avatar decorations, name banners, and profile effects with point prices]

### @ Mention Autocomplete
[Chat input with @ dropdown showing online users with avatars]

### Decorated Profile
[User profile with all three decoration types applied]

## 📊 Stats

**Total Shop Items:** 20 decorations
**Price Range:** 100-500 points
**New Endpoints:** 2
**Lines of Code Added:** 500+
**Bug Fixes:** 6

## 🙏 Credits

Made with ❤️ by **edXtra Technologies**

Special thanks to our beta testers for valuable feedback!

## 📝 Full Changelog

See [CHANGELOG.md](CHANGELOG.md) for complete technical details.

## 🐛 Known Issues

None at this time! Report bugs at [GitHub Issues](https://github.com/your-repo/issues)

## 🔜 What's Next?

Coming in v2.4.0:
- 🎁 Daily login rewards
- 🏆 Achievement system expansion
- 🎮 More shop items
- 🌟 Animated decorations
- 💬 Chat reactions

---

**Enjoy the update!** 🚀

If you love Focus Mode, please ⭐ star our repo and share with friends!

**Support:** contact@edxtratech.com  
**Website:** https://edxtratech.com  
**Version:** 2.3.0  
**Release Date:** December 14, 2025
