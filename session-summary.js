// Load and display session summary
async function loadSessionSummary() {
  console.log('[SessionSummary] Loading session summary...');
  const result = await chrome.storage.local.get(['sessionSummary']);
  const summary = result.sessionSummary;

  console.log('[SessionSummary] Summary data:', summary);

  if (!summary) {
    console.log('[SessionSummary] No session summary found');
    return;
  }

  // Display duration
  const minutes = Math.floor(summary.duration / 60);
  const seconds = summary.duration % 60;
  const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  document.getElementById('sessionDuration').textContent = durationText;

  // Display stats
  const uniqueSites = new Set(summary.activities.map(a => a.domain)).size;
  document.getElementById('totalSites').textContent = uniqueSites;
  document.getElementById('totalTabs').textContent = summary.activities.length;

  // Calculate productivity score (fewer switches = better)
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
