// Social.js - Friends and leaderboard logic with API integration

// API Configuration
const API_BASE_URL = 'https://focus-backend-g1zg.onrender.com';

async function send(msg) {
  return new Promise((res) => chrome.runtime.sendMessage(msg, res));
}

// Store for real-time updates (using polling instead of WebSocket for now)
const onlineFriends = new Set();
const friendsActivity = new Map();

// Auto-refresh friends activity every 30 seconds
setInterval(async () => {
  const activeTab = document.querySelector('.tab.active')?.dataset.tab;
  if (activeTab === 'activity' || activeTab === 'friends') {
    try {
      const activity = await API.getFriendsActivity();
      activity.forEach(friend => {
        friendsActivity.set(friend.userId, friend);
        onlineFriends.add(friend.userId);
      });
    } catch (error) {
      console.error('Failed to refresh activity:', error);
    }
  }
}, 30000);

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', async () => {
    // Check if trying to access chat during focus mode
    if (tab.dataset.tab === 'chat') {
      const data = await chrome.storage.local.get(['focusActive']);
      if (data.focusActive) {
        alert('Chat is disabled during focus mode. Stay focused!');
        return; // Prevent tab switch
      }
    }
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
    
    // Reload content
    if (tab.dataset.tab === 'friends') loadFriends();
    if (tab.dataset.tab === 'requests') loadFriendRequests();
    if (tab.dataset.tab === 'leaderboard') loadLeaderboard();
    if (tab.dataset.tab === 'activity') loadActivity();
    if (tab.dataset.tab === 'chat') initCommunityChat();
    if (tab.dataset.tab === 'shop') initializeShop();
  });
});

// Add friend (send friend request)
document.getElementById('addFriendBtn').addEventListener('click', async () => {
  const username = document.getElementById('friendUsername').value.trim();
  if (!username) return;
  
  try {
    const result = await API.addFriend(username);
    document.getElementById('friendUsername').value = '';
    
    if (result.status === 'pending') {
      alert(result.message || 'Friend request sent!');
    } else if (result.status === 'accepted') {
      alert(result.message || 'You are now friends!');
      loadFriends();
    }
    
    // Reload requests tab if visible
    if (document.querySelector('.tab[data-tab="requests"]')?.classList.contains('active')) {
      loadFriendRequests();
    }
  } catch (error) {
    alert(error.message || 'Failed to send friend request');
  }
});

async function loadFriends() {
  try {
    const friends = await API.getFriends();
    const container = document.getElementById('friendsList');
    
    if (!friends || friends.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <p>No friends yet. Add friends to see their activity!</p>
        </div>
      `;
      return;
    }
    
    // Sort friends - online users at top
    const sortedFriends = friends.sort((a, b) => {
      const statusA = getActivityStatus(a);
      const statusB = getActivityStatus(b);
      const isOnlineA = statusA !== 'offline';
      const isOnlineB = statusB !== 'offline';
      
      if (isOnlineA && !isOnlineB) return -1;
      if (!isOnlineA && isOnlineB) return 1;
      return 0;
    });
    
    container.innerHTML = sortedFriends.map(friend => {
      // Avatar decoration wrapper
      const avatarContent = friend.avatarDecoration ? `
        <div style="position: relative; display: inline-block;">
          <div class="friend-avatar">${friend.avatar || '👤'}</div>
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 56px;
            height: 56px;
            background: url('${chrome.runtime.getURL(`assets/avatar/${friend.avatarDecoration}.png`)}') center/contain no-repeat;
            pointer-events: none;
            z-index: 1;
          "></div>
        </div>
      ` : `<div class="friend-avatar">${friend.avatar || '👤'}</div>`;
      
      const cardStyle = friend.nameBanner ? `
        cursor: pointer;
        background: url('${chrome.runtime.getURL(`assets/name_banner/${friend.nameBanner}.png`)}') center/cover;
        background-size: 100% 100%;
      ` : 'cursor: pointer;';
      
      const content = `
        ${avatarContent}
        <div class="friend-info">
          <div class="friend-name" style="text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">
            ${friend.displayName}
          </div>
          <div class="friend-username" style="text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">@${friend.username}</div>
          <div class="friend-activity" style="text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">
            <span class="activity-indicator ${getActivityStatus(friend)}"></span>
            ${getActivityText(friend)}
          </div>
        </div>
        <div class="friend-stats">
          <div class="friend-stat" style="color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">Level <strong style="color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">${friend.level || 1}</strong></div>
          <div class="friend-stat" style="color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);"><strong style="color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">${friend.stats?.totalFocusTime || 0}</strong> min focused</div>
        </div>
        <button class="btn-remove" data-id="${friend.userId}">Remove</button>
      `;
      
      return `
        <div class="friend-card" data-username="${friend.username}" style="${cardStyle}">
          ${content}
        </div>
      `;
    }).join('');
    
    // Add click listeners for profile viewing
    document.querySelectorAll('.friend-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('btn-remove')) {
          viewProfile(card.dataset.username);
        }
      });
    });
    
    // Add remove listeners
    document.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await API.removeFriend(btn.dataset.id);
          loadFriends();
        } catch (error) {
          alert('Failed to remove friend');
        }
      });
    });
  } catch (error) {
    console.error('Failed to load friends:', error);
    document.getElementById('friendsList').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p>Failed to load friends. Please try again.</p>
      </div>
    `;
  }
}

function getActivityStatus(friend) {
  // Check friend activity from backend
  const activity = friend.activity || {};
  
  // Check if online (activity updated in last 5 minutes)
  const lastUpdated = activity.lastUpdated ? new Date(activity.lastUpdated).getTime() : 0;
  const now = Date.now();
  const isOnline = (now - lastUpdated) < 5 * 60 * 1000; // 5 minutes
  
  if (!isOnline) return 'offline';
  if (activity.focusActive || activity.status === 'focusing') return 'focusing';
  if (activity.status === 'online' || activity.status === 'youtube') return 'online';
  
  return 'offline';
}

function getActivityText(friend) {
  const activity = friend.activity || {};
  
  // Check if online
  const lastUpdated = activity.lastUpdated ? new Date(activity.lastUpdated).getTime() : 0;
  const now = Date.now();
  const isOnline = (now - lastUpdated) < 5 * 60 * 1000;
  
  if (!isOnline) {
    return 'Offline';
  }
  
  if (activity.focusActive || activity.status === 'focusing') {
    return '🎯 In focus session';
  }
  
  // Enhanced activity display
  if (activity.activityType && activity.videoTitle) {
    const icon = activity.videoThumbnail && typeof activity.videoThumbnail === 'string' && activity.videoThumbnail.length <= 2 
      ? activity.videoThumbnail 
      : '📚';
    return `${icon} ${activity.activityType}: ${activity.videoTitle.substring(0, 35)}${activity.videoTitle.length > 35 ? '...' : ''}`;
  }
  
  if (activity.status === 'studying' && activity.videoTitle) {
    return `📚 ${activity.videoTitle.substring(0, 40)}${activity.videoTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'youtube' && activity.videoTitle) {
    return `📺 ${activity.videoTitle.substring(0, 40)}${activity.videoTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'youtube-shorts' && activity.videoTitle) {
    return `📱 ${activity.videoTitle.substring(0, 40)}${activity.videoTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'reading' && activity.videoTitle) {
    return `📄 ${activity.videoTitle.substring(0, 40)}${activity.videoTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'searching' && activity.videoTitle) {
    return `🔍 ${activity.videoTitle.substring(0, 40)}${activity.videoTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'youtube') {
    return '📺 Watching YouTube';
  }
  
  if (activity.status === 'studying') {
    return '📚 Studying';
  }
  
  if (activity.status === 'social-media') {
    return '📱 Scrolling Social Media';
  }
  
  // Custom labels for common websites
  if (activity.currentUrl) {
    const url = activity.currentUrl || '';
    const lowerUrl = url.toLowerCase();
    
    // Google
    if (lowerUrl.includes('google.com')) {
      if (lowerUrl.includes('/search')) {
        return '🔍 Googling...';
      }
      return '🔍 On Google';
    }
    
    // Social Media
    if (lowerUrl.includes('instagram.com')) {
      if (lowerUrl.includes('/reel')) return '📸 Watching Reels';
      if (lowerUrl.includes('/stories')) return '📸 Checking Stories';
      return '📸 Scrolling Instagram';
    }
    
    if (lowerUrl.includes('facebook.com')) {
      return '👥 On Facebook';
    }
    
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
      return '🐦 Scrolling X (Twitter)';
    }
    
    if (lowerUrl.includes('reddit.com')) {
      return '🤖 Browsing Reddit';
    }
    
    if (lowerUrl.includes('tiktok.com')) {
      return '🎵 Watching TikTok';
    }
    
    if (lowerUrl.includes('snapchat.com')) {
      return '👻 On Snapchat';
    }
    
    if (lowerUrl.includes('linkedin.com')) {
      return '💼 Networking on LinkedIn';
    }
    
    if (lowerUrl.includes('pinterest.com')) {
      return '📌 Pinning Ideas';
    }
    
    // Entertainment
    if (lowerUrl.includes('netflix.com')) {
      return '🎬 Watching Netflix';
    }
    
    if (lowerUrl.includes('spotify.com')) {
      return '🎵 Listening to Spotify';
    }
    
    if (lowerUrl.includes('twitch.tv')) {
      return '🎮 Watching Twitch';
    }
    
    if (lowerUrl.includes('discord.com')) {
      return '💬 Chatting on Discord';
    }
    
    // Shopping
    if (lowerUrl.includes('amazon.')) {
      return '🛒 Shopping on Amazon';
    }
    
    if (lowerUrl.includes('flipkart.com')) {
      return '🛒 Shopping on Flipkart';
    }
    
    // News & Info
    if (lowerUrl.includes('wikipedia.org')) {
      return '📖 Reading Wikipedia';
    }
    
    if (lowerUrl.includes('github.com')) {
      return '💻 Coding on GitHub';
    }
    
    if (lowerUrl.includes('stackoverflow.com')) {
      return '💡 Finding Solutions';
    }
    
    // Email
    if (lowerUrl.includes('gmail.com') || lowerUrl.includes('mail.google.com')) {
      return '📧 Checking Email';
    }
    
    if (lowerUrl.includes('outlook.')) {
      return '📧 Checking Outlook';
    }
    
    // Default - show domain
    const domain = url.match(/https?:\/\/([^\/]+)/)?.[1] || 'web';
    return `🌐 ${domain}`;
  }
  
  return 'Online';
}

// Load friend requests
async function loadFriendRequests() {
  try {
    const data = await API.getFriendRequests();
    const { pending, sent } = data;
    
    // Update badge
    const badge = document.getElementById('requestsBadge');
    if (badge) {
      badge.textContent = pending.length;
      badge.style.display = pending.length > 0 ? 'inline-block' : 'none';
    }
    
    // Load pending requests
    const pendingContainer = document.getElementById('pendingRequestsList');
    if (pending.length === 0) {
      pendingContainer.innerHTML = `
        <div class="empty-state" style="padding: 32px 16px;">
          <div class="empty-state-icon">📬</div>
          <p style="font-size: 14px;">No pending friend requests</p>
        </div>
      `;
    } else {
      pendingContainer.innerHTML = pending.map(req => `
        <div class="friend-item">
          <div class="friend-avatar">${req.avatar || '👤'}</div>
          <div class="friend-info">
            <div class="friend-name" style="text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">${req.displayName || req.username}</div>
            <div class="friend-username" style="text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">@${req.username}</div>
            <div style="font-size: 11px; color: #888; margin-top: 4px; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">
              📅 ${new Date(req.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div class="friend-actions">
            <button class="accept-request-btn" data-username="${req.username}">
              ✓ Accept
            </button>
            <button class="reject-request-btn" data-username="${req.username}">
              ✕ Reject
            </button>
          </div>
        </div>
      `).join('');
      
      // Add event listeners
      document.querySelectorAll('.accept-request-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const username = e.target.dataset.username;
          try {
            await API.acceptFriendRequest(username);
            alert(`You are now friends with @${username}!`);
            loadFriendRequests();
            loadFriends();
          } catch (error) {
            alert('Failed to accept friend request');
          }
        });
      });
      
      document.querySelectorAll('.reject-request-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const username = e.target.dataset.username;
          try {
            await API.rejectFriendRequest(username);
            alert('Friend request rejected');
            loadFriendRequests();
          } catch (error) {
            alert('Failed to reject friend request');
          }
        });
      });
    }
    
    // Load sent requests
    const sentContainer = document.getElementById('sentRequestsList');
    if (sent.length === 0) {
      sentContainer.innerHTML = `
        <div class="empty-state" style="padding: 32px 16px;">
          <div class="empty-state-icon">✉️</div>
          <p style="font-size: 14px;">No sent friend requests</p>
        </div>
      `;
    } else {
      sentContainer.innerHTML = sent.map(req => `
        <div class="friend-item">
          <div class="friend-avatar">${req.avatar || '👤'}</div>
          <div class="friend-info">
            <div class="friend-name" style="text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">${req.displayName || req.username}</div>
            <div class="friend-username" style="text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">@${req.username}</div>
            <div style="font-size: 11px; color: #888; margin-top: 4px; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">
              📤 Sent ${new Date(req.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div class="friend-actions">
            <span style="
              background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
              color: #000;
              padding: 8px 16px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              display: flex;
              align-items: center;
              gap: 6px;
            ">⏳ Pending</span>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Failed to load friend requests:', error);
    document.getElementById('pendingRequestsList').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p>Failed to load requests</p>
      </div>
    `;
  }
}

async function loadLeaderboard() {
  try {
    const leaderboard = await API.getLeaderboard(10); // Top 10 only
    const currentUserData = await chrome.storage.local.get(['user']);
    const currentUser = currentUserData.user;
    
    const container = document.getElementById('leaderboardList');
    
    if (!leaderboard || leaderboard.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏆</div>
          <p>No users yet. Be the first to compete!</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = leaderboard.map((user, index) => {
      const rank = index + 1;
      const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
      const isCurrentUser = currentUser && user.userId === currentUser.userId;
      const rankIcon = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank;
      
      let itemStyle = isCurrentUser ? 'border-color: #3b82f6; background: rgba(59, 130, 246, 0.05);' : '';
      
      // Apply name banner as card background
      if (user.nameBanner) {
        itemStyle = `background: url('${chrome.runtime.getURL(`assets/name_banner/${user.nameBanner}.png`)}') center/cover; background-size: 100% 100%;${isCurrentUser ? ' border-color: #3b82f6;' : ''}`;
      }
      
      // Avatar decoration wrapper
      const avatarContent = user.avatarDecoration ? `
        <div style="position: relative; display: inline-block;">
          <div class="friend-avatar">${user.avatar || '👤'}</div>
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 56px;
            height: 56px;
            background: url('${chrome.runtime.getURL(`assets/avatar/${user.avatarDecoration}.png`)}') center/contain no-repeat;
            pointer-events: none;
            z-index: 1;
          "></div>
        </div>
      ` : `<div class="friend-avatar">${user.avatar || '👤'}</div>`;
      
      const content = `
        <div class="leaderboard-rank ${rankClass}">${rankIcon}</div>
        ${avatarContent}
        <div class="friend-info">
          <div class="friend-name">
            ${user.displayName}
            ${isCurrentUser ? '<span style="color: #3b82f6; font-size: 11px; font-weight: 600;">(You)</span>' : ''}
          </div>
          <div class="friend-username">@${user.username}</div>
        </div>
        <div class="friend-stats">
          <div class="friend-stat" style="color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">Lv <strong style="color: #ffffff; text-shadow: 0 2px 8px rgba(59, 130, 246, 0.8), 0 0 4px rgba(59, 130, 246, 0.6);">${user.level || 1}</strong></div>
          <div class="friend-stat" style="color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);"><strong style="color: #fbbf24; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(251, 191, 36, 0.6);">${user.points || 0}</strong> pts</div>
          <div class="friend-stat" style="color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);"><strong style="color: #10b981; text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(16, 185, 129, 0.6);">${user.stats?.totalFocusTime || 0}</strong> min</div>
        </div>
      `;
      
      return `
        <div class="leaderboard-item" style="${itemStyle}">
          ${content}
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load leaderboard:', error);
    document.getElementById('leaderboardList').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p>Failed to load leaderboard. Please try again.</p>
      </div>
    `;
  }
}

async function loadActivity() {
  try {
    const activity = await API.getFriendsActivity();
    const container = document.getElementById('activityFeed');
    
    if (!activity || activity.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <p>No recent friend activity</p>
        </div>
      `;
      return;
    }
    
    // Sort activity - online users at top
    const sortedActivity = activity.sort((a, b) => {
      const statusA = getActivityStatus(a);
      const statusB = getActivityStatus(b);
      const isOnlineA = statusA !== 'offline';
      const isOnlineB = statusB !== 'offline';
      
      if (isOnlineA && !isOnlineB) return -1;
      if (!isOnlineA && isOnlineB) return 1;
      return 0;
    });
    
    container.innerHTML = sortedActivity.map(friend => {
      const avatarDecoration = friend.avatarDecoration ? `<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: url('${chrome.runtime.getURL(`assets/avatar/${friend.avatarDecoration}.png`)}') center/contain no-repeat; pointer-events: none; z-index: 10;"></div>` : '';
      const nameBannerStyle = friend.nameBanner ? `background: url('${chrome.runtime.getURL(`assets/name_banner/${friend.nameBanner}.png`)}') center/cover; background-size: 100% 100%;` : '';
      
      return `
      <div class="friend-card" style="${nameBannerStyle}">
        <div class="friend-avatar" style="position: relative;">
          ${friend.avatar || '👤'}
          ${avatarDecoration}
        </div>
        <div class="friend-info">
          <div class="friend-name" style="text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">${friend.displayName}</div>
          <div class="friend-activity">
            <span class="activity-indicator ${getActivityStatus(friend)}"></span>
            <span style="text-shadow: 1px 1px 3px rgba(0,0,0,0.8);">${getActivityText(friend)}</span>
          </div>
          <div style="font-size: 11px; color: #ddd; margin-top: 4px; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);">
            ${getTimeAgo(friend.activity?.lastUpdated)}
          </div>
        </div>
      </div>
    `;
    }).join('');
  } catch (error) {
    console.error('Failed to load activity:', error);
    document.getElementById('activityFeed').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p>Failed to load activity. Please try again.</p>
      </div>
    `;
  }
}

function getTimeAgo(timestamp) {
  if (!timestamp) return 'Unknown';
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function getActivityTextFromData(activity) {
  if (!activity) return 'Offline';
  
  if (activity.status === 'focusing') {
    return '🎯 In focus session';
  }
  
  // Enhanced activity display with activityType
  if (activity.activityType && activity.videoTitle) {
    const icon = activity.videoThumbnail && typeof activity.videoThumbnail === 'string' && activity.videoThumbnail.length <= 2 
      ? activity.videoThumbnail 
      : '📚';
    return `${icon} ${activity.activityType}: ${activity.videoTitle}`;
  }
  
  if (activity.status === 'studying' && activity.videoTitle) {
    return `📚 Studying: ${activity.videoTitle}`;
  }
  
  if (activity.status === 'youtube' && activity.videoTitle) {
    return `📺 Watching: ${activity.videoTitle}`;
  }
  
  if (activity.status === 'youtube-shorts' && activity.videoTitle) {
    return `📱 Watching Short: ${activity.videoTitle}`;
  }
  
  if (activity.status === 'reading' && activity.videoTitle) {
    return `📄 Reading: ${activity.videoTitle}`;
  }
  
  if (activity.status === 'searching' && activity.videoTitle) {
    return `🔍 ${activity.videoTitle}`;
  }
  
  if (activity.status === 'studying') {
    return '📚 Studying';
  }
  
  if (activity.status === 'social-media') {
    return '📱 Scrolling Social Media';
  }
  
  // Custom labels for common websites
  if (activity.currentUrl) {
    const url = activity.currentUrl || '';
    const lowerUrl = url.toLowerCase();
    
    // Google
    if (lowerUrl.includes('google.com')) {
      if (lowerUrl.includes('/search')) {
        return '🔍 Googling...';
      }
      return '🔍 On Google';
    }
    
    // Social Media
    if (lowerUrl.includes('instagram.com')) {
      if (lowerUrl.includes('/reel')) return '📸 Watching Reels';
      if (lowerUrl.includes('/stories')) return '📸 Checking Stories';
      return '📸 Scrolling Instagram';
    }
    
    if (lowerUrl.includes('facebook.com')) {
      return '👥 On Facebook';
    }
    
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
      return '🐦 Scrolling X (Twitter)';
    }
    
    if (lowerUrl.includes('reddit.com')) {
      return '🤖 Browsing Reddit';
    }
    
    if (lowerUrl.includes('tiktok.com')) {
      return '🎵 Watching TikTok';
    }
    
    if (lowerUrl.includes('snapchat.com')) {
      return '👻 On Snapchat';
    }
    
    if (lowerUrl.includes('linkedin.com')) {
      return '💼 Networking on LinkedIn';
    }
    
    if (lowerUrl.includes('pinterest.com')) {
      return '📌 Pinning Ideas';
    }
    
    // Entertainment
    if (lowerUrl.includes('netflix.com')) {
      return '🎬 Watching Netflix';
    }
    
    if (lowerUrl.includes('spotify.com')) {
      return '🎵 Listening to Spotify';
    }
    
    if (lowerUrl.includes('twitch.tv')) {
      return '🎮 Watching Twitch';
    }
    
    if (lowerUrl.includes('discord.com')) {
      return '💬 Chatting on Discord';
    }
    
    // Shopping
    if (lowerUrl.includes('amazon.')) {
      return '🛒 Shopping on Amazon';
    }
    
    if (lowerUrl.includes('flipkart.com')) {
      return '🛒 Shopping on Flipkart';
    }
    
    // News & Info
    if (lowerUrl.includes('wikipedia.org')) {
      return '📖 Reading Wikipedia';
    }
    
    if (lowerUrl.includes('github.com')) {
      return '💻 Coding on GitHub';
    }
    
    if (lowerUrl.includes('stackoverflow.com')) {
      return '💡 Finding Solutions';
    }
    
    // Email
    if (lowerUrl.includes('gmail.com') || lowerUrl.includes('mail.google.com')) {
      return '📧 Checking Email';
    }
    
    if (lowerUrl.includes('outlook.')) {
      return '📧 Checking Outlook';
    }
    
    // Default - show domain
    const domain = url.match(/https?:\/\/([^\/]+)/)?.[1] || 'web';
    return `🌐 ${domain}`;
  }
  
  return 'Online';
}

// Profile Modal Functions
async function viewProfile(username) {
  const modal = document.getElementById('profileModal');
  const content = document.getElementById('profileContent');
  const modalWrapper = document.getElementById('profileModalWrapper');
  const modalContent = document.getElementById('profileModalContent');
  
  modal.style.display = 'flex';
  content.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Loading profile...</div>';
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/profile/${username}`, {
      headers: {
        'Authorization': `Bearer ${await API.getToken()}`
      }
    });
    
    const profile = await response.json();
    
    console.log('👤 Profile loaded:', profile.username, 'Effect:', profile.profileEffect);
    
    const isOnline = profile.isOnline;
    const lastSeen = profile.lastSeen ? getTimeAgo(profile.lastSeen) : 'Unknown';
    
    // Reset modal styles
    modalWrapper.style.background = 'transparent';
    modalWrapper.style.padding = '0';
    modalWrapper.style.boxShadow = 'none';
    modalContent.style.background = '#141414';
    modalContent.style.border = '1px solid #1f1f1f';
    modalContent.style.boxShadow = '0 24px 80px rgba(0,0,0,0.8)';
    
    // Profile decoration overlay (on top of modal, not as border)
    const profileDecoration = profile.profileDecoration ? `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: url('${chrome.runtime.getURL(`assets/profile/${profile.profileDecoration}.png`)}');
        background-size: 100% 100%;
        background-position: center;
        background-repeat: no-repeat;
        pointer-events: none;
        z-index: 1000;
        border-radius: 15px;
      "></div>
    ` : '';
    
    // Discord-style avatar decoration (uses assets/avatar/ folder)
    const avatarDecoration = profile.avatarDecoration ? `
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 140px;
        height: 140px;
        background: url('${chrome.runtime.getURL(`assets/avatar/${profile.avatarDecoration}.png`)}') center/contain no-repeat;
        pointer-events: none;
        z-index: 10;
      "></div>
    ` : '';
    
    content.innerHTML = `
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="position: relative; display: inline-block; margin-bottom: 20px;">
          <div style="font-size: 64px; line-height: 1;">${profile.avatar || '👤'}</div>
          ${avatarDecoration}
          <div style="position: absolute; bottom: 2px; right: 2px; width: 16px; height: 16px; background: ${isOnline ? '#10b981' : '#4b5563'}; border: 2px solid #141414; border-radius: 50%; z-index: 11;"></div>
        </div>
        <h2 style="font-size: 24px; font-weight: 600; margin: 0 0 6px 0; color: #ffffff;">${profile.displayName}</h2>
        <div style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">@${profile.username}</div>
        <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: ${isOnline ? 'rgba(16, 185, 129, 0.1)' : '#0a0a0a'}; border: 1px solid ${isOnline ? '#10b981' : '#1f1f1f'}; border-radius: 6px; font-size: 12px; font-weight: 500; color: ${isOnline ? '#10b981' : '#6b7280'};">
          <span style="width: 6px; height: 6px; background: ${isOnline ? '#10b981' : '#4b5563'}; border-radius: 50%;"></span>
          ${isOnline ? 'Online' : `Last seen ${lastSeen}`}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
        <div style="background: #141414; border: 1px solid #2a2a2a; padding: 18px 12px; border-radius: 10px; text-align: center; transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
          <div style="font-size: 28px; font-weight: 600; color: #3b82f6; margin-bottom: 4px;">${profile.level || 1}</div>
          <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">Level</div>
        </div>
        <div style="background: #141414; border: 1px solid #2a2a2a; padding: 18px 12px; border-radius: 10px; text-align: center; transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
          <div style="font-size: 28px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">${profile.points || 0}</div>
          <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">Points</div>
        </div>
        <div style="background: #141414; border: 1px solid #2a2a2a; padding: 18px 12px; border-radius: 10px; text-align: center; transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
          <div style="font-size: 28px; font-weight: 600; color: #ffffff; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>${profile.streak?.current || 0}</span>
            ${(profile.streak?.current || 0) > 0 ? '<i class="fas fa-fire" style="color: #f97316; font-size: 20px;"></i>' : ''}
          </div>
          <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">Current Streak</div>
        </div>
      </div>

      <div style="background: #141414; border: 1px solid #2a2a2a; padding: 24px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
        <h3 style="font-size: 13px; margin: 0 0 20px 0; color: #ffffff; font-weight: 600; display: flex; align-items: center; gap: 8px;"><i class="fas fa-chart-line" style="color: #3b82f6; font-size: 14px;"></i> Statistics</h3>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #2a2a2a;">
          <span style="color: #9ca3af; font-size: 13px; font-weight: 500;">Total Focus Time</span>
          <strong style="color: #e5e5e5; font-size: 15px; font-weight: 600;">${profile.stats?.totalFocusTime || 0} min</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #2a2a2a;">
          <span style="color: #9ca3af; font-size: 13px; font-weight: 500;">Sessions Completed</span>
          <strong style="color: #e5e5e5; font-size: 15px; font-weight: 600;">${profile.stats?.sessionsCompleted || 0}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #2a2a2a;">
          <span style="color: #9ca3af; font-size: 13px; font-weight: 500;">Sites Blocked</span>
          <strong style="color: #e5e5e5; font-size: 15px; font-weight: 600;">${profile.stats?.sitesBlocked || 0}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #9ca3af; font-size: 13px; font-weight: 500;">Longest Streak</span>
          <strong style="color: #e5e5e5; font-size: 15px; font-weight: 600;">${profile.streak?.longest || 0} days</strong>
        </div>
      </div>

      ${profile.badges && profile.badges.length > 0 ? `
        <div style="background: #141414; border: 1px solid #2a2a2a; padding: 24px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <h3 style="font-size: 13px; margin: 0; color: #ffffff; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              <i class="fas fa-trophy" style="color: #fbbf24; font-size: 14px;"></i> 
              Achievements (${profile.badges.length})
            </h3>
            ${profile.badges.length > 6 ? `
              <button id="showAllBadges" style="background: #0a0a0a; border: 1px solid #2a2a2a; padding: 6px 12px; border-radius: 6px; color: #9ca3af; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
                <span id="badgeButtonText">Show All</span>
                <i id="badgeButtonIcon" class="fas fa-chevron-down" style="font-size: 10px;"></i>
              </button>
            ` : ''}
          </div>
          <div id="badgesContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; max-height: ${profile.badges.length > 6 ? '280px' : 'none'}; overflow: hidden; transition: max-height 0.3s ease;">
            ${profile.badges.slice(0, 6).map(badge => {
              const badgeInfo = getBadgeInfo(badge);
              return `<div class="profile-badge" style="background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px 12px; text-align: center; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; position: relative;" title="${badgeInfo.description}" onmouseenter="this.style.borderColor='#3b82f6'; this.style.boxShadow='0 4px 16px rgba(59, 130, 246, 0.2)'; this.querySelector('.badge-icon-inner').style.transform='scale(1.15) rotate(5deg)';" onmouseleave="this.style.borderColor='#2a2a2a'; this.style.boxShadow='none'; this.querySelector('.badge-icon-inner').style.transform='scale(1)';">
                <div class="badge-icon-inner" style="font-size: 32px; margin-bottom: 12px; color: #3b82f6; transition: all 0.3s ease;">${badgeInfo.icon}</div>
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px; color: #e5e5e5;">${badgeInfo.name}</div>
                <div style="font-size: 11px; color: #6b7280;">${badgeInfo.description}</div>
                <div style="position: absolute; top: 8px; right: 8px; font-size: 14px; color: #22c55e;"><i class="fas fa-check-circle"></i></div>
              </div>`;
            }).join('')}
            ${profile.badges.length > 6 ? `
              <div id="hiddenBadges" style="display: none; grid-column: 1 / -1;">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; margin-top: 10px;">
                  ${profile.badges.slice(6).map(badge => {
                    const badgeInfo = getBadgeInfo(badge);
                    return `<div class="profile-badge" style="background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px 12px; text-align: center; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; position: relative;" title="${badgeInfo.description}" onmouseenter="this.style.borderColor='#3b82f6'; this.style.boxShadow='0 4px 16px rgba(59, 130, 246, 0.2)'; this.querySelector('.badge-icon-inner').style.transform='scale(1.15) rotate(5deg)';" onmouseleave="this.style.borderColor='#2a2a2a'; this.style.boxShadow='none'; this.querySelector('.badge-icon-inner').style.transform='scale(1)';">
                      <div class="badge-icon-inner" style="font-size: 32px; margin-bottom: 12px; color: #3b82f6; transition: all 0.3s ease;">${badgeInfo.icon}</div>
                      <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px; color: #e5e5e5;">${badgeInfo.name}</div>
                      <div style="font-size: 11px; color: #6b7280;">${badgeInfo.description}</div>
                      <div style="position: absolute; top: 8px; right: 8px; font-size: 14px; color: #22c55e;"><i class="fas fa-check-circle"></i></div>
                    </div>`;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      ` : '<div style="background: #141414; border: 1px solid #2a2a2a; padding: 24px; border-radius: 12px; margin-bottom: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);"><div style="font-size: 32px; margin-bottom: 8px; opacity: 0.3;"><i class="fas fa-trophy" style="color: #6b7280;"></i></div><div style="color: #6b7280; font-size: 13px;">No badges earned yet</div></div>'}

      ${(isOnline || profile.activity?.focusActive) && profile.activity?.status && profile.activity.status !== 'offline' ? `
        <div style="background: #141414; border: 1px solid #2a2a2a; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <h3 style="font-size: 13px; margin: 0; color: #ffffff; font-weight: 600; display: flex; align-items: center; gap: 8px;"><i class="fas fa-bolt" style="color: #fbbf24; font-size: 14px;"></i> Live Activity</h3>
            ${profile.activity.focusActive ? `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #dc2626; border: 1px solid #ef4444; border-radius: 6px; font-size: 11px; font-weight: 600; color: white;">
              <span style="width: 5px; height: 5px; background: white; border-radius: 50%;"></span>
              FOCUS MODE
            </span>` : ''}
          </div>
          
          <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);">
            <span class="activity-indicator ${profile.activity.focusActive ? 'focusing' : profile.activity.status}" style="width: 12px; height: 12px; flex-shrink: 0;"></span>
            <div style="flex: 1;">
              <div style="color: #e5e5e5; font-size: 13px; font-weight: 500; margin-bottom: 4px;">${getActivityTextFromData(profile.activity)}</div>
              ${profile.activity.focusActive ? `<div style="color: #6b7280; font-size: 11px;">Deep focus session active</div>` : ''}
            </div>
          </div>
          
          ${profile.activity.videoTitle ? `
            ${(() => {
              // Dynamic detection based on thumbnail type
              const hasImageThumbnail = profile.activity.videoThumbnail && 
                                       typeof profile.activity.videoThumbnail === 'string' && 
                                       (profile.activity.videoThumbnail.startsWith('http') || 
                                        profile.activity.videoThumbnail.startsWith('https'));
              
              const hasEmojiIcon = profile.activity.videoThumbnail && 
                                  typeof profile.activity.videoThumbnail === 'string' && 
                                  profile.activity.videoThumbnail.length <= 2;
              
              const isPDF = profile.activity.videoThumbnail === '📄' || 
                           profile.activity.status === 'reading';
              
              const isYouTubeContent = profile.activity.status === 'youtube' || 
                                      profile.activity.status === 'youtube-shorts' ||
                                      profile.activity.videoChannel === 'YouTube' ||
                                      profile.activity.videoChannel === 'YouTube Shorts';
              
              // PRIORITY 1: If we have an actual image URL (YouTube videos/shorts), show it
              if (hasImageThumbnail) {
                const label = profile.activity.status === 'youtube-shorts' ? 'NOW WATCHING SHORT' : 
                             profile.activity.activityType || 'NOW WATCHING';
                
                return `
                  <div style="background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 10px; overflow: hidden; transition: transform 0.2s;">
                    <div style="position: relative;">
                      <img src="${profile.activity.videoThumbnail}" alt="Thumbnail" style="width: 100%; height: auto; display: block;">
                      ${profile.activity.focusActive ? `<div style="position: absolute; top: 10px; right: 10px; background: #dc2626; border: 1px solid #ef4444; padding: 5px 10px; border-radius: 6px; font-size: 10px; font-weight: 600; color: white;">FOCUSING</div>` : ''}
                      <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); padding: 16px 14px 10px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                          <div style="width: 5px; height: 5px; background: #dc2626; border-radius: 50%;"></div>
                          <span style="color: #6b7280; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">${label}</span>
                        </div>
                      </div>
                    </div>
                    <div style="padding: 14px;">
                      <div style="color: #e5e5e5; font-size: 13px; font-weight: 500; margin-bottom: 10px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${profile.activity.videoTitle}</div>
                      ${profile.activity.videoChannel ? `
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <div style="width: 28px; height: 28px; background: #dc2626; border: 1px solid #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px;">📺</div>
                          <div>
                            <div style="color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Channel</div>
                            <div style="color: #9ca3af; font-size: 12px; font-weight: 500;">${profile.activity.videoChannel}</div>
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `;
              }
              
              // PRIORITY 2: PDF documents
              if (isPDF) {
                // PDF Display
                return `
                  <div style="background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 10px; overflow: hidden; padding: 16px;">
                    ${profile.activity.focusActive ? `<div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #dc2626; border: 1px solid #ef4444; border-radius: 6px; font-size: 10px; font-weight: 600; color: white; margin-bottom: 12px;">FOCUSING</div>` : ''}
                    <div style="display: flex; align-items: center; gap: 14px;">
                      <div style="width: 60px; height: 60px; background: #3b82f6; border: 1px solid #60a5fa; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 32px; flex-shrink: 0;">📄</div>
                      <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                          <div style="width: 5px; height: 5px; background: #3b82f6; border-radius: 50%;"></div>
                          <span style="color: #6b7280; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Reading Document</span>
                        </div>
                        <div style="color: #e5e5e5; font-size: 13px; font-weight: 500; line-height: 1.4;">${profile.activity.videoTitle}</div>
                      </div>
                    </div>
                  </div>
                `;
              }
              
              // PRIORITY 3: Study activities with emoji icons
              if (hasEmojiIcon || profile.activity.activityType) {
                const icon = hasEmojiIcon ? profile.activity.videoThumbnail : '📚';
                const activityLabel = profile.activity.activityType || 'Studying';
                
                return `
                  <div style="background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 10px; overflow: hidden; padding: 16px;">
                    ${profile.activity.focusActive ? `<div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #dc2626; border: 1px solid #ef4444; border-radius: 6px; font-size: 10px; font-weight: 600; color: white; margin-bottom: 12px;">FOCUSING</div>` : ''}
                    <div style="display: flex; align-items: center; gap: 14px;">
                      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border: 1px solid #60a5fa; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 32px; flex-shrink: 0; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">${icon}</div>
                      <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                          <div style="width: 5px; height: 5px; background: #3b82f6; border-radius: 50%;"></div>
                          <span style="color: #6b7280; font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">${activityLabel}</span>
                        </div>
                        <div style="color: #e5e5e5; font-size: 14px; font-weight: 600; line-height: 1.4; margin-bottom: 4px;">${profile.activity.videoTitle}</div>
                        ${profile.activity.videoChannel ? `<div style="color: #9ca3af; font-size: 11px; display: flex; align-items: center; gap: 4px;"><span>📚</span> ${profile.activity.videoChannel}</div>` : ''}
                      </div>
                    </div>
                  </div>
                `;
              }
              
              // PRIORITY 4: Fallback - Simple text display
              {
                // Fallback - Simple text display
                return `<div style="color: #6b7280; font-size: 12px; padding: 10px; background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 8px; border-left: 2px solid #3b82f6;">${profile.activity.videoTitle}</div>`;
              }
            })()}
          ` : ''}
          
          ${profile.activity.actionButton && profile.activity.currentUrl ? `
            <button class="activity-action-btn" data-url="${profile.activity.currentUrl}" style="width: 100%; margin-top: 12px; padding: 10px 16px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border: 1px solid #60a5fa; border-radius: 8px; color: white; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; outline: none;">
              <i class="fas fa-external-link-alt"></i>
              ${profile.activity.actionButton}
            </button>
          ` : ''}
        </div>
      ` : ''}
      ${profileDecoration}
    `;
    
    // Add event listener for action button (CSP-compliant)
    setTimeout(() => {
      const actionBtn = content.querySelector('.activity-action-btn');
      if (actionBtn) {
        const url = actionBtn.getAttribute('data-url');
        actionBtn.addEventListener('click', () => {
          if (url) {
            window.open(url, '_blank');
          }
        });
        
        // Add hover effects via JavaScript
        actionBtn.addEventListener('mouseenter', () => {
          actionBtn.style.transform = 'translateY(-1px)';
          actionBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
        });
        actionBtn.addEventListener('mouseleave', () => {
          actionBtn.style.transform = 'translateY(0)';
          actionBtn.style.boxShadow = 'none';
        });
      }
      
      // Add event listener for "Show All Badges" button
      const showAllBtn = content.querySelector('#showAllBadges');
      if (showAllBtn) {
        let isExpanded = false;
        showAllBtn.addEventListener('click', () => {
          const hiddenBadges = content.querySelector('#hiddenBadges');
          const badgesContainer = content.querySelector('#badgesContainer');
          const buttonText = content.querySelector('#badgeButtonText');
          const buttonIcon = content.querySelector('#badgeButtonIcon');
          
          isExpanded = !isExpanded;
          
          if (isExpanded) {
            hiddenBadges.style.display = 'block';
            badgesContainer.style.maxHeight = 'none';
            buttonText.textContent = 'Show Less';
            buttonIcon.classList.remove('fa-chevron-down');
            buttonIcon.classList.add('fa-chevron-up');
          } else {
            hiddenBadges.style.display = 'none';
            badgesContainer.style.maxHeight = '280px';
            buttonText.textContent = 'Show All';
            buttonIcon.classList.remove('fa-chevron-up');
            buttonIcon.classList.add('fa-chevron-down');
          }
        });
        
        // Add hover effect
        showAllBtn.addEventListener('mouseenter', () => {
          showAllBtn.style.background = '#141414';
          showAllBtn.style.borderColor = '#3b82f6';
          showAllBtn.style.color = '#3b82f6';
        });
        showAllBtn.addEventListener('mouseleave', () => {
          showAllBtn.style.background = '#0a0a0a';
          showAllBtn.style.borderColor = '#2a2a2a';
          showAllBtn.style.color = '#9ca3af';
        });
      }
    }, 0);
    
  } catch (error) {
    console.error('Failed to load profile:', error);
    content.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <div>Failed to load profile</div>
      </div>
    `;
  }
}

function getBadgeInfo(badgeId) {
  const badges = {
    'first-session': { icon: '<i class="fas fa-flag-checkered"></i>', name: 'First Step', description: 'Complete first session' },
    'getting-started': { icon: '<i class="fas fa-play-circle"></i>', name: 'Getting Started', description: 'Complete 5 sessions' },
    'dedicated': { icon: '<i class="fas fa-star"></i>', name: 'Dedicated', description: 'Complete 10 sessions' },
    'focus-warrior': { icon: '<i class="fas fa-fist-raised"></i>', name: 'Focus Warrior', description: '25 sessions completed' },
    'session-master': { icon: '<i class="fas fa-medal"></i>', name: 'Session Master', description: '50 sessions completed' },
    'hour-achiever': { icon: '<i class="fas fa-clock"></i>', name: 'Hour Achiever', description: '5+ hours focused' },
    'time-warrior': { icon: '<i class="fas fa-hourglass-half"></i>', name: 'Time Warrior', description: '25+ hours focused' },
    'focus-champion': { icon: '<i class="fas fa-trophy"></i>', name: 'Focus Champion', description: '100+ hours focused' },
    'streak-starter': { icon: '<i class="fas fa-fire-alt"></i>', name: 'Streak Starter', description: '3 day streak' },
    'streak-master': { icon: '<i class="fas fa-fire"></i>', name: 'Streak Master', description: '7 day streak' },
    'streak-legend': { icon: '<i class="fas fa-award"></i>', name: 'Streak Legend', description: '30 day streak' },
    'level-up': { icon: '<i class="fas fa-level-up-alt"></i>', name: 'Level Up', description: 'Reached level 3' },
    'rising-star': { icon: '<i class="fas fa-star-half-alt"></i>', name: 'Rising Star', description: 'Reached level 5' },
    'productivity-king': { icon: '<i class="fas fa-crown"></i>', name: 'Productivity King', description: 'Reached level 10' },
    'early-bird': { icon: '<i class="fas fa-sun"></i>', name: 'Early Bird', description: 'Focused before 8 AM' },
    'night-owl': { icon: '<i class="fas fa-moon"></i>', name: 'Night Owl', description: 'Focused after 10 PM' },
    'social-butterfly': { icon: '<i class="fas fa-user-friends"></i>', name: 'Social Butterfly', description: '5+ friends' }
  };
  return badges[badgeId] || { icon: '<i class="fas fa-trophy"></i>', name: badgeId, description: 'Achievement unlocked' };
}

document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('profileModal').style.display = 'none';
});

// Close modal on background click
document.getElementById('profileModal').addEventListener('click', (e) => {
  if (e.target.id === 'profileModal') {
    document.getElementById('profileModal').style.display = 'none';
  }
});

// Load initial data
loadFriends();
loadFriendRequests(); // Load requests and update badge
updateChatTabState(); // Check if focus mode is active

// Auto-refresh activity every 10 seconds
setInterval(() => {
  const activeTab = document.querySelector('.tab.active').dataset.tab;
  if (activeTab === 'activity') loadActivity();
}, 10000);

// Auto-refresh friend requests badge every 30 seconds
setInterval(() => {
  loadFriendRequests();
}, 30000);

// Auto-refresh chat tab state every 5 seconds
setInterval(() => {
  updateChatTabState();
}, 5000);

// Update chat tab visual state based on focus mode
async function updateChatTabState() {
  const data = await chrome.storage.local.get(['focusActive']);
  const chatTab = document.querySelector('[data-tab="chat"]');
  if (chatTab) {
    if (data.focusActive) {
      chatTab.style.opacity = '0.5';
      chatTab.style.cursor = 'not-allowed';
      chatTab.title = 'Chat disabled during focus mode';
    } else {
      chatTab.style.opacity = '1';
      chatTab.style.cursor = 'pointer';
      chatTab.title = '';
    }
  }
}

// Community Chat Implementation
let chatSocket = null;
let currentUser = null;
const chatMessages = [];
const onlineUsers = new Map();

async function initCommunityChat() {
  if (chatSocket && chatSocket.connected) {
    console.log('✅ Chat already initialized and connected');
    return; // Already initialized
  }

  try {
    // Get current user data
    const userData = await chrome.storage.local.get(['user', 'authToken']);
    if (!userData.user || !userData.authToken) {
      console.warn('⚠️ No user data or auth token found');
      document.getElementById('chatMessages').innerHTML = `
        <div class="chat-welcome">
          <div class="chat-welcome-icon">🔒</div>
          <h3 style="margin-bottom: 8px; color: #888;">Please log in</h3>
          <p style="font-size: 13px; color: #666;">You need to be logged in to use community chat</p>
        </div>
      `;
      return;
    }

    console.log('🔌 Initializing community chat for user:', userData.user.username);
    currentUser = userData.user;

    // Connect to Socket.IO - use same base URL as API but remove /api suffix
    const apiBaseURL = API_CONFIG.baseURL.replace('/api', '');
    console.log('🌐 Connecting to WebSocket at:', apiBaseURL);
    chatSocket = io(apiBaseURL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    chatSocket.on('connect', () => {
      console.log('✅ Connected to community chat - Socket ID:', chatSocket.id);
      console.log('🔑 Authenticating with token...');
      updateChatStatus('connected', 'Connected to server...');
      chatSocket.emit('authenticate', userData.authToken);
    });

    chatSocket.on('authenticated', (data) => {
      console.log('✅ Chat authenticated, User ID:', data?.userId);
      console.log('🚪 Joining community room...');
      updateChatStatus('ready', 'Ready');
      chatSocket.emit('join-community-chat');
    });

    chatSocket.on('community-message', (message) => {
      console.log('💬 Received message:', message.username, '-', message.text.substring(0, 30));
      addMessageToChat(message);
    });

    chatSocket.on('chat-history', (messages) => {
      console.log('📜 Received chat history:', messages.length, 'messages');
      const container = document.getElementById('chatMessages');
      
      if (messages && messages.length > 0) {
        container.innerHTML = '';
        messages.forEach(msg => addMessageToChat(msg, false));
        scrollToBottom();
      } else {
        console.log('💬 No chat history, keeping welcome message');
        // Keep the welcome message if no messages
      }
    });

    chatSocket.on('user-joined-chat', (user) => {
      console.log('👋 User joined:', user.username);
      onlineUsers.set(user.userId, user);
      updateOnlineUsers();
    });

    chatSocket.on('user-left-chat', (userId) => {
      console.log('👋 User left:', userId);
      onlineUsers.delete(userId);
      updateOnlineUsers();
    });

    chatSocket.on('online-users-list', (users) => {
      console.log('👥 Online users list received:', users.length, 'users');
      onlineUsers.clear();
      users.forEach(user => onlineUsers.set(user.userId, user));
      updateOnlineUsers();
    });

    chatSocket.on('disconnect', () => {
      console.log('⚠️ Disconnected from chat');
      updateChatStatus('disconnected', 'Disconnected');
    });

    chatSocket.on('connect_error', (error) => {
      console.error('❌ Chat connection error:', error);
      updateChatStatus('error', 'Connection Error');
    });

    chatSocket.on('error', (error) => {
      console.error('❌ Chat error:', error);
    });

    // Setup chat form - wait a bit for DOM to be ready
    setTimeout(() => {
      const chatForm = document.getElementById('chatForm');
      const chatSendBtn = document.getElementById('chatSendBtn');
      const chatInput = document.getElementById('chatInput');
      
      if (chatForm && chatSendBtn && chatInput) {
        // CRITICAL: Prevent form submission completely
        chatForm.addEventListener('submit', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }, true);
        
        // Remove old listener if exists
        const newBtn = chatSendBtn.cloneNode(true);
        chatSendBtn.parentNode.replaceChild(newBtn, chatSendBtn);
        
        // Create error message element
        const errorMsg = document.createElement('div');
        errorMsg.id = 'chatError';
        errorMsg.style.cssText = 'color: #dc2626; font-size: 12px; margin-bottom: 8px; display: none; font-weight: 500;';
        chatForm.insertBefore(errorMsg, chatInput);
        
        const showError = (message) => {
          errorMsg.textContent = message;
          errorMsg.style.display = 'block';
          setTimeout(() => {
            errorMsg.style.display = 'none';
          }, 3000);
        };
        
        // English profanity/abusive words
        const badWordsEnglish = [
          'fuck', 'fucking', 'fucked', 'fucker', 'fck', 'fuk',
          'shit', 'shit', 'bullshit',
          'bitch', 'bitches', 'btch',
          'bastard', 'bastards',
          'asshole', 'assholes', 
          'dick', 'dickhead',
          'pussy', 'pussies',
          'cock', 'cocks',
          'slut', 'sluts', 'whore', 'whores',
          'nigger', 'nigga',
          'cunt', 'cunts',
          'retard', 'retarded',
          'motherfucker', 'mofo'
        ];
        
        // Hindi/Hinglish profanity
        const badWordsHindi = [
          'chutiya', 'chutiye', 'chod', 'chodu', 'madarchod', 'mc', 
          'bhenchod', 'bc', 'bsdk', 'bhosdike', 'bkl', 'bhosdi',
          'gandu', 'gaandu', 'gand', 'lund', 'loda', 'lawde',
          'randi', 'raand', 'kutte', 'kutta', 'kuttiya',
          'harami', 'haramzada', 'kamina', 'kamine',
          'saala', 'sala', 'saali', 'sali','rand',
          'behenchod', 'benchod', 'bhosad', 'chut',
          'maa ki', 'maki', 'teri maa', 'maadar'
        ];
        
        // Inappropriate names (actresses, porn stars, etc.)
        const inappropriateNames = [
          'mia khalifa', 'mia malkova', 'lana rhoades', 'riley reid',
          'johnny sins', 'jonny sins', 'brazzers', 
          'sunny leone', 'sunny leonne', 'sanny leon',
          'mia khalifaa', 'khalifa',
          'alexis texas', 'abella danger', 'angela white',
          'asa akira', 'lisa ann', 'dani daniels',
          'porn', 'pornstar', 'pornhub', 'xvideos', 'xnxx',
          'sasha grey', 'kendra lust', 'adriana chechik',
          'elsa jean', 'piper perri', 'anna bell peaks',
          'ana de armas', 'swedny sweedy', 'sweeny', 'sydney sweeney'
        ];
        
        const allBadWords = [...badWordsEnglish, ...badWordsHindi, ...inappropriateNames];
        
        const containsProfanity = (text) => {
          const lower = text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '') // Remove special chars
            .replace(/\s+/g, ' '); // Normalize spaces
          
          // Check each bad word with word boundaries
          return allBadWords.some(word => {
            // Create regex with word boundaries to match whole words only
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            return regex.test(lower);
          });
        };
        
        const sendMessage = () => {
          const message = chatInput.value.trim();
          console.log('📤 Attempting to send message:', message);
          
          // Check for profanity
          if (containsProfanity(message)) {
            showError('Badmoshi na mittar 🚫');
            chatInput.value = '';
            return;
          }
          
          if (message && chatSocket && chatSocket.connected) {
            console.log('✅ Sending message via socket');
            chatSocket.emit('community-message', { text: message });
            chatInput.value = '';
          } else {
            console.warn('⚠️ Cannot send - Socket connected:', chatSocket?.connected);
          }
        };
        
        newBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          sendMessage();
        });
        
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            sendMessage();
          }
        });
        
        // @ Mention autocomplete
        let mentionDropdown = null;
        
        chatInput.addEventListener('input', (e) => {
          const value = chatInput.value;
          const cursorPos = chatInput.selectionStart;
          const textBeforeCursor = value.substring(0, cursorPos);
          const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
          
          if (lastAtSymbol !== -1) {
            const searchTerm = textBeforeCursor.substring(lastAtSymbol + 1).toLowerCase();
            const spaceAfterAt = searchTerm.includes(' ');
            
            if (!spaceAfterAt && searchTerm.length >= 0) {
              // Show mention suggestions - get from onlineUsers Map
              const usersArray = Array.from(onlineUsers.values());
              const matches = usersArray.filter(u => 
                u.username && u.username.toLowerCase().startsWith(searchTerm)
              ).slice(0, 5);
              
              if (matches.length > 0) {
                showMentionDropdown(matches, lastAtSymbol);
              } else {
                hideMentionDropdown();
              }
            } else {
              hideMentionDropdown();
            }
          } else {
            hideMentionDropdown();
          }
        });
        
        function showMentionDropdown(users, atPosition) {
          hideMentionDropdown();
          
          mentionDropdown = document.createElement('div');
          mentionDropdown.style.cssText = `
            position: absolute;
            bottom: 60px;
            left: 16px;
            width: 280px;
            background: #1a1a1a;
            border: 1px solid #3b82f6;
            border-radius: 8px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            box-shadow: 0 -4px 16px rgba(59, 130, 246, 0.3);
          `;
          
          users.forEach((user, index) => {
            const item = document.createElement('div');
            item.style.cssText = `
              padding: 10px 12px;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 10px;
              transition: background 0.2s;
            `;
            item.innerHTML = `
              <span style="font-size: 18px;">${user.avatar || '👤'}</span>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; color: #fff; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.displayName}</div>
                <div style="font-size: 11px; color: #3b82f6; font-weight: 600;">@${user.username}</div>
              </div>
            `;
            
            item.addEventListener('mouseenter', () => {
              item.style.background = 'rgba(59, 130, 246, 0.2)';
            });
            
            item.addEventListener('mouseleave', () => {
              item.style.background = 'transparent';
            });
            
            item.addEventListener('click', () => {
              const value = chatInput.value;
              const cursorPos = chatInput.selectionStart;
              const textBeforeCursor = value.substring(0, cursorPos);
              const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
              const textAfterCursor = value.substring(cursorPos);
              
              const newValue = value.substring(0, lastAtSymbol) + '@' + user.username + ' ' + textAfterCursor;
              chatInput.value = newValue;
              
              // Flash the input border to show mention added
              chatInput.style.borderColor = '#3b82f6';
              setTimeout(() => {
                chatInput.style.borderColor = '';
              }, 500);
              
              chatInput.focus();
              chatInput.selectionStart = chatInput.selectionEnd = lastAtSymbol + user.username.length + 2;
              
              hideMentionDropdown();
            });
            
            mentionDropdown.appendChild(item);
          });
          
          document.querySelector('.chat-input-area').appendChild(mentionDropdown);
        }
        
        function hideMentionDropdown() {
          if (mentionDropdown) {
            mentionDropdown.remove();
            mentionDropdown = null;
          }
        }
        
        // Hide dropdown on blur (with delay to allow click)
        chatInput.addEventListener('blur', () => {
          setTimeout(() => hideMentionDropdown(), 200);
        });
        
        console.log('✅ Chat input handlers attached with @ mention autocomplete');
      } else {
        console.error('❌ Chat form elements not found');
      }
    }, 100);

  } catch (error) {
    console.error('Failed to initialize chat:', error);
  }
}

function setupChatInput() {
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  
  if (!chatInput || !chatSendBtn) {
    console.error('❌ Chat input elements not found');
    return;
  }

  // Remove form's default submit behavior entirely
  const chatForm = document.getElementById('chatForm');
  if (chatForm) {
    chatForm.onsubmit = (e) => {
      e.preventDefault();
      return false;
    };
  }

  // Send on button click
  const sendMessage = () => {
    const message = chatInput.value.trim();
    if (message && chatSocket && chatSocket.connected) {
      console.log('📤 Sending message:', message.substring(0, 30));
      chatSocket.emit('community-message', { text: message });
      chatInput.value = '';
      chatInput.focus();
    } else if (!chatSocket || !chatSocket.connected) {
      console.warn('⚠️ Cannot send: Socket not connected');
      alert('Chat is not connected. Please refresh the page.');
    }
  };

  // Remove old listeners by cloning button
  const newSendBtn = chatSendBtn.cloneNode(true);
  chatSendBtn.parentNode.replaceChild(newSendBtn, chatSendBtn);
  
  newSendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sendMessage();
  });

  // Send on Enter key
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      sendMessage();
    }
  });

  console.log('✅ Chat input handlers set up');
}

function updateChatStatus(status, text) {
  const statusMap = {
    'connected': { color: '#4ade80', text: text || 'Connected' },
    'ready': { color: '#4ade80', text: text || 'Ready' },
    'authenticated': { color: '#4ade80', text: text || 'Ready' },
    'disconnected': { color: '#666', text: text || 'Disconnected' },
    'error': { color: '#ff6b6b', text: text || 'Connection Error' }
  };
  
  const info = statusMap[status] || { color: '#666', text: text || 'Unknown' };
  
  // Try to find status indicator
  const statusEl = document.getElementById('chatStatus');
  const statusText = document.getElementById('chatStatusText');
  
  if (statusEl && statusText) {
    statusEl.style.display = 'flex';
    statusEl.style.alignItems = 'center';
    statusEl.style.gap = '8px';
    statusText.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: ${info.color}; display: inline-block; margin-right: 6px;"></span>
      <span style="color: ${info.color};">${info.text}</span>
    `;
  }
}

let lastMessageUser = null;

function addMessageToChat(message, scroll = true) {
  const container = document.getElementById('chatMessages');
  
  // Remove welcome message if it exists
  const welcome = container.querySelector('.chat-welcome');
  if (welcome) {
    welcome.remove();
  }

  const time = new Date(message.timestamp || Date.now());
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Check if this is a consecutive message from same user
  const isConsecutive = lastMessageUser === message.userId;
  lastMessageUser = message.userId;
  
  // Process @ mentions
  let processedText = escapeHtml(message.text);
  const mentionRegex = /@(\w+)/g;
  processedText = processedText.replace(mentionRegex, '<span style="color: #3b82f6; background: rgba(59, 130, 246, 0.1); padding: 2px 6px; border-radius: 4px; font-weight: 600;">@$1</span>');
  
  // Check if current user is mentioned
  chrome.storage.local.get(['user'], (data) => {
    if (data.user && message.text.includes('@' + data.user.username)) {
      // Show notification for mention
      new Notification('You were mentioned!', {
        body: `${message.displayName}: ${message.text}`,
        icon: chrome.runtime.getURL('icons/icon128.png')
      });
    }
  });
  
  const messageEl = document.createElement('div');
  messageEl.className = isConsecutive ? 'message message-consecutive' : 'message';
  
  if (isConsecutive) {
    // Consecutive message - only show text with time
    messageEl.innerHTML = `
      <div class="message-avatar" style="visibility: hidden;"></div>
      <div class="message-content">
        <div class="message-text" style="position: relative;">
          ${processedText}
          <span class="message-time" style="font-size: 10px; color: #6b7280; margin-left: 8px;">${timeStr}</span>
        </div>
      </div>
    `;
  } else {
    // New message - show avatar with decoration
    const avatarDecoration = message.avatarDecoration ? `
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 42px;
        height: 42px;
        background: url('${chrome.runtime.getURL(`assets/avatar/${message.avatarDecoration}.png`)}') center/contain no-repeat;
        pointer-events: none;
        z-index: 10;
      "></div>
    ` : '';
    
    messageEl.innerHTML = `
      <div style="position: relative; width: 36px; height: 36px; flex-shrink: 0;">
        <div class="message-avatar" style="position: relative; z-index: 1;">${message.avatar || '👤'}</div>
        ${avatarDecoration}
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${message.displayName || message.username}</span>
          <span class="message-time">${timeStr}</span>
        </div>
        <div class="message-text">${processedText}</div>
      </div>
    `;
  }
  
  container.appendChild(messageEl);
  
  if (scroll) {
    scrollToBottom();
  }

  // Keep only last 100 messages
  while (container.children.length > 100) {
    container.removeChild(container.firstChild);
  }
}

function updateOnlineUsers() {
  const container = document.getElementById('onlineUsersList');
  const countEl = document.getElementById('onlineCount');
  
  countEl.textContent = onlineUsers.size;
  
  const usersArray = Array.from(onlineUsers.values());
  
  container.innerHTML = usersArray.map(user => {
    const avatarDecoration = user.avatarDecoration ? `
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 38px;
        height: 38px;
        background: url('${chrome.runtime.getURL(`assets/avatar/${user.avatarDecoration}.png`)}') center/contain no-repeat;
        pointer-events: none;
        z-index: 10;
      "></div>
    ` : '';
    
    const cardStyle = user.nameBanner ? `
      background: url('${chrome.runtime.getURL(`assets/name_banner/${user.nameBanner}.png`)}') center/cover;
      background-size: 100% 100%;
    ` : '';
    
    return `
      <div class="online-user" style="${cardStyle}">
        <div style="position: relative; width: 32px; height: 32px; flex-shrink: 0;">
          <div class="online-user-avatar" style="position: relative; z-index: 1;">${user.avatar || '👤'}</div>
          ${avatarDecoration}
        </div>
        <div class="online-user-info">
          <div class="online-user-name" style="text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">${user.displayName || user.username}</div>
        </div>
        <div class="online-indicator-small"></div>
      </div>
    `;
  }).join('');
}

function scrollToBottom() {
  const container = document.getElementById('chatMessages');
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ====================
// SHOP FUNCTIONALITY
// ====================

const shopItems = {
  avatar: [
    { id: 'av', name: 'Avatar Frame 1', price: 100 },
    { id: 'av1', name: 'Avatar Frame 2', price: 125 },
    { id: 'av2', name: 'Avatar Frame 3', price: 150 },
    { id: 'av3', name: 'Avatar Frame 4', price: 200 },
    { id: 'av4', name: 'Avatar Frame 5', price: 250 },
    { id: 'av5', name: 'Avatar Frame 6', price: 300 },
    { id: 'av6', name: 'Avatar Frame 7', price: 350 },
    { id: 'av7', name: 'Avatar Frame 8', price: 400 },
    { id: 'a8', name: 'Avatar Frame 9', price: 500 }
  ],
  banner: [
    { id: 'b1', name: 'Banner Style 1', price: 100 },
    { id: 'b2', name: 'Banner Style 2', price: 150 },
    { id: 'b4', name: 'Banner Style 3', price: 200 },
    { id: 'b5', name: 'Banner Style 4', price: 250 },
    { id: 'b6', name: 'Banner Style 5', price: 300 },
    { id: 'b7', name: 'Banner Style 6', price: 350 },
    { id: 'b8', name: 'Banner Style 7', price: 400 },
    { id: 'b9', name: 'Banner Style 8', price: 450 }
  ],
  profile: [
    { id: 'gradient-1', name: 'Gradient Frame', price: 200 },
    { id: 'p2', name: 'Profile Frame 2', price: 300 },
    { id: 'p3', name: 'Profile Frame 3', price: 400 }
  ]
};

let currentShopCategory = 'avatar';
let currentUserData = null;

async function initializeShop() {
  try {
    // Fetch fresh user data from API
    const profile = await API.getProfile();
    if (!profile) return;
    
    currentUserData = profile;
    
    // Update local storage with fresh data
    await chrome.storage.local.set({ user: profile });
    
    // Update user info
    document.getElementById('shopUserAvatar').textContent = currentUserData.avatar || '👤';
    document.getElementById('shopUserName').textContent = currentUserData.displayName || currentUserData.username;
    document.getElementById('shopUserLevel').textContent = currentUserData.level || 1;
    document.getElementById('shopUserPoints').textContent = currentUserData.points || 0;
    
    // Load shop items
    await loadShopItems(currentShopCategory);
    
    // Add category button listeners
    document.querySelectorAll('.shop-category-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.shop-category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentShopCategory = btn.dataset.category;
        await loadShopItems(currentShopCategory);
      });
    });
    
    // Update preview with current decorations
    updatePreview();
    
  } catch (error) {
    console.error('Failed to initialize shop:', error);
  }
}

async function loadShopItems(category) {
  const grid = document.getElementById('shopItemsGrid');
  const items = shopItems[category] || [];
  
  // Use current user data which is already fresh from API
  const user = currentUserData;
  if (!user) return;
  
  const purchasedEffects = user.purchasedEffects || [];
  
  let currentEquipped = null;
  if (category === 'avatar') currentEquipped = user.avatarDecoration;
  else if (category === 'banner') currentEquipped = user.nameBanner;
  else if (category === 'profile') currentEquipped = user.profileDecoration;
  
  grid.innerHTML = items.map(item => {
    const isOwned = purchasedEffects.includes(item.id);
    const isEquipped = currentEquipped === item.id;
    
    let folderPath = '';
    if (category === 'avatar') folderPath = 'assets/avatar';
    else if (category === 'banner') folderPath = 'assets/name_banner';
    else if (category === 'profile') folderPath = 'assets/profile';
    
    const imageUrl = chrome.runtime.getURL(`${folderPath}/${item.id}.png`);
    
    return `
      <div class="shop-item ${isOwned ? 'owned' : ''} ${isEquipped ? 'equipped' : ''}" data-item-id="${item.id}" data-category="${category}">
        ${isEquipped ? '<div class="shop-item-status equipped">EQUIPPED</div>' : (isOwned ? '<div class="shop-item-status owned">OWNED</div>' : '')}
        <div class="shop-item-image">
          <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: ${category === 'banner' ? 'cover' : 'contain'};" />
        </div>
        <div style="text-align: center; font-size: 13px; font-weight: 600; color: #ddd; margin-bottom: 4px;">${item.name}</div>
        ${isEquipped ? 
          '<div style="padding: 8px; background: #fbbf24; border-radius: 6px; font-weight: 600; font-size: 13px; color: #000; text-align: center;">EQUIPPED</div>' :
          (isOwned ? 
            '<button class="shop-item-equip-btn" style="width: 100%; padding: 8px; background: #3b82f6; border: none; border-radius: 6px; font-weight: 600; font-size: 13px; color: #fff; cursor: pointer;">EQUIP</button>' :
            `<div class="shop-item-price"><i class="fas fa-coins"></i> ${item.price} Points</div>`
          )
        }
      </div>
    `;
  }).join('');
  
  // Add click listeners
  grid.querySelectorAll('.shop-item').forEach(itemEl => {
    itemEl.addEventListener('click', async (e) => {
      const itemId = itemEl.dataset.itemId;
      const category = itemEl.dataset.category;
      
      if (e.target.classList.contains('shop-item-equip-btn')) {
        await equipItem(itemId, category);
      } else if (!itemEl.classList.contains('owned') && !itemEl.classList.contains('equipped')) {
        await purchaseItem(itemId, category);
      }
    });
    
    // Preview on hover
    itemEl.addEventListener('mouseenter', () => {
      const itemId = itemEl.dataset.itemId;
      const category = itemEl.dataset.category;
      previewItem(itemId, category);
    });
  });
}

async function purchaseItem(itemId, category) {
  const items = shopItems[category];
  const item = items.find(i => i.id === itemId);
  
  if (!item) return;
  
  const userData = await chrome.storage.local.get(['user']);
  const user = userData.user;
  
  if (user.points < item.price) {
    alert(`Not enough points! You need ${item.price} points but have ${user.points} points.`);
    return;
  }
  
  if (confirm(`Purchase ${item.name} for ${item.price} points?`)) {
    try {
      // Add to purchased effects
      const purchasedEffects = user.purchasedEffects || [];
      if (!purchasedEffects.includes(itemId)) {
        purchasedEffects.push(itemId);
      }
      
      // Deduct points
      const newPoints = user.points - item.price;
      
      // Update backend
      const response = await API.request('/users/purchase-effect', {
        method: 'POST',
        body: JSON.stringify({ effectId: itemId, price: item.price })
      });
      
      // Update local storage with response from server
      user.purchasedEffects = response.purchasedEffects || purchasedEffects;
      user.points = response.points || newPoints;
      await chrome.storage.local.set({ user });
      currentUserData = user;
      
      // Refresh shop
      document.getElementById('shopUserPoints').textContent = newPoints;
      await loadShopItems(category);
      
      alert(`Successfully purchased ${item.name}!`);
    } catch (error) {
      console.error('Purchase failed:', error);
      alert('Purchase failed! Please try again.');
    }
  }
}

async function equipItem(itemId, category) {
  try {
    let endpoint = '';
    if (category === 'avatar') endpoint = 'updateAvatarDecoration';
    else if (category === 'banner') endpoint = 'updateNameBanner';
    else if (category === 'profile') endpoint = 'updateProfileDecoration';
    
    if (category === 'avatar') {
      await API.updateAvatarDecoration(itemId);
    } else if (category === 'banner') {
      await API.updateNameBanner(itemId);
    } else if (category === 'profile') {
      await API.updateProfileDecoration(itemId);
    }
    
    // Update local storage
    const userData = await chrome.storage.local.get(['user']);
    if (category === 'avatar') userData.user.avatarDecoration = itemId;
    else if (category === 'banner') userData.user.nameBanner = itemId;
    else if (category === 'profile') userData.user.profileDecoration = itemId;
    
    await chrome.storage.local.set({ user: userData.user });
    currentUserData = userData.user;
    
    // Refresh shop and preview
    await loadShopItems(category);
    updatePreview();
    
    alert('Item equipped successfully!');
  } catch (error) {
    console.error('Equip failed:', error);
    alert('Failed to equip item!');
  }
}

function previewItem(itemId, category) {
  if (category === 'avatar') {
    const decorationUrl = chrome.runtime.getURL(`assets/avatar/${itemId}.png`);
    document.getElementById('previewAvatarDecoration').style.background = `url('${decorationUrl}') center/contain no-repeat`;
    document.getElementById('previewAvatarDecoration').style.pointerEvents = 'none';
  } else if (category === 'banner') {
    const bannerUrl = chrome.runtime.getURL(`assets/name_banner/${itemId}.png`);
    document.getElementById('previewCard').style.background = `url('${bannerUrl}') center/cover`;
    document.getElementById('previewCard').style.backgroundSize = '100% 100%';
    // Keep user info visible
    if (currentUserData) {
      document.getElementById('previewCardAvatar').textContent = currentUserData.avatar || '👤';
      document.getElementById('previewCardName').textContent = currentUserData.displayName || currentUserData.username || 'Your Name';
      document.getElementById('previewCardUsername').textContent = '@' + (currentUserData.username || 'username');
    }
  } else if (category === 'profile') {
    const profileUrl = chrome.runtime.getURL(`assets/profile/${itemId}.png`);
    document.getElementById('previewProfile').style.background = `url('${profileUrl}') center/cover`;
    document.getElementById('previewProfile').style.backgroundSize = '100% 100%';
    document.getElementById('previewProfile').textContent = '';
  }
}

function updatePreview() {
  if (!currentUserData) return;
  
  // Update avatar preview
  document.getElementById('previewAvatar').textContent = currentUserData.avatar || '👤';
  if (currentUserData.avatarDecoration) {
    const decorationUrl = chrome.runtime.getURL(`assets/avatar/${currentUserData.avatarDecoration}.png`);
    document.getElementById('previewAvatarDecoration').style.background = `url('${decorationUrl}') center/contain no-repeat`;
  } else {
    document.getElementById('previewAvatarDecoration').style.background = 'none';
  }
  
  // Update card preview with user's actual info
  document.getElementById('previewCardAvatar').textContent = currentUserData.avatar || '👤';
  document.getElementById('previewCardName').textContent = currentUserData.displayName || currentUserData.username || 'Your Name';
  document.getElementById('previewCardUsername').textContent = '@' + (currentUserData.username || 'username');
  
  if (currentUserData.nameBanner) {
    const bannerUrl = chrome.runtime.getURL(`assets/name_banner/${currentUserData.nameBanner}.png`);
    document.getElementById('previewCard').style.background = `url('${bannerUrl}') center/cover`;
    document.getElementById('previewCard').style.backgroundSize = '100% 100%';
  } else {
    document.getElementById('previewCard').style.background = '#141414';
  }
  
  // Update profile preview
  if (currentUserData.profileDecoration) {
    const profileUrl = chrome.runtime.getURL(`assets/profile/${currentUserData.profileDecoration}.png`);
    document.getElementById('previewProfile').style.background = `url('${profileUrl}') center/cover`;
    document.getElementById('previewProfile').style.backgroundSize = '100% 100%';
    document.getElementById('previewProfile').textContent = '';
  } else {
    document.getElementById('previewProfile').style.background = '#141414';
    document.getElementById('previewProfile').textContent = 'Profile Frame';
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (chatSocket) {
    chatSocket.disconnect();
  }
});
