let updateInterval = null;

// Quick buttons
document.querySelectorAll('.btn-quick').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('duration').value = btn.dataset.duration;
  });
});

// Preset selector
document.getElementById('preset').addEventListener('change', (e) => {
  const presets = {
    deepWork: 90,
    study: 45,
    quickFocus: 15
  };
  if (e.target.value && presets[e.target.value]) {
    document.getElementById('duration').value = presets[e.target.value];
  }
});

// View stats button
document.getElementById('viewStats').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// View friends button
document.getElementById('viewFriends').addEventListener('click', () => {
  chrome.tabs.create({url: chrome.runtime.getURL('social.html')});
});

let countdownInterval = null;
let countdownStartTime = null;

document.getElementById('start').addEventListener('click', async () => {
  const duration = Number(document.getElementById('duration').value) || 25;
  const passcode = document.getElementById('passcode').value || null;
  const preset = document.getElementById('preset').value || null;
  const pomodoroEnabled = document.getElementById('pomodoroToggle').checked;
  
  // Update pomodoro setting
  await send({action: 'updateSettings', settings: {pomodoroEnabled}});
  
  // Show countdown screen
  showCountdownScreen(duration, passcode, preset);
});

function showCountdownScreen(duration, passcode, preset) {
  // Hide setup controls
  document.getElementById('setupControls').style.display = 'none';
  document.getElementById('statsOverview').style.display = 'none';
  document.getElementById('goalProgress').style.display = 'none';
  document.getElementById('friendsWidget').style.display = 'none';
  
  // Show countdown screen
  const countdownScreen = document.getElementById('countdownScreen');
  countdownScreen.style.display = 'flex';
  
  let secondsLeft = 10;
  const countdownNumber = document.getElementById('countdownNumber');
  const countdownBar = document.getElementById('countdownBar');
  
  // Set initial bar width
  countdownBar.style.width = '100%';
  
  // Start countdown
  countdownStartTime = Date.now();
  countdownInterval = setInterval(() => {
    secondsLeft--;
    countdownNumber.textContent = secondsLeft;
    
    // Update progress bar (counting down)
    const progress = (secondsLeft / 10) * 100;
    countdownBar.style.width = progress + '%';
    
    if (secondsLeft <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      
      // Start the actual focus session
      startFocusSession(duration, passcode, preset);
    }
  }, 1000);
}

async function startFocusSession(duration, passcode, preset) {
  // Hide countdown screen
  document.getElementById('countdownScreen').style.display = 'none';
  
  // Start the session
  const resp = await send({action:'startSession', durationMin: duration, passcode, preset});
  if (resp && resp.end) {
    // Show timer immediately
    showTimer();
    updateTimer();
    startTimerUpdate();
  } else {
    // If session failed to start, show setup controls
    document.getElementById('setupControls').style.display = 'block';
    document.getElementById('statsOverview').style.display = 'flex';
    document.getElementById('goalProgress').style.display = 'block';
    document.getElementById('friendsWidget').style.display = 'block';
  }
}

function cancelCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  // Hide countdown screen
  document.getElementById('countdownScreen').style.display = 'none';
  
  // Show setup controls again
  document.getElementById('setupControls').style.display = 'block';
  document.getElementById('statsOverview').style.display = 'flex';
  document.getElementById('goalProgress').style.display = 'block';
  document.getElementById('friendsWidget').style.display = 'block';
  
  // Reset countdown
  document.getElementById('countdownNumber').textContent = '10';
  document.getElementById('countdownBar').style.width = '100%';
}

document.getElementById('cancelCountdown').addEventListener('click', cancelCountdown);

document.getElementById('emergency').addEventListener('click', async () => {
  const resp = await send({action:'emergencyBreak'});
  if (resp.ok) {
    setStatus('2-minute break granted');
    updateTimer();
  } else alert('Emergency break already used');
});

async function send(msg){
  return new Promise((res)=> chrome.runtime.sendMessage(msg, res));
}

function setStatus(t){ 
  document.getElementById('status').textContent = t; 
}

function showTimer() {
  document.getElementById('timerDisplay').classList.add('active');
  document.getElementById('setupControls').style.display = 'none';
  document.getElementById('activeControls').style.display = 'block';
  document.getElementById('statsOverview').style.display = 'flex';
  document.getElementById('goalProgress').style.display = 'block';
  document.getElementById('friendsWidget').style.display = 'block';
}

function hideTimer() {
  document.getElementById('timerDisplay').classList.remove('active');
  document.getElementById('setupControls').style.display = 'block';
  document.getElementById('activeControls').style.display = 'none';
  document.getElementById('statsOverview').style.display = 'flex';
  document.getElementById('goalProgress').style.display = 'block';
  document.getElementById('friendsWidget').style.display = 'block';
}

async function updateTimer() {
  const s = await send({action:'getState'});
  // Update stats display
  updateStatsDisplay(s);
  
  const timerDisplay = document.getElementById('timerDisplay');
  const timerProgress = document.querySelector('.timer-progress');
  
  // Check if on break
  if (s && s.onBreak && s.breakEnd) {
    const now = Date.now();
    const remaining = Math.max(0, s.breakEnd - now);
    const totalDuration = s.breakDuration || (5 * 60 * 1000);
    
    if (remaining > 0) {
      showTimer();
      
      // Change to green for break
      timerDisplay.classList.add('break-mode');
      timerProgress.style.stroke = '#4ade80'; // Green color
      
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      document.querySelector('.timer-time').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
      // Update circle progress
      const progress = remaining / totalDuration;
      const circumference = 2 * Math.PI * 90;
      const offset = circumference * (1 - progress);
      timerProgress.style.strokeDashoffset = offset;
      
      setStatus('On Break 🎉');
    } else {
      hideTimer();
      timerDisplay.classList.remove('break-mode');
      timerProgress.style.stroke = '#4a9eff';
      setStatus('Idle');
    }
  } else if (s && s.focusActive && s.sessionEnd) {
    const now = Date.now();
    const remaining = Math.max(0, s.sessionEnd - now);
    const totalDuration = s.sessionDuration || (25 * 60 * 1000);
    
    if (remaining > 0) {
      showTimer();
      
      // Reset to blue for focus
      timerDisplay.classList.remove('break-mode');
      timerProgress.style.stroke = '#4a9eff';
      
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      document.querySelector('.timer-time').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
      // Update circle progress - circle empties as time runs out
      const progress = remaining / totalDuration;
      const circumference = 2 * Math.PI * 90;
      const offset = circumference * (1 - progress);
      timerProgress.style.strokeDashoffset = offset;
      
      setStatus('Focus active');
    } else {
      hideTimer();
      timerDisplay.classList.remove('break-mode');
      timerProgress.style.stroke = '#4a9eff';
      setStatus('Idle');
    }
  } else {
    hideTimer();
    timerDisplay.classList.remove('break-mode');
    timerProgress.style.stroke = '#4a9eff';
    setStatus('Idle');
  }
}

function updateStatsDisplay(state) {
  // Update level
  document.getElementById('levelDisplay').textContent = state.level || 1;
  
  // Update streak
  const streak = state.streak?.current || 0;
  document.getElementById('streakDisplay').textContent = streak > 0 ? `${streak}🔥` : '0';
  
  // Update today's time
  const todayMin = state.todayFocusTime || 0;
  const hours = Math.floor(todayMin / 60);
  const mins = todayMin % 60;
  const todayText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  document.getElementById('todayDisplay').textContent = todayText;
  
  // Update daily goal progress
  const goal = state.dailyGoal || 120;
  const progress = Math.min(100, (todayMin / goal) * 100);
  const goalFill = document.getElementById('goalFill');
  goalFill.style.width = `${progress}%`;
  document.getElementById('goalText').textContent = `${todayMin}/${goal} min daily goal`;
  
  // Check if goal just completed
  if (progress >= 100 && !state.goalCompletedToday) {
    showGoalCelebration();
    chrome.storage.local.set({ goalCompletedToday: true });
  } else if (progress < 100 && state.goalCompletedToday) {
    // Reset for new day
    chrome.storage.local.set({ goalCompletedToday: false });
  }
}

function showGoalCelebration() {
  // Create celebration overlay
  const overlay = document.createElement('div');
  overlay.className = 'goal-celebration-overlay';
  overlay.innerHTML = `
    <div class="goal-celebration-content">
      <div class="goal-tada">🎉</div>
      <h2 class="goal-message">Daily Goal Achieved!</h2>
      <p class="goal-submessage">Amazing work! You're crushing it! 🔥</p>
    </div>
  `;
  
  // Create confetti
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.animationDelay = Math.random() * 3 + 's';
    confetti.style.backgroundColor = ['#4a9eff', '#22c55e', '#fb7185', '#fbbf24', '#a78bfa'][Math.floor(Math.random() * 5)];
    overlay.appendChild(confetti);
  }
  
  document.body.appendChild(overlay);
  
  // Play notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: '🎉 Daily Goal Achieved!',
    message: 'Congratulations! You\'ve completed your daily focus goal!',
    requireInteraction: true
  });
  
  // Remove overlay after animation
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 500);
  }, 4000);
}

function startTimerUpdate() {
  stopTimerUpdate();
  updateInterval = setInterval(updateTimer, 1000);
}

function stopTimerUpdate() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// Load friends activity
async function loadFriendsWidget() {
  const friendsList = document.getElementById('friendsList');
  const onlineCount = document.getElementById('onlineCount');
  
  try {
    const activity = await API.getFriendsActivity();
    
    if (!activity || activity.length === 0) {
      friendsList.innerHTML = '<div class="friends-empty">No friends online<br><small>Add friends to see their activity</small></div>';
      onlineCount.textContent = '0';
      onlineCount.style.background = '#666';
      return;
    }
    
    // Filter only online friends
    const onlineFriends = activity.filter(friend => {
      const lastUpdated = friend.activity?.lastUpdated;
      return lastUpdated && (Date.now() - new Date(lastUpdated).getTime() < 5 * 60 * 1000);
    });
    
    if (onlineFriends.length === 0) {
      friendsList.innerHTML = '<div class="friends-empty">No friends online</div>';
      onlineCount.textContent = '0';
      onlineCount.style.background = '#666';
      return;
    }
    
    onlineCount.textContent = onlineFriends.length;
    onlineCount.style.background = '#22c55e';
    
    friendsList.innerHTML = onlineFriends.slice(0, 3).map(friend => {
      const activity = friend.activity || {};
      let statusText = 'Online';
      let statusColor = '#22c55e';
      
      if (activity.focusActive) {
        statusText = '🎯 Focusing';
        statusColor = '#dc2626';
        if (activity.videoTitle) {
          statusText += ` • ${activity.videoTitle.substring(0, 15)}...`;
        }
      } else if (activity.videoTitle) {
        statusText = `📺 ${activity.videoTitle.substring(0, 20)}...`;
      } else if (activity.currentUrl) {
        const domain = activity.currentUrl.match(/https?:\/\/([^\/]+)/)?.[1] || 'web';
        statusText = `🌐 ${domain}`;
      }
      
      return `
        <div class="friend-item" onclick="chrome.tabs.create({url: chrome.runtime.getURL('social.html')})">
          <div class="friend-avatar-small" style="position: relative;">
            ${friend.avatar || '👤'}
            <div style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; background: ${statusColor}; border: 2px solid #1a1a1a; border-radius: 50%;"></div>
          </div>
          <div class="friend-details">
            <div class="friend-name-small">${friend.displayName}</div>
            <div class="friend-status-small">${statusText}</div>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers to friend items
    document.querySelectorAll('.friend-item[data-action="open-social"]').forEach(item => {
      item.addEventListener('click', () => {
        chrome.tabs.create({url: chrome.runtime.getURL('social.html')});
      });
    });
    
    // Add click handlers to friend items
    document.querySelectorAll('.friend-item[data-action="open-social"]').forEach(item => {
      item.addEventListener('click', () => {
        chrome.tabs.create({url: chrome.runtime.getURL('social.html')});
      });
    });
    
  } catch (error) {
    console.error('Failed to load friends:', error);
    friendsList.innerHTML = '<div class="friends-empty">Failed to load</div>';
    onlineCount.textContent = '0';
    onlineCount.style.background = '#666';
  }
}

// Check for updates and show banner
async function checkUpdateBanner() {
  const data = await chrome.storage.local.get(['updateAvailable', 'latestVersion', 'releaseUrl']);
  
  if (data.updateAvailable) {
    const banner = document.getElementById('updateBanner');
    const versionSpan = document.getElementById('updateVersion');
    
    if (banner && versionSpan) {
      versionSpan.textContent = `v${data.latestVersion}`;
      banner.style.display = 'flex';
    }
  }
}

const viewUpdateBtn = document.getElementById('viewUpdateBtn');
if (viewUpdateBtn) {
  viewUpdateBtn.addEventListener('click', async () => {
    // Trigger download via background script
    chrome.runtime.sendMessage({action: 'downloadUpdate'});
  });
}

// Initial state check
updateTimer();
startTimerUpdate(); // Start interval immediately to keep timer running
checkUpdateBanner(); // Check for available updates

// Check if user is registered
send({action: 'getState'}).then(state => {
  if (!state.user) {
    // Not registered, show registration
    window.location.href = 'register.html';
  } else {
    // Load friends if registered
    loadFriendsWidget();
    // Refresh friends every 30 seconds
    setInterval(loadFriendsWidget, 30000);
  }
});

// Cleanup on popup close
window.addEventListener('unload', stopTimerUpdate);
