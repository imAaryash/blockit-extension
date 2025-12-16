// Popup with real data integration
const API_BASE_URL = 'https://focus-backend-g1zg.onrender.com';

let selectedDuration = 25;
let focusActive = false;
let remainingTime = 0;
let timerInterval = null;
let countdownInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadPopupData();
  
  // Refresh friends list every 10 seconds
  setInterval(async () => {
    const state = await chrome.storage.local.get(['authToken', 'friendsData']);
    await loadFriends(state);
  }, 10000);
});

// Listen for session end from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sessionEnded') {
    // Session ended by alarm
    endFocusSession();
  }
  return true;
});

// Listen for storage changes to update daily goal progress in real-time
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local') {
    if (changes.todayFocusTime || changes.dailyGoal) {
      const state = await chrome.storage.local.get(['todayFocusTime', 'dailyGoal', 'goalAchievedToday']);
      const todayMin = state.todayFocusTime || 0;
      const dailyGoal = state.dailyGoal || 120;
      updateDailyGoalProgress(todayMin, dailyGoal, state.goalAchievedToday);
      
      // Also update the Today stat
      const hours = Math.floor(todayMin / 60);
      const mins = todayMin % 60;
      const todayText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      document.getElementById('todayDisplay1').textContent = todayText;
    }
  }
});

// Load real data
async function loadPopupData() {
  try {
    const state = await chrome.storage.local.get([
      'level', 'streak', 'todayFocusTime', 'focusActive', 'sessionEnd',
      'friendsData', 'authToken', 'user', 'points', 'sessionStart', 'selectedDuration', 'todayDate',
      'dailyGoal', 'goalAchievedToday'
    ]);
    
    // Check for login - Redirect to login if not authenticated
    if (!state.authToken || !state.user) {
      window.location.href = 'login.html';
      return;
    }
    
    // Load saved duration or default to 25
    selectedDuration = state.selectedDuration || 25;
    
    // Check if it's a new day and reset todayFocusTime if needed (IST timezone)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    const todayDateString = istTime.toISOString().substring(0, 10); // YYYY-MM-DD in IST
    
    let todayMin = state.todayFocusTime || 0;
    const storedDate = state.todayDate || '';
    
    // Reset if it's a new day
    if (storedDate !== todayDateString) {
      todayMin = 0;
      await chrome.storage.local.set({ 
        todayFocusTime: 0, 
        todayDate: todayDateString,
        goalAchievedToday: false
      });
    }
    
    // Update stats
    const level = state.level || 1;
    const streak = state.streak?.current || 0;
    
    // Format today's time
    const hours = Math.floor(todayMin / 60);
    const mins = todayMin % 60;
    const todayText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    
    document.getElementById('levelDisplay1').textContent = level;
    document.getElementById('streakDisplay1').textContent = streak || '0';
    document.getElementById('todayDisplay1').textContent = todayText;
    
    // Update daily goal progress
    const dailyGoal = state.dailyGoal || 120; // Default 2 hours
    updateDailyGoalProgress(todayMin, dailyGoal, state.goalAchievedToday);
    
    // Update timer display
    focusActive = state.focusActive || false;
    const sessionEnd = state.sessionEnd || 0;
    
    // If session has expired, clear it immediately
    if (focusActive && sessionEnd > 0 && sessionEnd <= Date.now()) {
      await chrome.storage.local.set({
        focusActive: false,
        sessionEnd: 0,
        sessionStart: 0
      });
      focusActive = false;
    }
    
    if (focusActive && sessionEnd > Date.now()) {
      remainingTime = sessionEnd - Date.now();
      const totalDuration = sessionEnd - state.sessionStart;
      
      document.getElementById('statusDisplay1').textContent = 'Focusing';
      document.getElementById('startBtn1').style.display = 'none';
      document.querySelector('.popup1 .custom-timer').style.opacity = '0.5';
      document.querySelector('.popup1 .custom-timer').style.pointerEvents = 'none';
      document.getElementById('customMinutes1').disabled = true;
      document.getElementById('quickActions1').classList.add('hidden');
      
      // Set initial circle state
      const remainingSeconds = Math.floor(remainingTime / 1000);
      const totalSeconds = Math.floor(totalDuration / 1000);
      updateProgressCircle(remainingSeconds, totalSeconds, false);
      
      startTimerUpdate();
    } else {
      const minutes = selectedDuration;
      document.getElementById('timerDisplay1').textContent = formatTime(minutes * 60);
      document.getElementById('statusDisplay1').textContent = 'Ready';
      document.getElementById('customMinutes1').value = minutes;
      
      // Initialize circle to empty (ready state)
      updateProgressCircle(0, 1, false);
    }
    
    // Load friends
    await loadFriends(state);
    
    // Setup event listeners
    setupEventListeners();
    
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Load friends list with activity
async function loadFriends(state) {
  const friendsList = document.getElementById('friendsList1');
  const onlineCount = document.getElementById('onlineCount1');
  
  try {
    const token = state.authToken;
    if (!token) {
      friendsList.innerHTML = '<div class="no-friends">Login to see friends</div>';
      onlineCount.textContent = '0 online';
      return;
    }
    
    // Fetch friends from API
    const response = await fetch(`${API_BASE_URL}/api/friends/activity`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) throw new Error('Failed to fetch friends');
    
    const friends = await response.json();
    
    if (!friends || friends.length === 0) {
      friendsList.innerHTML = '<div class="no-friends">No friends yet<br><small style="font-size: 10px; color: #4b5563;">Add friends in Social tab</small></div>';
      onlineCount.textContent = '0 online';
      return;
    }
    
    // Filter online friends (active within last 5 minutes)
    const activeFriends = friends.filter(f => {
      const lastUpdated = f.activity?.lastUpdated;
      return lastUpdated && (Date.now() - new Date(lastUpdated).getTime() < 5 * 60 * 1000);
    });
    
    onlineCount.textContent = `${activeFriends.length} online`;
    
    if (activeFriends.length === 0) {
      friendsList.innerHTML = '<div class="no-friends">No friends online</div>';
      return;
    }
    
    // Display friends with activity and avatar decorations
    friendsList.innerHTML = activeFriends.slice(0, 4).map(friend => {
      const activity = friend.activity || {};
      const isFocusing = activity.focusActive;
      const avatar = friend.avatar || friend.displayName?.[0] || friend.username?.[0] || '👤';
      
      // Avatar decoration overlay
      const avatarDecoration = friend.avatarDecoration ? 
        `<div class="friend-avatar-decoration" style="background-image: url('${chrome.runtime.getURL(`assets/avatar/${friend.avatarDecoration}.png`)}')"></div>` : '';
      
      // Name banner support (both static and animated)
      const nameBanner = friend.nameBanner;
      let nameBannerHTML = '';
      if (nameBanner) {
        const animatedBanners = ['asset', 'mb1', 'mb2', 'mb3', 'mb4', 'mb5', 'mb6', 'mb7'];
        const isAnimated = animatedBanners.includes(nameBanner);
        const extension = isAnimated ? '.webm' : '.png';
        const url = chrome.runtime.getURL(`assets/name_banner/${nameBanner}${extension}`);
        
        if (isAnimated) {
          nameBannerHTML = `<video autoplay loop muted playsinline class="friend-name-banner" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; border-radius: 14px;" src="${url}"></video>`;
        } else {
          nameBannerHTML = `<div class="friend-name-banner" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${url}'); background-size: cover; background-position: center; z-index: 0; border-radius: 14px;"></div>`;
        }
      }
      
      // Determine status class (focusing=red, online=green, idle=dimmed green)
      let statusClass = 'online';
      let activityIcon = '◉';
      let activityText = 'Online';
      
      if (isFocusing) {
        statusClass = 'focusing';
        activityIcon = '◉';
        activityText = 'Focusing';
        
        // Add specific activity if available
        if (activity.videoTitle) {
          activityIcon = '▶';
          activityText = `${activity.videoTitle.substring(0, 22)}${activity.videoTitle.length > 22 ? '...' : ''}`;
        } else if (activity.activityDetails) {
          activityIcon = '◉';
          activityText = `${activity.activityDetails.substring(0, 22)}${activity.activityDetails.length > 22 ? '...' : ''}`;
        }
      } else if (activity.videoTitle) {
        activityIcon = '▶';
        activityText = `${activity.videoTitle.substring(0, 22)}${activity.videoTitle.length > 22 ? '...' : ''}`;
      } else if (activity.currentUrl) {
        try {
          const domain = new URL(activity.currentUrl).hostname.replace('www.', '');
          activityIcon = '⊕';
          activityText = domain;
        } catch {
          activityIcon = '⊕';
          activityText = 'Browsing';
        }
      } else if (activity.status === 'idle') {
        statusClass = 'idle';
        activityIcon = '○';
        activityText = 'Idle';
      }
      
      return `
        <div class="friend-item" data-username="${friend.username}" style="position: relative; overflow: hidden;">
          ${nameBannerHTML}
          <div style="position: relative; z-index: 1; display: flex; align-items: center; gap: 12px; padding: 12px;">
            <div class="friend-avatar ${statusClass}">
              ${avatar}
              ${avatarDecoration}
            </div>
            <div class="friend-info">
              <div class="friend-name">${friend.displayName || friend.username}</div>
              <div class="friend-activity ${statusClass}">
                <span class="activity-icon">${activityIcon}</span>
                <span>${activityText}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers to open social page (only if not focusing)
    document.querySelectorAll('.popup1 .friend-item').forEach(item => {
      item.addEventListener('click', () => {
        // Don't open social page if in focus mode
        if (!focusActive) {
          chrome.tabs.create({ url: chrome.runtime.getURL('social.html') });
        }
      });
    });
    
  } catch (error) {
    console.error('Error loading friends:', error);
    friendsList.innerHTML = '<div class="no-friends">Unable to load friends</div>';
    onlineCount.textContent = '0 online';
  }
}

// Setup event listeners
function setupEventListeners() {
  // Custom timer input - update on change
  const customInput = document.getElementById('customMinutes1');
  
  function updateDuration() {
    if (focusActive) return;
    
    const minutes = parseInt(customInput.value);
    
    if (isNaN(minutes) || minutes < 1 || minutes > 480) {
      customInput.style.borderColor = '#dc2626';
      customInput.value = selectedDuration;
      setTimeout(() => customInput.style.borderColor = '#2a2a2a', 1000);
      return;
    }
    
    selectedDuration = minutes;
    document.getElementById('timerDisplay1').textContent = formatTime(minutes * 60);
    customInput.style.borderColor = '#22c55e';
    setTimeout(() => customInput.style.borderColor = '#2a2a2a', 500);
    
    // Save to storage
    chrome.storage.local.set({ selectedDuration: minutes });
  }
  
  customInput.addEventListener('change', updateDuration);
  customInput.addEventListener('blur', updateDuration);
  customInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      customInput.blur();
    }
  });
  
  // Start button - show countdown first
  const startBtn = document.getElementById('startBtn1');
  startBtn.addEventListener('click', () => {
    if (!focusActive) {
      showCountdownScreen();
    }
  });
  
  // Cancel countdown button
  document.getElementById('cancelCountdown').addEventListener('click', () => {
    cancelCountdown();
  });
  
  // Quick action buttons
  document.getElementById('socialBtn1').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('social.html') });
  });
  
  document.getElementById('dashboardBtn1').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });
}

// Show countdown screen (5 seconds)
function showCountdownScreen() {
  // Hide main content
  document.getElementById('mainContent').style.display = 'none';
  
  // Show countdown screen
  const countdownScreen = document.getElementById('countdownScreen');
  countdownScreen.classList.add('active');
  
  let secondsLeft = 5;
  const countdownNumber = document.getElementById('countdownNumber');
  const countdownBar = document.getElementById('countdownBar');
  
  // Set initial state
  countdownNumber.textContent = secondsLeft;
  countdownBar.style.width = '100%';
  
  // Start countdown
  countdownInterval = setInterval(() => {
    secondsLeft--;
    countdownNumber.textContent = secondsLeft;
    
    // Update progress bar (counting down)
    const progress = (secondsLeft / 5) * 100;
    countdownBar.style.width = progress + '%';
    
    if (secondsLeft <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      
      // Start the actual focus session
      startFocusSession();
    }
  }, 1000);
}

// Cancel countdown
function cancelCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  // Hide countdown screen
  document.getElementById('countdownScreen').classList.remove('active');
  
  // Show main content
  document.getElementById('mainContent').style.display = 'block';
}

// Start focus session (called after countdown)
async function startFocusSession() {
  // Hide countdown screen
  document.getElementById('countdownScreen').classList.remove('active');
  
  // Show main content
  document.getElementById('mainContent').style.display = 'block';
  
  try {
    const durationMin = selectedDuration;
    const endTime = Date.now() + (durationMin * 60 * 1000);
    
    await chrome.storage.local.set({
      focusActive: true,
      sessionEnd: endTime,
      sessionStart: Date.now(),
      emergencyUsed: false,
      sessionBlockedCount: 0
    });
    
    chrome.alarms.create('focus-end', { when: endTime });
    
    focusActive = true;
    remainingTime = durationMin * 60 * 1000;
    
    document.getElementById('statusDisplay1').textContent = 'Focusing';
    document.getElementById('startBtn1').style.display = 'none';
    document.querySelector('.popup1 .custom-timer').style.opacity = '0.5';
    document.querySelector('.popup1 .custom-timer').style.pointerEvents = 'none';
    document.getElementById('customMinutes1').disabled = true;
    document.getElementById('quickActions1').classList.add('hidden');
    
    // Initialize circle to full
    const totalSeconds = durationMin * 60;
    updateProgressCircle(totalSeconds, totalSeconds, false);
    
    startTimerUpdate();
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'focusStarted', duration: durationMin });
    
  } catch (error) {
    console.error('Error starting focus:', error);
  }
}

// Update timer display with circle animation
function startTimerUpdate() {
  if (timerInterval) clearInterval(timerInterval);
  
  const totalDuration = selectedDuration * 60 * 1000;
  
  timerInterval = setInterval(() => {
    remainingTime -= 1000;
    
    if (remainingTime <= 0) {
      endFocusSession();
      return;
    }
    
    const seconds = Math.floor(remainingTime / 1000);
    const totalSeconds = Math.floor(totalDuration / 1000);
    
    document.getElementById('timerDisplay1').textContent = formatTime(seconds);
    updateProgressCircle(seconds, totalSeconds, false);
  }, 1000);
}

// End focus session and reset UI
async function endFocusSession() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  focusActive = false;
  remainingTime = 0;
  
  // Clear storage to ensure session is ended
  await chrome.storage.local.set({
    focusActive: false,
    sessionEnd: 0,
    sessionStart: 0
  });
  
  // Reset UI
  document.getElementById('statusDisplay1').textContent = 'Ready';
  document.getElementById('timerDisplay1').textContent = formatTime(selectedDuration * 60);
  document.getElementById('startBtn1').style.display = 'block';
  document.querySelector('.popup1 .custom-timer').style.opacity = '1';
  document.querySelector('.popup1 .custom-timer').style.pointerEvents = 'auto';
  document.getElementById('customMinutes1').disabled = false;
  document.getElementById('quickActions1').classList.remove('hidden');
  
  // Reset circle to empty
  updateProgressCircle(0, 1, false);
}

// Update daily goal progress
function updateDailyGoalProgress(currentMinutes, goalMinutes, alreadyAchieved) {
  const percentage = Math.min((currentMinutes / goalMinutes) * 100, 100);
  const isAchieved = currentMinutes >= goalMinutes;
  
  // Update time display
  const currentHours = Math.floor(currentMinutes / 60);
  const currentMins = currentMinutes % 60;
  const currentText = currentHours > 0 ? `${currentHours}h ${currentMins}m` : `${currentMins}m`;
  
  const goalHours = Math.floor(goalMinutes / 60);
  const goalMins = goalMinutes % 60;
  const goalText = goalHours > 0 ? `${goalHours}h ${goalMins}m` : `${goalMinutes}m`;
  
  document.getElementById('goalCurrentTime').textContent = currentText;
  document.getElementById('goalTargetTime').textContent = goalText;
  
  // Update progress bar
  const progressBar = document.getElementById('goalProgressBar');
  progressBar.style.width = percentage + '%';
  
  // Update percentage text
  const percentageEl = document.getElementById('goalPercentage');
  percentageEl.textContent = Math.round(percentage) + '% Complete';
  
  // Update styling based on achievement
  const section = document.getElementById('dailyGoalSection');
  if (isAchieved) {
    progressBar.classList.add('goal-reached');
    percentageEl.classList.add('achieved');
    section.classList.add('goal-achieved');
    percentageEl.textContent = '🎉 Goal Achieved!';
    
    // Trigger celebration only once per day
    if (!alreadyAchieved) {
      triggerCelebration();
      chrome.storage.local.set({ goalAchievedToday: true });
    }
  } else {
    progressBar.classList.remove('goal-reached');
    percentageEl.classList.remove('achieved');
    section.classList.remove('goal-achieved');
  }
}

// Trigger celebration confetti effect
function triggerCelebration() {
  // Create confetti container
  const confettiContainer = document.createElement('div');
  confettiContainer.className = 'confetti';
  document.body.appendChild(confettiContainer);
  
  // Create 50 confetti pieces
  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti-piece';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDelay = Math.random() * 0.5 + 's';
    confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
    confettiContainer.appendChild(confetti);
  }
  
  // Remove confetti after animation
  setTimeout(() => {
    confettiContainer.remove();
  }, 4000);
}

// Format time (seconds to MM:SS)
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update progress circle
function updateProgressCircle(remainingSeconds, totalSeconds, isBreak = false) {
  const circle = document.getElementById('progressCircle1');
  if (!circle) return;
  
  const circumference = 2 * Math.PI * 80; // radius is 80
  const progress = remainingSeconds / totalSeconds;
  // Circle should start full (0 offset) and end empty (full offset)
  const offset = circumference * (1 - progress);
  
  circle.style.strokeDashoffset = offset;
  
  // Change color for break mode (green), default is red for focus
  if (isBreak) {
    circle.classList.add('break');
  } else {
    circle.classList.remove('break');
  }
}
