// background.js — service worker for Focus Mode

// API Configuration
const API_BASE_URL = 'https://focus-backend-g1zg.onrender.com';

// Import update checker
importScripts('update-checker.js');

const DEFAULTS = {
  allowed: ["https://www.youtube.com/","https://youtube.com/","https://www.google.com/"],
  blockedKeywords: [
    "instagram.com", "whatsapp.com", "x.com", "twitter.com", "tiktok.com",
    "facebook.com", "reddit.com", "github.com", "quora.com", "pinterest.com",
    "edxtratech.com", "edxtra.tech", "linkedin.com", "snapchat.com",
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
  todayDate: new Date().toDateString(),
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
    if (url.includes(a) || hostname.includes(a.replace(/^https?:\/\//, ''))) return; // allowed — keep
  }

  // YouTube single-tab rule
  if (hostname.includes('youtube.com')) {
    // allow only one youtube tab — find all youtube tabs and keep the earliest one
    const tabs = await chrome.tabs.query({});
    const ytTabs = tabs.filter(t => t.url && t.url.includes('youtube.com'));
    // if more than one, close the newest (if this tab is not the earliest)
    if (ytTabs.length > 1) {
      // choose earliest by id (simple heuristic)
      const earliest = ytTabs.reduce((a,b)=> (a.id<b.id?a:b));
      if (tab.id !== earliest.id) {
        await chrome.tabs.update(tab.id, {url: chrome.runtime.getURL('blocked.html')});
        await incrementStat('blockedCount');
      }
    }
    return;
  }

  // Blocked keywords check
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
  const s = await chrome.storage.local.get({stats: DEFAULTS.stats});
  s.stats = s.stats || {blockedCount:0, attempts:0};
  s.stats[key] = (s.stats[key]||0)+1;
  await chrome.storage.local.set({stats: s.stats});
  
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
  
  // Add activity
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
  if (alarm.name === 'break-end') {
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
    const sessionDuration = state.sessionDuration || 0;
    
    // Get session activities
    const result = await chrome.storage.local.get(['sessionActivities']);
    const activities = result.sessionActivities || [];
    
    // Save session summary for popup
    const durationSeconds = Math.floor(sessionDuration / 1000);
    await chrome.storage.local.set({
      sessionSummary: {
        duration: durationSeconds,
        activities: activities,
        completedAt: Date.now()
      }
    });
    
    // Clear session activities
    await chrome.storage.local.remove('sessionActivities');
    
    // Update stats
    await updateSessionStats(sessionDuration);
    
    await chrome.storage.local.set({focusActive:false, sessionEnd: 0, emergencyUsed: false});
    
    // Open session summary popup
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
  
  // Update stats
  const newTotalTime = (state.stats.totalFocusTime || 0) + durationMin;
  const newSessions = (state.stats.sessionsCompleted || 0) + 1;
  
  // Update daily focus time
  const today = new Date().toDateString();
  let todayTime = state.todayFocusTime || 0;
  if (state.todayDate !== today) {
    todayTime = 0; // Reset if new day
  }
  todayTime += durationMin;
  
  // Update streak
  const lastDate = state.streak?.lastSessionDate;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  
  let currentStreak = state.streak?.current || 0;
  let longestStreak = state.streak?.longest || 0;
  
  // Update streak logic
  if (!lastDate) {
    // First session ever
    currentStreak = 1;
  } else if (lastDate === today) {
    // Already counted today, don't increment
    // Keep current streak as is
  } else if (lastDate === yesterdayStr) {
    // Continued streak from yesterday
    currentStreak++;
  } else {
    // Streak broken, start over
    currentStreak = 1;
  }
  
  // Always update longest if current is higher
  longestStreak = Math.max(longestStreak, currentStreak);
  
  console.log('[Streak] Current:', currentStreak, 'Longest:', longestStreak, 'Last date:', lastDate);
  
  // Calculate points (1 point per minute + bonuses)
  let pointsEarned = durationMin;
  if (durationMin >= 60) pointsEarned += 20; // 1 hour bonus
  if (currentStreak >= 7) pointsEarned += 50; // Week streak bonus
  
  const newPoints = (state.points || 0) + pointsEarned;
  const newLevel = Math.floor(newPoints / 500) + 1;
  
  // Check for new badges
  const currentBadges = state.badges || [];
  const updatedBadges = await checkBadges(currentBadges, newTotalTime, newSessions, currentStreak, newLevel);
  
  // Save everything
  await chrome.storage.local.set({
    stats: {
      ...state.stats,
      totalFocusTime: newTotalTime,
      sessionsCompleted: newSessions
    },
    streak: {
      current: currentStreak,
      longest: longestStreak,
      lastSessionDate: today
    },
    points: newPoints,
    level: newLevel,
    badges: updatedBadges,
    todayFocusTime: todayTime,
    todayDate: today
  });
  
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
            lastSessionDate: today
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
    {id: 'first-session', name: 'First Step', desc: 'Complete first session', condition: sessions >= 1},
    {id: 'focus-champion', name: 'Focus Champion', desc: '100+ hours focused', condition: totalTime >= 6000},
    {id: 'streak-master', name: 'Streak Master', desc: '7 day streak', condition: streak >= 7},
    {id: 'early-bird', name: 'Early Bird', desc: 'Focused before 8 AM', condition: false}, // Time-based, implemented separately
    {id: 'night-owl', name: 'Night Owl', desc: 'Focused after 10 PM', condition: false}, // Time-based, implemented separately
    {id: 'social-butterfly', name: 'Social Butterfly', desc: '10+ friends', condition: false}, // Friends count, checked elsewhere
    {id: 'focus-warrior', name: 'Focus Warrior', desc: '50 sessions completed', condition: sessions >= 50},
    {id: 'productivity-king', name: 'Productivity King', desc: 'Reached level 10', condition: level >= 10}
  ];
  
  for (const badge of newBadges) {
    if (badge.condition && !validBadges.find(b => b.id === badge.id)) {
      console.log('[Badge] Unlocked:', badge.name);
      validBadges.push({id: badge.id, name: badge.name, desc: badge.desc, earnedAt: Date.now()});
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '🏆 New Badge Unlocked!',
        message: `${badge.name}: ${badge.desc}`
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
        allowed: allowedSites
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
          
          const activity = {
            status: 'focusing',
            focusActive: true,
            startTime: now,
            currentUrl: currentTab?.url || null,
            videoTitle: null,
            videoThumbnail: null,
            videoChannel: null
          };
          
          // Get YouTube video info if watching
          if (currentTab && currentTab.url && currentTab.url.includes('youtube.com/watch')) {
            console.log('[StartSession] 🎬 YouTube detected! Processing...');
            try {
              const urlParams = new URL(currentTab.url);
              const videoId = urlParams.searchParams.get('v');
              
              console.log('[StartSession] Video ID:', videoId);
              console.log('[StartSession] Tab title available:', !!currentTab.title);
              
              if (videoId) {
                console.log('[StartSession] Fetching YouTube data for video:', videoId);
                
                // Use tab title directly to avoid CORS
                if (currentTab.title) {
                  activity.videoTitle = currentTab.title.replace(' - YouTube', '');
                  activity.videoThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                  activity.videoChannel = 'YouTube';
                  console.log('[StartSession] ✅ YouTube video from tab title:', activity.videoTitle);
                } else {
                  console.log('[StartSession] ⚠️ No tab title available');
                }
              } else {
                console.log('[StartSession] ⚠️ No video ID found in URL');
              }
            } catch (e) {
              console.error('[StartSession] Error fetching YouTube info:', e);
            }
          }
          // Check for PDF files
          else if (currentTab && currentTab.url && (currentTab.url.endsWith('.pdf') || currentTab.url.startsWith('file://') && currentTab.url.includes('.pdf'))) {
            console.log('[StartSession] 📄 PDF detected! Processing...');
            try {
              // Extract PDF filename from URL
              const urlParts = currentTab.url.split('/');
              let pdfName = urlParts[urlParts.length - 1];
              pdfName = decodeURIComponent(pdfName.replace('.pdf', ''));
              
              activity.videoTitle = pdfName;
              activity.videoThumbnail = '📄';
              activity.videoChannel = 'Reading PDF';
              console.log('[StartSession] ✅ PDF detected:', pdfName);
            } catch (e) {
              console.error('[StartSession] Error parsing PDF name:', e);
            }
          } else {
            console.log('[StartSession] ℹ️ Regular browsing tab');
          }
          
          console.log('[StartSession] Activity data to send:', JSON.stringify(activity, null, 2));
          
          const response = await fetch(`${API_BASE_URL}/api/users/activity`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ activity })
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
              
              const activity = {
                status: 'online',
                focusActive: false,
                currentUrl: currentTab?.url || null,
                videoTitle: null,
                videoThumbnail: null,
                videoChannel: null
              };
              
              // Check if watching YouTube
              if (currentTab && currentTab.url && currentTab.url.includes('youtube.com/watch')) {
                try {
                  const urlParams = new URL(currentTab.url);
                  const videoId = urlParams.searchParams.get('v');
                  
                  if (videoId) {
                    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
                    const oembedResponse = await fetch(oembedUrl);
                    
                    if (oembedResponse.ok) {
                      const videoData = await oembedResponse.json();
                      activity.status = 'youtube';
                      activity.videoTitle = videoData.title;
                      activity.videoThumbnail = videoData.thumbnail_url;
                      activity.videoChannel = videoData.author_name;
                    }
                  }
                } catch (e) {
                  console.error('[EndSession] Error fetching YouTube info:', e);
                }
              }
              
              const response = await fetch(`${API_BASE_URL}/api/users/activity`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ activity })
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
    } else if (msg.action === 'downloadUpdate') {
      // Handle update download request from popup
      downloadUpdate();
      sendResponse({ok: true});
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

// Initialize defaults on installed
chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get();
  await chrome.storage.local.set(Object.assign({}, DEFAULTS, s));
  
  // Load data from MongoDB if user is logged in
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
        console.log('Syncing data from MongoDB:', userData);
        
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
            lastSessionDate: userData.streak?.lastUpdate
          },
          dailyGoal: userData.settings?.dailyGoal || 120,
          pomodoroBreakDuration: userData.settings?.breakTime || 5
        });
        console.log('Data synced from MongoDB successfully');
      }
    }
  } catch (error) {
    console.error('Failed to load data from MongoDB:', error);
  }
});

// Sync data from MongoDB on startup
async function syncFromMongoDB() {
  try {
    const state = await chrome.storage.local.get(['authToken']);
    const token = state.authToken;
    
    if (token) {
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('Syncing data from MongoDB:', userData);
        
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
            lastSessionDate: userData.streak?.lastUpdate
          },
          dailyGoal: userData.settings?.dailyGoal || 120,
          pomodoroBreakDuration: userData.settings?.breakTime || 5
        });
        console.log('Data synced from MongoDB successfully');
      }
    }
  } catch (error) {
    console.error('Failed to sync from MongoDB:', error);
  }
}

// Run sync on extension startup
syncFromMongoDB();

// Setup heartbeat alarm for activity updates
chrome.alarms.create('activity-heartbeat', { periodInMinutes: 1 });

// Send initial heartbeat immediately
sendActivityHeartbeat();

// Handle heartbeat alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'activity-heartbeat') {
    await sendActivityHeartbeat();
  } else if (alarm.name === 'focus-end') {
    console.log('[SessionEnd] 🔔 Focus timer alarm triggered!');
    const state = await getState();
    console.log('[SessionEnd] Current focusActive:', state.focusActive);
    const sessionDuration = state.sessionDuration || 0;
    
    // Update stats
    await updateSessionStats(sessionDuration);
    
    await chrome.storage.local.set({focusActive:false, sessionEnd: 0, emergencyUsed: false});
    
    // Update activity back to online IMMEDIATELY
    try {
      const token = (await chrome.storage.local.get('authToken'))?.authToken;
      console.log('[SessionComplete] Updating status to online...');
      
      if (token) {
        // Get current tab to update activity
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        
        const activity = {
          status: 'online',
          focusActive: false,
          currentUrl: currentTab?.url || null,
          videoTitle: null,
          videoThumbnail: null,
          videoChannel: null
        };
        
        // Check if watching YouTube
        if (currentTab && currentTab.url && currentTab.url.includes('youtube.com/watch')) {
          try {
            const urlParams = new URL(currentTab.url);
            const videoId = urlParams.searchParams.get('v');
            
            if (videoId) {
              const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
              const oembedResponse = await fetch(oembedUrl);
              
              if (oembedResponse.ok) {
                const videoData = await oembedResponse.json();
                activity.status = 'youtube';
                activity.videoTitle = videoData.title;
                activity.videoThumbnail = videoData.thumbnail_url;
                activity.videoChannel = videoData.author_name;
              }
            }
          } catch (e) {
            console.error('[SessionComplete] Error fetching YouTube info:', e);
          }
        }
        
        const response = await fetch(`${API_BASE_URL}/api/users/activity`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ activity })
        });
        
        if (response.ok) {
          console.log('[SessionComplete] ✅ Status updated to online');
        } else {
          console.error('[SessionComplete] ❌ Failed:', response.status, await response.text());
        }
      }
    } catch (error) {
      console.error('[SessionComplete] ❌ Error:', error);
    }
    
    // Check for Pomodoro break
    if (state.pomodoroEnabled) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Break Time! 🎉',
        message: `Great work! Take a ${state.pomodoroBreakDuration || 5} minute break.`
      });
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Focus session ended',
        message: 'Your Focus Mode session has finished — good job! 🎯'
      });
    }
  }
});

// Activity heartbeat function
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
    
    const activity = {
      status: state.focusActive ? 'focusing' : 'online',
      focusActive: state.focusActive || false,
      currentUrl: currentTab?.url || null,
      videoTitle: null,
      videoThumbnail: null,
      videoChannel: null
    };
    
    // Get YouTube video info if watching (even during focus mode)
    if (currentTab && currentTab.url && currentTab.url.includes('youtube.com/watch')) {
      try {
        const urlParams = new URL(currentTab.url);
        const videoId = urlParams.searchParams.get('v');
        
        if (videoId) {
          console.log('[Heartbeat] YouTube detected, videoId:', videoId);
          
          // Use tab title as fallback to avoid CORS issues
          if (currentTab.title) {
            activity.status = state.focusActive ? 'focusing' : 'youtube';
            activity.videoTitle = currentTab.title.replace(' - YouTube', '');
            activity.videoThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            activity.videoChannel = 'YouTube';
            console.log('[Heartbeat] ✅ YouTube video from tab:', activity.videoTitle);
          }
        }
      } catch (e) {
        console.error('[Heartbeat] Error fetching YouTube info:', e);
      }
    }
    // Check for PDF files
    else if (currentTab && currentTab.url && (currentTab.url.endsWith('.pdf') || currentTab.url.startsWith('file://') && currentTab.url.includes('.pdf'))) {
      try {
        // Extract PDF filename from URL
        const urlParts = currentTab.url.split('/');
        let pdfName = urlParts[urlParts.length - 1];
        pdfName = decodeURIComponent(pdfName.replace('.pdf', ''));
        
        activity.status = state.focusActive ? 'focusing' : 'browsing';
        activity.videoTitle = pdfName;
        activity.videoThumbnail = '📄'; // PDF icon as placeholder
        activity.videoChannel = 'Reading PDF';
        console.log('[Heartbeat] ✅ PDF detected:', pdfName);
      } catch (e) {
        console.error('[Heartbeat] Error parsing PDF name:', e);
      }
    }
    
    console.log('[Heartbeat] Sending activity update:', activity);
    
    // Update backend
    const response = await fetch('https://focus-backend-g1zg.onrender.com/api/users/activity', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ activity })
    });
    
    if (response.ok) {
      console.log('[Heartbeat] Activity updated successfully');
    } else {
      console.error('[Heartbeat] Failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('[Heartbeat] Error:', error);
  }
}
