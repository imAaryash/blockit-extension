// background.js — service worker for Focus Mode

// Environment Detection - FORCE PRODUCTION MODE
function isDevelopment() {
  // Always return false to use production API
  // To enable development mode, set this to true manually
  return false;
}

// API Configuration - Environment aware
const API_URL = isDevelopment() 
  ? 'http://localhost:3000/api' 
  : 'https://focus-backend-g1zg.onrender.com/api';
const API_BASE_URL = isDevelopment()
  ? 'http://localhost:3000'
  : 'https://focus-backend-g1zg.onrender.com';

console.log('[Background Environment] Mode:', isDevelopment() ? 'DEVELOPMENT' : 'PRODUCTION');
console.log('[Background Environment] API URL:', API_URL);

// Version control
let extensionBlocked = false;
let blockReason = '';

// Import update checker
importScripts('update-checker.js');

// Show What's New page on December 25th, 2025
chrome.runtime.onInstalled.addListener((details) => {
  const now = new Date();
  const launchDate = new Date('2025-12-25T00:00:00');
  
  // Only show on or after December 25th, 2025
  if (now >= launchDate) {
    if (details.reason === 'install') {
      // First-time install - show what's new page
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/whats-new.html') });
    } else if (details.reason === 'update') {
      const manifest = chrome.runtime.getManifest();
      const currentVersion = manifest.version;
      
      // Check if user has already seen this version's update page
      chrome.storage.local.get(['lastSeenUpdateVersion'], (result) => {
        if (result.lastSeenUpdateVersion !== currentVersion && currentVersion === '2.6.0') {
          chrome.tabs.create({ url: chrome.runtime.getURL('pages/whats-new.html') });
          // Mark this version as seen
          chrome.storage.local.set({ lastSeenUpdateVersion: currentVersion });
        }
      });
    }
  }
});

// Core social media sites that are ALWAYS blocked during focus mode (cannot be removed)
const PERMANENT_BLOCKED_SITES = [
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "reddit.com",
  "tiktok.com",
  "snapchat.com"
];

const DEFAULTS = {
  allowed: ["https://www.youtube.com/","https://youtube.com/","https://www.google.com/"],
  blockedKeywords: [
    "whatsapp.com", "github.com", "quora.com", "pinterest.com",
    "edxtratech.com", "edxtra.tech", "linkedin.com",
    "netflix.com", "discord.com", "twitch.tv", "9gag.com", "imgur.com"
  ],
  stats: {blockedCount: 0, attempts: 0, totalFocusTime: 0, sessionsCompleted: 0},
  emergencyUsed: false,
  streak: {current: 0, longest: 0, lastSessionDate: null},
  points: 0,
  level: 1,
  badges: [],
  dailyGoal: 120,
  idleTimeAccumulated: 0, // minutes
  todayFocusTime: 0,
  todayDate: (() => { 
    // IST is UTC+5:30
    const d = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const istTime = new Date(d.getTime() + istOffset);
    return istTime.toISOString().substring(0, 10);
  })(),
  presets: {
    deepWork: {name: "Deep Work", duration: 90, allowedSites: ["https://www.google.com/"]},
    study: {name: "Study", duration: 45, allowedSites: ["https://www.youtube.com/", "https://www.google.com/"]},
    quickFocus: {name: "Quick Focus", duration: 15, allowedSites: []}
  },
  pomodoroEnabled: false,
  pomodoroBreakDuration: 5,
  theme: 'dark',
  // Social features
  user: null, // {userId, username, displayName, avatar, createdAt}
  friends: [], // Array of friend userIds
  friendsData: {}, // {userId: {username, displayName, avatar, stats, activity}}
  activity: {status: 'offline', currentUrl: null, focusActive: false, lastUpdated: null},
  allUsers: {} // Simple user registry (username -> userData)
};

// Check if extension version is blocked due to critical bugs
async function checkVersionStatus() {
  try {
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version;
    
    const response = await fetch(`${API_BASE_URL}/api/version/check?version=${currentVersion}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (!data.allowed) {
        extensionBlocked = true;
        blockReason = data.message;
        
        console.error('[Version] 🚨 EXTENSION BLOCKED:', data.message);
        console.error('[Version] Current:', currentVersion, 'Minimum Required:', data.minimumVersion);
        
        // Show critical notification
        chrome.notifications.create('critical-update-notification', {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '🚨 Critical Update Required',
          message: data.message + ' Extension features are disabled.',
          priority: 2,
          requireInteraction: true,
          buttons: [
            { title: 'Update Now' }
          ]
        });
        
        // Handle notification click to open critical update page
        chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
          if (notifId === 'critical-update-notification' && btnIdx === 0) {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/critical-update.html') });
          }
        });
        
        chrome.notifications.onClicked.addListener((notifId) => {
          if (notifId === 'critical-update-notification') {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/critical-update.html') });
          }
        });
        
        // Store blocked status
        await chrome.storage.local.set({ 
          extensionBlocked: true,
          blockReason: data.message,
          minimumVersion: data.minimumVersion
        });
        
        return false;
      } else {
        extensionBlocked = false;
        await chrome.storage.local.set({ extensionBlocked: false });
        console.log('[Version] ✅ Version check passed:', currentVersion);
        return true;
      }
    }
  } catch (error) {
    console.error('[Version] Failed to check version:', error);
    // Don't block on network error
    return true;
  }
}

async function getState() {
  const s = await chrome.storage.local.get();
  return Object.assign({}, DEFAULTS, s);
}

function nowMs(){return Date.now();}

async function enforceTab(tab) {
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;
  
  const state = await getState();
  const {focusActive, sessionEnd, onBreak} = state;
  const tNow = nowMs();
  
  const url = tab.url.toLowerCase();
  const hostname = (new URL(tab.url)).hostname.toLowerCase();

  console.log('[EnforceTab] Checking tab:', hostname);

  // ALWAYS check permanently blocked sites first (24/7 blocking)
  const permanentBlocked = state.permanentBlocked || [];
  console.log('[EnforceTab] Permanent blocked list:', permanentBlocked);
  
  for (const site of permanentBlocked) {
    const siteLower = site.toLowerCase();
    console.log('[EnforceTab] Checking if', hostname, 'matches', siteLower);
    
    if (url.includes(siteLower) || hostname.includes(siteLower)) {
      console.log('[PermanentBlock] ⛔ BLOCKING permanently blocked site:', hostname);
      await chrome.tabs.update(tab.id, {url: chrome.runtime.getURL('pages/blocked.html')});
      await incrementStat('blockedCount');
      return;
    }
  }
  
  console.log('[EnforceTab] Not in permanent block list, continuing...');

  // Only enforce focus mode restrictions when focus mode is active AND not on break
  if (!focusActive || !sessionEnd || tNow > sessionEnd || onBreak) {
    console.log('[EnforceTab] Focus mode not active, allowing site');
    return;
  }

  // Allowed check (simple substring match for now)
  for (const a of state.allowed || []) {
    if (!a) continue;
    const allowedHost = a.replace(/^https?:\/\//, '').replace(/\/$/, ''); // Remove protocol and trailing slash
    if (url.includes(allowedHost) || hostname.includes(allowedHost)) return; // allowed — keep
  }

  // YouTube is allowed - removed single-tab restriction to allow multiple YouTube tabs
  if (hostname.includes('youtube.com')) {
    return; // Allow all YouTube tabs
  }

  // Check permanent blocked sites first (always blocked during focus)
  for (const site of PERMANENT_BLOCKED_SITES) {
    if (url.includes(site) || hostname.includes(site)) {
      await chrome.tabs.update(tab.id, {url: chrome.runtime.getURL('pages/blocked.html')});
      await incrementStat('blockedCount');
      return;
    }
  }
  
  // Blocked keywords check (custom user-added sites)
  for (const kw of state.blockedKeywords || []) {
    if (!kw) continue;
    if (url.includes(kw) || hostname.includes(kw)) {
      // redirect to local blocked page
      await chrome.tabs.update(tab.id, {url: chrome.runtime.getURL('pages/blocked.html')});
      await incrementStat('blockedCount');
      return;
    }
  }
}

async function incrementStat(key) {
  const s = await chrome.storage.local.get({stats: DEFAULTS.stats, sessionBlockedCount: 0});
  s.stats = s.stats || {blockedCount:0, attempts:0};
  s.stats[key] = (s.stats[key]||0)+1;
  
  // Track session-specific blocked attempts for focus score calculation
  if (key === 'blockedCount') {
    s.sessionBlockedCount = (s.sessionBlockedCount || 0) + 1;
  }
  
  await chrome.storage.local.set({stats: s.stats, sessionBlockedCount: s.sessionBlockedCount});
  
  // Sync blocked count to MongoDB
  if (key === 'blockedCount') {
    try {
      const token = (await chrome.storage.local.get('authToken'))?.authToken;
      const state = await getState();
      if (token) {
        await fetch(`${API_URL}/users/stats`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            stats: {
              sitesBlocked: s.stats.blockedCount,
              totalFocusTime: state.stats?.totalFocusTime || 0,
              sessionsCompleted: state.stats?.sessionsCompleted || 0
            }
          })
        });
      }
    } catch (error) {
      console.error('Failed to sync blocked count:', error);
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Enforce focus mode restrictions
  if (changeInfo.status === 'complete' || changeInfo.url) {
    enforceTab(tab).catch(console.error);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  enforceTab(tab).catch(console.error);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    enforceTab(tab).catch(console.error);
    
    // Track browsing activity during focus session
    await trackBrowsingActivity(tab);
    
    // Update activity immediately
    await updateUserActivity(tab);
    
    // Also send to backend immediately
    await sendActivityHeartbeat();
  } catch (e) { /* ignore */ }
});

// Whitelist of educational/study domains that should not count as distractions
const STUDY_DOMAINS = [
  'web.getmarks.app',
  'getmarks.app',
  'docs.google.com',
  'drive.google.com',
  'classroom.google.com',
  'scholar.google.com',
  'notion.so',
  'notion.com',
  'github.com',
  'stackoverflow.com',
  'stackexchange.com',
  'coursera.org',
  'udemy.com',
  'khanacademy.org',
  'edx.org',
  'brilliant.org',
  'leetcode.com',
  'hackerrank.com',
  'codecademy.com',
  'freecodecamp.org',
  'w3schools.com',
  'mdn.mozilla.org',
  'wikipedia.org',
  'wolframalpha.com',
  'desmos.com',
  'geogebra.org',
  'quizlet.com',
  'anki.com',
  'brainly.com',
  'chegg.com',
  'studyblue.com',
  'grammarly.com',
  'overleaf.com',
  'latex.org',
  'arxiv.org',
  'researchgate.net',
  'medium.com',
  'dev.to'
];

// Check if a domain is a study/educational resource
function isStudyResource(domain) {
  return STUDY_DOMAINS.some(studyDomain => domain.includes(studyDomain));
}

// Track browsing activity during focus session
async function trackBrowsingActivity(tab) {
  if (!tab || !tab.url) return;
  
  const state = await getState();
  if (!state.focusActive) return; // Only track during focus session
  
  // Get current session activities
  const result = await chrome.storage.local.get(['sessionActivities']);
  const activities = result.sessionActivities || [];
  
  // Extract domain and title
  let domain = 'Unknown';
  let icon = '🌐';
  
  try {
    const url = new URL(tab.url);
    domain = url.hostname.replace('www.', '');
    
    // Skip study resources - they shouldn't count as distractions
    if (isStudyResource(domain)) {
      console.log('[Activity] Skipping study resource:', domain, '(not counted as distraction)');
      return;
    }
    
    // Set icon based on domain
    if (domain.includes('youtube')) icon = '📺';
    else if (domain.includes('github')) icon = '💻';
    else if (domain.includes('stackoverflow')) icon = '📚';
    else if (domain.includes('google')) icon = '🔍';
    else if (tab.url.endsWith('.pdf')) icon = '📄';
    else if (domain.includes('docs.google') || domain.includes('notion')) icon = '📝';
  } catch (e) {
    // Invalid URL, skip
    return;
  }
  
  // Add activity (only non-study sites reach here)
  activities.push({
    domain: domain,
    title: tab.title || domain,
    icon: icon,
    timestamp: Date.now()
  });
  
  // Keep only last 50 activities to avoid memory issues
  const recentActivities = activities.slice(-50);
  
  console.log('[Activity] Tracked activity:', domain, '- Total activities:', recentActivities.length);
  await chrome.storage.local.set({ sessionActivities: recentActivities });
}

// Track user activity
async function updateUserActivity(tab) {
  if (!tab || !tab.url) return;
  
  const state = await getState();
  if (!state.user) return; // Not registered
  
  let currentActivity = 'browsing';
  let currentUrl = tab.url;
  let videoTitle = null;
  let status = 'online';
  
  // Check what user is doing
  if (state.focusActive) {
    status = 'focusing';
    currentActivity = 'focusing';
  } else if (tab.url.includes('youtube.com/watch')) {
    status = 'youtube';
    currentActivity = 'youtube';
    
    // Save the actual video URL (not the oEmbed fetch URL)
    const videoUrl = tab.url;
    
    // Extract video ID and fetch video details from YouTube oEmbed
    try {
      const urlParams = new URL(videoUrl);
      const videoId = urlParams.searchParams.get('v');
      
      if (videoId) {
        console.log('[Activity] Fetching YouTube video info for:', videoId);
        
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await fetch(oembedUrl);
        
        if (response.ok) {
          const videoData = await response.json();
          videoTitle = videoData.title || null;
          
          // Store additional video info (use actual video URL, not oEmbed URL)
          await chrome.storage.local.set({
            youtubeVideo: {
              title: videoData.title,
              thumbnail: videoData.thumbnail_url,
              channel: videoData.author_name,
              videoId: videoId,
              url: videoUrl  // Use the actual video URL
            }
          });
          
          console.log('[Activity] ✅ YouTube video info:', videoData.title);
        } else {
          console.log('[Activity] ⚠️ oEmbed API failed, using fallback');
          // Fallback: try to extract from page
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.title.replace(/ - YouTube$/, '').trim()
          });
          if (result && result[0]?.result) {
            videoTitle = result[0].result;
          }
        }
      }
    } catch (e) {
      console.error('[Activity] Error fetching video info:', e);
    }
  }
  
  await chrome.storage.local.set({
    activity: {
      status: status,
      currentActivity,
      currentUrl: currentUrl.substring(0, 100), // Limit length
      tabTitle: tab.title || null,  // Include tab title
      videoTitle: videoTitle,
      focusActive: state.focusActive || false,
      lastUpdated: Date.now()
    }
  });
  
  // Also get the stored YouTube video info if available
  const storedVideo = await chrome.storage.local.get('youtubeVideo');
  if (storedVideo.youtubeVideo && status === 'youtube') {
    await chrome.storage.local.set({
      activity: {
        status: status,
        currentActivity,
        currentUrl: currentUrl.substring(0, 100),
        tabTitle: tab.title || null,  // Include tab title
        videoTitle: storedVideo.youtubeVideo.title,
        videoThumbnail: storedVideo.youtubeVideo.thumbnail,
        videoChannel: storedVideo.youtubeVideo.channel,
        focusActive: state.focusActive || false,
        lastUpdated: Date.now()
      }
    });
  }
}

// Idle state detection DISABLED - Don't pause timer when user works in other browsers
// If user switches to another browser to work, Chrome detects it as "idle" and extends the timer
// This causes a 30min session to take 40+ minutes in real time
/*
chrome.idle.onStateChanged.addListener(async (newState) => {
  const state = await getState();
  
  if (!state.focusActive) return; // Only care about idle during focus sessions
  
  console.log('[Idle] State changed to:', newState);
  
  if (newState === 'idle' || newState === 'locked') {
    // User went idle or locked screen - pause the timer
    console.log('[Idle] ⚠️ User went idle during focus session, pausing timer');
    
    await chrome.storage.local.set({
      idlePausedAt: Date.now(),
      wasIdleDuringSession: true
    });
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '⏸️ Timer Paused',
      message: 'Focus timer paused because you went idle. Resume when you return!',
      priority: 1
    });
  } else if (newState === 'active') {
    // User came back - resume timer
    const idlePausedAt = state.idlePausedAt;
    
    if (idlePausedAt) {
      const idleDuration = Date.now() - idlePausedAt;
      const idleMinutes = Math.floor(idleDuration / 60000);
      
      console.log('[Idle] ✅ User returned, was idle for', idleMinutes, 'minutes');
      
      // Extend session end time by idle duration (don't count idle time)
      const newSessionEnd = state.sessionEnd + idleDuration;
      const newSessionDuration = (state.sessionDuration || 0) + idleDuration;
      const totalIdleTime = (state.idleTimeAccumulated || 0) + idleDuration;
      
      // IMPORTANT: Do NOT extend plannedDurationSeconds - it should remain the original value
      // Only sessionEnd is extended to pause the timer, but final stats use original planned duration
      
      await chrome.storage.local.set({
        sessionEnd: newSessionEnd,
        sessionDuration: newSessionDuration,
        idlePausedAt: 0,
        idleTimeAccumulated: totalIdleTime
        // plannedDurationSeconds is NOT updated - keeps original value
      });
      
      // Update alarm
      chrome.alarms.create('focus-end', { when: newSessionEnd });
      
      console.log('[Idle] Extended session end time by', idleMinutes, 'minutes');
      
      // Show notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '▶️ Timer Resumed',
        message: `Welcome back! Timer extended by ${idleMinutes} minutes (idle time doesn't count).`,
        priority: 1
      });
    }
  }
});
*/

// Alarms to end session when time's up
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'activity-heartbeat') {
    // Handle activity heartbeat
    await sendActivityHeartbeat();
  } else if (alarm.name === 'presence-check') {
    // Handle presence check notification
    const state = await getState();
    
    if (state.focusActive) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '👋 Are you still there?',
        message: 'Tap to confirm you\'re still focusing',
        requireInteraction: true,
        buttons: [{ title: 'Yes, I\'m here!' }]
      }, (notificationId) => {
        // Store notification ID for handling response
        chrome.storage.local.set({ lastPresenceCheckId: notificationId });
      });
      
      // Schedule next check
      schedulePresenceChecks();
    }
  } else if (alarm.name === 'break-end') {
    // End the emergency break, resume blocking
    await chrome.storage.local.set({onBreak: false});
    console.log('[EmergencyBreak] Break ended, resuming blocking');
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Break Over ⏰',
      message: 'Emergency break ended. Back to focus mode!'
    });
  } else if (alarm.name === 'focus-end') {
    const state = await getState();
    
    // CRITICAL: Check if session is still active to prevent double-processing
    if (!state.focusActive) {
      console.log('[SessionEnd] ⚠️ Session already ended, skipping duplicate alarm');
      return;
    }
    
    // ALWAYS use the exact planned duration that was stored at session start
    // Fallback: If plannedDurationSeconds is missing/invalid, calculate from session times
    let durationSeconds = state.plannedDurationSeconds;
    
    if (!durationSeconds || durationSeconds <= 0) {
      console.warn('[SessionEnd] ⚠️ plannedDurationSeconds missing or invalid:', durationSeconds);
      console.warn('[SessionEnd] Calculating from sessionStart and sessionEnd...');
      
      // Calculate from actual session times (fallback)
      const sessionStart = state.sessionStart || 0;
      const sessionEnd = state.sessionEnd || Date.now();
      const elapsedMs = sessionEnd - sessionStart;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      
      // Round to nearest 5-minute interval (300 seconds) since all timers are multiples of 5
      const fiveMinutes = 5 * 60; // 300 seconds
      durationSeconds = Math.round(elapsedSeconds / fiveMinutes) * fiveMinutes;
      
      console.warn('[SessionEnd] Calculated duration:', elapsedSeconds, 'seconds (raw) →', durationSeconds, 'seconds (rounded to 5-min interval)');
    }
    
    console.log('[SessionEnd] ================================');
    console.log('[SessionEnd] State plannedDurationSeconds:', state.plannedDurationSeconds);
    console.log('[SessionEnd] State sessionStart:', new Date(state.sessionStart).toISOString());
    console.log('[SessionEnd] State sessionEnd:', new Date(state.sessionEnd).toISOString());
    console.log('[SessionEnd] State sessionDuration:', state.sessionDuration, 'ms');
    console.log('[SessionEnd] State idleTimeAccumulated:', state.idleTimeAccumulated, 'ms');
    console.log('[SessionEnd] Using duration:', durationSeconds, 'seconds (', Math.floor(durationSeconds / 60), 'minutes', durationSeconds % 60, 'seconds)');
    console.log('[SessionEnd] ================================');
    
    // Get session activities
    const result = await chrome.storage.local.get(['sessionActivities']);
    const activities = result.sessionActivities || [];
    
    // Save session summary with EXACT planned duration
    await chrome.storage.local.set({
      sessionSummary: {
        duration: durationSeconds,
        activities: activities,
        completedAt: Date.now()
      }
    });
    
    // Clear session activities
    await chrome.storage.local.remove('sessionActivities');
    
    // Use milliseconds for stats calculation
    const actualDuration = durationSeconds * 1000;
    
    // Check minimum session duration (15 minutes = 900000 ms)
    const minimumDuration = 15 * 60 * 1000; // 15 minutes minimum
    const earnedPoints = actualDuration >= minimumDuration;
    
    if (!earnedPoints) {
      console.log('[SessionEnd] Session too short for points:', Math.floor(actualDuration / 60000), 'minutes (minimum: 15 minutes)');
    } else {
      console.log('[SessionEnd] Updating stats for', Math.floor(actualDuration / 60000), 'minute session');
      // Update stats using ACTUAL elapsed time
      await updateSessionStats(actualDuration);
    }
    
    // IMPORTANT: Set focusActive to false FIRST to prevent duplicate processing
    await chrome.storage.local.set({focusActive:false, sessionEnd: 0, emergencyUsed: false, sessionBlockedCount: 0});
    
    // Clear alarms
    chrome.alarms.clear('focus-end');
    
    // Notify popup to update UI
    chrome.runtime.sendMessage({ action: 'sessionEnded' }).catch(() => {
      // Popup might not be open, that's okay
    });
    
    // Update activity back to online
    try {
      const token = (await chrome.storage.local.get('authToken'))?.authToken;
      if (token) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        const activity = getDetailedActivity(currentTab?.url, currentTab?.title, false);
        await chrome.storage.local.set({ activity: activity });
        
        const activityToSend = {
          status: activity.status || 'online',
          focusActive: false,
          currentUrl: activity.currentUrl || null,
          videoTitle: activity.videoTitle || null,
          videoThumbnail: activity.videoThumbnail || null,
          videoChannel: activity.videoChannel || null,
          activityType: activity.activityType || null,
          activityDetails: activity.activityDetails || null,
          actionButton: activity.actionButton || null
        };
        
        await fetch(`${API_BASE_URL}/api/users/activity`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ activity: activityToSend })
        });
      }
    } catch (error) {
      console.error('[SessionEnd] Error updating activity:', error);
    }
    
    // Update session summary with points earned status
    await chrome.storage.local.set({
      sessionSummary: {
        duration: durationSeconds,
        activities: activities,
        completedAt: Date.now(),
        earnedPoints: earnedPoints,
        minimumDuration: minimumDuration / 60000 // Store in minutes
      }
    });
    
    // Open session summary popup AFTER stats are updated
    console.log('[SessionEnd] Opening session summary popup with', activities.length, 'activities');
    chrome.windows.create({
      url: chrome.runtime.getURL('pages/session-summary.html'),
      type: 'popup',
      width: 650,
      height: 700
    }, (window) => {
      console.log('[SessionEnd] Session summary window created:', window.id);
    });
    
    // Start break time
    const breakDuration = 5; // 5 minutes break
    const breakEnd = Date.now() + (breakDuration * 60 * 1000);
    
    await chrome.storage.local.set({
      onBreak: true,
      breakEnd: breakEnd,
      breakDuration: breakDuration * 60 * 1000
    });
    
    // Set alarm to end break
    chrome.alarms.create('auto-break-end', { when: breakEnd });
    
    // Show break notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '🎉 Focus Session Complete!',
      message: `You focused for ${Math.floor(durationSeconds / 60)} minutes! Take a ${breakDuration} minute break.`,
      requireInteraction: true
    });
  } else if (alarm.name === 'auto-break-end') {
    // End the auto break
    await chrome.storage.local.set({onBreak: false, breakEnd: 0});
    console.log('[AutoBreak] Break ended');
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '⏰ Break Over!',
      message: 'Break time ended. Ready for another focus session?'
    });
  } else if (alarm.name === 'sync-from-mongodb') {
    console.log('[AutoSync] Pulling fresh data from MongoDB (source of truth)...');
    await syncFromMongoDB();
  } else if (alarm.name === 'version-check') {
    console.log('[VersionCheck] Performing periodic version check...');
    await checkVersionStatus();
  } else if (alarm.name === 'check-storage') {
    await checkStorageQuota();
  } else if (alarm.name === 'retry-sync') {
    // Retry syncing if we have pending offline data
    const state = await chrome.storage.local.get(['pendingSync', 'authToken']);
    if (state.pendingSync && state.authToken) {
      console.log('[RetrySync] Attempting to sync offline data...');
      const success = await syncCurrentStateToMongoDB();
      if (success) {
        await chrome.storage.local.set({ pendingSync: false });
        console.log('[RetrySync] ✅ Successfully synced offline data!');
        await syncFromMongoDB(); // Pull back to verify
      } else {
        console.warn('[RetrySync] ⚠️ Still offline, will retry later');
        // Retry again in 5 minutes
        chrome.alarms.create('retry-sync', { delayInMinutes: 5 });
      }
    }
  }
});

// Helper function to sync current state to MongoDB (Global scope)
// CRITICAL: Only call this after completing a session or earning achievements
// MongoDB uses incremental updates only (never decreases values)
async function syncCurrentStateToMongoDB() {
  try {
    const token = (await chrome.storage.local.get('authToken'))?.authToken;
    if (!token) {
      console.log('[Sync] No auth token, skipping sync');
      return false;
    }
    
    const currentState = await chrome.storage.local.get(['stats', 'points', 'level', 'badges', 'streak', 'focusHistory']);
    
    console.log('[Sync] Sending incremental update to MongoDB:', {
      totalFocusTime: currentState.stats?.totalFocusTime,
      sessions: currentState.stats?.sessionsCompleted,
      points: currentState.points,
      level: currentState.level
    });
    
    // Add timeout for offline detection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(`${API_URL}/users/stats`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        stats: currentState.stats,
        streak: currentState.streak,
        badges: currentState.badges || [], // Send full badge objects
        points: currentState.points,
        level: currentState.level,
        focusHistory: currentState.focusHistory || {}
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const result = await response.json();
      console.log('[Sync] ✅ Incremental update sent to MongoDB (server validates no decreases)');
      
      // Check if server rejected any values
      if (result.rejected) {
        if (result.rejected.totalFocusTime || result.rejected.sessionsCompleted) {
          console.warn('[Sync] ⚠️ Server rejected some values - local data is WRONG');
          console.warn('[Sync] Local had:', currentState.stats);
          console.warn('[Sync] MongoDB has:', result.user.stats);
          
          // Update local storage with correct MongoDB values
          await chrome.storage.local.set({
            stats: result.user.stats,
            points: result.user.points,
            level: result.user.level,
            badges: result.user.badges,
            streak: result.user.streak
          });
          console.log('[Sync] ✅ Corrected local data from MongoDB response');
        }
      }
      
      return true;
    } else {
      const errorText = await response.text();
      console.error('[Sync] MongoDB sync failed:', response.status, errorText);
      return false;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('[Sync] ⚠️ Request timeout - likely offline or poor connection');
    } else {
      console.error('[Sync] Failed to sync current state:', error.message);
    }
    // Don't throw - allow offline usage, data will sync when back online
    return false;
  }
}

// Update session stats and gamification
async function updateSessionStats(durationMs) {
  const state = await getState();
  const durationMin = Math.floor(durationMs / 60000);
  
  // Calculate focus score based on blocked attempts
  const sessionBlockedCount = state.sessionBlockedCount || 0;
  
  // Focus Score: 100% - (blocked attempts / (minutes * 0.5))
  // Allows ~0.5 blocks per minute before score drops significantly
  // Examples: 
  // - 0 blocks in 30min = 100% score
  // - 5 blocks in 30min = 67% score  
  // - 15 blocks in 30min = 0% score
  const maxExpectedBlocks = durationMin * 0.5;
  let focusScore = Math.max(0, 100 - (sessionBlockedCount / maxExpectedBlocks * 100));
  focusScore = Math.min(100, focusScore); // Cap at 100%
  
  // Focus multiplier (0.3x to 1.0x based on score)
  // Even low focus gives some XP, but focused sessions get full rewards
  const focusMultiplier = 0.3 + (focusScore / 100 * 0.7);
  
  console.log(`[FocusScore] Blocked: ${sessionBlockedCount}, Duration: ${durationMin}min, Score: ${focusScore.toFixed(1)}%, Multiplier: ${focusMultiplier.toFixed(2)}x`);
  
  // Update stats
  const newTotalTime = (state.stats.totalFocusTime || 0) + durationMin;
  const newSessions = (state.stats.sessionsCompleted || 0) + 1;
  
  // CRITICAL: Use session START time for date tracking (not end time)
  // This ensures cross-midnight sessions (e.g., 11:40 PM to 1 AM) are credited to the correct day
  let sessionStartTime = state.sessionStart || Date.now();
  
  // Validate session start time (detect clock issues)
  const now = Date.now();
  if (sessionStartTime > now) {
    console.warn('[SessionTracking] ⚠️ Session start time is in the future! Clock drift detected.');
    console.warn('[SessionTracking] Using current time instead');
    sessionStartTime = now - durationMs; // Estimate start time
  }
  
  if (now - sessionStartTime > 24 * 60 * 60 * 1000) {
    console.warn('[SessionTracking] ⚠️ Session started more than 24 hours ago!');
    console.warn('[SessionTracking] This might be a stuck session or clock issue');
  }
  
  const sessionStartDate = new Date(sessionStartTime);
  
  // Update daily focus time with IST date comparison (IST = UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
  const sessionStartIST = new Date(sessionStartDate.getTime() + istOffset);
  const sessionDateString = sessionStartIST.toISOString().substring(0, 10); // YYYY-MM-DD in IST
  
  console.log('[SessionTracking] Session started at:', sessionStartDate.toISOString());
  console.log('[SessionTracking] Session date (IST):', sessionDateString);
  console.log('[SessionTracking] Duration:', durationMin, 'minutes');
  
  let todayTime = state.todayFocusTime || 0;
  const storedDate = state.todayDate || '';
  
  // Check if we need to update today's time or if this session belongs to a previous day
  const currentTime = new Date();
  const currentDateIST = new Date(currentTime.getTime() + istOffset);
  const currentDateString = currentDateIST.toISOString().substring(0, 10);
  
  if (sessionDateString === currentDateString) {
    // Session belongs to today - add to today's time
    if (storedDate !== currentDateString) {
      todayTime = 0; // Reset if it's a new day
    }
    todayTime += durationMin;
    console.log('[SessionTracking] ✅ Session credited to today:', currentDateString, '- Total today:', todayTime, 'min');
  } else {
    // Session started on a previous day (cross-midnight or delayed sync)
    console.log('[SessionTracking] ⚠️ Session belongs to', sessionDateString, '(not today:', currentDateString, ')');
    // Don't add to todayTime, but still update streak and history for that date
  }
  
  // Update streak with IST-based date comparison (Duolingo-style)
  // CRITICAL: Use session START date for streak tracking
  let lastDate = state.streak?.lastSessionDate;
  
  // Migrate old date format to new format
  lastDate = normalizeDateToISO(lastDate);
  
  // Get yesterday based on session start date
  const yesterdaySessionIST = new Date(sessionStartIST.getTime() - (24 * 60 * 60 * 1000));
  const yesterdayDateString = yesterdaySessionIST.toISOString().substring(0, 10);
  
  let currentStreak = state.streak?.current || 0;
  let longestStreak = state.streak?.longest || 0;
  
  console.log('[Streak] Last session date (normalized):', lastDate);
  console.log('[Streak] This session date (IST):', sessionDateString);
  console.log('[Streak] Yesterday from session (IST):', yesterdayDateString);
  console.log('[Streak] Current streak before update:', currentStreak);
  
  // Duolingo-style streak logic:
  // - Only increment on FIRST session of each day
  // - If last session was yesterday, continue streak (+1)
  // - If last session was today, keep current streak (no increment)
  // - If last session was before yesterday, streak was already broken by checkStreakOnLogin()
  
  if (!lastDate) {
    // First session ever
    currentStreak = 1;
    console.log('[Streak] 🎉 First session ever! Streak started at 1');
  } else if (lastDate === sessionDateString) {
    // Already completed a session on this date - keep current streak (don't increment)
    console.log('[Streak] ✅ Already completed session on', sessionDateString, ', maintaining streak at', currentStreak);
  } else if (lastDate === yesterdayDateString) {
    // This is the FIRST session of this date, and last session was yesterday - continue streak!
    currentStreak++;
    console.log('[Streak] 🔥 First session of', sessionDateString, '! Continued from yesterday. New streak:', currentStreak);
  } else if (lastDate > sessionDateString) {
    // Last date is in the future somehow (clock issue or session from past being processed)
    console.log('[Streak] ⚠️ Session is from the past (', sessionDateString, 'vs last:', lastDate, '), keeping streak at', currentStreak);
  } else {
    // Last session was before yesterday (2+ days ago)
    console.log('[Streak] ❌ Last session was', lastDate, '(before', yesterdayDateString, '). Starting new streak at 1');
    currentStreak = 1;
  }
  
  // Always update longest if current is higher
  longestStreak = Math.max(longestStreak, currentStreak);
  
  console.log('[Streak] ✅ Updated - Current:', currentStreak, 'Longest:', longestStreak, 'Session date:', sessionDateString);
  
  // Progressive leveling system
  // Each level requires more XP: Level 1->2: 100, 2->3: 200, 3->4: 300, etc.
  const calculateLevel = (points) => {
    let level = 1;
    let totalXpNeeded = 0;
    let xpForNextLevel = 100; // Starting XP requirement
    
    while (points >= totalXpNeeded + xpForNextLevel) {
      totalXpNeeded += xpForNextLevel;
      level++;
      xpForNextLevel = level * 100; // Each level needs level * 100 XP
    }
    
    return level;
  };
  
  // Calculate base points with progressive scaling
  // First hour (0-60 min): 1 min = 1 point
  // Second hour (61-120 min): 1 min = 1.5 points
  // Third hour (121-180 min): 1 min = 2 points
  // After 180 min: capped at 180 min calculation (max 210 min sessions)
  let basePoints = 0;
  
  if (durationMin <= 60) {
    // First hour: 1x
    basePoints = durationMin;
  } else if (durationMin <= 120) {
    // First hour at 1x, second hour at 1.5x
    basePoints = 60 + ((durationMin - 60) * 1.5);
  } else {
    // First hour: 1x (60 pts), second: 1.5x (90 pts), third hour: 2x
    // Cap at 210 minutes max
    const thirdHourMinutes = Math.min(durationMin - 120, 60);
    basePoints = 60 + (60 * 1.5) + (thirdHourMinutes * 2);
  }
  
  // Bonus points
  if (durationMin >= 60) basePoints += 20; // 1 hour bonus
  if (currentStreak >= 7) basePoints += 50; // Week streak bonus
  
  // Apply focus multiplier to earned points
  const pointsEarned = Math.floor(basePoints * focusMultiplier);
  
  console.log(`[Points] Duration: ${durationMin}min, Base: ${basePoints.toFixed(1)}, Focus Multiplier: ${focusMultiplier.toFixed(2)}x, Final: ${pointsEarned}`);
  
  const newPoints = (state.points || 0) + pointsEarned;
  const newLevel = calculateLevel(newPoints);
  
  // Check for new badges
  const currentBadges = state.badges || [];
  const updatedBadges = await checkBadges(currentBadges, newTotalTime, newSessions, currentStreak, newLevel);
  
  // Save everything including points earned for this session
  try {
    await chrome.storage.local.set({
      stats: {
        ...state.stats,
        totalFocusTime: newTotalTime,
        sessionsCompleted: newSessions
      },
      streak: {
        current: currentStreak,
        longest: longestStreak,
        lastSessionDate: sessionDateString // Store session START date in IST
      },
      points: newPoints,
      level: newLevel,
      badges: updatedBadges,
      todayFocusTime: todayTime,
      todayDate: currentDateString, // Store current date (for today's time tracking)
      sessionPointsEarned: pointsEarned // Store points earned this session for summary display
    });
  } catch (error) {
    console.error('[Storage] CRITICAL: Failed to save session stats:', error);
    
    // Try to save critical data only (minimal payload)
    try {
      await chrome.storage.local.set({
        stats: { totalFocusTime: newTotalTime, sessionsCompleted: newSessions },
        points: newPoints,
        level: newLevel
      });
      console.log('[Storage] ✅ Saved critical stats only');
    } catch (criticalError) {
      console.error('[Storage] FATAL: Cannot save even critical data:', criticalError);
      // Last resort - try to notify user
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '⚠️ Storage Error',
        message: 'Session completed but could not save data. Please check browser storage.',
        priority: 2
      }).catch(() => {});
    }
  }
  
  // Update focus history for heatmap - use session start date
  try {
    const historyResult = await chrome.storage.local.get('focusHistory');
    const focusHistory = historyResult.focusHistory || {};
    
    // Add session time to the date it was started on
    if (!focusHistory[sessionDateString]) {
      focusHistory[sessionDateString] = 0;
    }
    focusHistory[sessionDateString] += durationMin;
    
    console.log('[FocusHistory] Added', durationMin, 'min to', sessionDateString, '- Total:', focusHistory[sessionDateString], 'min');
    
    // Cleanup old history if storage is getting full (keep last 365 days)
    const dates = Object.keys(focusHistory).sort();
    if (dates.length > 365) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 365);
      const cutoffString = cutoffDate.toISOString().substring(0, 10);
      
      dates.forEach(date => {
        if (date < cutoffString) {
          delete focusHistory[date];
        }
      });
      console.log('[FocusHistory] Cleaned up old data, keeping last 365 days');
    }
    
    await chrome.storage.local.set({ focusHistory });
  } catch (error) {
    console.error('[FocusHistory] Failed to save history:', error);
    // Non-critical, continue without history update
  }
  
  // Update study group stats if user has active groups
  const groupResult = await chrome.storage.local.get('activeGroupIds');
  const activeGroupIds = groupResult.activeGroupIds || [];
  if (activeGroupIds.length > 0 && durationMin > 0) {
    const token = (await chrome.storage.local.get('authToken'))?.authToken;
    if (token) {
      for (const groupId of activeGroupIds) {
        try {
          await fetch(`${API_BASE_URL}/api/groups/${groupId}/stats`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ focusTime: durationMin })
          });
        } catch (error) {
          console.error('Failed to update group stats:', error);
        }
      }
    }
  }
  
  // Sync to MongoDB after session completion
  const syncSuccess = await syncCurrentStateToMongoDB();
  
  if (syncSuccess) {
    console.log('[Sync] ✅ Stats and badges synced to MongoDB');
    // DON'T pull from MongoDB here - it can cause race conditions and double-counting
    // Our local data is correct since we just calculated it
    // The periodic sync will keep things in sync
  } else {
    console.warn('[Sync] ⚠️ MongoDB sync failed (likely offline) - data saved locally and will sync when online');
    // Mark that we have pending sync
    await chrome.storage.local.set({ pendingSync: true, lastOfflineSession: Date.now() });
  }
  
  // Try to sync when back online (if we were offline)
  if (!syncSuccess) {
    // Set up a retry mechanism
    chrome.alarms.create('retry-sync', { delayInMinutes: 5 });
  }
  
  // Update user data in allUsers registry for friends to see
  if (state.user) {
    const allUsers = state.allUsers || {};
    if (allUsers[state.user.username]) {
      allUsers[state.user.username] = {
        ...allUsers[state.user.username],
        level: newLevel,
        points: newPoints,
        stats: {
          totalFocusTime: newTotalTime,
          sessionsCompleted: newSessions
        }
      };
      await chrome.storage.local.set({allUsers});
    }
  }
}

async function checkBadges(badges, totalTime, sessions, streak, level, silent = false) {
  // Ensure badges is always an array and filter out invalid entries
  const validBadges = Array.isArray(badges) ? badges.filter(b => b && b.id) : [];
  
  console.log('[Badges] ========== BADGE CHECK START ==========');
  console.log('[Badges] Input parameters:');
  console.log('  - Total Time:', totalTime, 'minutes (', Math.floor(totalTime/60), 'hours )');
  console.log('  - Sessions:', sessions);
  console.log('  - Streak:', streak, 'days');
  console.log('  - Level:', level);
  console.log('  - Current badges:', validBadges.length, '-', validBadges.map(b => b.id).join(', '));
  
  const newBadges = [
    // Session-based achievements
    {id: 'first-session', name: 'First Step', desc: 'Complete first session', condition: sessions >= 1},
    {id: 'getting-started', name: 'Getting Started', desc: 'Complete 5 sessions', condition: sessions >= 5},
    {id: 'dedicated', name: 'Dedicated', desc: 'Complete 10 sessions', condition: sessions >= 10},
    {id: 'focus-warrior', name: 'Focus Warrior', desc: '25 sessions completed', condition: sessions >= 25},
    {id: 'session-master', name: 'Session Master', desc: '50 sessions completed', condition: sessions >= 50},
    
    // Time-based achievements (in minutes)
    {id: 'hour-achiever', name: 'Hour Achiever', desc: '5+ hours focused', condition: totalTime >= 300},
    {id: 'time-warrior', name: 'Time Warrior', desc: '25+ hours focused', condition: totalTime >= 1500},
    {id: 'focus-champion', name: 'Focus Champion', desc: '100+ hours focused', condition: totalTime >= 6000},
    
    // Streak-based achievements
    {id: 'streak-starter', name: 'Streak Starter', desc: '3 day streak', condition: streak >= 3},
    {id: 'streak-master', name: 'Streak Master', desc: '7 day streak', condition: streak >= 7},
    {id: 'streak-legend', name: 'Streak Legend', desc: '30 day streak', condition: streak >= 30},
    
    // Level-based achievements
    {id: 'level-up', name: 'Level Up', desc: 'Reached level 3', condition: level >= 3},
    {id: 'rising-star', name: 'Rising Star', desc: 'Reached level 5', condition: level >= 5},
    {id: 'productivity-king', name: 'Productivity King', desc: 'Reached level 10', condition: level >= 10},
    
    // Time-based (checked separately)
    {id: 'early-bird', name: 'Early Bird', desc: 'Focused before 8 AM', condition: false},
    {id: 'night-owl', name: 'Night Owl', desc: 'Focused after 10 PM', condition: false},
    
    // Social (checked separately)
    {id: 'social-butterfly', name: 'Social Butterfly', desc: '5+ friends', condition: false}
  ];
  
  console.log('[Badges] ========================================');
  console.log('[Badges] Checking each badge condition:');
  
  let hasNewBadges = false;
  for (const badge of newBadges) {
    const alreadyEarned = validBadges.find(b => b.id === badge.id);
    console.log(`[Badge] ${badge.id}: ${badge.condition ? '✓ QUALIFIED' : '✗ Not qualified'} | ${alreadyEarned ? 'Already earned' : 'Not earned yet'}`);
    
    if (badge.condition && !alreadyEarned) {
      console.log('[Badge] 🎉 UNLOCKING:', badge.name, '-', badge.desc);
      const newBadge = {id: badge.id, name: badge.name, desc: badge.desc, earnedAt: Date.now()};
      validBadges.push(newBadge);
      hasNewBadges = true;
      
      // Only show notifications if not in silent mode (i.e., during actual gameplay, not manual checks)
      if (!silent) {
        // Show system notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '🏆 New Badge Unlocked!',
          message: `${badge.name}: ${badge.desc}`
        });
        
        // Send message to dashboard for popup animation
        chrome.runtime.sendMessage({
          action: 'badgeUnlocked',
          badge: newBadge
        }).catch(() => {
          // Dashboard might not be open, that's okay
          console.log('[Badge] Dashboard not open for popup notification');
        });
      }
    }
  }
  
  console.log('[Badges] ========================================');
  if (hasNewBadges) {
    console.log('[Badges] 🎉 NEW BADGES UNLOCKED! Total earned:', validBadges.length);
  } else {
    console.log('[Badges] No new badges this time. Total earned:', validBadges.length);
  }
  console.log('[Badges] Final badge IDs:', validBadges.map(b => b.id).join(', '));
  console.log('[Badges] ========== BADGE CHECK END ==========');
  return validBadges;
}

// Messaging API for popup/options
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // Version check handler - allows popup to check before showing UI
    if (msg.action === 'checkVersionStatus') {
      const allowed = await checkVersionStatus();
      sendResponse({ 
        allowed: allowed, 
        reason: blockReason || 'Version check required',
        extensionBlocked: extensionBlocked
      });
      return;
    }
    
    if (msg.action === 'startSession') {
      console.log('[StartSession] Checking version status...');
      console.log('[StartSession] Current blocked status:', extensionBlocked);
      
      // CRITICAL: Check if extension is blocked before starting session
      const versionAllowed = await checkVersionStatus();
      
      console.log('[StartSession] Version check result:', versionAllowed);
      console.log('[StartSession] Extension blocked:', extensionBlocked);
      console.log('[StartSession] Block reason:', blockReason);
      
      if (!versionAllowed) {
        console.error('[StartSession] ❌ BLOCKING SESSION - Version not allowed');
        sendResponse({
          ok: false, 
          err: 'version-blocked',
          message: blockReason || 'This version is blocked due to critical bugs. Please update the extension.'
        });
        return;
      }
      
      console.log('[StartSession] ✅ Version check passed, starting session...');
      
      const durationMin = Number(msg.durationMin) || 25;
      const passcode = msg.passcode || null;
      const preset = msg.preset || null;
      const now = nowMs();
      const end = now + durationMin*60*1000;
      
      // Apply preset if provided
      let allowedSites = (await getState()).allowed;
      if (preset) {
        const state = await getState();
        const presetData = state.presets?.[preset];
        if (presetData) {
          allowedSites = presetData.allowedSites;
        }
      }
      
      console.log('[StartSession] ⏱️ Setting timer for', durationMin, 'minutes =', durationMin * 60, 'seconds');
      
      await chrome.storage.local.set({
        focusActive:true, 
        sessionEnd: end, 
        sessionStart: now,
        sessionDuration: durationMin*60*1000,
        plannedDurationSeconds: durationMin * 60, // Store exact seconds for stats
        passcode: passcode || undefined,
        allowed: allowedSites,
        sessionBlockedCount: 0, // Reset blocked count for new session
        idleTimeAccumulated: 0, // Reset idle time
        idlePausedAt: 0,
        wasIdleDuringSession: false
      });
      
      console.log('[StartSession] ✅ Stored plannedDurationSeconds:', durationMin * 60);
      
      // Update activity to focusing
      try {
        const token = (await chrome.storage.local.get('authToken'))?.authToken;
        console.log('[StartSession] Token available:', !!token);
        
        if (token) {
          console.log('[StartSession] Sending activity update to backend...');
          
          // Get all tabs to find YouTube (popup might be active)
          const allTabs = await chrome.tabs.query({});
          console.log('[StartSession] Total tabs found:', allTabs.length);
          
          let currentTab = null;
          
          // Find YouTube tab first
          const youtubeTabs = allTabs.filter(tab => tab.url && tab.url.includes('youtube.com/watch'));
          console.log('[StartSession] YouTube tabs found:', youtubeTabs.length);
          
          if (youtubeTabs.length > 0) {
            currentTab = youtubeTabs[0]; // Use first YouTube tab found
            console.log('[StartSession] Using YouTube tab');
          } else {
            // Otherwise use the most recent non-extension tab
            const nonExtensionTabs = allTabs.filter(tab => tab.url && !tab.url.startsWith('chrome-extension://'));
            if (nonExtensionTabs.length > 0) {
              currentTab = nonExtensionTabs[0];
              console.log('[StartSession] Using first non-extension tab');
            }
          }
          
          console.log('[StartSession] Current tab URL:', currentTab?.url);
          console.log('[StartSession] Current tab title:', currentTab?.title);
          
          // Use enhanced activity detection
          const activity = getDetailedActivity(
            currentTab?.url,
            currentTab?.title,
            true // focusActive
          );
          
          // Store full activity locally
          await chrome.storage.local.set({ activity: activity });
          
          // Prepare activity data with ALL fields
          const activityToSend = {
            status: activity.status || 'focusing',
            focusActive: true,
            startTime: now,
            currentUrl: activity.currentUrl || currentTab?.url || null,
            videoTitle: activity.videoTitle || null,
            videoThumbnail: activity.videoThumbnail || null,
            videoChannel: activity.videoChannel || null,
            activityType: activity.activityType || null,
            activityDetails: activity.activityDetails || null,
            actionButton: activity.actionButton || null
          };
          
          console.log('[StartSession] Activity data to send:', JSON.stringify(activityToSend, null, 2));
          
          const response = await fetch(`${API_BASE_URL}/api/users/activity`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ activity: activityToSend })
          });
          
          if (response.ok) {
            console.log('[StartSession] ✅ Status updated to focusing');
            const responseData = await response.json();
            console.log('[StartSession] Backend response:', responseData);
          } else {
            console.error('[StartSession] ❌ Failed:', response.status, await response.text());
          }
        } else {
          console.log('[StartSession] ⚠️ No auth token - user not logged in');
        }
      } catch (error) {
        console.error('[StartSession] ❌ Error updating status:', error);
      }
      
      // Clear any previous session activities
      await chrome.storage.local.set({ sessionActivities: [] });
      
      chrome.alarms.create('focus-end', {when: end});
      
      // Schedule presence checks
      schedulePresenceChecks();
      
      sendResponse({ok:true, end});
    } else if (msg.action === 'endSession') {
      const s = await chrome.storage.local.get();
      const pass = s.passcode;
      if (s.focusActive) {
        // require passcode to end early
        if (!pass || msg.passcode === pass) {
          await chrome.storage.local.set({focusActive:false, sessionEnd:0});
          chrome.alarms.clear('focus-end');
          
          // Update activity back to online
          try {
            const token = (await chrome.storage.local.get('authToken'))?.authToken;
            console.log('[EndSession] Updating status to online...');
            
            if (token) {
              // Get current tab
              const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
              const currentTab = tabs[0];
              
              // Use enhanced activity detection with focusActive = false
              const activity = getDetailedActivity(
                currentTab?.url,
                currentTab?.title,
                false // focusActive = false (session ended)
              );
              
              // Store full activity locally
              await chrome.storage.local.set({ activity: activity });
              
              // Prepare activity data with ALL fields
              const activityToSend = {
                status: activity.status || 'online',
                focusActive: false,
                currentUrl: activity.currentUrl || null,
                videoTitle: activity.videoTitle || null,
                videoThumbnail: activity.videoThumbnail || null,
                videoChannel: activity.videoChannel || null,
                activityType: activity.activityType || null,
                activityDetails: activity.activityDetails || null,
                actionButton: activity.actionButton || null
              };
              
              const response = await fetch(`${API_BASE_URL}/api/users/activity`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ activity: activityToSend })
              });
              
              if (response.ok) {
                console.log('[EndSession] ✅ Status updated to online');
              } else {
                console.error('[EndSession] ❌ Failed:', response.status, await response.text());
              }
            }
          } catch (error) {
            console.error('[EndSession] ❌ Error:', error);
          }
          
          sendResponse({ok:true});
        } else {
          sendResponse({ok:false, err: 'wrong-passcode'});
        }
      } else sendResponse({ok:true});
    } else if (msg.action === 'emergencyBreak') {
      const s = await chrome.storage.local.get({emergencyUsed:false, sessionEnd:0, focusActive:false});
      if (s.emergencyUsed) { sendResponse({ok:false, err:'used'}); return; }
      if (!s.focusActive) { sendResponse({ok:false, err:'not active'}); return; }
      
      // Pause the timer for 2 minutes
      const now = nowMs();
      const remainingTime = Math.max(0, s.sessionEnd - now);
      const breakEndTime = now + 2*60*1000;
      const resumeTime = breakEndTime + remainingTime;
      
      await chrome.storage.local.set({
        emergencyUsed: true,
        onBreak: true,
        breakEndTime: breakEndTime,
        pausedSessionEnd: s.sessionEnd, // Store original end time
        sessionEnd: resumeTime // New end time after break
      });
      
      // Set alarm for when break ends
      chrome.alarms.create('break-end', {when: breakEndTime});
      chrome.alarms.create('focus-end', {when: resumeTime});
      
      sendResponse({ok:true, breakEnd: breakEndTime, resumeTime: resumeTime});
    } else if (msg.action === 'getState') {
      const s = await chrome.storage.local.get();
      sendResponse(s);
    } else if (msg.action === 'checkForUpdates') {
      // Handle manual update check request
      (async () => {
        await checkForUpdates();
        sendResponse({ok: true});
      })();
      return true; // Keep message channel open for async response
    } else if (msg.action === 'downloadUpdate') {
      // Handle update download request from popup
      (async () => {
        await downloadUpdate();
        sendResponse({ok: true});
      })();
      return true; // Keep message channel open for async response
    } else if (msg.action === 'syncFromMongoDB') {
      await syncFromMongoDB();
      sendResponse({ok: true});
    } else if (msg.action === 'updateLists') {
      await chrome.storage.local.set({allowed: msg.allowed || [], blockedKeywords: msg.blocked || []});
      sendResponse({ok:true});
    } else if (msg.action === 'setPasscode') {
      await chrome.storage.local.set({passcode: msg.passcode});
      sendResponse({ok:true});
    } else if (msg.action === 'updateSettings') {
      await chrome.storage.local.set(msg.settings);
      
      // Sync to MongoDB
      try {
        const token = (await chrome.storage.local.get('authToken'))?.authToken;
        if (token) {
          await fetch(`${API_BASE_URL}/api/users/settings`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              settings: {
                dailyGoal: msg.settings.dailyGoal,
                pomodoroEnabled: msg.settings.pomodoroEnabled || false,
                focusTime: msg.settings.focusTime || 25,
                breakTime: msg.settings.pomodoroBreakDuration || 5
              }
            })
          });
          console.log('Settings synced to MongoDB');
        }
      } catch (error) {
        console.error('Failed to sync settings:', error);
      }
      
      sendResponse({ok:true});
    } else if (msg.action === 'addCustomBlock') {
      const s = await getState();
      const blocked = s.blockedKeywords || [];
      if (!blocked.includes(msg.site)) {
        blocked.push(msg.site);
        await chrome.storage.local.set({blockedKeywords: blocked});
      }
      sendResponse({ok:true});
    } else if (msg.action === 'removeCustomBlock') {
      // Prevent removal of permanent blocked sites
      if (PERMANENT_BLOCKED_SITES.includes(msg.site)) {
        sendResponse({ok: false, error: 'Cannot remove core social media sites'});
        return;
      }
      
      const s = await getState();
      const blocked = (s.blockedKeywords || []).filter(b => b !== msg.site);
      await chrome.storage.local.set({blockedKeywords: blocked});
      sendResponse({ok:true});
    } else if (msg.action === 'addPermanentBlock') {
      const s = await getState();
      const permanentBlocked = s.permanentBlocked || [];
      const site = msg.site.toLowerCase().trim();
      
      if (!permanentBlocked.includes(site)) {
        permanentBlocked.push(site);
        await chrome.storage.local.set({permanentBlocked: permanentBlocked});
        console.log('[PermanentBlock] Added site:', site, '- Total:', permanentBlocked.length);
        
        // Immediately check all open tabs and close any matching the blocked site
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          if (tab.url) {
            const url = tab.url.toLowerCase();
            const hostname = (new URL(tab.url)).hostname.toLowerCase();
            
            if (url.includes(site) || hostname.includes(site)) {
              console.log('[PermanentBlock] Closing tab with blocked site:', hostname);
              await chrome.tabs.update(tab.id, {url: chrome.runtime.getURL('pages/blocked.html')});
            }
          }
        }
      }
      sendResponse({ok:true});
    } else if (msg.action === 'removePermanentBlock') {
      const s = await getState();
      const permanentBlocked = (s.permanentBlocked || []).filter(b => b !== msg.site);
      await chrome.storage.local.set({permanentBlocked: permanentBlocked});
      console.log('[PermanentBlock] Removed site:', msg.site, '- Remaining:', permanentBlocked.length);
      sendResponse({ok:true});
    } else if (msg.action === 'registerUser') {
      const state = await getState();
      const allUsers = state.allUsers || {};
      
      // Check if username exists
      if (allUsers[msg.userData.username]) {
        sendResponse({ok: false, error: 'Username taken'});
        return;
      }
      
      // Register user
      allUsers[msg.userData.username] = msg.userData;
      await chrome.storage.local.set({
        user: msg.userData,
        allUsers: allUsers,
        activity: {
          status: 'online',
          currentUrl: null,
          focusActive: false,
          lastUpdated: Date.now()
        }
      });
      sendResponse({ok: true});
    } else if (msg.action === 'getUsers') {
      const state = await getState();
      sendResponse(state.allUsers || {});
    } else if (msg.action === 'addFriend') {
      const state = await getState();
      const friends = state.friends || [];
      const allUsers = state.allUsers || {};
      
      // Find user by username
      const friendData = allUsers[msg.username];
      if (!friendData) {
        sendResponse({ok: false, error: 'User not found'});
        return;
      }
      
      if (!friends.includes(friendData.userId)) {
        friends.push(friendData.userId);
        const friendsData = state.friendsData || {};
        friendsData[friendData.userId] = {
          ...friendData,
          addedAt: Date.now()
        };
        await chrome.storage.local.set({friends, friendsData});
      }
      sendResponse({ok: true});
    } else if (msg.action === 'removeFriend') {
      const state = await getState();
      const friends = (state.friends || []).filter(id => id !== msg.userId);
      const friendsData = state.friendsData || {};
      delete friendsData[msg.userId];
      await chrome.storage.local.set({friends, friendsData});
      sendResponse({ok: true});
    } else if (msg.action === 'updateActivity') {
      await chrome.storage.local.set({
        activity: {
          ...msg.activity,
          lastUpdated: Date.now()
        }
      });
      sendResponse({ok: true});
    } else if (msg.action === 'getFriends') {
      const state = await getState();
      const friendsData = state.friendsData || {};
      const friends = state.friends || [];
      
      // Get fresh activity for friends (simulate - in real app would fetch from server)
      const friendsList = friends.map(userId => friendsData[userId]).filter(Boolean);
      sendResponse({friends: friendsList});
    } else if (msg.action === 'checkBadges') {
      console.log('[Badge Check] Manual badge check triggered');
      const state = await getState();
      const currentBadges = state.badges || [];
      const totalTime = state.stats?.totalFocusTime || 0;
      const sessions = state.stats?.sessionsCompleted || 0;
      const currentStreak = state.streak?.current || 0;
      const level = state.level || 1;
      
      console.log('[Badge Check] Current stats - Sessions:', sessions, 'Time:', totalTime, 'Streak:', currentStreak, 'Level:', level);
      console.log('[Badge Check] Existing badges:', currentBadges.length);
      
      // Use silent mode for manual checks to avoid duplicate notifications
      const newBadges = await checkBadges(currentBadges, totalTime, sessions, currentStreak, level, true);
      console.log('[Badge Check] After check, total badges:', newBadges.length);
      
      // Save updated badges to local storage
      await chrome.storage.local.set({ badges: newBadges });
      console.log('[Badge Check] ✅ Badges saved to local storage');
      
      // Sync to MongoDB and wait for completion
      const syncSuccess = await syncCurrentStateToMongoDB();
      if (syncSuccess) {
        console.log('[Badge Check] ✅ Synced to MongoDB successfully');
      } else {
        console.warn('[Badge Check] ⚠️ MongoDB sync failed, badges saved locally only');
      }
      
      sendResponse({badges: newBadges, success: true, synced: syncSuccess});
    } else if (msg.action === 'userRegistered') {
      // Handle user registration/login notification
      console.log('[Background] User registered/logged in:', msg.user?.username);
      
      // Trigger immediate activity update
      sendActivityHeartbeat();
      
      // Acknowledge to unblock UI
      sendResponse({ok: true});
    } else {
      // Catch-all for unknown messages to prevent hanging
      console.warn('[Background] Unknown message action:', msg.action);
      sendResponse({ok: false, error: 'Unknown action'});
    }
  })();
  // indicate we'll respond asynchronously
  return true;
});

// Helper function to normalize date format (handles both old and new formats)
function normalizeDateToISO(dateStr) {
  if (!dateStr) return null;
  
  // If already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // If in old format like "Tue Dec 09 2025", convert to YYYY-MM-DD
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.log('[Date Migration] Invalid date:', dateStr);
      return null;
    }
    const normalized = date.toISOString().substring(0, 10);
    console.log('[Date Migration] Converted old format:', dateStr, '→', normalized);
    return normalized;
  } catch (error) {
    console.error('[Date Migration] Error converting date:', dateStr, error);
    return null;
  }
}

// Check if streak should be broken (user missed yesterday)
// This function fetches streak from MongoDB and checks if it should be broken
async function checkStreakOnLogin() {
  try {
    const token = (await chrome.storage.local.get('authToken'))?.authToken;
    if (!token) {
      console.log('[Streak Check] No auth token, skipping');
      return;
    }
    
    // Fetch user data from MongoDB
    const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      console.log('[Streak Check] Failed to fetch profile');
      return;
    }
    
    const userData = await response.json();
    let lastSessionDate = userData.streak?.lastSessionDate;
    
    // Migrate old date format to new format
    lastSessionDate = normalizeDateToISO(lastSessionDate);
    
    if (!lastSessionDate) {
      console.log('[Streak Check] No previous sessions');
      return;
    }
    
    // Get yesterday and today in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const yesterdayIST = new Date(istTime.getTime() - (24 * 60 * 60 * 1000));
    const yesterdayDateString = yesterdayIST.toISOString().substring(0, 10);
    const todayDateString = istTime.toISOString().substring(0, 10);
    
    console.log('[Streak Check] MongoDB last session:', lastSessionDate);
    console.log('[Streak Check] Yesterday (IST):', yesterdayDateString);
    console.log('[Streak Check] Today (IST):', todayDateString);
    console.log('[Streak Check] Current streak:', userData.streak?.current);
    
    // If last session was before yesterday (more than 1 day ago), break the streak
    if (lastSessionDate < yesterdayDateString && lastSessionDate !== todayDateString) {
      const currentStreak = userData.streak?.current || 0;
      console.log('[Streak Check] ❌ Streak broken! Last session was', lastSessionDate, '(missed yesterday). Resetting from', currentStreak, 'to 0');
      
      // Update MongoDB first
      const updateResponse = await fetch(`${API_BASE_URL}/api/users/stats`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          streak: {
            current: 0,
            longest: userData.streak?.longest || 0,
            lastSessionDate: lastSessionDate // Keep last date
          }
        })
      });
      
      if (updateResponse.ok) {
        console.log('[Streak Check] ✅ Synced broken streak to MongoDB');
        
        // Update local storage to match
        await chrome.storage.local.set({
          streak: {
            current: 0,
            longest: userData.streak?.longest || 0,
            lastSessionDate: lastSessionDate
          }
        });
        console.log('[Streak Check] ✅ Updated local storage');
      }
    } else {
      console.log('[Streak Check] ✅ Streak is safe! Last session:', lastSessionDate, 'Current streak:', userData.streak?.current);
      
      // Update local storage with MongoDB data
      await chrome.storage.local.set({
        streak: {
          current: userData.streak?.current || 0,
          longest: userData.streak?.longest || 0,
          lastSessionDate: lastSessionDate
        }
      });
    }
  } catch (error) {
    console.error('[Streak Check] Error:', error);
  }
}

// Handle browser startup/restart - check version, sync from MongoDB, then check sessions
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Startup] Browser started, checking version...');
  await checkVersionStatus(); // Check if version is blocked
  console.log('[Startup] Syncing from MongoDB...');
  await syncFromMongoDB(); // Pull fresh data from authoritative source
  await handleBrowserClosedDuringSession(); // Handle sessions that were active when browser closed
});

// Handle sessions where browser was closed
// CRITICAL: Do NOT count time when browser was closed as focus time!
async function handleBrowserClosedDuringSession() {
  try {
    const state = await getState();
    const now = Date.now();
    
    // Check if there was an active focus session when browser was closed
    if (state.focusActive && state.sessionStart) {
      console.log('[BrowserClosed] Found active session from closed browser');
      console.log('[BrowserClosed] Session started:', new Date(state.sessionStart).toISOString());
      console.log('[BrowserClosed] Planned end:', new Date(state.sessionEnd).toISOString());
      console.log('[BrowserClosed] Browser reopened:', new Date(now).toISOString());
      
      // Check if session should have ended by now (allow 5 second tolerance)
      if (now >= state.sessionEnd - 5000) {
        // Session timer finished while browser was closed
        // Use EXACT planned duration (what user set)
        const plannedSeconds = state.plannedDurationSeconds || Math.floor((state.sessionEnd - state.sessionStart) / 1000);
        const plannedMinutes = Math.floor(plannedSeconds / 60);
        
        console.log('[BrowserClosed] ✅ Timer finished while browser closed. Using EXACT planned duration:', plannedMinutes, 'minutes');
        
        // Save session summary with exact planned duration
        await chrome.storage.local.set({
          sessionSummary: {
            duration: plannedSeconds,
            activities: [],
            completedAt: state.sessionEnd, // Use when it SHOULD have ended
            earnedPoints: plannedSeconds >= 900, // 15 minutes minimum
            minimumDuration: 15
          }
        });
        
        // Award stats for planned duration
        if (plannedSeconds >= 900) { // 15 minutes
          await updateSessionStats(plannedSeconds * 1000);
        }
        
        // Show notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '✅ Session Recovered',
          message: `Credited ${plannedMinutes} minutes from your session that finished while browser was closed!`,
          requireInteraction: false
        });
        
        // Open session summary
        chrome.windows.create({
          url: chrome.runtime.getURL('pages/session-summary.html'),
          type: 'popup',
          width: 650,
          height: 700
        });
      } else {
        // Session was interrupted (browser closed before timer ended)
        console.log('[BrowserClosed] ⚠️ Session interrupted - timer had not finished yet');
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '⏸️ Session Interrupted',
          message: 'Your previous session was interrupted and was not counted.',
          requireInteraction: false
        });
      }
      
      // Reset focus state
      await chrome.storage.local.set({
        focusActive: false,
        sessionEnd: 0,
        sessionStart: 0,
        sessionPausedAt: 0,
        emergencyUsed: false,
        sessionBlockedCount: 0,
        idleTimeAccumulated: 0,
        idlePausedAt: 0
      });
      
      // Clear any pending alarms
      await chrome.alarms.clearAll();
      
      // Update activity status
      try {
        const token = state.authToken;
        if (token) {
          await chrome.storage.local.set({ 
            activity: {
              status: 'online',
              focusActive: false,
              currentUrl: null
            }
          });
          
          await fetch(`${API_BASE_URL}/api/users/activity`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ 
              activity: {
                status: 'online',
                focusActive: false,
                currentUrl: null
              }
            })
          });
        }
      } catch (error) {
        console.error('[BrowserClosed] Error updating activity:', error);
      }
    }
  } catch (error) {
    console.error('[BrowserClosed] Error:', error);
    // Always reset to ensure user isn't stuck
    await chrome.storage.local.set({
      focusActive: false,
      sessionEnd: 0,
      sessionStart: 0,
      sessionPausedAt: 0,
      emergencyUsed: false,
      sessionBlockedCount: 0,
      idleTimeAccumulated: 0,
      idlePausedAt: 0
    });
  }
}

// Detect when browser is about to close - pause the session
chrome.runtime.onSuspend.addListener(async () => {
  console.log('[Suspend] Browser closing, pausing focus session...');
  const state = await getState();
  
  if (state.focusActive) {
    await chrome.storage.local.set({
      sessionPausedAt: Date.now()
    });
    console.log('[Suspend] ✅ Session paused');
  }
});

// Schedule presence check notifications at random intervals
function schedulePresenceChecks() {
  const intervals = [5, 7, 13, 17]; // Minutes
  const randomInterval = intervals[Math.floor(Math.random() * intervals.length)];
  const nextCheckTime = Date.now() + (randomInterval * 60 * 1000);
  
  chrome.alarms.create('presence-check', { when: nextCheckTime });
  console.log(`[PresenceCheck] Next check scheduled in ${randomInterval} minutes`);
}

// Initialize defaults on installed
chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get();
  await chrome.storage.local.set(Object.assign({}, DEFAULTS, s));
  
  // Check version status immediately on install/update
  console.log('[Install] Checking version status...');
  await checkVersionStatus();
  
  // Check for sessions from previous browser session
  await handleBrowserClosedDuringSession();
  
  // Load data from MongoDB if user is logged in (includes streak check)
  try {
    const token = s.authToken;
    if (token) {
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('[Init] Syncing data from MongoDB:', userData.username);
        
        // Normalize lastSessionDate to new format
        const normalizedLastSessionDate = normalizeDateToISO(userData.streak?.lastSessionDate);
        
        // Update local storage with MongoDB data
        await chrome.storage.local.set({
          user: {
            userId: userData.userId,
            username: userData.username,
            displayName: userData.displayName,
            avatar: userData.avatar
          },
          points: userData.points || 0,
          level: userData.level || 1,
          badges: userData.badges || [],
          stats: {
            totalFocusTime: userData.stats?.totalFocusTime || 0,
            sessionsCompleted: userData.stats?.sessionsCompleted || 0,
            blockedCount: userData.stats?.sitesBlocked || 0
          },
          streak: {
            current: userData.streak?.current || 0,
            longest: userData.streak?.longest || 0,
            lastSessionDate: normalizedLastSessionDate
          },
          dailyGoal: userData.settings?.dailyGoal || 120,
          pomodoroBreakDuration: userData.settings?.breakTime || 5
        });
        console.log('[Init] ✅ Data synced from MongoDB (date normalized)');
        
        // Now check streak AFTER syncing from MongoDB
        await checkStreakOnLogin();
      }
    }
  } catch (error) {
    console.error('[Init] Failed to load data from MongoDB:', error);
  }
});

// Sync data from MongoDB on startup
async function syncFromMongoDB() {
  try {
    const currentState = await getState();
    const token = currentState.authToken;
    
    if (!token) {
      console.log('[Sync] No auth token, skipping MongoDB sync');
      return false;
    }
    
    // Add timeout for offline detection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const userData = await response.json();
      console.log('[Sync] Data from MongoDB:', userData);
      console.log('[Sync] Current local stats:', currentState.stats);
      
      // MongoDB is the SINGLE SOURCE OF TRUTH
      // Always use MongoDB data, never let local override it
      const mongoTotalTime = userData.stats?.totalFocusTime || 0;
      const mongoSessions = userData.stats?.sessionsCompleted || 0;
      const mongoPoints = userData.points || 0;
      const mongoLevel = userData.level || 1;
      
      console.log('[Sync] 📥 LOADING FROM MONGODB (AUTHORITATIVE SOURCE)');
      console.log('[Sync] MongoDB Data - Time:', mongoTotalTime, 'Sessions:', mongoSessions, 'Points:', mongoPoints, 'Level:', mongoLevel);
      
      // Validate MongoDB data before using it
      if (mongoTotalTime < 0 || mongoSessions < 0 || mongoPoints < 0 || mongoLevel < 1) {
        console.error('[Sync] ⚠️ Invalid MongoDB data detected, keeping local data');
        return false;
      }
      
      // Sanity check: If MongoDB has way less data than local, warn but still use it (might be correct)
      if (currentState.stats?.totalFocusTime && mongoTotalTime < currentState.stats.totalFocusTime * 0.5) {
        console.warn('[Sync] ⚠️ MongoDB has significantly less time than local:', mongoTotalTime, 'vs', currentState.stats.totalFocusTime);
        console.warn('[Sync] This might indicate data loss. Using MongoDB anyway (authoritative source).');
      }
      
      // ALWAYS use MongoDB data - it's the authoritative source
      const updateData = {
        user: {
          userId: userData.userId,
          username: userData.username,
          displayName: userData.displayName,
          avatar: userData.avatar
        },
        points: mongoPoints,
        level: mongoLevel,
        badges: userData.badges || [],
        focusHistory: userData.focusHistory || {},
        dailyGoal: userData.settings?.dailyGoal || 120,
        pomodoroBreakDuration: userData.settings?.breakTime || 5,
        stats: {
          totalFocusTime: mongoTotalTime,
          sessionsCompleted: mongoSessions,
          blockedCount: userData.stats?.sitesBlocked || 0
        },
        streak: {
          current: userData.streak?.current || 0,
          longest: userData.streak?.longest || 0,
          lastSessionDate: userData.streak?.lastSessionDate || null
        }
      };
      
      console.log('[Sync] ✅ Loaded all data from MongoDB (authoritative source)');
      
      try {
        await chrome.storage.local.set(updateData);
        return true;
      } catch (storageError) {
        console.error('[Sync] Failed to save MongoDB data to local storage:', storageError);
        // Try to save critical fields only
        try {
          await chrome.storage.local.set({
            stats: updateData.stats,
            points: updateData.points,
            level: updateData.level,
            user: updateData.user
          });
          console.log('[Sync] ✅ Saved critical MongoDB data only');
          return true;
        } catch (criticalError) {
          console.error('[Sync] FATAL: Cannot save MongoDB data at all:', criticalError);
          return false;
        }
      }
    }
    return false;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('[Sync] ⚠️ MongoDB sync timeout - likely offline or slow connection');
    } else {
      console.error('[Sync] Failed to sync from MongoDB:', error);
    }
    return false;
  }
}

// Note: syncFromMongoDB() is now only called manually or on login
// MongoDB is the AUTHORITATIVE source of truth, not local storage

// REMOVED: Automatic sync from local → MongoDB (was causing data loss)
// Instead: Pull from MongoDB periodically to keep local data fresh
chrome.alarms.create('sync-from-mongodb', { periodInMinutes: 10 });

// Check version status every hour to catch critical updates
chrome.alarms.create('version-check', { periodInMinutes: 60 });

// Monitor storage usage and warn if getting full
async function checkStorageQuota() {
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse();
    const QUOTA_BYTES = chrome.storage.local.QUOTA_BYTES || 10485760; // 10MB default
    const usagePercent = (bytesInUse / QUOTA_BYTES) * 100;
    
    console.log('[Storage] Usage:', bytesInUse, 'bytes (', usagePercent.toFixed(1), '%)');
    
    if (usagePercent > 80) {
      console.warn('[Storage] ⚠️ Storage usage is high:', usagePercent.toFixed(1), '%');
      
      // Clean up old data
      const state = await chrome.storage.local.get(['focusHistory', 'sessionActivities']);
      
      // Remove old focus history (keep last 180 days only)
      if (state.focusHistory) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 180);
        const cutoffString = cutoff.toISOString().substring(0, 10);
        
        const cleaned = {};
        Object.keys(state.focusHistory).forEach(date => {
          if (date >= cutoffString) {
            cleaned[date] = state.focusHistory[date];
          }
        });
        
        await chrome.storage.local.set({ focusHistory: cleaned });
        console.log('[Storage] Cleaned old focus history');
      }
      
      // Clear old session activities
      if (state.sessionActivities && state.sessionActivities.length > 100) {
        await chrome.storage.local.set({ sessionActivities: [] });
        console.log('[Storage] Cleared old session activities');
      }
      
      // Notify user if still critical
      const newBytesInUse = await chrome.storage.local.getBytesInUse();
      const newUsagePercent = (newBytesInUse / QUOTA_BYTES) * 100;
      
      if (newUsagePercent > 90) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '⚠️ Storage Almost Full',
          message: 'Extension storage is ' + newUsagePercent.toFixed(0) + '% full. Some data may be lost.',
          priority: 2
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.error('[Storage] Failed to check quota:', error);
  }
}

// Check storage quota periodically
chrome.alarms.create('check-storage', { periodInMinutes: 30 });

// Setup heartbeat alarm for activity updates
chrome.alarms.create('activity-heartbeat', { periodInMinutes: 1 });

// Send initial heartbeat immediately
sendActivityHeartbeat();

// Activity heartbeat function
// Helper function to clean video titles (remove notification counts)
function cleanVideoTitle(title) {
  if (!title) return title;
  // Remove notification count like "(127) " from the beginning
  return title.replace(/^\(\d+\)\s*/, '').trim();
}

// Enhanced activity detection function
function getDetailedActivity(url, title, focusActive) {
  const activity = {
    status: focusActive ? 'focusing' : 'online',
    focusActive: focusActive || false,
    currentUrl: url || null,
    videoTitle: null,
    videoThumbnail: null,
    videoChannel: null,
    activityType: null,
    activityDetails: null,
    actionButton: null // Text for repeat action button
  };

  if (!url) return activity;

  // GetMarks.app - Study platform
  if (url.includes('web.getmarks.app')) {
    activity.status = focusActive ? 'focusing' : 'studying';
    activity.videoChannel = 'GetMarks';
    activity.videoThumbnail = '▶';
    
    if (url.includes('/formula-cards/')) {
      activity.activityType = 'Reading Formulas';
      activity.videoTitle = 'Learning Formulas';
      activity.actionButton = 'Read Same Formula';
    } else if (url.includes('/quick-concepts/')) {
      activity.activityType = 'Revising Concepts';
      activity.videoTitle = 'Quick Concept Revision';
      activity.actionButton = 'Revise Same Concept';
    } else if (url.match(/\/[a-zA-Z0-9]{6,}\//)) { // Question pages like /cpyqbV3/
      activity.activityType = 'Solving Questions';
      activity.videoTitle = 'Practice Problems';
      activity.actionButton = 'Solve Same Question';
    } else {
      activity.activityType = 'Studying';
      activity.videoTitle = 'GetMarks Session';
    }
  }
  
  // BYJU'S
  else if (url.includes('byjus.com')) {
    activity.status = focusActive ? 'focusing' : 'studying';
    activity.videoChannel = "BYJU'S";
    activity.videoThumbnail = '▶';
    activity.activityType = 'Online Class';
    activity.videoTitle = title ? title.replace(" - BYJU'S", '') : "BYJU'S Learning";
    activity.actionButton = 'Continue Learning';
  }
  
  // Vedantu
  else if (url.includes('vedantu.com')) {
    activity.status = focusActive ? 'focusing' : 'studying';
    activity.videoChannel = 'Vedantu';
    activity.videoThumbnail = '▶';
    
    if (url.includes('/live-class')) {
      activity.activityType = 'Live Class';
      activity.videoTitle = 'Attending Live Session';
      activity.actionButton = 'Join Class';
    } else if (url.includes('/doubt')) {
      activity.activityType = 'Doubt Solving';
      activity.videoTitle = 'Getting Help with Doubts';
      activity.actionButton = 'Ask Doubt';
    } else {
      activity.activityType = 'Studying';
      activity.videoTitle = title ? title.replace(' - Vedantu', '') : 'Vedantu Learning';
    }
  }
  
  // Physics Wallah (PW)
  else if (url.includes('pw.live') || url.includes('physicswallah.')) {
    activity.status = focusActive ? 'focusing' : 'studying';
    activity.videoChannel = 'Physics Wallah';
    activity.videoThumbnail = '▶';
    
    if (url.includes('/watch') || url.includes('/lecture')) {
      activity.activityType = 'Watching Lecture';
      activity.videoTitle = title ? title.replace(' - PW', '').replace(' - Physics Wallah', '') : 'PW Lecture';
      activity.actionButton = 'Watch Again';
    } else if (url.includes('/test') || url.includes('/practice')) {
      activity.activityType = 'Taking Test';
      activity.videoTitle = 'Practice Test';
      activity.actionButton = 'Retake Test';
    } else {
      activity.activityType = 'Studying';
      activity.videoTitle = 'Physics Wallah Session';
    }
  }
  
  // Doubtnut
  else if (url.includes('doubtnut.com')) {
    activity.status = focusActive ? 'focusing' : 'studying';
    activity.videoChannel = 'Doubtnut';
    activity.videoThumbnail = '◕';
    
    if (url.includes('/question')) {
      activity.activityType = 'Solving Question';
      activity.videoTitle = 'Question Solution';
      activity.actionButton = 'Solve Similar';
    } else {
      activity.activityType = 'Clearing Doubts';
      activity.videoTitle = title ? title.replace(' - Doubtnut', '') : 'Doubtnut Session';
    }
  }
  
  // Unacademy
  else if (url.includes('unacademy.com')) {
    activity.status = focusActive ? 'focusing' : 'studying';
    activity.videoChannel = 'Unacademy';
    activity.videoThumbnail = '▶';
    
    if (url.includes('/lesson')) {
      activity.activityType = 'Watching Lesson';
      activity.videoTitle = title ? title.replace(' - Unacademy', '') : 'Unacademy Lesson';
      activity.actionButton = 'Watch Again';
    } else if (url.includes('/test')) {
      activity.activityType = 'Taking Test';
      activity.videoTitle = 'Practice Test';
      activity.actionButton = 'Retake Test';
    } else {
      activity.activityType = 'Studying';
      activity.videoTitle = 'Unacademy Session';
    }
  }
  
  // Khan Academy
  else if (url.includes('khanacademy.org')) {
    activity.status = focusActive ? 'focusing' : 'studying';
    activity.videoChannel = 'Khan Academy';
    activity.videoThumbnail = '▶';
    
    if (url.includes('/video/')) {
      activity.activityType = 'Watching Tutorial';
      activity.videoTitle = title ? title.replace(' | Khan Academy', '') : 'Khan Academy Video';
      activity.actionButton = 'Watch Again';
    } else if (url.includes('/exercise/')) {
      activity.activityType = 'Practicing';
      activity.videoTitle = 'Practice Exercise';
      activity.actionButton = 'Practice More';
    } else {
      activity.activityType = 'Learning';
      activity.videoTitle = 'Khan Academy Session';
    }
  }
  
  // YouTube
  else if (url.includes('youtube.com/watch')) {
    activity.videoChannel = 'YouTube';
    
    const urlParams = new URL(url);
    const videoId = urlParams.searchParams.get('v');
    
    if (videoId && title) {
      activity.status = focusActive ? 'focusing' : 'youtube';
      activity.videoTitle = cleanVideoTitle(title.replace(' - YouTube', ''));
      // Only use image thumbnail if NOT in focus mode to avoid sticking
      if (!focusActive) {
        activity.videoThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      } else {
        activity.videoThumbnail = '▶';
      }
      activity.activityType = 'Watching Video';
      activity.actionButton = 'Watch Again';
    }
  }
  
  // YouTube Shorts
  else if (url.includes('youtube.com/shorts/')) {
    activity.status = focusActive ? 'focusing' : 'youtube-shorts';
    activity.videoChannel = 'YouTube Shorts';
    activity.videoThumbnail = '▶';
    
    const shortId = url.split('/shorts/')[1]?.split('?')[0];
    if (shortId && title) {
      activity.videoTitle = cleanVideoTitle(title.replace(' - YouTube', '').replace('#Shorts', '').trim());
      activity.activityType = 'Watching Short';
      activity.actionButton = 'Watch Again';
      // Only use image thumbnail if NOT in focus mode to avoid sticking
      if (!focusActive) {
        activity.videoThumbnail = `https://i.ytimg.com/vi/${shortId}/hqdefault.jpg`;
      }
    } else {
      activity.videoTitle = 'Watching Shorts';
    }
  }
  
  // Google Search
  else if (url.includes('google.com/search')) {
    activity.status = focusActive ? 'focusing' : 'searching';
    activity.videoChannel = 'Google';
    activity.videoThumbnail = '◕';
    activity.activityType = 'Searching';
    
    try {
      const searchParams = new URL(url).searchParams;
      const query = searchParams.get('q');
      if (query) {
        activity.videoTitle = `Searching: ${query}`;
        activity.actionButton = 'Search Again';
      } else {
        activity.videoTitle = 'Google Search';
      }
    } catch {
      activity.videoTitle = 'Google Search';
    }
  }
  
  // Instagram
  else if (url.includes('instagram.com')) {
    activity.status = focusActive ? 'focusing' : 'social-media';
    activity.videoChannel = 'Instagram';
    activity.videoThumbnail = '⊕';
    
    if (url.includes('/reel/')) {
      activity.activityType = 'Watching Reel';
      activity.videoTitle = 'Browsing Reels';
    } else if (url.includes('/p/')) {
      activity.activityType = 'Viewing Post';
      activity.videoTitle = 'Checking Posts';
    } else {
      activity.activityType = 'Browsing Feed';
      activity.videoTitle = 'Instagram Feed';
    }
  }
  
  // PDF Files
  else if (url.endsWith('.pdf') || (url.startsWith('file://') && url.includes('.pdf'))) {
    try {
      const urlParts = url.split('/');
      let pdfName = urlParts[urlParts.length - 1];
      pdfName = decodeURIComponent(pdfName.replace('.pdf', ''));
      
      activity.status = focusActive ? 'focusing' : 'reading';
      activity.videoTitle = pdfName;
      activity.videoThumbnail = '◐';
      activity.videoChannel = 'PDF Reader';
      activity.activityType = 'Reading Document';
      activity.actionButton = 'Open PDF';
    } catch (e) {
      activity.videoTitle = 'Reading PDF';
    }
  }
  
  // Default browsing
  else {
    activity.status = focusActive ? 'focusing' : 'browsing';
    activity.videoTitle = title || 'Browsing Web';
  }

  return activity;
}

async function sendActivityHeartbeat() {
  try {
    const state = await getState();
    console.log('[Heartbeat] Checking user:', state.user?.username, 'focusActive:', state.focusActive);
    
    if (!state.user || !state.user.userId) {
      console.log('[Heartbeat] No user logged in, skipping');
      return;
    }
    
    const token = (await chrome.storage.local.get('authToken'))?.authToken;
    if (!token) {
      console.log('[Heartbeat] No auth token, skipping');
      return;
    }
    
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    
    console.log('[Heartbeat] Current tab URL:', currentTab?.url);
    
    // Use enhanced activity detection
    const activity = getDetailedActivity(
      currentTab?.url,
      currentTab?.title,
      state.focusActive
    );
    
    console.log('[Heartbeat] Full activity data:', activity);
    
    // Send all activity fields to backend (now supported!)
    const activityToSend = {
      status: activity.status || 'online',
      focusActive: activity.focusActive || false,
      currentUrl: activity.currentUrl || null,
      videoTitle: activity.videoTitle || null,
      videoThumbnail: activity.videoThumbnail || null,
      videoChannel: activity.videoChannel || null,
      activityType: activity.activityType || null,
      activityDetails: activity.activityDetails || null,
      actionButton: activity.actionButton || null
    };
    
    // Store full activity data locally as well
    await chrome.storage.local.set({ activity: activity });
    
    console.log('[Heartbeat] Sending to backend:', activityToSend);
    
    // Update backend with compatible fields only
    const response = await fetch(`${API_URL}/users/activity`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ activity: activityToSend })
    });
    
    if (response.ok) {
      console.log('[Heartbeat] ✅ Activity updated successfully');
      const responseData = await response.json();
      console.log('[Heartbeat] Backend response:', responseData);
    } else {
      const errorText = await response.text();
      console.error('[Heartbeat] ❌ Failed:', response.status, errorText);
      
      // Check for device conflict
      if (response.status === 401) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.code === 'DEVICE_CONFLICT') {
            console.error('[Heartbeat] 🚨 Device conflict detected!');
            await handleDeviceConflict(errorData.message);
          }
        } catch (e) {
          // Not JSON or can't parse
        }
      }
    }
  } catch (error) {
    console.error('[Heartbeat] Error:', error);
  }
}

// Handle device conflict (logged in from another device)
async function handleDeviceConflict(message) {
  console.log('[DeviceConflict] Handling logout from another device');
  
  // Try to sync data to MongoDB before clearing (best effort)
  try {
    const authToken = (await chrome.storage.local.get('authToken'))?.authToken;
    const currentState = await chrome.storage.local.get(['stats', 'points', 'level', 'badges', 'streak', 'focusHistory']);
    
    if (authToken && currentState.stats) {
      await fetch(`${API_BASE_URL}/api/users/stats`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          stats: currentState.stats,
          streak: currentState.streak,
          badges: currentState.badges,
          points: currentState.points,
          level: currentState.level,
          focusHistory: currentState.focusHistory || {}
        })
      });
      console.log('[DeviceConflict] ✅ Synced data before device conflict logout');
    }
  } catch (error) {
    console.error('[DeviceConflict] Failed to sync before logout:', error);
  }
  
  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: '🔒 Logged Out',
    message: message || 'You have been logged in from another device. Please log in again.',
    priority: 2,
    requireInteraction: true
  });

  // Clear ONLY auth data, keep all progress data (stats, points, badges, etc.)
  // This ensures user doesn't lose progress if they log back in
  await chrome.storage.local.remove(['authToken', 'user', 'activity', 'friends', 'friendsData', 'allUsers']);
  console.log('[DeviceConflict] ✅ Cleared auth data only, keeping progress data');

  // Redirect all extension pages to login
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && tab.url.includes('chrome-extension://')) {
      chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('pages/login.html') });
    }
  }
}
