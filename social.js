// Social.js - Friends and leaderboard logic with API integration

// API Configuration
const API_BASE_URL = 'https://focus-backend-g1zg.onrender.com';

async function send(msg) {
  return new Promise((res) => chrome.runtime.sendMessage(msg, res));
}

// Privacy: Check if URL is safe to share (public sites like YouTube, not private sites like Meet/Zoom)
function isPublicURL(url) {
  if (!url) return false;
  
  const lowerUrl = url.toLowerCase();
  
  // Public sites that are safe to show exact URLs
  const publicDomains = [
    'youtube.com',
    'youtu.be',
    'wikipedia.org',
    'github.com',
    'stackoverflow.com',
    'reddit.com',
    'twitter.com',
    'x.com',
    'getmarks.app',  // GetMarks educational app
    'spotify.com',   // Spotify
    'netflix.com',   // Netflix
    'instagram.com', // Instagram
    'facebook.com',  // Facebook
    'tiktok.com',    // TikTok
    'linkedin.com'   // LinkedIn
  ];
  
  // Private/sensitive sites that should be hidden
  const privateDomains = [
    'meet.google.com',
    'zoom.us',
    'teams.microsoft.com',
    'webex.com',
    'whereby.com',
    'discord.com/channels',
    'slack.com'
  ];
  
  // Check if URL contains any private domain - hide it
  for (const domain of privateDomains) {
    if (lowerUrl.includes(domain)) {
      return false;
    }
  }
  
  // Check if URL contains any public domain - show it
  for (const domain of publicDomains) {
    if (lowerUrl.includes(domain)) {
      return true;
    }
  }
  
  // Default: hide for privacy
  return false;
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

// Toast notification function
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#3b82f6'
  };
  
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colors[type] || colors.info};
    color: white;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    font-size: 14px;
    animation: slideIn 0.3s ease-out;
  `;
  
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add friend (send friend request)
document.getElementById('addFriendBtn').addEventListener('click', async () => {
  const username = document.getElementById('friendUsername').value.trim();
  if (!username) return;
  
  try {
    const result = await API.addFriend(username);
    document.getElementById('friendUsername').value = '';
    
    if (result.status === 'pending') {
      showToast(result.message || 'Friend request sent!', 'success');
    } else if (result.status === 'accepted') {
      showToast(result.message || 'You are now friends!', 'success');
      loadFriends();
    }
    
    // Reload requests tab if visible
    if (document.querySelector('.tab[data-tab="requests"]')?.classList.contains('active')) {
      loadFriendRequests();
    }
  } catch (error) {
    showToast(error.message || 'Failed to send friend request', 'error');
  }
});

function showRemoveConfirmation(friendId, friendName) {
  const modal = document.createElement('div');
  modal.className = 'remove-confirmation-modal';
  modal.innerHTML = `
    <div class="remove-confirmation-content">
      <div class="remove-confirmation-icon">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h3>Remove Friend?</h3>
      <p>Are you sure you want to remove <strong>${friendName}</strong> from your friends list?</p>
      <div class="remove-confirmation-buttons">
        <button class="btn-cancel">Cancel</button>
        <button class="btn-confirm-remove">Remove</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Animate in
  setTimeout(() => modal.classList.add('show'), 10);
  
  // Cancel button
  modal.querySelector('.btn-cancel').addEventListener('click', () => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  });
  
  // Confirm remove button
  modal.querySelector('.btn-confirm-remove').addEventListener('click', async () => {
    try {
      await API.removeFriend(friendId);
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
      showToast(`Removed ${friendName} from friends`, 'success');
      loadFriends();
    } catch (error) {
      showToast('Failed to remove friend', 'error');
    }
  });
  
  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    }
  });
}

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
      
      const isAnimated = isAnimatedBanner(friend.nameBanner);
      const bannerHTML = getNameBannerHTML(friend.nameBanner);
      const cardStyle = friend.nameBanner ? `
        cursor: pointer;
        ${!isAnimated ? `background: url('${chrome.runtime.getURL(`assets/name_banner/${friend.nameBanner}.png`)}') center/cover; background-size: 100% 100%;` : 'position: relative; overflow: hidden;'}
      ` : 'cursor: pointer;';
      
      return `
        <div class="friend-card" data-username="${friend.username}" style="${cardStyle}">
          ${bannerHTML}
          <div style="position: relative; z-index: 1; display: flex; align-items: center; gap: 14px; flex: 1;">
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
          </div>
          <div class="friend-stats" style="position: relative; z-index: 1; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; margin-right: 30px;">
            <div class="friend-stat" style="color: #ffffff; text-shadow: 0 0 12px rgba(0,0,0,1), 0 0 24px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.8); background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 8px; backdrop-filter: blur(4px); font-size: 12px;">Level <strong style="color: #3b82f6; text-shadow: 0 0 12px rgba(59, 130, 246, 1), 0 0 24px rgba(59, 130, 246, 0.8); font-size: 14px;">${friend.level || 1}</strong></div>
            <div class="friend-stat" style="color: #ffffff; text-shadow: 0 0 12px rgba(0,0,0,1), 0 0 24px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.8); background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 8px; backdrop-filter: blur(4px); font-size: 12px;"><strong style="color: #10b981; text-shadow: 0 0 12px rgba(16, 185, 129, 1), 0 0 24px rgba(16, 185, 129, 0.8); font-size: 14px;">${friend.stats?.totalFocusTime || 0}</strong> min</div>
          </div>
          <button class="friend-menu-btn" data-id="${friend.userId}" data-name="${friend.displayName}">
            <i class="fas fa-ellipsis-v"></i>
          </button>
          <div class="friend-menu hidden" data-id="${friend.userId}">
            <div class="friend-menu-item nudge-option" data-id="${friend.userId}" data-name="${friend.displayName}">
              <i class="fas fa-hand-point-right"></i> Nudge
            </div>
            <div class="friend-menu-item remove-option" data-id="${friend.userId}" data-name="${friend.displayName}">
              <i class="fas fa-user-minus"></i> Remove
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click listeners for profile viewing
    document.querySelectorAll('.friend-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.friend-menu-btn') && !e.target.closest('.friend-menu')) {
          viewProfile(card.dataset.username);
        }
      });
    });
    
    // Add three-dots menu listeners
    document.querySelectorAll('.friend-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const friendId = btn.dataset.id;
        const menu = document.querySelector(`.friend-menu[data-id="${friendId}"]`);
        
        // Close all other menus
        document.querySelectorAll('.friend-menu').forEach(m => {
          if (m !== menu) m.classList.add('hidden');
        });
        
        // Position menu relative to button with proper calculation
        const rect = btn.getBoundingClientRect();
        const menuHeight = 100; // Approximate menu height
        const spaceBelow = window.innerHeight - rect.bottom;
        
        // Position below button if there's space, otherwise above
        if (spaceBelow > menuHeight) {
          menu.style.top = `${rect.bottom + 8}px`;
          menu.style.bottom = 'auto';
        } else {
          menu.style.top = 'auto';
          menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
        }
        
        menu.style.left = 'auto';
        menu.style.right = `${window.innerWidth - rect.right}px`;
        
        // Toggle this menu
        menu.classList.toggle('hidden');
      });
    });
    
    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.friend-menu') && !e.target.closest('.friend-menu-btn')) {
        document.querySelectorAll('.friend-menu').forEach(m => m.classList.add('hidden'));
      }
    });
    
    // Add nudge option listeners
    document.querySelectorAll('.nudge-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const friendId = option.dataset.id;
        const friendName = option.dataset.name;
        document.querySelector(`.friend-menu[data-id="${friendId}"]`).classList.add('hidden');
        sendNudge(friendId, friendName);
      });
    });
    
    // Add remove option listeners with confirmation
    document.querySelectorAll('.remove-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const friendId = option.dataset.id;
        const friendName = option.dataset.name;
        document.querySelector(`.friend-menu[data-id="${friendId}"]`).classList.add('hidden');
        showRemoveConfirmation(friendId, friendName);
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
  
  // If user is online and not focusing, show them as online
  return 'online';
}

// Helper function to clean video titles (remove notification counts)
function cleanVideoTitle(title) {
  if (!title) return title;
  // Remove notification count like "(127) " from the beginning
  return title.replace(/^\(\d+\)\s*/, '').trim();
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
    return '◉ In focus session';
  }
  
  // Privacy check: Don't show title for private URLs (Meet, Zoom, etc.)
  const isPrivateUrl = activity.currentUrl && !isPublicURL(activity.currentUrl);
  
  // Enhanced activity display
  if (activity.activityType && activity.videoTitle && !isPrivateUrl) {
    const icon = activity.videoThumbnail && typeof activity.videoThumbnail === 'string' && activity.videoThumbnail.length <= 2 
      ? activity.videoThumbnail 
      : '▶';
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `${icon} ${activity.activityType}: ${cleanTitle.substring(0, 35)}${cleanTitle.length > 35 ? '...' : ''}`;
  }
  
  if (activity.status === 'studying' && activity.videoTitle && !isPrivateUrl) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `▶ ${cleanTitle.substring(0, 40)}${cleanTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'youtube' && activity.videoTitle && !isPrivateUrl) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `▶ ${cleanTitle.substring(0, 40)}${cleanTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'youtube-shorts' && activity.videoTitle && !isPrivateUrl) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `▶ ${cleanTitle.substring(0, 40)}${cleanTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'reading' && activity.videoTitle && !isPrivateUrl) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `◐ ${cleanTitle.substring(0, 40)}${cleanTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'searching' && activity.videoTitle && !isPrivateUrl) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `◕ ${cleanTitle.substring(0, 40)}${cleanTitle.length > 40 ? '...' : ''}`;
  }
  
  if (activity.status === 'youtube') {
    return '▶ Watching YouTube';
  }
  
  if (activity.status === 'studying') {
    return '▶ Studying';
  }
  
  if (activity.status === 'social-media') {
    return '⊕ Scrolling Social Media';
  }
  
  // Custom labels for common websites
  if (activity.currentUrl) {
    const url = activity.currentUrl || '';
    const lowerUrl = url.toLowerCase();
    
    // Privacy: Show only platform name for private meeting sites
    if (lowerUrl.includes('meet.google.com')) {
      return '<i class="fas fa-video"></i> Google Meet';
    }
    if (lowerUrl.includes('zoom.us')) {
      return '<i class="fas fa-video"></i> Zoom';
    }
    if (lowerUrl.includes('teams.microsoft.com')) {
      return '<i class="fas fa-video"></i> Microsoft Teams';
    }
    if (lowerUrl.includes('webex.com')) {
      return '<i class="fas fa-video"></i> Webex';
    }
    if (lowerUrl.includes('whereby.com')) {
      return '<i class="fas fa-video"></i> Whereby';
    }
    if (lowerUrl.includes('discord.com/channels')) {
      return '<i class="fab fa-discord"></i> Discord Call';
    }
    if (lowerUrl.includes('slack.com/call')) {
      return '<i class="fab fa-slack"></i> Slack Call';
    }
    
    // Google
    if (lowerUrl.includes('google.com')) {
      if (lowerUrl.includes('/search')) {
        return '<i class="fas fa-search"></i> Googling...';
      }
      return '<i class="fab fa-google"></i> On Google';
    }
    
    // Social Media
    if (lowerUrl.includes('instagram.com')) {
      if (lowerUrl.includes('/reel')) return '<i class="fab fa-instagram"></i> Watching Reels';
      if (lowerUrl.includes('/stories')) return '<i class="fab fa-instagram"></i> Checking Stories';
      return '<i class="fab fa-instagram"></i> Scrolling Instagram';
    }
    
    if (lowerUrl.includes('facebook.com')) {
      return '<i class="fab fa-facebook"></i> On Facebook';
    }
    
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
      return '<i class="fab fa-twitter"></i> Scrolling X (Twitter)';
    }
    
    if (lowerUrl.includes('reddit.com')) {
      return '<i class="fab fa-reddit"></i> Browsing Reddit';
    }
    
    if (lowerUrl.includes('tiktok.com')) {
      return '<i class="fab fa-tiktok"></i> Watching TikTok';
    }
    
    if (lowerUrl.includes('snapchat.com')) {
      return '<i class="fab fa-snapchat"></i> On Snapchat';
    }
    
    if (lowerUrl.includes('linkedin.com')) {
      return '<i class="fab fa-linkedin"></i> Networking on LinkedIn';
    }
    
    if (lowerUrl.includes('pinterest.com')) {
      return '<i class="fab fa-pinterest"></i> Pinning Ideas';
    }
    
    // Entertainment
    if (lowerUrl.includes('netflix.com')) {
      return '<i class="fas fa-film"></i> Watching Netflix';
    }
    
    if (lowerUrl.includes('spotify.com')) {
      // Show song name if available in videoTitle
      if (activity.videoTitle && !isPrivateUrl) {
        const cleanTitle = cleanVideoTitle(activity.videoTitle);
        return `<i class="fab fa-spotify"></i> ${cleanTitle}`;
      }
      return '<i class="fab fa-spotify"></i> Listening to Spotify';
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
          <div class="empty-state-icon"><i class="fas fa-inbox" style="font-size: 48px; opacity: 0.3;"></i></div>
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
              <i class="fas fa-calendar-alt"></i> ${new Date(req.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div class="friend-actions">
            <button class="accept-request-btn" data-username="${req.username}">
              <i class="fas fa-check"></i> Accept
            </button>
            <button class="reject-request-btn" data-username="${req.username}">
              <i class="fas fa-times"></i> Reject
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
          <div class="empty-state-icon"><i class="fas fa-paper-plane" style="font-size: 48px; opacity: 0.3;"></i></div>
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
              <i class="fas fa-clock"></i> Sent ${new Date(req.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div class="friend-actions">
            <button class="withdraw-request-btn" data-username="${req.username}" style="
              background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              color: white;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.3s ease;
              display: flex;
              align-items: center;
              gap: 6px;
            ">
              <i class="fas fa-undo"></i> Withdraw
            </button>
          </div>
        </div>
      `).join('');
      
      // Add event listeners for withdraw buttons
      document.querySelectorAll('.withdraw-request-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const username = e.target.closest('.withdraw-request-btn').dataset.username;
          if (confirm(`Withdraw friend request to @${username}?`)) {
            try {
              // Use reject endpoint with withdraw parameter
              await API.rejectFriendRequest(username, true);
              showToast('Friend request withdrawn', 'success');
              loadFriendRequests();
            } catch (error) {
              console.error('Withdraw error:', error);
              showToast('Failed to withdraw request', 'error');
            }
          }
        });
      });
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
          <div class="empty-state-icon"><i class="fas fa-trophy"></i></div>
          <p>No users yet. Be the first to compete!</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = leaderboard.map((user, index) => {
      const rank = index + 1;
      const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
      const isCurrentUser = currentUser && user.userId === currentUser.userId;
      const rankIcon = rank === 1 ? '1' : rank === 2 ? '2' : rank === 3 ? '3' : rank;
      
      let itemStyle = isCurrentUser ? 'border-color: #3b82f6; background: rgba(59, 130, 246, 0.05);' : '';
      
      // Apply name banner as card background
      const isAnimated = isAnimatedBanner(user.nameBanner);
      if (user.nameBanner) {
        if (isAnimated) {
          itemStyle = `position: relative; overflow: hidden;${isCurrentUser ? ' border-color: #3b82f6;' : ''}`;
        } else {
          itemStyle = `background: url('${chrome.runtime.getURL(`assets/name_banner/${user.nameBanner}.png`)}') center/cover; background-size: 100% 100%;${isCurrentUser ? ' border-color: #3b82f6;' : ''}`;
        }
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
        ${user.nameBanner && isAnimated ? getNameBannerHTML(user.nameBanner) : ''}
        <div class="leaderboard-rank ${rankClass}" style="position: relative; z-index: 1;">${rankIcon}</div>
        <div style="position: relative; z-index: 1;">${avatarContent}</div>
        <div class="friend-info" style="position: relative; z-index: 1;">
          <div class="friend-name">
            ${user.displayName}
            ${isCurrentUser ? '<span style="color: #3b82f6; font-size: 11px; font-weight: 600;">(You)</span>' : ''}
          </div>
          <div class="friend-username">@${user.username}</div>
        </div>
        <div class="friend-stats" style="position: relative; z-index: 2;">
          <div class="friend-stat" style="color: #ffffff; text-shadow: 0 0 12px rgba(0,0,0,1), 0 0 24px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.8); background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 6px; backdrop-filter: blur(4px);">Lv <strong style="color: #ffffff; text-shadow: 0 0 12px rgba(59, 130, 246, 1), 0 0 24px rgba(59, 130, 246, 0.8);">${user.level || 1}</strong></div>
          <div class="friend-stat" style="color: #ffffff; text-shadow: 0 0 12px rgba(0,0,0,1), 0 0 24px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.8); background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 6px; backdrop-filter: blur(4px);"><strong style="color: #fbbf24; text-shadow: 0 0 12px rgba(251, 191, 36, 1), 0 0 24px rgba(251, 191, 36, 0.8);">${user.points || 0}</strong> pts</div>
          <div class="friend-stat" style="color: #ffffff; text-shadow: 0 0 12px rgba(0,0,0,1), 0 0 24px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.8); background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 6px; backdrop-filter: blur(4px);"><strong style="color: #10b981; text-shadow: 0 0 12px rgba(16, 185, 129, 1), 0 0 24px rgba(16, 185, 129, 0.8);">${user.stats?.totalFocusTime || 0}</strong> min</div>
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
          <div class="empty-state-icon"><i class="fas fa-chart-line"></i></div>
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
      const isAnimated = isAnimatedBanner(friend.nameBanner);
      const bannerHTML = getNameBannerHTML(friend.nameBanner);
      const nameBannerStyle = friend.nameBanner ? (isAnimated ? 'position: relative; overflow: hidden;' : `background: url('${chrome.runtime.getURL(`assets/name_banner/${friend.nameBanner}.png`)}') center/cover; background-size: 100% 100%;`) : '';
      
      return `
      <div class="friend-card" style="${nameBannerStyle}">
        ${bannerHTML}
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
    return '<i class="fas fa-circle-notch fa-spin" style="color: #dc2626;"></i> In focus session';
  }
  
  // Enhanced activity display with activityType
  if (activity.activityType && activity.videoTitle) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    
    // Special handling for Searching - videoTitle already contains "Searching: query"
    if (activity.activityType === 'Searching') {
      return `<i class="fas fa-search" style="color: #3b82f6;"></i> ${cleanTitle}`;
    }
    
    // For other activities with activityType, use appropriate icons
    let icon = '<i class="fas fa-play-circle" style="color: #ef4444;"></i>'; // Default for videos
    if (activity.activityType.includes('Studying') || activity.activityType.includes('Reading')) {
      icon = '<i class="fas fa-book-open" style="color: #10b981;"></i>';
    } else if (activity.activityType.includes('Watching')) {
      icon = '<i class="fas fa-play-circle" style="color: #ef4444;"></i>';
    } else if (activity.activityType.includes('Browsing')) {
      icon = '<i class="fas fa-globe" style="color: #8b5cf6;"></i>';
    }
    
    return `${icon} ${activity.activityType}: ${cleanTitle}`;
  }
  
  if (activity.status === 'studying' && activity.videoTitle) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `<i class="fas fa-book-open" style="color: #10b981;"></i> Studying: ${cleanTitle}`;
  }
  
  if (activity.status === 'youtube' && activity.videoTitle) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `<i class="fas fa-play-circle" style="color: #ef4444;"></i> Watching: ${cleanTitle}`;
  }
  
  if (activity.status === 'youtube-shorts' && activity.videoTitle) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `<i class="fas fa-mobile-alt" style="color: #ef4444;"></i> Watching Short: ${cleanTitle}`;
  }
  
  if (activity.status === 'reading' && activity.videoTitle) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `<i class="fas fa-book-reader" style="color: #10b981;"></i> Reading: ${cleanTitle}`;
  }
  
  if (activity.status === 'searching' && activity.videoTitle) {
    const cleanTitle = cleanVideoTitle(activity.videoTitle);
    return `<i class="fas fa-search" style="color: #3b82f6;"></i> ${cleanTitle}`;
  }
  
  if (activity.status === 'studying') {
    return '<i class="fas fa-book-open" style="color: #10b981;"></i> Studying';
  }
  
  if (activity.status === 'social-media') {
    return '<i class="fas fa-share-alt" style="color: #8b5cf6;"></i> Scrolling Social Media';
  }
  
  // Custom labels for common websites
  if (activity.currentUrl) {
    const url = activity.currentUrl || '';
    const lowerUrl = url.toLowerCase();
    
    // Privacy: Show only platform name for private meeting sites
    if (lowerUrl.includes('meet.google.com')) {
      return '<i class="fas fa-video" style="color: #10b981;"></i> Google Meet';
    }
    if (lowerUrl.includes('zoom.us')) {
      return '<i class="fas fa-video" style="color: #3b82f6;"></i> Zoom';
    }
    if (lowerUrl.includes('teams.microsoft.com')) {
      return '<i class="fas fa-video" style="color: #6264a7;"></i> Microsoft Teams';
    }
    if (lowerUrl.includes('webex.com')) {
      return '<i class="fas fa-video" style="color: #10b981;"></i> Webex';
    }
    if (lowerUrl.includes('whereby.com')) {
      return '<i class="fas fa-video" style="color: #3b82f6;"></i> Whereby';
    }
    if (lowerUrl.includes('discord.com/channels')) {
      return '<i class="fab fa-discord" style="color: #5865f2;"></i> Discord Call';
    }
    if (lowerUrl.includes('slack.com/call')) {
      return '<i class="fab fa-slack" style="color: #4a154b;"></i> Slack Call';
    }
    
    // Google
    if (lowerUrl.includes('google.com')) {
      if (lowerUrl.includes('/search')) {
        return '<i class="fas fa-search" style="color: #3b82f6;"></i> Googling...';
      }
      return '<i class="fab fa-google" style="color: #4285f4;"></i> On Google';
    }
    
    // Social Media
    if (lowerUrl.includes('instagram.com')) {
      if (lowerUrl.includes('/reel')) return '<i class="fab fa-instagram" style="color: #e4405f;"></i> Watching Reels';
      if (lowerUrl.includes('/stories')) return '<i class="fab fa-instagram" style="color: #e4405f;"></i> Checking Stories';
      return '<i class="fab fa-instagram" style="color: #e4405f;"></i> Scrolling Instagram';
    }
    
    if (lowerUrl.includes('facebook.com')) {
      return '<i class="fab fa-facebook" style="color: #1877f2;"></i> On Facebook';
    }
    
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
      return '<i class="fab fa-twitter" style="color: #1da1f2;"></i> Scrolling X (Twitter)';
    }
    
    if (lowerUrl.includes('reddit.com')) {
      return '<i class="fab fa-reddit" style="color: #ff4500;"></i> Browsing Reddit';
    }
    
    if (lowerUrl.includes('tiktok.com')) {
      return '<i class="fab fa-tiktok" style="color: #000000;"></i> Watching TikTok';
    }
    
    if (lowerUrl.includes('snapchat.com')) {
      return '<i class="fab fa-snapchat" style="color: #fffc00;"></i> On Snapchat';
    }
    
    if (lowerUrl.includes('linkedin.com')) {
      return '<i class="fab fa-linkedin" style="color: #0a66c2;"></i> Networking on LinkedIn';
    }
    
    if (lowerUrl.includes('pinterest.com')) {
      return '<i class="fab fa-pinterest" style="color: #e60023;"></i> Pinning Ideas';
    }
    
    // Entertainment
    if (lowerUrl.includes('netflix.com')) {
      return '<i class="fas fa-film" style="color: #e50914;"></i> Watching Netflix';
    }
    
    if (lowerUrl.includes('spotify.com')) {
      // Show song name if available in videoTitle
      if (activity.videoTitle && !isPublicURL(activity.currentUrl)) {
        const cleanTitle = cleanVideoTitle(activity.videoTitle);
        return `<i class="fab fa-spotify" style="color: #1db954;"></i> ${cleanTitle}`;
      }
      return '<i class="fab fa-spotify" style="color: #1db954;"></i> Listening to Spotify';
    }
    
    if (lowerUrl.includes('twitch.tv')) {
      return '<i class="fab fa-twitch" style="color: #9146ff;"></i> Watching Twitch';
    }
    
    if (lowerUrl.includes('discord.com')) {
      return '<i class="fab fa-discord" style="color: #5865f2;"></i> Chatting on Discord';
    }
    
    // Shopping
    if (lowerUrl.includes('amazon.')) {
      return '<i class="fab fa-amazon" style="color: #ff9900;"></i> Shopping on Amazon';
    }
    
    if (lowerUrl.includes('flipkart.com')) {
      return '<i class="fas fa-shopping-cart" style="color: #2874f0;"></i> Shopping on Flipkart';
    }
    
    // News & Info
    if (lowerUrl.includes('wikipedia.org')) {
      return '<i class="fab fa-wikipedia-w" style="color: #000000;"></i> Reading Wikipedia';
    }
    
    if (lowerUrl.includes('github.com')) {
      return '<i class="fab fa-github" style="color: #ffffff;"></i> Coding on GitHub';
    }
    
    if (lowerUrl.includes('stackoverflow.com')) {
      return '<i class="fab fa-stack-overflow" style="color: #f48024;"></i> Finding Solutions';
    }
    
    // Email
    if (lowerUrl.includes('gmail.com') || lowerUrl.includes('mail.google.com')) {
      return '<i class="fas fa-envelope" style="color: #ea4335;"></i> Checking Email';
    }
    
    if (lowerUrl.includes('outlook.')) {
      return '<i class="fas fa-envelope" style="color: #0078d4;"></i> Checking Outlook';
    }
    
    // Default - show domain
    const domain = url.match(/https?:\/\/([^\/]+)/)?.[1] || 'web';
    return `<i class="fas fa-globe" style="color: #3b82f6;"></i> ${domain}`;
  }
  
  return '<i class="fas fa-circle" style="color: #10b981;"></i> Online';
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
    // Valid profile IDs: gradient-1, p2-p15 (exclude banner/avatar IDs)
    const validProfileIds = ['gradient-1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15'];
    const hasValidProfileDecoration = profile.profileDecoration && validProfileIds.includes(profile.profileDecoration);
    
    const profileDecoration = hasValidProfileDecoration ? `
      <div id="profileDecorationOverlay" style="
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
        opacity: 1;
        transition: opacity 0.5s ease-in-out;
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
          
          ${profile.activity.videoTitle && (isPublicURL(profile.activity.currentUrl) || profile.activity.currentUrl?.includes('spotify.com')) ? `
            ${(() => {
              // Check for Spotify first
              const isSpotify = profile.activity.currentUrl?.toLowerCase().includes('spotify.com');
              
              if (isSpotify && profile.activity.videoTitle) {
                const cleanSongTitle = cleanVideoTitle(profile.activity.videoTitle);
                return `
                  <div style="background: linear-gradient(135deg, #1db954 0%, #1ed760 100%); border-radius: 12px; padding: 20px; margin-top: 12px; box-shadow: 0 8px 24px rgba(29, 185, 84, 0.3);">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
                      <div style="width: 48px; height: 48px; background: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                        <i class="fab fa-spotify" style="color: white;"></i>
                      </div>
                      <div style="flex: 1;">
                        <div style="color: rgba(255, 255, 255, 0.8); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">NOW PLAYING</div>
                        <div style="color: white; font-size: 15px; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${cleanSongTitle}</div>
                      </div>
                    </div>
                    ${profile.activity.focusActive ? `
                      <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; font-size: 10px; font-weight: 600; color: white;">
                        <span style="width: 5px; height: 5px; background: white; border-radius: 50%;"></span>
                        FOCUSING
                      </div>
                    ` : ''}
                  </div>
                `;
              }
              
              // Privacy check: only show details for public URLs
              if (!isPublicURL(profile.activity.currentUrl)) {
                return '';
              }
              
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
                      <img src="${profile.activity.videoThumbnail}" alt="Thumbnail" style="width: 100%; height: auto; display: block;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\"width: 100%; height: 200px; background: #1a1a1a; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 14px;\"><i class=\"fas fa-image\" style=\"font-size: 48px; opacity: 0.3;\"></i></div>';">
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
    
    // Profile decoration animation: 5s visible, 5s hidden, repeat
    if (hasValidProfileDecoration) {
      const decorationOverlay = document.getElementById('profileDecorationOverlay');
      if (decorationOverlay) {
        let isVisible = true;
        
        // Cycle every 5 seconds
        setInterval(() => {
          if (isVisible) {
            decorationOverlay.style.opacity = '0';
          } else {
            decorationOverlay.style.opacity = '1';
          }
          isVisible = !isVisible;
        }, 5000);
      }
    }
    
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
    
    const isAnimated = isAnimatedBanner(user.nameBanner);
    const bannerHTML = getNameBannerHTML(user.nameBanner);
    const cardStyle = user.nameBanner ? (isAnimated ? 'position: relative; overflow: hidden;' : `
      background: url('${chrome.runtime.getURL(`assets/name_banner/${user.nameBanner}.png`)}') center/cover;
      background-size: 100% 100%;
    `) : '';
    
    return `
      <div class="online-user" style="${cardStyle}">
        ${bannerHTML}
        <div style="position: relative; width: 32px; height: 32px; flex-shrink: 0; z-index: 1;">
          <div class="online-user-avatar" style="position: relative; z-index: 1;">${user.avatar || '👤'}</div>
          ${avatarDecoration}
        </div>
        <div class="online-user-info" style="position: relative; z-index: 1;">
          <div class="online-user-name" style="text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6);">${user.displayName || user.username}</div>
        </div>
        <div class="online-indicator-small" style="position: relative; z-index: 1;"></div>
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

// Helper function to compare version strings
function compareVersions(v1, v2) {
  // Ensure versions are strings and trim whitespace
  v1 = String(v1 || '0.0.0').trim();
  v2 = String(v2 || '0.0.0').trim();
  
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  
  return 0;
}

// Helper to check if banner is animated (.webm)
function isAnimatedBanner(bannerId) {
  if (!bannerId) return false;
  const animatedBanners = ['asset', 'mb1', 'mb2', 'mb3', 'mb4', 'mb5', 'mb6', 'mb7'];
  return animatedBanners.includes(bannerId);
}

// Helper to get name banner HTML (supports .webm and .png)
function getNameBannerHTML(bannerId, additionalClass = '', additionalStyle = '') {
  if (!bannerId) return '';
  
  const isAnimated = isAnimatedBanner(bannerId);
  const extension = isAnimated ? '.webm' : '.png';
  const url = chrome.runtime.getURL(`assets/name_banner/${bannerId}${extension}`);
  
  if (isAnimated) {
    return `<video autoplay loop muted playsinline class="name-banner-video ${additionalClass}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; ${additionalStyle}" src="${url}"></video>`;
  }
  
  return '';
}

// Shop items now loaded from backend
let shopItems = null;

let currentShopCategory = 'avatar';
let currentUserData = null;

async function initializeShop() {
  try {
    // Fetch shop items from backend
    const shopResponse = await API.request('/shop/items', { method: 'GET' });
    if (shopResponse && shopResponse.items) {
      shopItems = shopResponse.items;
      console.log('✅ Shop items loaded from backend:', shopItems);
    } else {
      console.error('Failed to load shop items from backend');
      return;
    }
    
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
    
    // Add "View as Friend" button listener
    const viewAsProfileBtn = document.getElementById('viewAsProfileBtn');
    if (viewAsProfileBtn) {
      viewAsProfileBtn.addEventListener('click', () => {
        // Show user's own profile as friends see it
        if (currentUserData && currentUserData.username) {
          viewProfile(currentUserData.username);
        }
      });
    }
    
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
    
    // Check if item requires newer version
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version;
    // Item is "coming soon" only if it requires a HIGHER version than current
    // compareVersions returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
    // So we want to show coming soon if currentVersion < minVersion (returns -1)
    const versionComparison = item.minVersion ? compareVersions(currentVersion, item.minVersion) : 1;
    const isComingSoon = item.minVersion && versionComparison < 0;
    
    // Debug log for first item with minVersion
    if (item.minVersion && item.id === 'av8') {
      console.log(`[Shop Debug] Item: ${item.id}, Current: ${currentVersion}, Required: ${item.minVersion}, Comparison: ${versionComparison}, Coming Soon: ${isComingSoon}`);
    }
    
    let folderPath = '';
    if (category === 'avatar') folderPath = 'assets/avatar';
    else if (category === 'banner') folderPath = 'assets/name_banner';
    else if (category === 'profile') folderPath = 'assets/profile';
    
    // Check if banner is animated using the helper function
    const isAnimated = category === 'banner' && isAnimatedBanner(item.id);
    
    // Use appropriate extension for banners (.webm for animated, .png for static)
    const extension = isAnimated ? '.webm' : '.png';
    const imageUrl = chrome.runtime.getURL(`${folderPath}/${item.id}${extension}`);
    
    return `
      <div class="shop-item ${isOwned ? 'owned' : ''} ${isEquipped ? 'equipped' : ''} ${isComingSoon ? 'coming-soon' : ''}" data-item-id="${item.id}" data-category="${category}">
        ${isComingSoon ? '<div class="shop-item-status coming-soon">COMING SOON</div>' : (isEquipped ? '<div class="shop-item-status equipped">EQUIPPED</div>' : (isOwned ? '<div class="shop-item-status owned">OWNED</div>' : ''))}
        <div class="shop-item-image" style="${isComingSoon ? 'opacity: 0.4; filter: blur(2px);' : ''}">
          ${isAnimated ? 
            `<video src="${imageUrl}" autoplay loop muted playsinline style="width: 100%; height: 100%; object-fit: cover;" ${isComingSoon ? 'poster="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'%3E%3C/svg%3E"' : ''}></video>` :
            `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: ${category === 'banner' ? 'cover' : 'contain'};" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\'display:flex;align-items:center;justify-content:center;height:100%;color:#666;font-size:12px;\'>Coming Soon</div>'" />`
          }
        </div>
        <div style="text-align: center; font-size: 13px; font-weight: 600; color: #ddd; margin-bottom: 4px;">${item.name}</div>
        ${isComingSoon ? 
          '<div style="padding: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 6px; font-weight: 600; font-size: 11px; color: #fff; text-align: center;">UPDATE REQUIRED</div>' :
          (isEquipped ? 
            '<div style="padding: 8px; background: #fbbf24; border-radius: 6px; font-weight: 600; font-size: 13px; color: #000; text-align: center;">EQUIPPED</div>' :
            (isOwned ? 
              '<button class="shop-item-equip-btn" style="width: 100%; padding: 8px; background: #3b82f6; border: none; border-radius: 6px; font-weight: 600; font-size: 13px; color: #fff; cursor: pointer;">EQUIP</button>' :
              `<div class="shop-item-price"><i class="fas fa-coins"></i> ${item.price} Points</div>`
            )
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
      
      // Prevent interaction with coming soon items
      if (itemEl.classList.contains('coming-soon')) {
        alert('⚠️ This item requires a newer version of the extension. Please update to access this item!');
        return;
      }
      
      // Handle equip button click
      if (e.target.classList.contains('shop-item-equip-btn')) {
        await equipItem(itemId, category);
      } 
      // For unowned/unequipped items, just preview (don't purchase immediately)
      else {
        previewItem(itemId, category);
      }
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
  // Get item data
  const items = shopItems[category];
  const item = items?.find(i => i.id === itemId);
  if (!item) return;
  
  // Check ownership
  const isOwned = currentUserData?.purchasedEffects?.includes(itemId);
  
  // Update preview based on category
  // Get unified purchase button
  const purchaseBtn = document.getElementById('shopPurchaseBtn');
  
  if (category === 'avatar') {
    const decorationUrl = chrome.runtime.getURL(`assets/avatar/${itemId}.png`);
    document.getElementById('previewAvatarDecoration').style.background = `url('${decorationUrl}') center/contain no-repeat`;
    document.getElementById('previewAvatarDecoration').style.pointerEvents = 'none';
    
    // Show/hide purchase button
    if (isOwned) {
      purchaseBtn.style.display = 'none';
    } else {
      purchaseBtn.style.display = 'block';
      purchaseBtn.innerHTML = `<i class="fas fa-shopping-cart"></i> Purchase for ${item.price} Points`;
      purchaseBtn.onclick = () => purchaseItem(itemId, category);
    }
  } else if (category === 'banner') {
    const previewCard = document.getElementById('previewCard');
    const isAnimated = isAnimatedBanner(itemId);
    const extension = isAnimated ? '.webm' : '.png';
    const bannerUrl = chrome.runtime.getURL(`assets/name_banner/${itemId}${extension}`);
    
    // Remove any existing video
    const existingVideo = previewCard.querySelector('.preview-banner-video');
    if (existingVideo) existingVideo.remove();
    
    if (isAnimated) {
      previewCard.style.background = '';
      previewCard.style.position = 'relative';
      previewCard.style.overflow = 'hidden';
      const video = document.createElement('video');
      video.src = bannerUrl;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.className = 'preview-banner-video';
      video.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0;';
      previewCard.insertBefore(video, previewCard.firstChild);
      
      // Ensure text is visible above video
      Array.from(previewCard.children).forEach(child => {
        if (child !== video && !child.style.position) {
          child.style.position = 'relative';
          child.style.zIndex = '1';
        }
      });
    } else {
      previewCard.style.background = `url('${bannerUrl}') center/cover`;
      previewCard.style.backgroundSize = '100% 100%';
    }
    // Keep user info visible
    if (currentUserData) {
      document.getElementById('previewCardAvatar').textContent = currentUserData.avatar || '👤';
      document.getElementById('previewCardName').textContent = currentUserData.displayName || currentUserData.username || 'Your Name';
      document.getElementById('previewCardUsername').textContent = '@' + (currentUserData.username || 'username');
    }
    
    // Show/hide purchase button
    if (isOwned) {
      purchaseBtn.style.display = 'none';
    } else {
      purchaseBtn.style.display = 'block';
      purchaseBtn.innerHTML = `<i class="fas fa-shopping-cart"></i> Purchase for ${item.price} Points`;
      purchaseBtn.onclick = () => purchaseItem(itemId, category);
    }
  } else if (category === 'profile') {
    const profileUrl = chrome.runtime.getURL(`assets/profile/${itemId}.png`);
    document.getElementById('previewProfile').style.background = `url('${profileUrl}') center/cover`;
    document.getElementById('previewProfile').style.backgroundSize = '100% 100%';
    document.getElementById('previewProfile').textContent = '';
    
    // Show/hide purchase button
    if (isOwned) {
      purchaseBtn.style.display = 'none';
    } else {
      purchaseBtn.style.display = 'block';
      purchaseBtn.innerHTML = `<i class="fas fa-shopping-cart"></i> Purchase for ${item.price} Points`;
      purchaseBtn.onclick = () => purchaseItem(itemId, category);
    }
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
    const previewCard = document.getElementById('previewCard');
    const isAnimated = isAnimatedBanner(currentUserData.nameBanner);
    const extension = isAnimated ? '.webm' : '.png';
    const bannerUrl = chrome.runtime.getURL(`assets/name_banner/${currentUserData.nameBanner}${extension}`);
    
    // Remove any existing video
    const existingVideo = previewCard.querySelector('.preview-banner-video');
    if (existingVideo) existingVideo.remove();
    
    if (isAnimated) {
      previewCard.style.background = '';
      previewCard.style.position = 'relative';
      previewCard.style.overflow = 'hidden';
      const video = document.createElement('video');
      video.src = bannerUrl;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.className = 'preview-banner-video';
      video.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0;';
      previewCard.insertBefore(video, previewCard.firstChild);
      
      // Ensure text is visible above video
      Array.from(previewCard.children).forEach(child => {
        if (child !== video && !child.style.position) {
          child.style.position = 'relative';
          child.style.zIndex = '1';
        }
      });
    } else {
      previewCard.style.background = `url('${bannerUrl}') center/cover`;
      previewCard.style.backgroundSize = '100% 100%';
    }
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

// Nudge Feature
async function sendNudge(friendUserId, friendDisplayName) {
  try {
    const token = await API.getToken();
    const response = await fetch(`${API_BASE_URL}/api/friends/nudge/${friendUserId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to send nudge');
    }

    showToast(`Nudge sent to ${friendDisplayName}! 👊`, 'success');
  } catch (error) {
    console.error('Send nudge error:', error);
    showToast(error.message || 'Failed to send nudge', 'error');
  }
}

// Check for new nudges
async function checkNudges() {
  try {
    const token = await API.getToken();
    const response = await fetch(`${API_BASE_URL}/api/friends/nudges`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) return;

    const nudges = await response.json();

    if (nudges && nudges.length > 0) {
      nudges.forEach(nudge => {
        showNudgeNotification(nudge);
      });
    }
  } catch (error) {
    console.error('Check nudges error:', error);
  }
}

// Show nudge notification
function showNudgeNotification(nudge) {
  const notification = document.createElement('div');
  notification.className = 'nudge-notification';
  notification.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
    border: 2px solid transparent;
    border-radius: 16px;
    padding: 0;
    box-shadow: 0 20px 60px rgba(139, 92, 246, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
    z-index: 10000;
    min-width: 380px;
    max-width: 420px;
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
    background: linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7, #8b5cf6, #6366f1);
    background-size: 200% 100%;
    border-radius: 16px;
    z-index: -1;
    animation: gradientShift 3s linear infinite;
  `;
  notification.appendChild(borderGlow);

  // Add pulse animation overlay
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

  content.innerHTML = `
    <div style="display: flex; align-items: start; gap: 16px;">
      <div style="position: relative; flex-shrink: 0;">
        <div style="font-size: 48px; filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));">${nudge.fromAvatar || '👤'}</div>
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
          animation: nudgeBounce 0.6s ease-in-out infinite;
        ">
          <i class="fas fa-hand-point-right" style="color: white; font-size: 12px;"></i>
        </div>
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <div style="font-size: 16px; font-weight: 700; color: #ffffff; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
            ${nudge.fromDisplayName}
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
            Nudge
          </div>
        </div>
        <div style="
          font-size: 15px;
          color: rgba(255, 255, 255, 0.95);
          line-height: 1.5;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
          font-weight: 500;
        ">
          ${nudge.message}
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
          <span>Click to start focusing</span>
        </div>
      </div>
      <button class="nudge-close-btn" style="
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
    notification.style.boxShadow = '0 24px 80px rgba(139, 92, 246, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.2) inset';
  };

  notification.onmouseleave = () => {
    notification.style.transform = 'translateY(0) scale(1)';
    notification.style.boxShadow = '0 20px 60px rgba(139, 92, 246, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1) inset';
  };

  const closeBtn = notification.querySelector('.nudge-close-btn');
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
    notification.style.animation = 'nudgeSlideOut 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    setTimeout(() => {
      notification.remove();
      window.location.href = 'popup.html';
    }, 200);
  };

  document.body.appendChild(notification);

  // Auto remove after 6 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'nudgeSlideOut 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      setTimeout(() => notification.remove(), 400);
    }
  }, 6000);
}

// Load friend suggestions
async function loadFriendSuggestions() {
  try {
    const token = await API.getToken();
    const response = await fetch(`${API_BASE_URL}/api/friends/suggestions`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load suggestions');
    }

    const suggestions = await response.json();
    displayFriendSuggestions(suggestions);

    // Update badge
    const badge = document.getElementById('suggestionsBadge');
    if (suggestions.length > 0) {
      badge.textContent = suggestions.length;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  } catch (error) {
    console.error('Load suggestions error:', error);
  }
}

// Add friend from suggestions
window.addFriend = async function(username, event) {
  try {
    const button = event?.target?.closest('.add-friend-btn') || event?.currentTarget;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    }
    
    await API.addFriend(username);
    
    if (button) {
      button.innerHTML = '<i class="fas fa-check"></i> Request Sent!';
      button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    }
    
    // Reload suggestions after 1 second
    setTimeout(() => {
      loadFriendSuggestions();
    }, 1000);
    
    // Show success notification
    showToast(`Friend request sent to @${username}`, 'success');
  } catch (error) {
    console.error('Add friend error:', error);
    showToast('Failed to send friend request', 'error');
    
    const button = event?.target?.closest('.add-friend-btn') || event?.currentTarget;
    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
    }
  }
}

// Display friend suggestions
function displayFriendSuggestions(suggestions) {
  const list = document.getElementById('suggestionsList');

  if (!suggestions || suggestions.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 48px 24px; color: #6b7280;">
        <i class="fas fa-users" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
        <p style="font-size: 15px;">No suggestions available right now</p>
        <p style="font-size: 13px; margin-top: 8px;">Connect with more friends to get suggestions!</p>
      </div>
    `;
    return;
  }

  list.innerHTML = suggestions.map(user => {
    const mutualText = user.mutualFriendsCount === 1
      ? `1 mutual friend`
      : `${user.mutualFriendsCount} mutual friends`;

    // Determine name banner file (add .png if not specified)
    const nameBannerFile = user.nameBanner ? 
      (user.nameBanner.includes('.') ? user.nameBanner : `${user.nameBanner}.png`) : null;
    const isAnimatedBanner = nameBannerFile?.endsWith('.webm');

    return `
      <div class="friend-card" style="animation: slideIn 0.4s ease-out; position: relative;">
        <div style="display: flex; align-items: center; gap: 16px; flex: 1;">
          <div style="position: relative;">
            <div style="font-size: 48px;">${user.avatar || '👤'}</div>
            ${user.avatarDecoration ? `
              <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 72px;
                height: 72px;
                background: url('${chrome.runtime.getURL(`assets/avatar/${user.avatarDecoration}.png`)}') center/contain no-repeat;
                pointer-events: none;
                z-index: 10;
              "></div>
            ` : ''}
          </div>
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              ${nameBannerFile ? `
                <div style="position: relative; display: inline-block;">
                  <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: auto;
                    height: 28px;
                    z-index: 0;
                  ">
                    ${isAnimatedBanner ?
                      `<video src="${chrome.runtime.getURL(`assets/name_banner/${nameBannerFile}`)}" autoplay loop muted playsinline style="height: 100%; width: auto; object-fit: contain;"></video>` :
                      `<img src="${chrome.runtime.getURL(`assets/name_banner/${nameBannerFile}`)}" style="height: 100%; width: auto; object-fit: contain;" />`
                    }
                  </div>
                  <div style="font-weight: 600; font-size: 15px; color: #e5e5e5; position: relative; z-index: 1; padding: 0 8px;">${user.displayName}</div>
                </div>
              ` : `<div style="font-weight: 600; font-size: 15px; color: #e5e5e5;">${user.displayName}</div>`}
              <div style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                Lv ${user.level || 1}
              </div>
            </div>
            <div style="color: #6b7280; font-size: 13px; margin-bottom: 6px;">@${user.username}</div>
            <div style="display: flex; align-items: center; gap: 6px; color: #8b5cf6; font-size: 12px;">
              <i class="fas fa-user-friends"></i>
              <span>${mutualText}</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">
              ${user.points || 0} pts
            </div>
            <button class="add-friend-btn" data-username="${user.username}" style="
              background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
              border: none;
              padding: 8px 16px;
              border-radius: 8px;
              color: white;
              font-size: 13px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.3s ease;
              display: flex;
              align-items: center;
              gap: 6px;
            " onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.4)';" onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
              <i class="fas fa-user-plus"></i>
              <span>Add Friend</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners to all add friend buttons
  document.querySelectorAll('.add-friend-btn').forEach(button => {
    button.addEventListener('click', async function(e) {
      const username = this.getAttribute('data-username');
      if (username) {
        await window.addFriend(username, e);
      }
    });
  });
}

// Check nudges every 2 minutes
setInterval(checkNudges, 2 * 60 * 1000);
checkNudges(); // Initial check

// Check for developer messages on load
checkDeveloperMessageSocial();

// Function to check and show developer message in social page
async function checkDeveloperMessageSocial() {
  try {
    const state = await chrome.storage.local.get(['authToken', 'user']);
    if (!state.authToken || !state.user) return;

    const response = await fetch(`${API_BASE_URL}/api/users/developer-message`, {
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
      showDeveloperMessageNotificationSocial(message);
    }
  } catch (error) {
    console.error('Check developer message error:', error);
  }
}

// Show developer message notification in social page
function showDeveloperMessageNotificationSocial(message) {
  // Reuse the existing nudge notification code but with blue theme
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

  notification.onclick = async () => {
    // Mark as read
    try {
      const state = await chrome.storage.local.get('sessionToken');
      await fetch(`${API_BASE_URL}/api/users/mark-message-read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messageId: message.id })
      });
    } catch (error) {
      console.error('Mark as read error:', error);
    }
    
    // Show alert with full message
    alert(`${message.title}\n\n${message.message}\n\n- ${message.from.displayName}`);
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

// Add suggestions tab handling
const suggestionsTab = document.querySelector('[data-tab="suggestions"]');
if (suggestionsTab) {
  suggestionsTab.addEventListener('click', () => {
    loadFriendSuggestions();
  });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (chatSocket) {
    chatSocket.disconnect();
  }
});
