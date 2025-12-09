// WebSocket client for real-time activity updates
class ActivitySocket {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
  }

  async connect() {
    if (this.connected) return;

    const token = await chrome.storage.local.get(['authToken']);
    if (!token.authToken) {
      console.error('No auth token found');
      return;
    }

    // Load Socket.IO from CDN
    if (!window.io) {
      await this.loadSocketIO();
    }

    const serverUrl = 'https://focus-backend-g1zg.onrender.com';
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('🔌 Connected to activity server');
      this.connected = true;
      
      // Authenticate
      this.socket.emit('authenticate', token.authToken);
    });

    this.socket.on('authenticated', (data) => {
      console.log('✅ Authenticated:', data.userId);
    });

    this.socket.on('auth-error', (data) => {
      console.error('❌ Auth error:', data.error);
    });

    this.socket.on('friend-activity', (data) => {
      console.log('📊 Friend activity update:', data);
      this.emit('activity-update', data);
    });

    this.socket.on('friend-online', (data) => {
      console.log('Friend online:', data.username);
      this.emit('friend-online', data);
    });

    this.socket.on('friend-offline', (data) => {
      console.log('Friend offline:', data.username);
      this.emit('friend-offline', data);
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 Disconnected from activity server');
      this.connected = false;
    });
  }

  async loadSocketIO() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.6.1/socket.io.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  updateActivity(status, startTime = null, currentUrl = null, videoTitle = null) {
    if (!this.connected || !this.socket) return;

    this.socket.emit('activity-update', {
      status,
      startTime,
      currentUrl,
      videoTitle
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ActivitySocket;
}
