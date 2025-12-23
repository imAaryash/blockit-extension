// Season 2 - Winter Arc JavaScript

let seasonData = null;

// Initialize season features on dashboard load
async function initSeasonFeatures() {
  try {
    // Get auth token from chrome storage
    const storage = await chrome.storage.local.get(['authToken']);
    const token = storage.authToken;
    
    if (!token) {
      console.error('[Season] No auth token found');
      return;
    }
    
    // Get season status (API_URL already includes /api)
    const response = await fetch(`${API_URL}/season/status`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      console.error('[Season] Failed to fetch season status');
      return;
    }
    
    seasonData = await response.json();
    if (!seasonData.success) {
      console.error('[Season] Invalid season data');
      return;
    }
    
    // Update UI with season info
    updateSeasonUI();
    
    // Check if user needs to see welcome modal (first time in season)
    checkSeasonWelcome();
    
  } catch (error) {
    console.error('[Season] Error initializing season features:', error);
  }
}

// Update season UI elements
function updateSeasonUI() {
  if (!seasonData || !seasonData.season) return;
  
  const seasonName = seasonData.season.name || 'Winter Arc';
  const shopCoins = seasonData.season.shopCoins || 0;
  
  // Add season info to dashboard header
  const dashboardHeader = document.querySelector('.dashboard-header');
  if (!dashboardHeader) {
    console.warn('[Season] .dashboard-header element not found on page');
    return;
  }
  
  // Create header stats container if it doesn't exist
  let headerStats = dashboardHeader.querySelector('.header-stats');
  if (!headerStats) {
    headerStats = document.createElement('div');
    headerStats.className = 'header-stats';
    headerStats.style.cssText = 'display: flex; gap: 15px; align-items: center; margin-top: 10px;';
    dashboardHeader.appendChild(headerStats);
  }
  
  // Add season badge
  if (!headerStats.querySelector('.season-badge')) {
    const seasonBadge = document.createElement('div');
    seasonBadge.className = 'season-badge';
    seasonBadge.innerHTML = `❄️ ${seasonName}`;
    headerStats.appendChild(seasonBadge);
  }
  
  // Add shop coins display
  if (!headerStats.querySelector('.shop-coins-display')) {
    const coinsDisplay = document.createElement('div');
    coinsDisplay.className = 'shop-coins-display';
    coinsDisplay.innerHTML = `
      <span class="coin-icon">🪙</span>
      <span class="coin-amount">${shopCoins}</span>
    `;
    headerStats.appendChild(coinsDisplay);
  }
}

// Check if user needs to see season welcome modal
function checkSeasonWelcome() {
  if (!seasonData || !seasonData.season) return;
  
  const { seasonJoinDate, currentSeason } = seasonData.season;
  const hasSeenWelcome = localStorage.getItem(`season-welcome-${currentSeason}`);
  
  // Show welcome if user just joined (within 24 hours) and hasn't seen it yet
  if (seasonJoinDate && !hasSeenWelcome) {
    const joinTime = new Date(seasonJoinDate).getTime();
    const now = Date.now();
    const hoursSinceJoin = (now - joinTime) / (1000 * 60 * 60);
    
    if (hoursSinceJoin < 24) {
      setTimeout(() => showSeasonWelcomeModal(), 1500);
    }
  }
}

// Show season welcome modal
function showSeasonWelcomeModal() {
  if (!seasonData || !seasonData.season) return;
  
  const { seasonName, shopCoins, points, currentSeason } = seasonData.season;
  
  const modal = document.createElement('div');
  modal.className = 'season-welcome-modal';
  modal.innerHTML = `
    <div class="season-welcome-content">
      <h1 class="season-welcome-title">Welcome to ${seasonName}! ❄️</h1>
      <p class="season-welcome-subtitle">A new season of focus and productivity begins</p>
      
      <div class="conversion-info">
        <div class="conversion-row">
          <span class="conversion-label">Your Points:</span>
          <span class="conversion-value">${points}</span>
        </div>
        <div class="conversion-row">
          <span class="conversion-label">Converted to:</span>
          <span class="conversion-arrow">→</span>
        </div>
        <div class="conversion-result">${shopCoins} Shop Coins 🪙</div>
      </div>
      
      <div class="season-features">
        <div class="feature-item">
          <div class="feature-icon">🛍️</div>
          <div class="feature-text">Shop coins are for buying cosmetics - they don't affect your rank!</div>
        </div>
        <div class="feature-item">
          <div class="feature-icon">🏆</div>
          <div class="feature-text">Your points stay the same for leaderboard rankings</div>
        </div>
        <div class="feature-item">
          <div class="feature-icon">🎯</div>
          <div class="feature-text">Complete weekly challenges to earn bonus coins</div>
        </div>
        <div class="feature-item">
          <div class="feature-icon">🎁</div>
          <div class="feature-text">Daily login rewards - up to 200 coins for 30-day streaks!</div>
        </div>
      </div>
      
      <button class="start-season-btn">Let's Go!</button>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Show modal
  setTimeout(() => modal.classList.add('show'), 100);
  
  // Close button handler
  modal.querySelector('.start-season-btn').addEventListener('click', () => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
    
    // Mark as seen
    localStorage.setItem(`season-welcome-${currentSeason}`, 'true');
  });
}

// Update leaderboard to use season rankings
async function loadSeasonLeaderboard() {
  try {
    // Get auth token from chrome storage
    const storage = await chrome.storage.local.get(['authToken']);
    const token = storage.authToken;
    
    if (!token) {
      console.error('[Leaderboard] No auth token found');
      return;
    }
    
    const response = await fetch(`${API_URL}/season/leaderboard`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      console.error('[Leaderboard] Failed to fetch');
      return;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('[Leaderboard] Invalid data');
      return;
    }
    
    // Update leaderboard header
    const leaderboardContainer = document.querySelector('.leaderboard-container');
    if (leaderboardContainer) {
      // Remove old header if exists
      const oldHeader = leaderboardContainer.querySelector('.leaderboard-season-header');
      if (oldHeader) oldHeader.remove();
      
      // Add season header
      const header = document.createElement('div');
      header.className = 'leaderboard-season-header';
      header.innerHTML = `
        <div class="leaderboard-season-title">${data.seasonName} Leaderboard</div>
        <div class="leaderboard-season-subtitle">Rankings based on focus points this season</div>
      `;
      leaderboardContainer.insertBefore(header, leaderboardContainer.firstChild);
    }
    
    // Render leaderboard
    renderLeaderboard(data.leaderboard);
    
  } catch (error) {
    console.error('[Leaderboard] Error:', error);
  }
}

// Render leaderboard entries
function renderLeaderboard(users) {
  const leaderboardList = document.querySelector('.leaderboard-list');
  if (!leaderboardList) return;
  
  leaderboardList.innerHTML = '';
  
  users.forEach((user, index) => {
    const rank = index + 1;
    const entry = document.createElement('div');
    entry.className = 'leaderboard-entry';
    if (rank <= 3) entry.classList.add(`rank-${rank}`);
    
    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    
    entry.innerHTML = `
      <div class="rank">${rankIcon}</div>
      <div class="user-info">
        <div class="avatar">${user.avatar || '👤'}</div>
        <div class="user-details">
          <div class="username">${user.displayName || user.username}</div>
          <div class="level">Level ${user.level || 1}</div>
        </div>
      </div>
      <div class="points">${user.points || 0} pts</div>
    `;
    
    leaderboardList.appendChild(entry);
  });
}

// Export functions for use in dashboard.js
window.seasonFeatures = {
  init: initSeasonFeatures,
  loadLeaderboard: loadSeasonLeaderboard,
  updateUI: updateSeasonUI
};
