// Critical Update Page Script
(async () => {
  try {
    const manifest = chrome.runtime.getManifest();
    const data = await chrome.storage.local.get(['extensionBlocked', 'blockReason', 'latestVersion', 'minimumVersion']);
    
    // Display current version
    const currentVersionEl = document.getElementById('currentVersion');
    if (currentVersionEl) {
      currentVersionEl.textContent = manifest.version;
    }
    
    // Display required version
    const requiredVersion = data.minimumVersion || data.latestVersion || '2.5.0';
    const requiredVersionEl = document.getElementById('requiredVersion');
    if (requiredVersionEl) {
      requiredVersionEl.textContent = requiredVersion;
    }
    
    // Display block reason
    const reason = data.blockReason || 'Your current version contains critical bugs that may cause data corruption.';
    const blockReasonEl = document.getElementById('blockReason');
    if (blockReasonEl) {
      blockReasonEl.textContent = reason;
    }
    
    // Update filename
    const filenameEl = document.getElementById('filename');
    if (filenameEl) {
      filenameEl.textContent = `focus-extension-v${requiredVersion}.zip`;
    }
    
    // Log for debugging
    console.log('[Critical Update] Extension blocked due to:', reason);
    console.log('[Critical Update] Current:', manifest.version, '| Required:', requiredVersion);
  } catch (error) {
    console.error('[Critical Update] Error loading data:', error);
  }
})();

// Open Extensions page
const extensionsBtn = document.getElementById('openExtensionsBtn');
if (extensionsBtn) {
  extensionsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/' });
  });
}

// Open Downloads folder
const downloadsBtn = document.getElementById('openDownloadsBtn');
if (downloadsBtn) {
  downloadsBtn.addEventListener('click', () => {
    chrome.downloads.showDefaultFolder();
  });
}
