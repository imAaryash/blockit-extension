// Quick reset functionality
function resetNow() {
  chrome.storage.local.set({
    focusActive: false,
    sessionEnd: 0,
    sessionStart: 0,
    emergencyUsed: false,
    sessionBlockedCount: 0,
    onBreak: false
  }, () => {
    const result = document.getElementById('result');
    result.className = 'success';
    result.style.display = 'block';
    result.innerHTML = '✓ Reset Complete! Focus mode has been cleared.<br>You can close this page now.';
  });
}

function checkStatus() {
  chrome.storage.local.get(['focusActive', 'sessionEnd'], (data) => {
    const result = document.getElementById('result');
    result.style.display = 'block';
    result.style.background = '#1a1a1a';
    result.innerHTML = `
      <strong>Current Status:</strong><br>
      Focus Active: ${data.focusActive ? '❌ YES (STUCK)' : '✓ No'}<br>
      Session End: ${data.sessionEnd ? new Date(data.sessionEnd).toLocaleString() : 'None'}
    `;
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('resetBtn').addEventListener('click', resetNow);
  document.getElementById('checkBtn').addEventListener('click', checkStatus);
});
