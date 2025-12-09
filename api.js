// API Configuration
const API_CONFIG = {
  baseURL: 'https://focus-backend-g1zg.onrender.com/api', // Change this to your deployed URL
  endpoints: {
    register: '/auth/register',
    login: '/auth/login',
    profile: '/auth/profile',
    updateStats: '/users/stats',
    updateSettings: '/users/settings',
    updateActivity: '/users/activity',
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
        throw new Error(data.error || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
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

  // Auth endpoints
  static async register(username, displayName, password) {
    const data = await this.request(API_CONFIG.endpoints.register, {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password })
    });
    
    if (data.token) {
      await this.setToken(data.token);
    }
    
    return data;
  }

  static async login(username, password) {
    const data = await this.request(API_CONFIG.endpoints.login, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    
    if (data.token) {
      await this.setToken(data.token);
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

  static async rejectFriendRequest(friendUsername) {
    return await this.request('/friends/reject', {
      method: 'POST',
      body: JSON.stringify({ friendUsername })
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
