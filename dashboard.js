// Dashboard JavaScript
async function send(msg) {
  return new Promise((res) => chrome.runtime.sendMessage(msg, res));
}

const allBadges = [
  {id: 'first', name: 'First Step', desc: 'Complete first session', icon: '🎯'},
  {id: 'hour', name: 'Focused Hour', desc: 'Complete 1 hour session', icon: '⏰'},
  {id: 'week', name: 'Week Warrior', desc: '7 day streak', icon: '🔥'},
  {id: 'hundred', name: 'Century', desc: '100 hours focused', icon: '💯'},
  {id: 'level5', name: 'Rising Star', desc: 'Reach level 5', icon: '⭐'},
  {id: 'sessions50', name: 'Dedicated', desc: '50 sessions completed', icon: '💪'}
];

async function loadDashboard() {
  // Sync from MongoDB first to get latest data
  await send({action: 'syncFromMongoDB'});
  
  const state = await send({action: 'getState'});
  
  // Update stats
  document.getElementById('levelStat').textContent = state.level || 1;
  document.getElementById('pointsStat').textContent = state.points || 0;
  
  const currentStreak = state.streak?.current || 0;
  document.getElementById('currentStreak').textContent = currentStreak > 0 ? `${currentStreak}🔥` : '0';
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
      ${earned ? '<div style="position: absolute; top: 8px; right: 8px; font-size: 16px;">✅</div>' : ''}
    `;
    div.style.position = 'relative';
    container.appendChild(div);
  });
}

function loadBlockedSites(sites) {
  const container = document.getElementById('blockedSitesList');
  container.innerHTML = '';
  
  if (sites.length === 0) {
    container.innerHTML = '<div style="color: #666; text-align: center; padding: 16px;">No custom blocked sites</div>';
    return;
  }
  
  sites.forEach(site => {
    const div = document.createElement('div');
    div.className = 'site-item';
    div.innerHTML = `
      <span>${site}</span>
      <button class="btn-remove" data-site="${site}">Remove</button>
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

// Load on page load
loadDashboard();
