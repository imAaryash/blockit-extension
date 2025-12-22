// Settings page functionality

// Check authentication before loading page
(async () => {
  const { authToken } = await chrome.storage.local.get(['authToken']);
  if (!authToken) {
    console.log('[Settings] No auth token found, redirecting to login...');
    window.location.href = chrome.runtime.getURL('pages/login.html');
    return;
  }
})();

// Use environment-aware API_URL from config.js
const API_BASE_URL = typeof API_URL !== 'undefined' ? API_URL.replace('/api', '') : 'https://focus-backend-g1zg.onrender.com';

// Logout handler
async function handleLogout() {
  try {
    console.log('[Logout] Starting logout process - syncing data first...');
    
    // STEP 1: Sync all current data to MongoDB BEFORE clearing
    const authToken = (await chrome.storage.local.get('authToken'))?.authToken;
    const currentState = await chrome.storage.local.get(['stats', 'points', 'level', 'badges', 'streak', 'focusHistory']);
    
    if (authToken) {
      try {
        // Sync final state to MongoDB
        await fetch(`${API_BASE_URL}/api/users/stats`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            stats: currentState.stats,
            streak: currentState.streak,
            badges: currentState.badges,
            points: currentState.points,
            level: currentState.level,
            focusHistory: currentState.focusHistory || {}
          })
        });
        console.log('[Logout] ✅ Data synced to MongoDB before logout');
      } catch (syncError) {
        console.error('[Logout] Failed to sync before logout:', syncError);
        // Continue with logout even if sync fails
      }
      
      // STEP 2: Call logout endpoint to invalidate session
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => {}); // Ignore errors
    }
    
    // STEP 3: Clear all local storage
    await chrome.storage.local.clear();
    console.log('[Logout] Local storage cleared');
    
    // STEP 4: Redirect to login
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Logout error:', error);
    // Clear storage and redirect anyway
    await chrome.storage.local.clear();
    window.location.href = 'login.html';
  }
}

// Available emojis (matching backend)
const AVAILABLE_EMOJIS = [
  // Animals (character-like)
  '🦊', '🐼', '🐨', '🦁', '🐯', '🐸', '🐙', '🦄', '🐲', '🦅',
  '🐺', '🦝', '🦉', '🦈', '🐧', '🦩', '🦜', '🐢', '🦎', '🦀',
  '🐵', '🙈', '🙉', '🙊', '🐶', '🐱', '🐭', '🐹', '🐰', '🐻',
  '🐻‍❄️', '🐔', '🐥', '🦆', '🦢', '🦚', '🦤', '🐦', '🦇', '🦦',
  '🦥', '🦘', '🦫', '🦭', '🦛', '🦏', '🦒', '🐘', '🦣', '🦌',
  // Fantasy & Mythical Characters
  '👽', '🤖', '🎃', '🦖', '🦕', '🐉', '🧙', '🧙‍♂️', '🧙‍♀️',
  '🧚', '🧚‍♂️', '🧚‍♀️', '🧛', '🧛‍♂️', '🧛‍♀️', '🧜', '🧜‍♂️', '🧜‍♀️',
  '🧞', '🧞‍♂️', '🧞‍♀️', '🧝', '🧝‍♂️', '🧝‍♀️', '🥷', '🦸', '🦸‍♂️', 
  '🦸‍♀️', '🦹', '🦹‍♂️', '🦹‍♀️', '🧌', '👹', '👺', '💀', '☠️', '👻'
];

let selectedEmoji = '👤';

// Load settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  loadEmojiGrid();
  
  // Add logout button event listener
  document.getElementById('logoutButton').addEventListener('click', async () => {
    if (confirm('Are you sure you want to logout?')) {
      await handleLogout();
    }
  });
});

// Load current settings from storage
async function loadSettings() {
  try {
    const state = await chrome.storage.local.get([
      'dailyGoal',
      'pomodoroBreakDuration',
      'avatar'
    ]);

    // Load daily goal
    const dailyGoal = state.dailyGoal || 120;
    document.getElementById('dailyGoalInput').value = dailyGoal;

    // Load break duration
    const breakDuration = state.pomodoroBreakDuration || 5;
    document.getElementById('pomodoroBreakInput').value = breakDuration;

    // Load avatar emoji
    selectedEmoji = state.avatar || '👤';
    document.getElementById('emojiPreview').textContent = selectedEmoji;
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Load emoji grid
function loadEmojiGrid() {
  const grid = document.getElementById('emojiGrid');
  
  grid.innerHTML = '';
  
  AVAILABLE_EMOJIS.forEach(emoji => {
    const option = document.createElement('div');
    option.className = 'emoji-option';
    if (emoji === selectedEmoji) {
      option.classList.add('selected');
    }
    option.dataset.emoji = emoji;
    option.textContent = emoji;
    option.onclick = () => selectEmoji(emoji);
    grid.appendChild(option);
  });
}

// Select emoji
function selectEmoji(emoji) {
  selectedEmoji = emoji;
  
  // Update preview
  document.getElementById('emojiPreview').textContent = emoji;
  
  // Update selected state
  document.querySelectorAll('.emoji-option').forEach(option => {
    option.classList.remove('selected');
    if (option.dataset.emoji === emoji) {
      option.classList.add('selected');
    }
  });
}

// Save settings
document.getElementById('saveButton').addEventListener('click', async () => {
  const btn = document.getElementById('saveButton');
  const originalHTML = btn.innerHTML;
  
  try {
    // Disable button and show loading
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    // Get values
    const dailyGoal = Number(document.getElementById('dailyGoalInput').value) || 120;
    const pomodoroBreakDuration = Number(document.getElementById('pomodoroBreakInput').value) || 5;
    
    // Save to local storage
    await chrome.storage.local.set({
      dailyGoal,
      pomodoroBreakDuration,
      avatar: selectedEmoji
    });
    
    // Also update user object if exists
    const userState = await chrome.storage.local.get('user');
    if (userState.user) {
      userState.user.avatar = selectedEmoji;
      await chrome.storage.local.set({ user: userState.user });
    }
    
    // Sync to backend
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing to cloud...';
    
    const token = (await chrome.storage.local.get('authToken'))?.authToken;
    if (token) {
      // Update settings and avatar together
      const [settingsResponse, profileResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/users/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            settings: {
              dailyGoal,
              pomodoroEnabled: false,
              focusTime: 25,
              breakTime: pomodoroBreakDuration
            }
          })
        }),
        fetch(`${API_BASE_URL}/api/users/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ avatar: selectedEmoji })
        })
      ]);
      
      if (!settingsResponse.ok || !profileResponse.ok) {
        throw new Error('Failed to sync to backend');
      }
    }
    
    // Show success
    btn.classList.add('success');
    btn.innerHTML = '<i class="fas fa-check-circle"></i> Saved & Synced!';
    
    // Reset after 2 seconds
    setTimeout(() => {
      btn.classList.remove('success');
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }, 2000);
    
  } catch (error) {
    console.error('Failed to save settings:', error);
    
    // Show error
    btn.classList.add('error');
    btn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Save Failed';
    
    // Reset after 2 seconds
    setTimeout(() => {
      btn.classList.remove('error');
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }, 2000);
  }
});
