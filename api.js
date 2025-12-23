// API Configuration
// Note: config.js must be loaded before this file to get API_URL
const API_CONFIG = {
  get baseURL() {
    // Use environment-aware API_URL from config.js if available
    return typeof API_URL !== 'undefined' ? API_URL : 'https://focus-backend-g1zg.onrender.com/api';
  },
  endpoints: {
    register: '/auth/register',
    login: '/auth/login',
    profile: '/auth/profile',
    updateStats: '/users/stats',
    updateSettings: '/users/settings',
    updateActivity: '/users/activity',
    updateProfileEffect: '/users/profile-effect',
    updateNameBanner: '/users/name-banner',
    updateAvatarDecoration: '/users/avatar-decoration',
    updateProfileDecoration: '/users/profile-decoration',
    getUser: '/users', // + /:username
    leaderboard: '/users/leaderboard',
    addFriend: '/friends/add',
    removeFriend: '/friends', // + /:friendUserId
    getFriends: '/friends',
    getFriendsActivity: '/friends/activity'
  }
};

// API Helper Functions
class API {
  static async request(endpoint, options = {}) {
    const token = await this.getToken();
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
      },
      ...options
    };

    const url = API_CONFIG.baseURL + endpoint;
    console.log('API Request:', options.method || 'GET', url);

    try {
      const response = await fetch(url, config);
      console.log('API Response status:', response.status);
      
      const data = await response.json();
      console.log('API Response data:', data);

      if (!response.ok) {
        // Check for device conflict (logged in on another device)
        if (response.status === 401 && data.code === 'DEVICE_CONFLICT') {
          console.error('🚨 Device conflict detected - user logged in elsewhere');
          await this.handleDeviceConflict(data.message);
        }
        throw new Error(data.error || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  static async handleDeviceConflict(message) {
    // Show notification to user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '🔒 Logged Out',
      message: message || 'You have been logged in from another device.',
      priority: 2,
      requireInteraction: true
    });

    // Clear all auth data
    await chrome.storage.local.clear();

    // Redirect to login if on extension pages
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && tab.url.includes('chrome-extension://')) {
          chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('pages/login.html') });
        }
      });
    });
  }

  static async getToken() {
    const result = await chrome.storage.local.get(['authToken']);
    return result.authToken;
  }

  static async setToken(token) {
    await chrome.storage.local.set({ authToken: token });
  }

  static async clearToken() {
    await chrome.storage.local.remove(['authToken']);
  }

  static async getDeviceId() {
    const result = await chrome.storage.local.get(['deviceId']);
    if (result.deviceId) {
      return result.deviceId;
    }
    // Generate new device ID
    const newDeviceId = crypto.randomUUID ? crypto.randomUUID() : `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await chrome.storage.local.set({ deviceId: newDeviceId });
    return newDeviceId;
  }

  static getBrowserInfo() {
    return navigator.userAgent;
  }

  // Auth endpoints
  static async register(username, displayName, password) {
    const deviceId = await this.getDeviceId();
    const browserInfo = this.getBrowserInfo();
    
    const data = await this.request(API_CONFIG.endpoints.register, {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password, deviceId, browserInfo })
    });
    
    if (data.token) {
      await this.setToken(data.token);
    }
    
    if (data.deviceId) {
      await chrome.storage.local.set({ deviceId: data.deviceId });
    }
    
    return data;
  }

  static async login(username, password) {
    const deviceId = await this.getDeviceId();
    const browserInfo = this.getBrowserInfo();
    
    const data = await this.request(API_CONFIG.endpoints.login, {
      method: 'POST',
      body: JSON.stringify({ username, password, deviceId, browserInfo })
    });
    
    if (data.token) {
      await this.setToken(data.token);
    }
    
    if (data.deviceId) {
      await chrome.storage.local.set({ deviceId: data.deviceId });
    }
    
    return data;
  }

  static async getProfile() {
    return await this.request(API_CONFIG.endpoints.profile);
  }

  // User endpoints
  static async updateStats(stats) {
    return await this.request(API_CONFIG.endpoints.updateStats, {
      method: 'PUT',
      body: JSON.stringify(stats)
    });
  }

  static async updateSettings(settings) {
    return await this.request(API_CONFIG.endpoints.updateSettings, {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  static async updateActivity(status, startTime) {
    return await this.request(API_CONFIG.endpoints.updateActivity, {
      method: 'PUT',
      body: JSON.stringify({ status, startTime })
    });
  }

  static async updateProfileEffect(effectId) {
    return await this.request(API_CONFIG.endpoints.updateProfileEffect, {
      method: 'PUT',
      body: JSON.stringify({ effectId })
    });
  }

  static async updateNameBanner(bannerId) {
    return await this.request(API_CONFIG.endpoints.updateNameBanner, {
      method: 'PUT',
      body: JSON.stringify({ bannerId })
    });
  }

  static async updateAvatarDecoration(decorationId) {
    return await this.request(API_CONFIG.endpoints.updateAvatarDecoration, {
      method: 'PUT',
      body: JSON.stringify({ decorationId })
    });
  }

  static async updateProfileDecoration(decorationId) {
    return await this.request(API_CONFIG.endpoints.updateProfileDecoration, {
      method: 'PUT',
      body: JSON.stringify({ decorationId })
    });
  }

  static async getUserByUsername(username) {
    return await this.request(`${API_CONFIG.endpoints.getUser}/${username}`);
  }

  static async getLeaderboard(limit = 50) {
    return await this.request(`${API_CONFIG.endpoints.leaderboard}?limit=${limit}`);
  }

  // Friends endpoints
  static async addFriend(friendUsername) {
    return await this.request(API_CONFIG.endpoints.addFriend, {
      method: 'POST',
      body: JSON.stringify({ friendUsername })
    });
  }

  static async acceptFriendRequest(friendUsername) {
    return await this.request('/friends/accept', {
      method: 'POST',
      body: JSON.stringify({ friendUsername })
    });
  }

  static async rejectFriendRequest(friendUsername, withdraw = false) {
    return await this.request('/friends/reject', {
      method: 'POST',
      body: JSON.stringify({ friendUsername, withdraw })
    });
  }

  static async getFriendRequests() {
    return await this.request('/friends/requests');
  }

  static async removeFriend(friendUserId) {
    return await this.request(`${API_CONFIG.endpoints.removeFriend}/${friendUserId}`, {
      method: 'DELETE'
    });
  }

  static async getFriends() {
    return await this.request(API_CONFIG.endpoints.getFriends);
  }

  static async getFriendsActivity() {
    return await this.request(API_CONFIG.endpoints.getFriendsActivity);
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API, API_CONFIG };
}
