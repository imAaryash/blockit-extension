// Check current focus state
async function checkFocusState() {
  try {
    const state = await chrome.storage.local.get(['focusActive', 'sessionEnd', 'onBreak']);
    
    const focusStatusEl = document.getElementById('focusStatus');
    const sessionEndEl = document.getElementById('sessionEnd');
    const resetBtn = document.getElementById('resetBtn');

    console.log('Current state:', state);

    if (state.focusActive) {
      focusStatusEl.textContent = 'Active (Stuck)';
      focusStatusEl.classList.add('active');
      focusStatusEl.classList.remove('inactive');
      resetBtn.disabled = false;
    } else {
      focusStatusEl.textContent = 'Inactive (Normal)';
      focusStatusEl.classList.add('inactive');
      focusStatusEl.classList.remove('active');
      resetBtn.disabled = true;
      resetBtn.textContent = 'Already Reset';
    }

    if (state.sessionEnd && state.sessionEnd > 0) {
      const endDate = new Date(state.sessionEnd);
      sessionEndEl.textContent = endDate.toLocaleString();
    } else {
      sessionEndEl.textContent = 'No active session';
    }
  } catch (error) {
    console.error('Error checking focus state:', error);
    document.getElementById('focusStatus').textContent = 'Error loading';
    document.getElementById('sessionEnd').textContent = 'Error loading';
    document.getElementById('resetBtn').textContent = 'Force Reset Anyway';
    document.getElementById('resetBtn').disabled = false;
  }
}

// Reset focus mode
async function resetFocusMode() {
  const resetBtn = document.getElementById('resetBtn');
  const successMsg = document.getElementById('successMsg');

  resetBtn.disabled = true;
  resetBtn.textContent = 'Resetting...';

  try {
    // Clear all focus-related state
    await chrome.storage.local.set({
      focusActive: false,
      sessionEnd: 0,
      sessionStart: 0,
      emergencyUsed: false,
      sessionBlockedCount: 0,
      onBreak: false,
      pomodoroSession: 0,
      pomodoroBreaksCompleted: 0
    });

    // Show success message
    successMsg.classList.add('show');
    resetBtn.textContent = 'Reset Complete!';

    // Refresh status after 1 second
    setTimeout(async () => {
      await checkFocusState();
    }, 1000);

  } catch (error) {
    console.error('Error resetting focus mode:', error);
    resetBtn.disabled = false;
    resetBtn.textContent = 'Reset Failed - Try Again';
    alert('Failed to reset focus mode. Please try again.');
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, checking focus state...');
  
  // Add slight delay to ensure everything is ready
  setTimeout(() => {
    checkFocusState().catch(err => {
      console.error('Failed to check focus state:', err);
      document.getElementById('focusStatus').textContent = 'Error';
      document.getElementById('sessionEnd').textContent = 'Error';
      document.getElementById('resetBtn').textContent = 'Force Reset';
      document.getElementById('resetBtn').disabled = false;
    });
  }, 100);

  document.getElementById('resetBtn').addEventListener('click', resetFocusMode);
});
