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
  // CRITICAL: Try to sync from MongoDB first, but fallback to local if offline
  try {
    await send({action: 'syncFromMongoDB'});
    // Small delay to ensure sync completes
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('[Dashboard] ✅ Synced from MongoDB (online)');
  } catch (err) {
    console.warn('[Dashboard] ⚠️ MongoDB sync failed (offline or network error), using local data:', err);
    // Continue with local storage data when offline
  }
  
  // Get fresh state after sync (or local data if offline)
  const state = await chrome.storage.local.get();
  
  console.log('[Dashboard] Loaded stats:', {
    totalFocusTime: state.stats?.totalFocusTime,
    sessionsCompleted: state.stats?.sessionsCompleted,
    points: state.points,
    level: state.level,
    source: state.lastSyncTime ? 'MongoDB (cached)' : 'Local only'
  });
  
  // Check if it's a new day and reset todayFocusTime if needed (IST timezone)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
  const istTime = new Date(now.getTime() + istOffset);
  const todayDateString = istTime.toISOString().substring(0, 10); // YYYY-MM-DD in IST
  const storedDate = state.todayDate || '';
  
  let todayMin = state.todayFocusTime || 0;
  
  // Reset if it's a new day
  if (storedDate !== todayDateString) {
    todayMin = 0;
    await chrome.storage.local.set({ 
      todayFocusTime: 0, 
      todayDate: todayDateString 
    });
  }
  
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
  
  // Today's focused time - use todayMin which is already calculated above
  const todayHours = Math.floor(todayMin / 60);
  const todayMins = todayMin % 60;
  const todayTimeElement = document.getElementById('todayTime');
  if (todayTimeElement) {
    todayTimeElement.textContent = todayHours > 0 ? `${todayHours}h ${todayMins}m` : `${todayMins}m`;
  }
  
  // Update daily goal progress - fetch from state
  const dailyGoalMinutes = state.dailyGoal || 120;
  const goalProgress = Math.min((todayMin / dailyGoalMinutes) * 100, 100);
  const goalProgressElement = document.getElementById('todayGoalProgress');
  if (goalProgressElement) {
    goalProgressElement.style.width = `${goalProgress}%`;
  }
  
  // Update daily goal text display
  const dailyGoalHours = Math.floor(dailyGoalMinutes / 60);
  const dailyGoalMins = dailyGoalMinutes % 60;
  const dailyGoalText = dailyGoalHours > 0 ? `${dailyGoalHours}h` : `${dailyGoalMinutes}m`;
  const dailyGoalElement = document.getElementById('dailyGoalText');
  if (dailyGoalElement) {
    dailyGoalElement.textContent = dailyGoalText;
  }
  
  document.getElementById('totalSessions').textContent = state.stats?.sessionsCompleted || 0;
  document.getElementById('blockedStat').textContent = state.stats?.blockedCount || 0;
  
  // Load badges
  loadBadges(state.badges || []);
  
  // Load focus heatmap
  await loadFocusHeatmap();
  
  // Load blocked sites
  loadBlockedSites(state.blockedKeywords || []);
}

// Generate Focus Heatmap (GitHub style)
async function loadFocusHeatmap() {
  const container = document.getElementById('focusHeatmap');
  
  // Get focus history from chrome storage
  const result = await chrome.storage.local.get('focusHistory');
  const focusHistory = result.focusHistory || {};
  
  console.log('Focus History Data:', focusHistory); // Debug log
  
  // Generate last 90 days using IST timezone (to match background.js)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
  const istTime = new Date(now.getTime() + istOffset);
  const days = 90;
  const heatmapData = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(istTime.getTime());
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD in IST
    const minutes = focusHistory[dateStr] || 0;
    
    heatmapData.push({
      date: dateStr,
      minutes: minutes,
      dayOfWeek: new Date(dateStr + 'T12:00:00').getDay() // 0=Sunday, 6=Saturday
    });
  }
  
  console.log('Heatmap Data Generated:', heatmapData.filter(d => d.minutes > 0)); // Debug log
  
  // Calculate max value for relative color scaling
  const maxMinutes = Math.max(...heatmapData.map(d => d.minutes), 1);
  console.log('Max minutes for scaling:', maxMinutes);
  
  // Assign levels based on percentiles of max value
  heatmapData.forEach(day => {
    day.level = getHeatLevelRelative(day.minutes, maxMinutes);
  });
  
  // Group by weeks (Sunday to Saturday)
  const weeks = [];
  let currentWeek = [];
  
  heatmapData.forEach((day, index) => {
    // Add empty days at the start of first week to align properly
    if (index === 0 && day.dayOfWeek !== 0) {
      for (let i = 0; i < day.dayOfWeek; i++) {
        currentWeek.push(null); // placeholder for empty days
      }
    }
    
    currentWeek.push(day);
    
    // Complete week on Saturday or at end
    if (day.dayOfWeek === 6 || index === heatmapData.length - 1) {
      // Fill remaining days if needed
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push([...currentWeek]);
      currentWeek = [];
    }
  });
  
  // Group weeks by month
  const months = [];
  let currentMonth = null;
  let monthWeeks = [];
  
  weeks.forEach(week => {
    // Find the first non-null day in the week to determine month
    const firstDay = week.find(d => d !== null);
    if (!firstDay) return;
    
    const monthName = new Date(firstDay.date + 'T12:00:00').toLocaleString('default', { month: 'short' });
    
    if (monthName !== currentMonth) {
      if (monthWeeks.length > 0) {
        months.push({ name: currentMonth, weeks: monthWeeks });
      }
      currentMonth = monthName;
      monthWeeks = [];
    }
    
    monthWeeks.push(week);
  });
  
  // Add last month
  if (monthWeeks.length > 0) {
    months.push({ name: currentMonth, weeks: monthWeeks });
  }
  
  // Render heatmap
  let html = '<div class="heatmap-container">';
  
  months.forEach(month => {
    html += `
      <div class="heatmap-month">
        <div class="heatmap-month-label">${month.name}</div>
        <div class="heatmap-month-grid">
    `;
    
    month.weeks.forEach(week => {
      html += '<div class="heatmap-week">';
      week.forEach(day => {
        if (day === null) {
          // Empty placeholder
          html += '<div class="heatmap-day heatmap-day-empty"></div>';
        } else {
          const date = new Date(day.date + 'T12:00:00');
          const tooltip = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}: ${day.minutes} min`;
          html += `
            <div class="heatmap-day" data-level="${day.level}" data-date="${day.date}" title="${tooltip}">
              <div class="heatmap-tooltip">${tooltip}</div>
            </div>
          `;
        }
      });
      html += '</div>';
    });
    
    html += `
        </div>
      </div>
    `;
  });
  
  html += `
    </div>
    <div class="heatmap-legend">
      <span class="heatmap-legend-label">Less</span>
      <div class="heatmap-legend-boxes">
        <div class="heatmap-legend-box" style="background: #1a1a1a; border-color: #2a2a2a;"></div>
        <div class="heatmap-legend-box" style="background: #0e4429; border-color: #0e4429;"></div>
        <div class="heatmap-legend-box" style="background: #006d32; border-color: #006d32;"></div>
        <div class="heatmap-legend-box" style="background: #26a641; border-color: #26a641;"></div>
        <div class="heatmap-legend-box" style="background: #39d353; border-color: #39d353;"></div>
      </div>
      <span class="heatmap-legend-label">More</span>
    </div>
  `;
  
  container.innerHTML = html;
}

function getHeatLevelRelative(minutes, maxMinutes) {
  if (minutes === 0) return 0;
  
  // Calculate percentage of max
  const percentage = (minutes / maxMinutes) * 100;
  
  // Distribute into 4 levels based on quartiles
  if (percentage <= 25) return 1;   // 0-25% of max
  if (percentage <= 50) return 2;   // 25-50% of max
  if (percentage <= 75) return 3;   // 50-75% of max
  return 4;                          // 75-100% of max
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
  
  // Core permanent sites that are always blocked
  const permanentSites = 7;
  const totalSites = permanentSites + sites.length;
  
  // Update count badge
  countBadge.textContent = `${totalSites} ${totalSites === 1 ? 'site' : 'sites'}`;
  
  if (sites.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-text">No custom sites added</div>
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

// Blocked sites popup handlers
document.getElementById('viewBlockedBtn')?.addEventListener('click', () => {
  // Create and show backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'popup-backdrop';
  backdrop.id = 'popupBackdrop';
  backdrop.addEventListener('click', closeBlockedPopup);
  document.body.appendChild(backdrop);
  
  // Show popup
  document.getElementById('blockedPopup').style.display = 'flex';
});

document.getElementById('closePopupBtn')?.addEventListener('click', closeBlockedPopup);

function closeBlockedPopup() {
  document.getElementById('blockedPopup').style.display = 'none';
  const backdrop = document.getElementById('popupBackdrop');
  if (backdrop) {
    backdrop.remove();
  }
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

// Check for developer messages
checkDeveloperMessage();

// Function to check and show developer message
async function checkDeveloperMessage() {
  try {
    const state = await chrome.storage.local.get(['authToken', 'user']);
    if (!state.authToken || !state.user) return;

    const response = await fetch('https://focus-backend-g1zg.onrender.com/api/users/developer-message', {
      headers: {
        'Authorization': `Bearer ${state.authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) return;

    const message = await response.json();
    console.log('Developer message response:', message);

    // Show notification if there's a message (hasUnread is undefined means there's a message)
    if (message && message.messageId && message.hasUnread !== false) {
      showDeveloperMessageNotification(message);
    }
  } catch (error) {
    console.error('Check developer message error:', error);
  }
}

// Show developer message notification
function showDeveloperMessageNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'developer-message-notification';
  notification.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%);
    border: 2px solid transparent;
    border-radius: 16px;
    padding: 0;
    box-shadow: 0 20px 60px rgba(59, 130, 246, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
    z-index: 10000;
    min-width: 400px;
    max-width: 450px;
    animation: nudgeSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    cursor: pointer;
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    overflow: hidden;
    backdrop-filter: blur(10px);
  `;

  // Add animated gradient border effect
  const borderGlow = document.createElement('div');
  borderGlow.style.cssText = `
    position: absolute;
    inset: -2px;
    background: linear-gradient(90deg, #3b82f6, #2563eb, #1d4ed8, #2563eb, #3b82f6);
    background-size: 200% 100%;
    border-radius: 16px;
    z-index: -1;
    animation: gradientShift 3s linear infinite;
  `;
  notification.appendChild(borderGlow);

  const pulseOverlay = document.createElement('div');
  pulseOverlay.style.cssText = `
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.2), transparent 60%);
    animation: pulse 2s ease-in-out infinite;
    pointer-events: none;
  `;
  notification.appendChild(pulseOverlay);

  const content = document.createElement('div');
  content.style.cssText = `
    position: relative;
    padding: 20px 24px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 14px;
  `;

  // Get avatar decoration HTML if exists
  let avatarDecorationHTML = '';
  if (message.from.avatarDecoration) {
    avatarDecorationHTML = `
      <div style="
        position: absolute;
        inset: -8px;
        background-image: url('${chrome.runtime.getURL(`assets/avatar/${message.from.avatarDecoration}.png`)}');
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        pointer-events: none;
        z-index: 2;
      "></div>
    `;
  }

  content.innerHTML = `
    <div style="display: flex; align-items: start; gap: 16px;">
      <div style="position: relative; flex-shrink: 0;">
        <div style="font-size: 48px; filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3)); position: relative; z-index: 1;">${message.from.avatar}</div>
        ${avatarDecorationHTML}
        <div style="
          position: absolute;
          bottom: -4px;
          right: -4px;
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(251, 191, 36, 0.5);
          z-index: 3;
        ">
          <i class="fas fa-crown" style="color: white; font-size: 12px;"></i>
        </div>
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <div style="font-size: 16px; font-weight: 700; color: #ffffff; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
            ${message.from.displayName}
          </div>
          <div style="
            background: rgba(255, 255, 255, 0.2);
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            color: #ffffff;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          ">
            Developer
          </div>
        </div>
        <div style="
          font-size: 14px;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 8px;
        ">
          ${message.title}
        </div>
        <div style="
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          display: flex;
          align-items: center;
          gap: 6px;
        ">
          <i class="fas fa-mouse-pointer" style="font-size: 10px;"></i>
          <span>Click to read message</span>
        </div>
      </div>
      <button class="dev-msg-close-btn" style="
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        font-size: 14px;
        padding: 0;
        transition: all 0.2s ease;
        flex-shrink: 0;
      ">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

  notification.appendChild(content);

  notification.onmouseenter = () => {
    notification.style.transform = 'translateY(-4px) scale(1.02)';
    notification.style.boxShadow = '0 24px 80px rgba(59, 130, 246, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.2) inset';
  };

  notification.onmouseleave = () => {
    notification.style.transform = 'translateY(0) scale(1)';
    notification.style.boxShadow = '0 20px 60px rgba(59, 130, 246, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1) inset';
  };

  const closeBtn = notification.querySelector('.dev-msg-close-btn');
  closeBtn.onmouseenter = () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    closeBtn.style.transform = 'scale(1.1)';
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    closeBtn.style.transform = 'scale(1)';
  };
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    notification.style.animation = 'nudgeSlideOut 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    setTimeout(() => notification.remove(), 400);
  };

  notification.onclick = () => {
    showDeveloperMessageModal(message);
    notification.style.animation = 'nudgeSlideOut 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    setTimeout(() => notification.remove(), 400);
  };

  document.body.appendChild(notification);

  // Auto-hide after 8 seconds if not interacted with
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'nudgeSlideOut 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      setTimeout(() => notification.remove(), 400);
    }
  }, 8000);
}

// Show developer message modal
async function showDeveloperMessageModal(message) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
    animation: fadeIn 0.3s ease;
    padding: 20px;
  `;

  // Get avatar decoration HTML
  let avatarDecorationHTML = '';
  if (message.from.avatarDecoration) {
    avatarDecorationHTML = `
      <div style="
        position: absolute;
        inset: -12px;
        background-image: url('${chrome.runtime.getURL(`assets/avatar/${message.from.avatarDecoration}.png`)}');
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        pointer-events: none;
        z-index: 2;
      "></div>
    `;
  }

  modal.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      border: 2px solid #3b82f6;
      border-radius: 20px;
      padding: 32px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 25px 80px rgba(59, 130, 246, 0.4);
      animation: modalSlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      position: relative;
    ">
      <button class="modal-close-btn" style="
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        font-size: 16px;
        padding: 0;
        transition: all 0.2s ease;
      ">
        <i class="fas fa-times"></i>
      </button>
      
      <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 24px;">
        <div style="position: relative; flex-shrink: 0;">
          <div style="font-size: 64px; filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.5)); position: relative; z-index: 1;">${message.from.avatar}</div>
          ${avatarDecorationHTML}
          <div style="
            position: absolute;
            bottom: -6px;
            right: -6px;
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 16px rgba(251, 191, 36, 0.6);
            z-index: 3;
          ">
            <i class="fas fa-crown" style="color: white; font-size: 16px;"></i>
          </div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">
            ${message.from.displayName}
          </div>
          <div style="
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            padding: 4px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            color: #ffffff;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: inline-block;
          ">
            Developer
          </div>
        </div>
      </div>

      <div style="
        font-size: 20px;
        font-weight: 600;
        color: #ffffff;
        margin-bottom: 16px;
      ">
        ${message.title}
      </div>

      <div style="
        font-size: 16px;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.85);
        margin-bottom: 24px;
        padding: 20px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        border-left: 4px solid #3b82f6;
      ">
        ${message.message}
      </div>

      <button class="got-it-btn" style="
        width: 100%;
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        border: none;
        border-radius: 12px;
        padding: 14px;
        color: white;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
      ">
        <i class="fas fa-check"></i> Got it, thanks!
      </button>
    </div>
  `;

  // Add modal styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes modalSlideUp {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    .got-it-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
    }
    .modal-close-btn:hover {
      background: rgba(255, 255, 255, 0.2) !important;
      transform: scale(1.1);
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(modal);

  // Mark message as read
  const markAsRead = async () => {
    try {
      const state = await chrome.storage.local.get('authToken');
      await fetch('https://focus-backend-g1zg.onrender.com/api/users/mark-message-read', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messageId: message.id })
      });
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  };

  const closeModal = () => {
    modal.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => modal.remove(), 300);
    markAsRead();
  };

  modal.querySelector('.modal-close-btn').onclick = closeModal;
  modal.querySelector('.got-it-btn').onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

// Manual badge refresh button handler
document.addEventListener('DOMContentLoaded', () => {
  const refreshBadgesBtn = document.getElementById('refreshBadgesBtn');
  if (refreshBadgesBtn) {
    refreshBadgesBtn.addEventListener('click', async () => {
      const icon = refreshBadgesBtn.querySelector('i');
      icon.classList.add('fa-spin');
      refreshBadgesBtn.disabled = true;
      
      try {
        console.log('[Badge Refresh] Manually checking badges...');
        const response = await send({action: 'checkBadges'});
        console.log('[Badge Refresh] Badge check response:', response);
        
        if (response.success) {
          // Wait a moment for MongoDB sync to propagate
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Reload dashboard to show updated badges
          console.log('[Badge Refresh] Reloading dashboard...');
          await loadDashboard();
          
          // Show success feedback
          const badgeCount = response.badges?.length || 0;
          refreshBadgesBtn.innerHTML = `<i class="fas fa-check"></i> Found ${badgeCount} badges!`;
          setTimeout(() => {
            refreshBadgesBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Check Badges';
            refreshBadgesBtn.disabled = false;
          }, 3000);
        } else {
          throw new Error('Badge check failed');
        }
      } catch (error) {
        console.error('[Badge Refresh] Error:', error);
        refreshBadgesBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
        setTimeout(() => {
          refreshBadgesBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Check Badges';
          refreshBadgesBtn.disabled = false;
        }, 2000);
        icon.classList.remove('fa-spin');
      }
    });
  }
});

