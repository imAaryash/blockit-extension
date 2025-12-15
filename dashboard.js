// Dashboard JavaScript
async function send(msg) {
  return new Promise((res) => chrome.runtime.sendMessage(msg, res));
}

const allBadges = [
  {id: 'first-session', name: 'First Step', desc: 'Complete first session', icon: '<i class="fas fa-flag-checkered"></i>'},
  {id: 'getting-started', name: 'Getting Started', desc: 'Complete 5 sessions', icon: '<i class="fas fa-play-circle"></i>'},
  {id: 'dedicated', name: 'Dedicated', desc: 'Complete 10 sessions', icon: '<i class="fas fa-star"></i>'},
  {id: 'focus-warrior', name: 'Focus Warrior', desc: '25 sessions completed', icon: '<i class="fas fa-fist-raised"></i>'},
  {id: 'session-master', name: 'Session Master', desc: '50 sessions completed', icon: '<i class="fas fa-medal"></i>'},
  {id: 'hour-achiever', name: 'Hour Achiever', desc: '5+ hours focused', icon: '<i class="fas fa-clock"></i>'},
  {id: 'time-warrior', name: 'Time Warrior', desc: '25+ hours focused', icon: '<i class="fas fa-hourglass-half"></i>'},
  {id: 'focus-champion', name: 'Focus Champion', desc: '100+ hours focused', icon: '<i class="fas fa-trophy"></i>'},
  {id: 'streak-starter', name: 'Streak Starter', desc: '3 day streak', icon: '<i class="fas fa-fire-alt"></i>'},
  {id: 'streak-master', name: 'Streak Master', desc: '7 day streak', icon: '<i class="fas fa-fire"></i>'},
  {id: 'streak-legend', name: 'Streak Legend', desc: '30 day streak', icon: '<i class="fas fa-award"></i>'},
  {id: 'level-up', name: 'Level Up', desc: 'Reached level 3', icon: '<i class="fas fa-level-up-alt"></i>'},
  {id: 'rising-star', name: 'Rising Star', desc: 'Reached level 5', icon: '<i class="fas fa-star-half-alt"></i>'},
  {id: 'productivity-king', name: 'Productivity King', desc: 'Reached level 10', icon: '<i class="fas fa-crown"></i>'},
  {id: 'early-bird', name: 'Early Bird', desc: 'Focused before 8 AM', icon: '<i class="fas fa-sun"></i>'},
  {id: 'night-owl', name: 'Night Owl', desc: 'Focused after 10 PM', icon: '<i class="fas fa-moon"></i>'},
  {id: 'social-butterfly', name: 'Social Butterfly', desc: '5+ friends', icon: '<i class="fas fa-user-friends"></i>'}
];

// Listen for badge unlock messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'badgeUnlocked') {
    console.log('[Badge Animation] Received badge unlock message:', message.badge);
    showBadgeUnlockNotification(message.badge);
    sendResponse({success: true});
    return true;
  }
});

async function loadDashboard() {
  // Sync from MongoDB first to get latest data
  await send({action: 'syncFromMongoDB'});
  
  const state = await send({action: 'getState'});
  
  // Update stats
  const currentLevel = state.level || 1;
  const currentPoints = state.points || 0;
  document.getElementById('levelStat').textContent = currentLevel;
  document.getElementById('pointsStat').textContent = currentPoints;
  
  // Update level progress bar
  updateLevelProgress(currentLevel, currentPoints);
  
  // Check for level up
  checkLevelUp();
  
  const currentStreak = state.streak?.current || 0;
  const streakHTML = currentStreak > 0 ? `${currentStreak} <i class="fas fa-fire" style="color: #f97316;"></i>` : '0';
  document.getElementById('currentStreak').innerHTML = streakHTML;
  document.getElementById('longestStreak').textContent = state.streak?.longest || 0;
  
  const totalMin = state.stats?.totalFocusTime || 0;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  document.getElementById('totalTime').textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  document.getElementById('totalSessions').textContent = state.stats?.sessionsCompleted || 0;
  document.getElementById('blockedStat').textContent = state.stats?.blockedCount || 0;
  
  // Load badges
  loadBadges(state.badges || []);
  
  // Load blocked sites
  loadBlockedSites(state.blockedKeywords || []);
}

async function checkLevelUp() {
  const result = await chrome.storage.local.get(['lastKnownLevel']);
  const state = await send({action: 'getState'});
  const currentLevel = state.level || 1;
  const lastKnownLevel = result.lastKnownLevel || currentLevel;
  
  if (currentLevel > lastKnownLevel) {
    showLevelUpNotification(currentLevel);
    await chrome.storage.local.set({ lastKnownLevel: currentLevel });
  } else if (!result.lastKnownLevel) {
    await chrome.storage.local.set({ lastKnownLevel: currentLevel });
  }
}

function showLevelUpNotification(newLevel) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'level-up-notification';
  notification.innerHTML = `
    <div class="level-up-icon">🎉</div>
    <div class="level-up-title">Level Up!</div>
    <div class="level-up-subtitle">You've reached Level ${newLevel}</div>
    <button class="level-up-close">Awesome!</button>
  `;
  
  document.body.appendChild(notification);
  
  // Add close button event listener
  const closeBtn = notification.querySelector('.level-up-close');
  closeBtn.addEventListener('click', () => notification.remove());
  
  // Create confetti
  createConfetti();
  
  // Auto close after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'levelUpAppear 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse';
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

function createConfetti() {
  const colors = ['#3b82f6', '#fbbf24', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      const confetti = document.createElement('div');
      confetti.style.position = 'fixed';
      confetti.style.width = '10px';
      confetti.style.height = '10px';
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = Math.random() * 100 + '%';
      confetti.style.top = '-10px';
      confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
      confetti.style.zIndex = '9999';
      confetti.style.animation = `confettiFall ${2 + Math.random() * 2}s linear forwards`;
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 4000);
    }, i * 30);
  }
}

function showBadgeUnlockNotification(badge) {
  // Find badge icon from allBadges
  const badgeInfo = allBadges.find(b => b.id === badge.id) || {};
  const badgeIcon = badgeInfo.icon || '🏆';
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'badge-unlock-notification';
  notification.innerHTML = `
    <div class="badge-unlock-icon">${badgeIcon}</div>
    <div class="badge-unlock-title">Achievement Unlocked!</div>
    <div class="badge-unlock-badge-name">${badge.name}</div>
    <div class="badge-unlock-description">${badge.desc}</div>
    <button class="badge-unlock-close">Awesome!</button>
  `;
  
  document.body.appendChild(notification);
  
  // Add close button event listener
  const closeBtn = notification.querySelector('.badge-unlock-close');
  closeBtn.addEventListener('click', () => notification.remove());
  
  // Create confetti (golden theme)
  createBadgeConfetti();
  
  // Auto close after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'badgeUnlockAppear 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse';
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

function createBadgeConfetti() {
  const colors = ['#fbbf24', '#f59e0b', '#fcd34d', '#fbbf24', '#ef4444', '#10b981'];
  for (let i = 0; i < 40; i++) {
    setTimeout(() => {
      const confetti = document.createElement('div');
      confetti.style.position = 'fixed';
      confetti.style.width = '8px';
      confetti.style.height = '8px';
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = Math.random() * 100 + '%';
      confetti.style.top = '-10px';
      confetti.style.borderRadius = '50%';
      confetti.style.zIndex = '9999';
      confetti.style.animation = `confettiFall ${2 + Math.random() * 2}s linear forwards`;
      confetti.style.boxShadow = '0 0 8px currentColor';
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 4000);
    }, i * 25);
  }
}

function updateLevelProgress(level, points) {
  // Calculate total XP needed to reach current level (progressive system)
  let totalXPForCurrentLevel = 0;
  for (let i = 1; i < level; i++) {
    totalXPForCurrentLevel += i * 100;
  }
  
  // XP needed for next level
  const pointsNeededForNext = level * 100;
  
  // Current progress toward next level
  const pointsInCurrentLevel = points - totalXPForCurrentLevel;
  const progress = (pointsInCurrentLevel / pointsNeededForNext) * 100;
  
  document.getElementById('levelProgressFill').style.width = `${Math.min(progress, 100)}%`;
  document.getElementById('levelProgressText').textContent = 
    `${pointsInCurrentLevel} / ${pointsNeededForNext} XP to level ${level + 1}`;
}

async function checkLevelUp() {
  const result = await chrome.storage.local.get(['lastKnownLevel']);
  const state = await send({action: 'getState'});
  const currentLevel = state.level || 1;
  const lastKnownLevel = result.lastKnownLevel || currentLevel;
  
  if (currentLevel > lastKnownLevel) {
    showLevelUpNotification(currentLevel);
    await chrome.storage.local.set({ lastKnownLevel: currentLevel });
  } else if (!result.lastKnownLevel) {
    await chrome.storage.local.set({ lastKnownLevel: currentLevel });
  }
}

// Duplicate functions removed - already defined above

async function refreshDashboard() {
  await loadStats();
  
  // Get state to load blocked sites and settings
  const state = await send({action: 'getState'});
  
  // Load blocked sites
  loadBlockedSites(state.blockedKeywords || []);
  
  // Load settings
  document.getElementById('dailyGoalInput').value = state.dailyGoal || 120;
  document.getElementById('pomodoroBreakInput').value = state.pomodoroBreakDuration || 5;
}

function loadBadges(earnedBadges) {
  const container = document.getElementById('badgesGrid');
  container.innerHTML = '';
  
  // earnedBadges can be array of objects or array of IDs
  const earnedIds = earnedBadges.map(b => typeof b === 'string' ? b : b.id);
  
  allBadges.forEach(badge => {
    const earned = earnedIds.includes(badge.id);
    const div = document.createElement('div');
    div.className = `badge-card ${earned ? 'earned' : ''}`;
    div.innerHTML = `
      <div class="badge-icon">${badge.icon}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.desc}</div>
      ${earned ? '<div style="position: absolute; top: 8px; right: 8px; font-size: 14px; color: #22c55e;"><i class="fas fa-check-circle"></i></div>' : ''}
    `;
    div.style.position = 'relative';
    container.appendChild(div);
  });
}

function loadBlockedSites(sites) {
  const container = document.getElementById('blockedSitesList');
  const countBadge = document.getElementById('blockedCount');
  container.innerHTML = '';
  
  // Update count badge
  countBadge.textContent = `${sites.length} ${sites.length === 1 ? 'site' : 'sites'}`;
  
  if (sites.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-shield-alt"></i></div>
        <div class="empty-state-text">
          No blocked sites yet.<br>
          Add websites above to block them during focus sessions.
        </div>
      </div>
    `;
    return;
  }
  
  sites.forEach(site => {
    const div = document.createElement('div');
    div.className = 'site-item';
    div.innerHTML = `
      <div class="site-info">
        <div class="site-icon"><i class="fas fa-ban"></i></div>
        <div class="site-name">${site}</div>
      </div>
      <button class="btn-remove" data-site="${site}">
        <i class="fas fa-trash-alt"></i>
        <span>Remove</span>
      </button>
    `;
    container.appendChild(div);
  });
  
  // Add remove listeners
  document.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      await send({action: 'removeCustomBlock', site: btn.dataset.site});
      loadDashboard();
    });
  });
}

// Add site button
document.getElementById('addSiteBtn').addEventListener('click', async () => {
  const site = document.getElementById('newSite').value.trim();
  if (site) {
    await send({action: 'addCustomBlock', site});
    document.getElementById('newSite').value = '';
    loadDashboard();
  }
});

// Save settings
document.getElementById('saveSettings').addEventListener('click', async () => {
  const dailyGoal = Number(document.getElementById('dailyGoalInput').value) || 120;
  const pomodoroBreakDuration = Number(document.getElementById('pomodoroBreakInput').value) || 5;
  
  await send({action: 'updateSettings', settings: {dailyGoal, pomodoroBreakDuration}});
  alert('Settings saved!');
});

// Check for updates button
document.getElementById('checkUpdatesBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('checkUpdatesBtn');
  const originalText = btn.innerHTML;
  
  // Show loading state
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Checking...</span>';
  btn.disabled = true;
  
  try {
    // Trigger update check in background
    const response = await chrome.runtime.sendMessage({action: 'checkForUpdates'});
    
    // Wait a moment for the check to complete
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Check if update is available
    const data = await chrome.storage.local.get(['updateAvailable', 'latestVersion']);
    
    if (data.updateAvailable) {
      btn.innerHTML = `<i class="fas fa-check-circle"></i><span>Update Available: v${data.latestVersion}</span>`;
      btn.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
      btn.style.borderColor = '#22c55e';
      
      // Trigger download
      setTimeout(() => {
        chrome.runtime.sendMessage({action: 'downloadUpdate'});
      }, 1000);
    } else {
      btn.innerHTML = '<i class="fas fa-check-circle"></i><span>Up to date!</span>';
      btn.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
      btn.style.borderColor = '#22c55e';
      
      // Reset after 3 seconds
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.disabled = false;
      }, 3000);
    }
  } catch (error) {
    console.error('Update check failed:', error);
    btn.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>Check Failed</span>';
    btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    btn.style.borderColor = '#ef4444';
    
    // Reset after 3 seconds
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.disabled = false;
    }, 3000);
  }
});

// Load on page load
loadDashboard();
