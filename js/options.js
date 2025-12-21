// Options page JavaScript
async function send(msg) {
  return new Promise((res) => chrome.runtime.sendMessage(msg, res));
}

// Available emoji list (same as backend)
const AVAILABLE_EMOJIS = [
  '👤', '😀', '😎', '🤓', '😇', '🥳', '🤩', '😴', 
  '🤯', '🥶', '🥵', '😈', '👻', '👽', '🤖', '💀',
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈',
  '🙉', '🙊', '🦄', '🐲', '🦖', '🦕', '🐉', '🌟',
  '⭐', '💫', '✨', '🔥', '💧', '⚡', '🌈', '🎮',
  '🎯', '🎨', '🎭', '🎪', '🎬', '🎤', '🎧', '🎵',
  '🎸', '🎹', '🥁', '🎺', '🎻', '🎲', '🎰', '🏆',
  '🥇', '🥈', '🥉', '🏅', '🎖️', '👑', '💎', '💍',
  '🔮', '🧿', '📿', '🛡️', '⚔️', '🏹', '🔱', '⚓'
];

async function loadSettings() {
  const state = await send({action: 'getState'});
  
  // Load allowed and blocked sites
  document.getElementById('allowed').value = (state.allowed || []).join('\n');
  document.getElementById('blocked').value = (state.blockedKeywords || []).join('\n');
  
  // Load statistics
  const level = state.level || 1;
  const points = state.points || 0;
  const streak = state.streak?.current || 0;
  const totalMin = state.stats?.totalFocusTime || 0;
  const sessions = state.stats?.sessionsCompleted || 0;
  const blocked = state.stats?.blockedCount || 0;
  
  document.getElementById('statLevel').textContent = level;
  document.getElementById('statPoints').textContent = points;
  document.getElementById('statStreak').textContent = streak > 0 ? `${streak}🔥` : '0';
  
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  document.getElementById('statTime').textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  document.getElementById('statSessions').textContent = sessions;
  document.getElementById('statBlocked').textContent = blocked;
  
  // Load emoji picker
  loadEmojiPicker(state.avatar || '👤');
}

function loadEmojiPicker(currentEmoji) {
  const picker = document.getElementById('emojiPicker');
  const preview = document.getElementById('emojiPreview');
  
  // Set current emoji in preview
  preview.textContent = currentEmoji;
  
  // Create emoji options
  picker.innerHTML = AVAILABLE_EMOJIS.map(emoji => `
    <div class="emoji-option ${emoji === currentEmoji ? 'selected' : ''}" data-emoji="${emoji}">${emoji}</div>
  `).join('');
  
  // Add click handlers
  document.querySelectorAll('.emoji-option').forEach(option => {
    option.addEventListener('click', () => {
      // Update selection
      document.querySelectorAll('.emoji-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      
      // Update preview
      preview.textContent = option.dataset.emoji;
    });
  });
}

// Save button
document.getElementById('save').addEventListener('click', async () => {
  const saveBtn = document.getElementById('save');
  
  const allowed = document.getElementById('allowed').value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
    
  const blocked = document.getElementById('blocked').value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  
  await send({action: 'updateLists', allowed, blocked});
  
  const passcode = document.getElementById('passcode').value.trim();
  if (passcode) {
    await send({action: 'setPasscode', passcode});
  }
  
  // Save selected emoji
  const selectedEmoji = document.querySelector('.emoji-option.selected');
  if (selectedEmoji) {
    const emoji = selectedEmoji.dataset.emoji;
    await chrome.storage.local.set({ avatar: emoji });
    
    // Update backend if user is logged in
    const token = (await chrome.storage.local.get('authToken'))?.authToken;
    if (token) {
      try {
        await fetch('https://focus-backend-g1zg.onrender.com/api/users/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ avatar: emoji })
        });
      } catch (error) {
        console.error('Failed to update avatar on backend:', error);
      }
    }
  }
  
  saveBtn.textContent = '✓ Saved!';
  saveBtn.classList.add('saved');
  
  setTimeout(() => {
    saveBtn.textContent = 'Save Settings';
    saveBtn.classList.remove('saved');
  }, 2000);
});

// Load settings on page load
loadSettings();
