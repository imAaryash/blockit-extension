// Auto-update checker for extension
// Checks GitHub releases for new versions

const GITHUB_REPO = 'imAaryash/blockit-extension'; // Replace with your actual repo
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // Check once per day
const CURRENT_VERSION = '2.2.0'; // Keep this synced with manifest.json

// Check for updates on extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    console.log('[UpdateChecker] Extension installed/updated');
    // Check for updates after 1 hour of initial install
    setTimeout(checkForUpdates, 60 * 60 * 1000);
  }
});

// Set up periodic update checks
chrome.alarms.create('check-updates', {
  periodInMinutes: 1440 // Check every 24 hours
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check-updates') {
    checkForUpdates();
  }
});

async function checkForUpdates() {
  try {
    console.log('[UpdateChecker] Checking for updates...');
    
    // Fetch latest release from GitHub
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      console.log('[UpdateChecker] Failed to fetch releases:', response.status);
      return;
    }
    
    const release = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
    
    console.log('[UpdateChecker] Current version:', CURRENT_VERSION);
    console.log('[UpdateChecker] Latest version:', latestVersion);
    
    if (compareVersions(latestVersion, CURRENT_VERSION) > 0) {
      console.log('[UpdateChecker] New version available!');
      
      // Get download URL for source code ZIP
      const zipUrl = `https://github.com/${GITHUB_REPO}/archive/refs/tags/v${latestVersion}.zip`;
      
      // Save update info
      await chrome.storage.local.set({
        updateAvailable: true,
        latestVersion: latestVersion,
        releaseUrl: release.html_url,
        releaseNotes: release.body || 'No release notes available',
        downloadUrl: zipUrl
      });
      
      // Show notification with download option
      chrome.notifications.create('update-available', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '🎉 Update Available!',
        message: `Version ${latestVersion} is ready. Click to download and install.`,
        requireInteraction: true,
        buttons: [
          { title: 'Download Now' },
          { title: 'Later' }
        ]
      });
    } else {
      console.log('[UpdateChecker] Extension is up to date');
      await chrome.storage.local.set({ updateAvailable: false });
    }
  } catch (error) {
    console.error('[UpdateChecker] Error checking for updates:', error);
  }
}

// Download and prepare update
async function downloadUpdate() {
  try {
    const data = await chrome.storage.local.get(['downloadUrl', 'latestVersion']);
    
    if (!data.downloadUrl) {
      console.error('[UpdateChecker] No download URL available');
      return false;
    }
    
    console.log('[UpdateChecker] Starting download...');
    
    // Download the ZIP file
    const downloadId = await chrome.downloads.download({
      url: data.downloadUrl,
      filename: `focus-extension-v${data.latestVersion}.zip`,
      saveAs: false // Auto-save to Downloads folder
    });
    
    console.log('[UpdateChecker] Download started, ID:', downloadId);
    
    // Listen for download completion
    return new Promise((resolve) => {
      const listener = (delta) => {
        if (delta.id === downloadId && delta.state) {
          if (delta.state.current === 'complete') {
            console.log('[UpdateChecker] Download complete!');
            chrome.downloads.onChanged.removeListener(listener);
            
            // Save download info
            chrome.storage.local.set({
              updateDownloaded: true,
              downloadComplete: true
            });
            
            // Show installation guide
            chrome.tabs.create({
              url: chrome.runtime.getURL('update-install.html')
            });
            
            resolve(true);
          } else if (delta.state.current === 'interrupted') {
            console.error('[UpdateChecker] Download interrupted');
            chrome.downloads.onChanged.removeListener(listener);
            resolve(false);
          }
        }
      };
      
      chrome.downloads.onChanged.addListener(listener);
    });
    
  } catch (error) {
    console.error('[UpdateChecker] Download error:', error);
    return false;
  }
}

// Handle notification clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId === 'update-available') {
    if (buttonIndex === 0) {
      // Download Now button
      chrome.notifications.clear(notificationId);
      await downloadUpdate();
    } else {
      // Later button
      chrome.notifications.clear(notificationId);
    }
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === 'update-available') {
    // Click on notification body also triggers download
    chrome.notifications.clear(notificationId);
    await downloadUpdate();
  }
});

// Compare version strings (e.g., "1.2.0" vs "1.1.0")
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  
  return 0; // versions are equal
}

// Export for use in popup
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkForUpdates, compareVersions };
}
