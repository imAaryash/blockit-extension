// Smooth number rolling animation with easing
function animateNumber(element, start, end, duration, delay = 0) {
  setTimeout(() => {
    const startTime = performance.now();
    const range = end - start;
    
    // Easing function (ease-out-cubic)
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      
      const current = start + (range * easedProgress);
      element.textContent = Math.floor(current).toLocaleString();
      
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = end.toLocaleString();
      }
    }
    
    requestAnimationFrame(update);
  }, delay);
}

// Calculate level from points
function calculateLevel(points) {
  let level = 1;
  let totalXpNeeded = 0;
  let xpForNextLevel = 100;
  
  while (points >= totalXpNeeded + xpForNextLevel) {
    totalXpNeeded += xpForNextLevel;
    level++;
    xpForNextLevel = level * 100;
  }
  
  return { level, totalXpNeeded, xpForNextLevel };
}

// Load and display session summary
async function loadSessionSummary() {
  console.log('[SessionSummary] Loading session summary...');
  const result = await chrome.storage.local.get(['sessionSummary', 'points', 'sessionPointsEarned']);
  const summary = result.sessionSummary;

  console.log('[SessionSummary] Summary data:', summary);
  console.log('[SessionSummary] Current points:', result.points);

  if (!summary) {
    console.log('[SessionSummary] No session summary found');
    return;
  }

  // Display duration
  const minutes = Math.floor(summary.duration / 60);
  const seconds = summary.duration % 60;
  const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  document.getElementById('sessionDuration').textContent = durationText;

  // Show warning if points weren't earned
  if (summary.earnedPoints === false) {
    document.getElementById('pointsWarning').style.display = 'block';
    document.getElementById('minDuration').textContent = summary.minimumDuration || 5;
    document.getElementById('summarySubtitle').textContent = 'Session completed, but too short for rewards';
  } else {
    document.getElementById('summarySubtitle').textContent = 'Great work! Here\'s what you accomplished';
    
    // Show points section with animation
    const pointsSection = document.getElementById('pointsSection');
    const currentPoints = result.points || 0;
    const pointsEarned = result.sessionPointsEarned || 0;
    const previousPoints = currentPoints - pointsEarned;
    
    console.log('[Points] Previous:', previousPoints, 'Earned:', pointsEarned, 'Current:', currentPoints);
    
    if (pointsEarned > 0) {
      pointsSection.style.display = 'block';
      
      // Calculate level info
      const levelInfo = calculateLevel(currentPoints);
      
      // Calculate progress to next level
      const xpIntoCurrentLevel = currentPoints - levelInfo.totalXpNeeded;
      const progressPercent = Math.floor((xpIntoCurrentLevel / levelInfo.xpForNextLevel) * 100);
      const xpToNext = levelInfo.xpForNextLevel - xpIntoCurrentLevel;
      
      // Set static values
      document.getElementById('earnedPointsBadge').textContent = pointsEarned.toLocaleString();
      document.getElementById('previousPointsText').textContent = previousPoints.toLocaleString();
      document.getElementById('levelStat').textContent = `Level ${levelInfo.level}`;
      document.getElementById('toNextStat').textContent = xpToNext.toLocaleString();
      
      // Set initial main number to previous points
      document.getElementById('mainPoints').textContent = previousPoints.toLocaleString();
      document.getElementById('progressStat').textContent = '0%';
      
      // Animate main number from previous to current total
      setTimeout(() => {
        animateNumber(document.getElementById('mainPoints'), previousPoints, currentPoints, 2000, 0);
        
        // Animate progress percentage
        setTimeout(() => {
          const progressStatEl = document.getElementById('progressStat');
          let currentPercent = 0;
          const percentInterval = setInterval(() => {
            currentPercent += 2;
            if (currentPercent >= progressPercent) {
              currentPercent = progressPercent;
              clearInterval(percentInterval);
            }
            progressStatEl.textContent = currentPercent + '%';
          }, 20);
        }, 500);
      }, 300);
    }
  }

  // Display stats
  const uniqueSites = new Set(summary.activities.map(a => a.domain)).size;
  document.getElementById('totalSites').textContent = uniqueSites;
  document.getElementById('totalTabs').textContent = summary.activities.length;

  // Calculate productivity score (fewer switches = better)
  // Note: Study resources are already filtered out in background.js, so this only counts distractions
  const score = Math.max(0, 100 - (summary.activities.length * 2));
  document.getElementById('productivityScore').textContent = score + '%';

  // Display activity timeline
  const websiteList = document.getElementById('websiteList');
  
  if (summary.activities.length === 0) {
    websiteList.innerHTML = '<div class="empty-state">No browsing data recorded</div>';
  } else {
    websiteList.innerHTML = '';
    
    // Group activities by domain and calculate time spent
    const domainMap = {};
    summary.activities.forEach((activity, index) => {
      const domain = activity.domain;
      if (!domainMap[domain]) {
        domainMap[domain] = {
          domain: domain,
          title: activity.title,
          icon: activity.icon,
          visits: 0,
          firstSeen: activity.timestamp
        };
      }
      domainMap[domain].visits++;
    });

    // Convert to array and sort by visits
    const domains = Object.values(domainMap).sort((a, b) => b.visits - a.visits);

    // Display top sites
    domains.slice(0, 10).forEach(site => {
      const item = document.createElement('div');
      item.className = 'website-item';
      
      const timeSpent = `${site.visits} ${site.visits === 1 ? 'visit' : 'visits'}`;
      
      item.innerHTML = `
        <div class="website-info">
          <div class="website-icon">${site.icon}</div>
          <div class="website-details">
            <div class="website-title">${site.title}</div>
            <div class="website-url">${site.domain}</div>
          </div>
        </div>
        <div class="website-time">${timeSpent}</div>
      `;
      
      websiteList.appendChild(item);
    });
  }

  // Clear the session summary after displaying
  await chrome.storage.local.remove('sessionSummary');
}

// Add close button handler
document.getElementById('closeButton')?.addEventListener('click', () => {
  window.close();
});

// Load summary on page load
document.addEventListener('DOMContentLoaded', loadSessionSummary);
