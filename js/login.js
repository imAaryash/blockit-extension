// Login.js - User login logic
async function send(msg) {
  return new Promise((res) => chrome.runtime.sendMessage(msg, res));
}

function showError(message) {
  const errorEl = document.getElementById('errorMessage');
  const errorText = errorEl.querySelector('span');
  errorText.textContent = message;
  errorEl.classList.add('show');
  setTimeout(() => errorEl.classList.remove('show'), 5000);
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('loginBtn');
  
  if (!username || !password) {
    showError('Please enter username and password');
    return;
  }
  
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
  
  try {
    console.log('Attempting to login:', username);
    
    const response = await API.login(username, password);
    
    console.log('Login response:', response);
    
    if (response.user && response.token) {
      console.log('Login successful, saving user data...');
      
      // Save user data locally
      // Save JWT token for authentication
      if (response.token) {
        await chrome.storage.local.set({ authToken: response.token });
        console.log('✅ Auth token saved');
      }
      
      await chrome.storage.local.set({
        user: response.user,
        isRegistered: true
      });
      
      // Notify background script
      await send({action: 'userRegistered', user: response.user});
      
      loginBtn.innerHTML = '<i class="fas fa-check"></i> Success!';
      
      // Redirect to main app
      setTimeout(() => {
        window.location.href = 'popup.html';
      }, 800);
    } else {
      console.error('Invalid response structure:', response);
      showError('Login failed. Invalid response from server.');
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Check if it's a device restriction error
    if (error.message && error.message.includes('already logged in on another device')) {
      showError('You are already logged in on another device. Please logout from the other device first.');
    } else {
      showError(error.message || 'Login failed. Please check your credentials.');
    }
    
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
  }
});

// Password visibility toggle
document.getElementById('togglePassword').addEventListener('click', function() {
  const passwordInput = document.getElementById('password');
  const icon = this.querySelector('i');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    passwordInput.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
});

// Check if already logged in
chrome.storage.local.get(['user', 'isRegistered', 'authToken'], async (data) => {
  if (data.isRegistered && data.user && data.authToken) {
    // Verify token is still valid
    try {
      await API.getProfile();
      window.location.href = 'popup.html';
    } catch (error) {
      // Token invalid, stay on login page
      console.log('Token invalid, user needs to login again');
    }
  }
});
