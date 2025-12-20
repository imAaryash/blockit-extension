# Changelog

All notable changes to BlockIt Focus Extension will be documented in this file.

## [2.4.0] - 2025-12-16

### 🆕 Social & UI Improvements
- **Three-Dots Menu on Friend Cards**: Added a modern three-dots (⋮) menu to each friend card with options for Nudge and Remove, replacing the old button layout.
- **Popup Menu & Confirmation**: Nudge and Remove actions now appear in a popup menu. Remove action shows a confirmation modal for safety.
- **Stats Alignment & Visibility**: Friend stats (level, focus time) now use a glassmorphic background and are always visible, even on decorated cards. Stats are aligned left of the menu button for a clean look.
- **Menu Positioning Fixes**: Menu now opens outside the card, unaffected by card hover/transform, and always appears in the correct position.
- **Leaderboard-Style Stats**: Friend stats now match the leaderboard style for consistency and readability.

### 🔄 Data & Sync Logic
- **Local Storage Streak Migration**: Local streak data is now cleared and always synced with MongoDB on login/startup. Old local streak logic is fully migrated to the new backend-driven system for reliability across devices.
- **Improved Sync on Install/Update**: On extension install or update, all user data (including streak, stats, points, badges, and settings) is fetched from the backend and replaces local storage, ensuring a single source of truth.

### 🐛 Bug Fixes
- Fixed friend card menu overlapping stats or decorations
- Fixed menu popup being affected by card hover/transform
- Fixed stats not visible on decorated backgrounds
- Fixed rare sync issues with streak data on login

---

## [2.3.0] - 2025-12-14

### 🛍️ Shop System
- **Point-Based Shop**: Buy decorations with earned points
  - Avatar Decorations (9 items, 100-500 points)
  - Name Banners (8 items, 100-450 points)
  - Profile Effects (3 items, 200-400 points)
- **Live Preview System**: See decorations before purchasing
  - Real-time preview of avatar decorations
  - Name banner preview on sample card with your info
  - Profile effect preview with proper sizing
- **Purchase Management**: 
  - Purchases saved permanently to database
  - One-click equip for owned items
  - Visual status indicators (Owned/Equipped)
  - Points deduction with validation

### 💬 Enhanced Chat Features
- **@ Mention Autocomplete**: 
  - Type @ to see online users dropdown
  - Shows user avatar, display name, and username
  - Click to auto-complete mention
  - Smart filtering as you type
- **Improved @ Mentions**:
  - Blue highlight for mentioned usernames
  - Desktop notifications when mentioned
  - Works seamlessly with existing chat

### ✨ Visual Improvements
- **Decorations in Live Activity**: Avatar and name banner decorations now visible on activity feed
- **Online Users Priority**: Online friends appear at top in Friends and Activity sections
- **Better Preview Sizing**:
  - Avatar decoration increased to 120px (from 80px)
  - Name banner card fixed at 70px height
  - Profile effect increased to 180px height
  - Proper text shadows for readability
- **Privacy Enhancement**: Page title changed to "ChatGPT" for discretion

### 🔧 Technical Updates
- **Backend Endpoints**:
  - POST `/users/purchase-effect` - Purchase decorations with points
  - Enhanced `/friends/activity` to include decoration fields
- **Data Persistence**: 
  - Purchases stored in `purchasedEffects` array
  - Points updated in real-time
  - Local storage synced with API responses
- **Improved Data Flow**:
  - Shop fetches fresh data from API (not cached)
  - Online users list used for mention autocomplete
  - Better error handling for purchases

### 🐛 Bug Fixes
- Fixed points display showing 0 instead of actual balance
- Fixed avatar decoration positioning in previews
- Fixed name banner not showing user info
- Fixed profile effect stretching issues
- Fixed purchase data not persisting after refresh

---

## [2.2.0] - 2025-12-14

### ✨ New Features
- **Profile Decorations System**
  - Avatar Decorations: Customizable frames around profile pictures
  - Name Banners: Stylish backgrounds for user cards
  - Profile Effects: Decorative frames on profile modals
  
- **Enhanced Chat System**
  - @ Mention Functionality: Tag users with @username
  - Notification alerts when you're mentioned
  - Profanity Filter: "Badmoshi na mittar" for inappropriate content
  - Consecutive Message Grouping: Cleaner chat interface
  - Avatar Decorations in Chat: Show profile decorations in messages
  
- **Visual Improvements**
  - Name banners on friend cards and leaderboard
  - Text shadows for better readability on decorated backgrounds
  - Avatar decorations in all sections (friends, leaderboard, chat, online users)

### 🔧 Improvements
- Better text visibility with shadow effects on colorful backgrounds
- Profile decoration stretches to fit modal perfectly
- Cleaner chat interface with message grouping
- Backend now sends decoration data with all user objects

### 🐛 Bug Fixes
- Fixed avatar decoration positioning in chat messages
- Fixed name banner not showing on profile modal
- Fixed stats visibility on colorful name banner backgrounds
- Fixed consecutive message grouping logic

---

## [1.0.0] - 2025-12-09

### 🎉 Initial Release

#### Features
- ⏱️ **Focus Mode**
  - Custom timers (5-60 minutes)
  - Real-time countdown
  - Site blocking during focus
  - Early session end option

- 🚫 **Site Blocking**
  - YouTube automatic blocking
  - Social media blocking
  - Custom blocked sites
  - Beautiful blocked page with themes

- 📊 **Statistics**
  - Total focus time tracking
  - Sessions completed counter
  - Sites blocked counter
  - Current streak tracking
  - Longest streak record

- 👥 **Friends System**
  - Friend requests (send/accept/reject)
  - Real-time friend activity
  - Online status indicators
  - Friend profile viewing
  - YouTube watch tracking

- 🏆 **Leaderboard**
  - Top 50 users ranking
  - Focus time competition
  - Real-time updates
  - Personal rank highlighting

- 💬 **Community Chat**
  - Global chat room
  - Real-time messaging
  - Online users list
  - Disabled during focus mode

- 🎨 **Customization**
  - Avatar selection (emojis)
  - Theme colors for blocked page
  - Display name customization
  - Settings persistence

- 🔒 **Security**
  - Bcrypt password hashing
  - JWT authentication
  - Secure HTTPS connections
  - Privacy-focused design

- 🌐 **Cloud Sync**
  - Cross-device stats sync
  - Real-time activity updates
  - Friend data synchronization
  - Settings backup

#### Technical
- MongoDB Atlas integration
- Socket.IO real-time updates
- Render deployment support
- RESTful API backend
- Chrome extension manifest v3

#### Known Limitations
- Free tier server may sleep (30s wake time)
- Chat history not persistent (last 50 messages)
- Maximum 50 users on leaderboard

---

## Upcoming Features

See [ROADMAP.md](ROADMAP.md) for planned features.

---

## Version Format

- **MAJOR.MINOR.PATCH** (e.g., 1.0.0)
- **MAJOR**: Breaking changes
- **MINOR**: New features
- **PATCH**: Bug fixes

[1.0.0]: https://github.com/imAaryash/blockit-extension/releases/tag/v1.0.0
