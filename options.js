// Options page JavaScript
async function send(msg) {
  return new Promise((res) => chrome.runtime.sendMessage(msg, res));
}

async function loadSettings() {
  const state = await send({action: 'getState'});
  
  // Load allowed and blocked sites
  document.getElementById('allowed').value = (state.allowed || []).join('\n');
  document.getElementById('blocked').value = (state.blockedKeywords || []).join('\n');
  
  // Load statistics
  const level = state.level || 1;
  const points = state.points || 0;
  const streak = state.streak?.current || 0;
  const totalMin = state.stats?.totalFocusTime || 0;
  const sessions = state.stats?.sessionsCompleted || 0;
  const blocked = state.stats?.blockedCount || 0;
  
  document.getElementById('statLevel').textContent = level;
  document.getElementById('statPoints').textContent = points;
  document.getElementById('statStreak').textContent = streak > 0 ? `${streak}🔥` : '0';
  
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  document.getElementById('statTime').textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  document.getElementById('statSessions').textContent = sessions;
  document.getElementById('statBlocked').textContent = blocked;
}

// Save button
document.getElementById('save').addEventListener('click', async () => {
  const saveBtn = document.getElementById('save');
  
  const allowed = document.getElementById('allowed').value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
    
  const blocked = document.getElementById('blocked').value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  
  await send({action: 'updateLists', allowed, blocked});
  
  const passcode = document.getElementById('passcode').value.trim();
  if (passcode) {
    await send({action: 'setPasscode', passcode});
  }
  
  saveBtn.textContent = '✓ Saved!';
  saveBtn.classList.add('saved');
  
  setTimeout(() => {
    saveBtn.textContent = 'Save Settings';
    saveBtn.classList.remove('saved');
  }, 2000);
});

// Load settings on page load
loadSettings();
