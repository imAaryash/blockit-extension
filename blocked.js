// Motivational quotes
const quotes = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Productivity is never an accident. It is always the result of commitment to excellence.", author: "Paul J. Meyer" },
  { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { text: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { text: "Concentrate all your thoughts upon the work in hand. The sun's rays do not burn until brought to a focus.", author: "Alexander Graham Bell" },
  { text: "Stay focused, go after your dreams and keep moving toward your goals.", author: "LL Cool J" },
  { text: "It's not always that we need to do more but rather that we need to focus on less.", author: "Nathan W. Morris" },
  { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
  { text: "Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work.", author: "Steve Jobs" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Anonymous" },
  { text: "Dream bigger. Do bigger.", author: "Anonymous" },
  { text: "Don't stop when you're tired. Stop when you're done.", author: "Anonymous" },
  { text: "Wake up with determination. Go to bed with satisfaction.", author: "Anonymous" },
  { text: "Do something today that your future self will thank you for.", author: "Sean Patrick Flanery" },
  { text: "Little things make big days.", author: "Anonymous" },
  { text: "It's going to be hard, but hard does not mean impossible.", author: "Anonymous" },
  { text: "Don't wait for opportunity. Create it.", author: "Anonymous" },
  { text: "Sometimes we're tested not to show our weaknesses, but to discover our strengths.", author: "Anonymous" },
  { text: "The key to success is to focus on goals, not obstacles.", author: "Anonymous" },
  { text: "Dream it. Wish it. Do it.", author: "Anonymous" },
  { text: "Great things never come from comfort zones.", author: "Anonymous" }
];

// Get daily quote (same quote for the whole day)
function getDailyQuote() {
  const today = new Date().toDateString();
  const seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = seed % quotes.length;
  return quotes[index];
}

// Load stats and quote
async function loadBlockedPage() {
  try {
    // Load daily quote
    const dailyQuote = getDailyQuote();
    document.getElementById('quoteText').textContent = dailyQuote.text;
    document.getElementById('quoteAuthor').textContent = `— ${dailyQuote.author}`;
    
    // Load user stats
    const data = await chrome.storage.local.get(['todayFocusTime', 'streak', 'stats']);
    
    const todayMinutes = data.todayFocusTime || 0;
    const currentStreak = data.streak?.current || 0;
    const totalMinutes = data.stats?.totalFocusTime || 0;
    const totalHours = Math.floor(totalMinutes / 60);
    
    document.getElementById('todayFocus').textContent = `${todayMinutes}m`;
    document.getElementById('currentStreak').textContent = `${currentStreak}🔥`;
    document.getElementById('totalTime').textContent = `${totalHours}h`;
    
  } catch (error) {
    console.error('Error loading blocked page:', error);
  }
}

// Initialize
loadBlockedPage();
