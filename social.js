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
    
    container.innerHTML = friends.map(friend => `
      <div class="friend-card" data-username="${friend.username}" style="cursor: pointer;">
        <div class="friend-avatar">${friend.avatar || '👤'}</div>
        <div class="friend-info">
          <div class="friend-name">${friend.displayName}</div>
          <div class="friend-username">@${friend.username}</div>
          <div class="friend-activity">
            <span class="activity-indicator ${getActivityStatus(friend)}"></span>
            ${getActivityText(friend)}
          </div>
        </div>
        <div class="friend-stats">
          <div class="friend-stat">Level <strong>${friend.level || 1}</strong></div>
          <div class="friend-stat"><strong>${friend.stats?.totalFocusTime || 0}</strong> min focused</div>
        </div>
        <button class="btn-remove" data-id="${friend.userId}">Remove</button>
      </div>
    `).join('');
    
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
  
  if (activity.status === 'youtube' && activity.videoTitle) {
    return `📺 ${activity.videoTitle.substring(0, 40)}${activity.videoTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'youtube') {
    return '📺 Watching YouTube';
  }
  
  if (activity.currentUrl) {
    const url = activity.currentUrl || '';
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
            <div class="friend-name">${req.displayName || req.username}</div>
            <div class="friend-username">@${req.username}</div>
            <div style="font-size: 11px; color: #888; margin-top: 4px;">
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
            <div class="friend-name">${req.displayName || req.username}</div>
            <div class="friend-username">@${req.username}</div>
            <div style="font-size: 11px; color: #888; margin-top: 4px;">
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
    const leaderboard = await API.getLeaderboard(50);
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
      
      return `
        <div class="leaderboard-item" style="${isCurrentUser ? 'border-color: #4a9eff;' : ''}">
          <div class="leaderboard-rank ${rankClass}">#${rank}</div>
          <div class="friend-avatar">${user.avatar || '👤'}</div>
          <div class="friend-info">
            <div class="friend-name">
              ${user.displayName}
              ${isCurrentUser ? '<span style="color: #4a9eff; font-size: 11px;">(You)</span>' : ''}
            </div>
            <div class="friend-username">@${user.username}</div>
          </div>
          <div class="friend-stats">
            <div class="friend-stat">Level <strong>${user.level || 1}</strong></div>
            <div class="friend-stat"><strong>${user.points || 0}</strong> points</div>
            <div class="friend-stat"><strong>${user.stats?.totalFocusTime || 0}</strong> min</div>
          </div>
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
    
    container.innerHTML = activity.map(friend => `
      <div class="friend-card">
        <div class="friend-avatar">${friend.avatar || '👤'}</div>
        <div class="friend-info">
          <div class="friend-name">${friend.displayName}</div>
          <div class="friend-activity">
            <span class="activity-indicator ${getActivityStatus(friend)}"></span>
            ${getActivityText(friend)}
          </div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">
            ${getTimeAgo(friend.activity?.lastUpdated)}
          </div>
        </div>
      </div>
    `).join('');
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
  
  if (activity.status === 'youtube' && activity.videoTitle) {
    return `📺 Watching: ${activity.videoTitle}`;
  }
  
  if (activity.currentUrl) {
    const domain = activity.currentUrl.match(/https?:\/\/([^\/]+)/)?.[1] || 'web';
    return `🌐 Browsing ${domain}`;
  }
  
  return 'Online';
}

// Profile Modal Functions
async function viewProfile(username) {
  const modal = document.getElementById('profileModal');
  const content = document.getElementById('profileContent');
  
  modal.style.display = 'flex';
  content.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Loading profile...</div>';
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/profile/${username}`, {
      headers: {
        'Authorization': `Bearer ${await API.getToken()}`
      }
    });
    
    const profile = await response.json();
    
    const isOnline = profile.isOnline;
    const lastSeen = profile.lastSeen ? getTimeAgo(profile.lastSeen) : 'Unknown';
    
    content.innerHTML = `
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="position: relative; display: inline-block; margin-bottom: 16px;">
          <div style="font-size: 80px; line-height: 1;">${profile.avatar || '👤'}</div>
          <div style="position: absolute; bottom: 4px; right: 4px; width: 20px; height: 20px; background: ${isOnline ? '#22c55e' : '#64748b'}; border: 3px solid #1a1a1a; border-radius: 50%; box-shadow: 0 0 0 2px ${isOnline ? '#22c55e' : '#64748b'};"></div>
        </div>
        <h2 style="font-size: 28px; font-weight: 700; margin: 0 0 6px 0; background: linear-gradient(135deg, #4a9eff 0%, #5da8ff 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${profile.displayName}</h2>
        <div style="color: #888; font-size: 15px; margin-bottom: 12px;">@${profile.username}</div>
        <div style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: ${isOnline ? 'linear-gradient(135deg, #166534 0%, #15803d 100%)' : 'rgba(30,30,30,0.8)'}; border-radius: 20px; font-size: 13px; font-weight: 600; border: 1px solid ${isOnline ? '#22c55e' : '#333'};">
          <span style="width: 8px; height: 8px; background: ${isOnline ? '#22c55e' : '#64748b'}; border-radius: 50%; ${isOnline ? 'animation: pulse 2s infinite;' : ''}"></span>
          ${isOnline ? 'Online Now' : `Last seen ${lastSeen}`}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px;">
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 20px 16px; border-radius: 12px; text-align: center; border: 1px solid rgba(74, 158, 255, 0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          <div style="font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #4a9eff 0%, #22d3ee 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${profile.level || 1}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Level</div>
        </div>
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 20px 16px; border-radius: 12px; text-align: center; border: 1px solid rgba(74, 158, 255, 0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          <div style="font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${profile.points || 0}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Points</div>
        </div>
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 20px 16px; border-radius: 12px; text-align: center; border: 1px solid rgba(251, 113, 133, 0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          <div style="font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #fb7185 0%, #f43f5e 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${profile.streak?.current || 0}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">🔥 Streak</div>
        </div>
      </div>

      <div style="background: rgba(15, 23, 42, 0.6); padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #1e293b; backdrop-filter: blur(10px);">
        <h3 style="font-size: 13px; margin: 0 0 16px 0; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">📊 Statistics</h3>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #1e293b;">
          <span style="color: #cbd5e1; font-size: 14px;">⏱️ Total Focus Time</span>
          <strong style="color: #4a9eff; font-size: 16px; font-weight: 700;">${profile.stats?.totalFocusTime || 0} min</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #1e293b;">
          <span style="color: #cbd5e1; font-size: 14px;">✅ Sessions Completed</span>
          <strong style="color: #22c55e; font-size: 16px; font-weight: 700;">${profile.stats?.sessionsCompleted || 0}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #1e293b;">
          <span style="color: #cbd5e1; font-size: 14px;">🚫 Sites Blocked</span>
          <strong style="color: #fb7185; font-size: 16px; font-weight: 700;">${profile.stats?.sitesBlocked || 0}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #cbd5e1; font-size: 14px;">🏆 Longest Streak</span>
          <strong style="color: #fbbf24; font-size: 16px; font-weight: 700;">${profile.streak?.longest || 0} days</strong>
        </div>
      </div>

      ${profile.badges && profile.badges.length > 0 ? `
        <div style="background: rgba(15, 23, 42, 0.6); padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #1e293b; backdrop-filter: blur(10px);">
          <h3 style="font-size: 13px; margin: 0 0 16px 0; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">🏅 Achievements (${profile.badges.length})</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;">
            ${profile.badges.map(badge => {
              const badgeInfo = getBadgeInfo(badge);
              return `<div class="profile-badge" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 16px 12px; border-radius: 12px; text-align: center; border: 2px solid ${badgeInfo.color || '#2a2a2a'}; box-shadow: 0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s; cursor: pointer;" title="${badgeInfo.description}"><div style="font-size: 32px; margin-bottom: 8px;">${badgeInfo.icon}</div><div style="font-size: 12px; font-weight: 600; color: #e2e8f0;">${badgeInfo.name}</div></div>`;
            }).join('')}
          </div>
        </div>
      ` : '<div style="background: rgba(15, 23, 42, 0.4); padding: 24px; border-radius: 12px; margin-bottom: 20px; border: 1px dashed #2a2a2a; text-align: center;"><div style="font-size: 40px; margin-bottom: 8px; opacity: 0.5;">🏅</div><div style="color: #64748b; font-size: 14px;">No badges earned yet</div></div>'}

      ${(isOnline || profile.activity?.focusActive) && profile.activity?.status && profile.activity.status !== 'offline' ? `
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); padding: 24px; border-radius: 12px; border: 1px solid #2563eb; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.2);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <h3 style="font-size: 14px; margin: 0; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">⚡ Live Activity</h3>
            ${profile.activity.focusActive ? `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border-radius: 20px; font-size: 12px; font-weight: 700; color: white; box-shadow: 0 0 20px rgba(220, 38, 38, 0.5); animation: pulse 2s infinite;">
              <span style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: pulse 1s infinite;"></span>
              IN FOCUS MODE
            </span>` : ''}
          </div>
          
          <div style="display: flex; align-items: center; gap: 12px; padding: 14px; background: rgba(0,0,0,0.3); border-radius: 10px; margin-bottom: 16px;">
            <span class="activity-indicator ${profile.activity.focusActive ? 'focusing' : profile.activity.status}" style="width: 14px; height: 14px; flex-shrink: 0;"></span>
            <div style="flex: 1;">
              <div style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin-bottom: 4px;">${getActivityTextFromData(profile.activity)}</div>
              ${profile.activity.focusActive ? `<div style="color: #94a3b8; font-size: 12px;">🎯 Deep focus session active</div>` : ''}
            </div>
          </div>
          
          ${profile.activity.videoTitle && profile.activity.videoThumbnail ? `
            ${profile.activity.videoThumbnail === '📄' ? `
              <!-- PDF Display -->
              <div style="margin-top: 16px; background: linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); padding: 20px;">
                ${profile.activity.focusActive ? `<div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(220, 38, 38, 0.95); border-radius: 20px; font-size: 11px; font-weight: 700; color: white; margin-bottom: 16px;">🎯 FOCUSING</div>` : ''}
                <div style="display: flex; align-items: center; gap: 16px;">
                  <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 48px; flex-shrink: 0;">📄</div>
                  <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                      <div style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%; animation: pulse 2s infinite;"></div>
                      <span style="color: #fca5a5; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Reading PDF</span>
                    </div>
                    <div style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin-bottom: 10px; line-height: 1.4;">${profile.activity.videoTitle}</div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div style="color: #94a3b8; font-size: 12px;">📖 Document</div>
                    </div>
                  </div>
                </div>
              </div>
            ` : `
              <!-- YouTube Display -->
              <div style="margin-top: 16px; background: linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); transition: transform 0.2s; cursor: pointer;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                <div style="position: relative;">
                  <img src="${profile.activity.videoThumbnail}" alt="Video thumbnail" style="width: 100%; height: auto; display: block;">
                  ${profile.activity.focusActive ? `<div style="position: absolute; top: 8px; right: 8px; background: rgba(220, 38, 38, 0.95); padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; color: white; backdrop-filter: blur(10px);">🎯 FOCUSING</div>` : ''}
                  <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); padding: 20px 16px 12px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                      <div style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%; animation: pulse 2s infinite;"></div>
                      <span style="color: #fca5a5; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Now Watching</span>
                    </div>
                  </div>
                </div>
                <div style="padding: 16px;">
                  <div style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin-bottom: 10px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${profile.activity.videoTitle}</div>
                  ${profile.activity.videoChannel ? `
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px;">📺</div>
                      <div>
                        <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Channel</div>
                        <div style="color: #cbd5e1; font-size: 13px; font-weight: 600;">${profile.activity.videoChannel}</div>
                      </div>
                    </div>
                  ` : ''}
                </div>
              </div>
            `}
          ` : profile.activity.videoTitle ? `<div style="color: #94a3b8; font-size: 13px; margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; border-left: 3px solid #4a9eff;">📺 ${profile.activity.videoTitle}</div>` : ''}
        </div>
      ` : ''}
    `;
    
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
    'first-session': { icon: '🎯', name: 'First Steps', description: 'Completed first focus session', color: '#4a9eff' },
    'streak-master': { icon: '🔥', name: 'Streak Master', description: '7-day streak achieved', color: '#fb7185' },
    'focus-champion': { icon: '⭐', name: 'Focus Champion', description: '100+ hours focused', color: '#fbbf24' },
    'early-bird': { icon: '🌅', name: 'Early Bird', description: 'Focused before 8 AM', color: '#22d3ee' },
    'night-owl': { icon: '🦉', name: 'Night Owl', description: 'Focused after 10 PM', color: '#a78bfa' },
    'social-butterfly': { icon: '👥', name: 'Social Butterfly', description: '10+ friends added', color: '#22c55e' },
    'focus-warrior': { icon: '⚔️', name: 'Focus Warrior', description: '50 sessions completed', color: '#ef4444' },
    'productivity-king': { icon: '👑', name: 'Productivity King', description: 'Reached level 10', color: '#fbbf24' }
  };
  return badges[badgeId] || { icon: '🏅', name: badgeId, description: 'Achievement unlocked', color: '#4a9eff' };
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
      container.innerHTML = '';
      messages.forEach(msg => addMessageToChat(msg, false));
      scrollToBottom();
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
        
        const sendMessage = () => {
          const message = chatInput.value.trim();
          console.log('📤 Attempting to send message:', message);
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
        console.log('✅ Chat input handlers attached');
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

function addMessageToChat(message, scroll = true) {
  const container = document.getElementById('chatMessages');
  
  // Remove welcome message if it exists
  const welcome = container.querySelector('.chat-welcome');
  if (welcome) {
    welcome.remove();
  }

  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  
  const time = new Date(message.timestamp || Date.now());
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageEl.innerHTML = `
    <div class="message-avatar">${message.avatar || '👤'}</div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-author">${message.displayName || message.username}</span>
        <span class="message-time">${timeStr}</span>
      </div>
      <div class="message-text">${escapeHtml(message.text)}</div>
    </div>
  `;
  
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
  
  container.innerHTML = usersArray.map(user => `
    <div class="online-user">
      <div class="online-user-avatar">${user.avatar || '👤'}</div>
      <div class="online-user-info">
        <div class="online-user-name">${user.displayName || user.username}</div>
      </div>
      <div class="online-indicator-small"></div>
    </div>
  `).join('');
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

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (chatSocket) {
    chatSocket.disconnect();
  }
});
