// background.js — service worker for Focus Mode

// API Configuration
const API_BASE_URL = 'https://focus-backend-g1zg.onrender.com';

// Import update checker
importScripts('update-checker.js');

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
  dailyGoal: 120, // minutes
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

  // Only enforce restrictions when focus mode is active AND not on break
  if (!focusActive || !sessionEnd || tNow > sessionEnd || onBreak) return;

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
      await chrome.tabs.update(tab.id, {url: chrome.runtime.getURL('blocked.html')});
      await incrementStat('blockedCount');
      return;
    }
  }
  
  // Blocked keywords check (custom user-added sites)
  for (const kw of state.blockedKeywords || []) {
    if (!kw) continue;
    if (url.includes(kw) || hostname.includes(kw)) {
      // redirect to local blocked page
      await chrome.tabs.update(tab.id, {url: chrome.runtime.getURL('blocked.html')});
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
        await fetch('https://focus-backend-g1zg.onrender.com/api/users/stats', {
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
        videoTitle: storedVideo.youtubeVideo.title,
        videoThumbnail: storedVideo.youtubeVideo.thumbnail,
        videoChannel: storedVideo.youtubeVideo.channel,
        focusActive: state.focusActive || false,
        lastUpdated: Date.now()
      }
    });
  }
}

// Alarms to end session when time's up
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'activity-heartbeat') {
    // Handle activity heartbeat
    await sendActivityHeartbeat();
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
    
    // Calculate ACTUAL elapsed time (not planned duration)
    const sessionStart = state.sessionStart || Date.now();
    const sessionEnd = Date.now();
    const actualDuration = sessionEnd - sessionStart; // Actual time elapsed in milliseconds
    
    console.log('[SessionEnd] Session start:', new Date(sessionStart).toISOString());
    console.log('[SessionEnd] Session end:', new Date(sessionEnd).toISOString());
    console.log('[SessionEnd] Actual duration:', Math.floor(actualDuration / 60000), 'minutes');
    
    // Get session activities
    const result = await chrome.storage.local.get(['sessionActivities']);
    const activities = result.sessionActivities || [];
    
    // Save session summary for popup (use actual duration)
    const durationSeconds = Math.floor(actualDuration / 1000);
    await chrome.storage.local.set({
      sessionSummary: {
        duration: durationSeconds,
        activities: activities,
        completedAt: Date.now()
      }
    });
    
    // Clear session activities
    await chrome.storage.local.remove('sessionActivities');
    
    // Check minimum session duration (5 minutes = 300000 ms)
    const minimumDuration = 5 * 60 * 1000; // 5 minutes
    const earnedPoints = actualDuration >= minimumDuration;
    
    if (!earnedPoints) {
      console.log('[SessionEnd] Session too short for points:', Math.floor(actualDuration / 60000), 'minutes');
    } else {
      console.log('[SessionEnd] Updating stats for', Math.floor(actualDuration / 60000), 'minute session');
      // Update stats using ACTUAL elapsed time
      await updateSessionStats(actualDuration);
    }
    
    await chrome.storage.local.set({focusActive:false, sessionEnd: 0, emergencyUsed: false, sessionBlockedCount: 0});
    
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
      url: chrome.runtime.getURL('session-summary.html'),
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
  }
});

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
  
  // Update daily focus time with IST date comparison (IST = UTC+5:30)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
  const istTime = new Date(now.getTime() + istOffset);
  const todayDateString = istTime.toISOString().substring(0, 10); // YYYY-MM-DD in IST
  
  let todayTime = state.todayFocusTime || 0;
  const storedDate = state.todayDate || '';
  
  // Reset if it's a new day (comparing YYYY-MM-DD strings in IST)
  if (storedDate !== todayDateString) {
    todayTime = 0; // Reset if new day
  }
  todayTime += durationMin;
  
  // Update streak with IST-based date comparison (Duolingo-style)
  let lastDate = state.streak?.lastSessionDate;
  
  // Migrate old date format to new format
  lastDate = normalizeDateToISO(lastDate);
  
  // Get yesterday in IST (reuse istTime calculated above)
  const yesterdayIST = new Date(istTime.getTime() - (24 * 60 * 60 * 1000));
  const yesterdayDateString = yesterdayIST.toISOString().substring(0, 10);
  
  let currentStreak = state.streak?.current || 0;
  let longestStreak = state.streak?.longest || 0;
  
  console.log('[Streak] Last session date (normalized):', lastDate);
  console.log('[Streak] Today (IST):', todayDateString);
  console.log('[Streak] Yesterday (IST):', yesterdayDateString);
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
  } else if (lastDate === todayDateString) {
    // Already completed a session today - keep current streak (don't increment)
    console.log('[Streak] ✅ Already completed session today, maintaining streak at', currentStreak);
  } else if (lastDate === yesterdayDateString) {
    // This is the FIRST session of today, and last session was yesterday - continue streak!
    currentStreak++;
    console.log('[Streak] 🔥 First session of the day! Continued from yesterday. New streak:', currentStreak);
  } else if (lastDate > todayDateString) {
    // Clock issue - last date is in the future somehow
    console.log('[Streak] ⚠️ Clock issue detected (last date in future), keeping streak at', currentStreak);
  } else {
    // Last session was before yesterday (2+ days ago)
    // Streak should have been broken by checkStreakOnLogin(), but handle it here as safety net
    console.log('[Streak] ❌ Last session was', lastDate, '(before yesterday). Starting new streak at 1');
    currentStreak = 1;
  }
  
  // Always update longest if current is higher
  longestStreak = Math.max(longestStreak, currentStreak);
  
  console.log('[Streak] ✅ Updated - Current:', currentStreak, 'Longest:', longestStreak, 'Last date:', todayDateString);
  
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
  
  // Calculate base points (1 point per minute + bonuses)
  let basePoints = durationMin;
  if (durationMin >= 60) basePoints += 20; // 1 hour bonus
  if (currentStreak >= 7) basePoints += 50; // Week streak bonus
  
  // Apply focus multiplier to earned points
  const pointsEarned = Math.floor(basePoints * focusMultiplier);
  
  console.log(`[Points] Base: ${basePoints}, After Focus Multiplier: ${pointsEarned}`);
  
  const newPoints = (state.points || 0) + pointsEarned;
  const newLevel = calculateLevel(newPoints);
  
  // Check for new badges
  const currentBadges = state.badges || [];
  const updatedBadges = await checkBadges(currentBadges, newTotalTime, newSessions, currentStreak, newLevel);
  
  // Save everything including points earned for this session
  await chrome.storage.local.set({
    stats: {
      ...state.stats,
      totalFocusTime: newTotalTime,
      sessionsCompleted: newSessions
    },
    streak: {
      current: currentStreak,
      longest: longestStreak,
      lastSessionDate: todayDateString // Store as YYYY-MM-DD in IST
    },
    points: newPoints,
    level: newLevel,
    badges: updatedBadges,
    todayFocusTime: todayTime,
    todayDate: todayDateString, // Store as YYYY-MM-DD in IST
    sessionPointsEarned: pointsEarned // Store points earned this session for summary display
  });
  
  // Update focus history for heatmap
  const historyResult = await chrome.storage.local.get('focusHistory');
  const focusHistory = historyResult.focusHistory || {};
  focusHistory[todayDateString] = todayTime;
  await chrome.storage.local.set({ focusHistory });
  
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
  
  // Sync to MongoDB
  try {
    const token = (await chrome.storage.local.get('authToken'))?.authToken;
    if (token) {
      await fetch(`${API_BASE_URL}/api/users/stats`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          stats: {
            totalFocusTime: newTotalTime,
            sessionsCompleted: newSessions,
            sitesBlocked: state.stats.blockedCount || 0
          },
          streak: {
            current: currentStreak,
            longest: longestStreak,
            lastSessionDate: todayDateString
          },
          points: newPoints,
          level: newLevel,
          badges: updatedBadges.filter(b => b && b.id).map(b => b.id)
        })
      });
      console.log('Stats synced to MongoDB');
    }
  } catch (error) {
    console.error('Failed to sync stats to MongoDB:', error);
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

async function checkBadges(badges, totalTime, sessions, streak, level) {
  // Filter out any null/undefined badges first
  const validBadges = (badges || []).filter(b => b && b.id);
  
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
  
  console.log('[Badges] Checking badges - Sessions:', sessions, 'Time:', totalTime, 'Streak:', streak, 'Level:', level);
  console.log('[Badges] Current badges:', validBadges.map(b => b.id).join(', '));
  
  for (const badge of newBadges) {
    if (badge.condition && !validBadges.find(b => b.id === badge.id)) {
      console.log('[Badge] ✅ Unlocked:', badge.name, badge.desc);
      const newBadge = {id: badge.id, name: badge.name, desc: badge.desc, earnedAt: Date.now()};
      validBadges.push(newBadge);
      
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
  
  console.log('[Badges] Total earned:', validBadges.length, 'Badge IDs:', validBadges.map(b => b.id));
  return validBadges;
}

// Messaging API for popup/options
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.action === 'startSession') {
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
      
      await chrome.storage.local.set({
        focusActive:true, 
        sessionEnd: end, 
        sessionStart: now,
        sessionDuration: durationMin*60*1000,
        passcode: passcode || undefined,
        allowed: allowedSites,
        sessionBlockedCount: 0 // Reset blocked count for new session
      });
      
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

// Handle browser startup/restart - check for stuck focus sessions and streak
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Startup] Browser started, checking for stuck focus sessions...');
  await handleStuckSession();
  // checkStreakOnLogin will be called after MongoDB sync in onInstalled
});

// Initialize defaults on installed
chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get();
  await chrome.storage.local.set(Object.assign({}, DEFAULTS, s));
  
  // Check for stuck sessions on extension install/update
  await handleStuckSession();
  
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

// Handle stuck focus sessions (browser closed during focus)
async function handleStuckSession() {
  try {
    const state = await getState();
    const now = Date.now();
    
    // Check if there was an active focus session
    if (state.focusActive && state.sessionStart && state.sessionEnd) {
      console.log('[StuckSession] Found active session from previous browser session');
      console.log('[StuckSession] Session started:', new Date(state.sessionStart).toISOString());
      console.log('[StuckSession] Session was supposed to end:', new Date(state.sessionEnd).toISOString());
      
      // Calculate how long the user actually focused before closing
      const actualDuration = state.sessionEnd - state.sessionStart; // Original planned duration
      const sessionDurationMin = Math.floor(actualDuration / 60000);
      
      console.log('[StuckSession] Session was:', sessionDurationMin, 'minutes');
      
      // If session was at least 5 minutes, award points
      const minimumDuration = 5 * 60 * 1000; // 5 minutes
      if (actualDuration >= minimumDuration) {
        console.log('[StuckSession] Session met minimum duration, awarding points...');
        
        // Award points for the completed portion
        await updateSessionStats(actualDuration);
        
        // Create session summary
        const activities = state.sessionActivities || [];
        await chrome.storage.local.set({
          sessionSummary: {
            duration: Math.floor(actualDuration / 1000),
            activities: activities,
            completedAt: now,
            earnedPoints: true,
            recovered: true // Flag to indicate this was a recovered session
          }
        });
        
        console.log('[StuckSession] Points awarded for recovered session');
        
        // Show notification about recovered session
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '🔄 Session Recovered!',
          message: `We saved your ${sessionDurationMin} minute focus session and awarded your points!`,
          requireInteraction: true
        });
      } else {
        console.log('[StuckSession] Session was too short, no points awarded');
      }
      
      // Reset focus state
      await chrome.storage.local.set({
        focusActive: false,
        sessionEnd: 0,
        sessionStart: 0,
        emergencyUsed: false,
        sessionBlockedCount: 0,
        onBreak: false,
        breakEnd: 0
      });
      
      // Clear any pending alarms
      await chrome.alarms.clearAll();
      
      // Update activity status back to online
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
        console.error('[StuckSession] Error updating activity:', error);
      }
      
      console.log('[StuckSession] Focus state reset, user can now start new sessions');
    } else {
      console.log('[StuckSession] No stuck session found');
    }
  } catch (error) {
    console.error('[StuckSession] Error handling stuck session:', error);
    // Always reset to ensure user isn't stuck
    await chrome.storage.local.set({
      focusActive: false,
      sessionEnd: 0,
      sessionStart: 0,
      emergencyUsed: false,
      sessionBlockedCount: 0,
      onBreak: false,
      breakEnd: 0
    });
  }
}

// Sync data from MongoDB on startup
async function syncFromMongoDB() {
  try {
    const currentState = await getState();
    const token = currentState.authToken;
    
    if (token) {
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('[Sync] Data from MongoDB:', userData);
        console.log('[Sync] Current local stats:', currentState.stats);
        
        // ONLY sync from MongoDB if local data is empty or MongoDB has more data
        // This prevents MongoDB from overwriting accurate local stats
        const mongoTotalTime = userData.stats?.totalFocusTime || 0;
        const localTotalTime = currentState.stats?.totalFocusTime || 0;
        
        // Only update if MongoDB has more time (user might have focused on another device)
        // OR if local is empty (fresh install)
        const shouldUpdateStats = localTotalTime === 0 || mongoTotalTime > localTotalTime;
        
        console.log('[Sync] MongoDB time:', mongoTotalTime, 'Local time:', localTotalTime, 'Should update:', shouldUpdateStats);
        
        // Always update user profile, points, level, badges
        const updateData = {
          user: {
            userId: userData.userId,
            username: userData.username,
            displayName: userData.displayName,
            avatar: userData.avatar
          },
          dailyGoal: userData.settings?.dailyGoal || currentState.dailyGoal || 120,
          pomodoroBreakDuration: userData.settings?.breakTime || currentState.pomodoroBreakDuration || 5
        };
        
        // Only overwrite stats if MongoDB has newer/more data
        if (shouldUpdateStats) {
          updateData.points = userData.points || 0;
          updateData.level = userData.level || 1;
          updateData.badges = userData.badges || [];
          updateData.stats = {
            totalFocusTime: mongoTotalTime,
            sessionsCompleted: userData.stats?.sessionsCompleted || 0,
            blockedCount: userData.stats?.sitesBlocked || 0
          };
          updateData.streak = {
            current: userData.streak?.current || 0,
            longest: userData.streak?.longest || 0,
            lastSessionDate: userData.streak?.lastSessionDate || null
          };
          console.log('[Sync] ✅ Updated stats from MongoDB');
        } else {
          console.log('[Sync] ⚠️ Skipped stats update - local data is more recent');
        }
        
        await chrome.storage.local.set(updateData);
      }
    }
  } catch (error) {
    console.error('[Sync] Failed to sync from MongoDB:', error);
  }
}

// Note: syncFromMongoDB() is now only called manually or on login
// Not on startup to prevent overwriting accurate local data

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
    const response = await fetch('https://focus-backend-g1zg.onrender.com/api/users/activity', {
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
    }
  } catch (error) {
    console.error('[Heartbeat] Error:', error);
  }
}
