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
  // Get local state first (prioritize local data)
  const localState = await chrome.storage.local.get();
  
  // Sync from MongoDB (but don't let it overwrite recent settings)
  await send({action: 'syncFromMongoDB'}).catch(err => console.error('Sync failed:', err));
  
  // Get state (merge with local)
  const state = await send({action: 'getState'});
  
  // Check if it's a new day and reset todayFocusTime if needed (IST timezone)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
  const istTime = new Date(now.getTime() + istOffset);
  const todayDateString = istTime.toISOString().substring(0, 10); // YYYY-MM-DD in IST
  const storedDate = state.todayDate || '';
  
  // Reset if it's a new day
  if (storedDate !== todayDateString) {
    await chrome.storage.local.set({ 
      todayFocusTime: 0, 
      todayDate: todayDateString 
    });
    state.todayFocusTime = 0;
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
  
  // Today's focused time (use state.todayFocusTime, not stats.todayFocusTime)
  const todayMin = state.todayFocusTime || 0;
  const todayHours = Math.floor(todayMin / 60);
  const todayMins = todayMin % 60;
  const todayTimeElement = document.getElementById('todayTime');
  if (todayTimeElement) {
    todayTimeElement.textContent = todayHours > 0 ? `${todayHours}h ${todayMins}m` : `${todayMins}m`;
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
      level: getHeatLevel(minutes),
      dayOfWeek: new Date(dateStr + 'T12:00:00').getDay() // 0=Sunday, 6=Saturday
    });
  }
  
  console.log('Heatmap Data Generated:', heatmapData.filter(d => d.minutes > 0)); // Debug log
  
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

function getHeatLevel(minutes) {
  if (minutes === 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
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
