# 🎯 BlockIt - Focus Mode Chrome Extension

> Stay focused, block distractions, and boost your productivity with BlockIt!

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://github.com/imAaryash/blockit-extension)

## 🌟 Features

### 🚀 Core Features
- **⏱️ Focus Mode** - Set custom timers (5-60 mins) to block distracting websites
- **🔒 Site Blocking** - Automatically blocks YouTube, social media, and custom sites during focus
- **📊 Statistics Tracking** - Monitor your productivity with detailed stats:
  - Total focus time
  - Sessions completed
  - Sites blocked
  - Current & longest streaks
- **🏆 Leaderboard** - Compete with friends and see who's most productive
- **👥 Friends System** - Add friends, view their stats and activity in real-time
- **💬 Community Chat** - Global chat room to connect with other focused users
- **🎨 Custom Themes** - Personalize your blocked page with colors and avatars

### 🎯 Smart Features
- **YouTube Watch Tracking** - See what your friends are watching
- **Real-time Activity** - Live updates of friends' online status
- **Friend Requests** - Privacy-focused friend system with accept/reject
- **Focus Mode Protection** - Chat disabled during focus to eliminate distractions
- **Auto Sync** - All stats sync across devices via cloud backend

### 📈 Advanced Tracking
- Session history
- Focus streaks
- Sites blocked counter
- Time-based analytics
- Activity feed

## 📥 Installation

1. **Download the Source Code**
   ```bash
   # Option A: Clone with Git
   git clone https://github.com/imAaryash/blockit-extension.git
   cd blockit-extension/focus-extension
   
   # Option B: Download ZIP
   # Go to https://github.com/imAaryash/blockit-extension
   # Click "Code" → "Download ZIP"
   # Extract the ZIP file
   ```

2. **Load Extension in Chrome**
   - Open Google Chrome browser
   - Type `chrome://extensions/` in the address bar and press Enter
   - Enable **"Developer mode"** using the toggle switch in the top-right corner
   - Click the **"Load unpacked"** button that appears
   - Navigate to and select the `focus-extension` folder (the one containing `manifest.json`)
   - The extension will now appear in your extensions list ✅

3. **Pin the Extension to Toolbar**
   - Click the Extensions icon (puzzle piece 🧩) in Chrome's toolbar
   - Find **"Focus Mode"** in the dropdown
   - Click the pin icon (📌) next to it to keep it visible

4. **Verify Installation**
   - You should see the Focus Mode icon in your Chrome toolbar
   - Click it to open the popup
   - If you see the interface, installation was successful! 🎉

**Important Notes:**
- The extension must remain in the folder you selected - don't delete or move it
- You'll see a "Developer mode" badge - this is normal for unpacked extensions
- The extension will remain installed until you remove it from `chrome://extensions/`
- Chrome may show warnings for developer mode extensions - this is normal and safe

## 🔧 Setup & Usage

### First Time Setup

1. **Register Account**
   - Click the extension icon
   - Click "Create Account"
   - Fill in:
     - **Username** (unique, lowercase)
     - **Display Name** (your visible name)
     - **Password** (minimum 6 characters)
     - **Avatar** (emoji, e.g., 👨‍💻)
   - Click "Register"

2. **Login**
   - Enter your username and password
   - Click "Login"
   - Your stats will sync automatically

### Using Focus Mode

1. **Start Focus Session**
   - Click extension icon
   - Choose duration (5-60 minutes)
   - Click "Start Focus"
   - Distracting sites are now blocked!

2. **During Focus**
   - Timer counts down
   - Blocked sites show custom page
   - Progress tracked in real-time
   - Chat is disabled to keep you focused

3. **End Session**
   - Click "End Focus" to stop early
   - Or wait for timer to complete
   - Stats automatically updated

### Adding Friends

1. **Send Friend Request**
   - Go to Dashboard → Social
   - Click "Friends" tab
   - Enter friend's username
   - Click "Add Friend"

2. **Accept Requests**
   - Click "Requests" tab
   - See incoming requests
   - Click "Accept" or "Reject"

3. **View Friend Activity**
   - See who's online
   - Check what they're watching
   - View their focus stats
   - Real-time activity updates

### Community Chat

1. **Access Chat**
   - Go to Social page
   - Click "Community Chat" tab
   - Chat disabled during focus mode

2. **Chatting**
   - Type message and press Enter
   - See online users list
   - Real-time messaging
   - Global community room

### Viewing Leaderboard

1. **Check Rankings**
   - Go to Dashboard → Social
   - Click "Leaderboard" tab
   - See top 50 users by focus time
   - Your rank highlighted

## ⚙️ Settings

### Customize Your Experience

- **Avatar** - Change your emoji avatar
- **Blocked Sites** - Customize which sites to block during focus
- **Theme** - Choose blocked page colors
- **Timer Presets** - Quick access to 5, 15, 30, 60 min sessions

### Access Settings
- Click extension icon → Settings
- Or Dashboard → Options

## 📊 Dashboard Features

### Stats Overview
- Total focus time
- Sessions completed
- Sites blocked
- Current streak
- Longest streak

### Activity Feed
- Recent friend activity
- YouTube watch history
- Focus sessions
- Real-time updates

### Social Features
- Friends list
- Online status
- Friend requests
- Leaderboard
- Community chat

## 🎨 Screenshots

### Focus Mode
Focus timer with custom blocked page

### Dashboard
Complete stats overview and analytics

### Social
Friends, leaderboard, and community chat

### Blocked Page
Beautiful custom page shown during focus

## 🔒 Privacy & Security

- **Secure Authentication** - Passwords hashed with bcrypt (10 rounds)
- **JWT Tokens** - Secure session management
- **Friend Requests** - Privacy-first friend system
- **No Tracking** - We don't track your browsing (except blocked sites count)
- **Open Source** - Full code transparency

## 🛠️ Technical Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express.js
- **Database**: MongoDB Atlas
- **Real-time**: Socket.IO
- **Hosting**: Render (free tier)
- **Authentication**: JWT + bcrypt

## 📖 User Guide

### Account Management

**Register:**
```
1. Click extension icon
2. "Create Account" button
3. Fill username, display name, password, avatar
4. Click "Register"
```

**Login:**
```
1. Click extension icon
2. Enter username and password
3. Click "Login"
```

**Logout:**
```
1. Dashboard → Options
2. Click "Logout"
```

**Delete Account:**
```
1. Dashboard → Options
2. Scroll to bottom
3. Click "Delete Account"
4. Confirm deletion
```

### Focus Sessions

**Quick Start:**
```
1. Click extension icon
2. Click preset time button (5/15/30/60 min)
3. Focus mode activated!
```

**Custom Timer:**
```
1. Click extension icon
2. Drag slider to desired minutes
3. Click "Start Focus"
```

**Early End:**
```
1. Click extension icon during focus
2. Click "End Focus"
3. Confirm to stop early
```

### Friends System

**Add Friend:**
```
Social → Friends → Enter username → Add Friend
```

**Accept Request:**
```
Social → Requests → Click "Accept" on request
```

**Remove Friend:**
```
Social → Friends → Click "Remove" on friend
```

**View Profile:**
```
Social → Friends → Click friend's name
```

## 🐛 Troubleshooting

### Extension Not Working

**Problem:** Extension icon doesn't appear
- **Solution:** Refresh `chrome://extensions/` and reload extension

**Problem:** Can't login/register
- **Solution:** Check internet connection, server might be waking up (wait 30 seconds)

**Problem:** Stats not syncing
- **Solution:** Logout and login again to force sync

### Focus Mode Issues

**Problem:** Sites not blocking
- **Solution:** Reload the tab after starting focus mode

**Problem:** Timer not starting
- **Solution:** Check if another focus session is active

**Problem:** Can't end focus early
- **Solution:** Reload extension and try again

### Social Features

**Problem:** Friends not showing online
- **Solution:** Refresh the social page

**Problem:** Chat not working
- **Solution:** Check if focus mode is active (chat disabled during focus)

**Problem:** Friend requests not appearing
- **Solution:** Click "Requests" tab to load them

### Server Issues

**Problem:** "Failed to connect to server"
- **Solution:** 
  - Server may be sleeping (free tier)
  - Wait 30 seconds and try again
  - Check https://focus-backend-g1zg.onrender.com/api/health

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## 📝 License

MIT License - feel free to use and modify!

## 👨‍💻 Developer

Created by **Aaryash**
- GitHub: [@imAaryash](https://github.com/imAaryash)

## 🆘 Support

Having issues? 
- Open an [Issue](https://github.com/imAaryash/blockit-extension/issues)
- Check [Troubleshooting](#-troubleshooting) section
- Contact: aaryash@edxtra.tech

## 🎯 Roadmap

- [ ] Custom site blocking rules
- [ ] Focus statistics export
- [ ] Mobile app companion
- [ ] Team/group challenges
- [ ] Pomodoro timer integration
- [ ] Browser notifications
- [ ] Dark mode
- [ ] More blocking categories

## ⭐ Show Your Support

If you find BlockIt helpful, please:
- ⭐ Star this repository
- 🐛 Report bugs
- 💡 Suggest features
- 📢 Share with friends

---

**Made with ❤️ for productive people**

Stay focused, stay productive! 🚀
