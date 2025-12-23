// Environment Configuration
// Automatically detects if running locally or in production

const ENV_CONFIG = {
  // Detect environment
  isDevelopment: () => {
    // Only use development mode when explicitly testing with localhost backend
    // Check if extension ID matches unpacked/development ID
    // Production extensions have different IDs after being packed/published
    const extensionId = chrome.runtime.id;
    
    // Your unpacked extension ID (update this with your actual dev ID)
    const DEV_EXTENSION_IDS = [
      // 'your-dev-extension-id-here', // Add your development extension ID here when testing
    ];
    
    // Check if hostname is localhost (for web testing)
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
    
    // Return false by default (production mode) unless explicitly in dev list
    return isLocalhost || DEV_EXTENSION_IDS.includes(extensionId);
  },
  
  // API URLs
  api: {
    development: 'http://localhost:3000/api', // Your local backend
    production: 'https://focus-backend-g1zg.onrender.com/api' // Your deployed backend
  },
  
  // Get current API URL based on environment
  getApiUrl: function() {
    return this.isDevelopment() ? this.api.development : this.api.production;
  },
  
  // Feature flags
  features: {
    debugLogs: true, // Enable debug logs in development
    mockData: false  // Use mock data for testing without backend
  },
  
  // Get feature flag
  isFeatureEnabled: function(feature) {
    return this.isDevelopment() && this.features[feature];
  }
};

// Export API_URL for backward compatibility
const API_URL = ENV_CONFIG.getApiUrl();

// Log environment info
console.log(`[Environment] Mode: ${ENV_CONFIG.isDevelopment() ? 'DEVELOPMENT' : 'PRODUCTION'}`);
console.log(`[Environment] API URL: ${API_URL}`);

// Show dev indicator in UI
if (ENV_CONFIG.isDevelopment()) {
  // Add visual indicator for development mode
  window.addEventListener('DOMContentLoaded', () => {
    const devBadge = document.createElement('div');
    devBadge.id = 'dev-mode-indicator';
    devBadge.innerHTML = '🛠️ DEV MODE';
    devBadge.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      background: linear-gradient(135deg, #f59e0b, #ef4444);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      cursor: pointer;
      animation: pulse 2s ease-in-out infinite;
    `;
    devBadge.title = `Using local backend: ${API_URL}`;
    
    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(devBadge);
    
    // Click to see full config
    devBadge.addEventListener('click', () => {
      console.log('[Dev Mode] Configuration:', ENV_CONFIG);
      alert(`Development Mode\n\nAPI: ${API_URL}\n\nClick OK to view full config in console.`);
    });
  });
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.ENV_CONFIG = ENV_CONFIG;
  window.API_URL = API_URL;
}
