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

document.getElementById('start').addEventListener('click', async () => {
  const duration = Number(document.getElementById('duration').value) || 25;
  const passcode = document.getElementById('passcode').value || null;
  const preset = document.getElementById('preset').value || null;
  const pomodoroEnabled = document.getElementById('pomodoroToggle').checked;
  
  // Update pomodoro setting
  await send({action: 'updateSettings', settings: {pomodoroEnabled}});
  
  const resp = await send({action:'startSession', durationMin: duration, passcode, preset});
  if (resp && resp.end) {
    updateTimer();
    startTimerUpdate();
  }
});

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
  document.getElementById('setupControls').classList.add('hidden');
  document.getElementById('activeControls').classList.add('visible');
}

function hideTimer() {
  document.getElementById('timerDisplay').classList.remove('active');
  document.getElementById('setupControls').classList.remove('hidden');
  document.getElementById('activeControls').classList.remove('visible');
}

async function updateTimer() {
  const s = await send({action:'getState'});
  // Update stats display
  updateStatsDisplay(s);
  
  if (s && s.focusActive && s.sessionEnd) {
    const now = Date.now();
    const remaining = Math.max(0, s.sessionEnd - now);
    const totalDuration = s.sessionDuration || (25 * 60 * 1000);
    
    if (remaining > 0) {
      showTimer();
      
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      document.querySelector('.timer-time').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
      // Update circle progress - circle empties as time runs out
      const progress = remaining / totalDuration;
      const circumference = 2 * Math.PI * 90;
      const offset = circumference * (1 - progress);
      document.querySelector('.timer-progress').style.strokeDashoffset = offset;
      
      setStatus('Focus active');
    } else {
      hideTimer();
      setStatus('Idle');
    }
  } else {
    hideTimer();
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
  document.getElementById('goalFill').style.width = `${progress}%`;
  document.getElementById('goalText').textContent = `${todayMin}/${goal} min daily goal`;
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
    
  } catch (error) {
    console.error('Failed to load friends:', error);
    friendsList.innerHTML = '<div class="friends-empty">Failed to load</div>';
    onlineCount.textContent = '0';
    onlineCount.style.background = '#666';
  }
}

// Initial state check
updateTimer();
startTimerUpdate(); // Start interval immediately to keep timer running

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
