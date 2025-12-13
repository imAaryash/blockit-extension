// Register.js - User registration logic with API integration
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

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value.trim();
  const displayName = document.getElementById('displayName').value.trim();
  const password = document.getElementById('password').value;
  const registerBtn = document.getElementById('registerBtn');
  
  // Validate
  if (username.length < 3) {
    showError('Username must be at least 3 characters');
    return;
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showError('Username can only contain letters, numbers, and underscores');
    return;
  }
  
  if (password.length < 6) {
    showError('Password must be at least 6 characters');
    return;
  }
  
  registerBtn.disabled = true;
  registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
  
  try {
    console.log('Attempting to register:', username, displayName);
    
    // Register via API
    const response = await API.register(username, displayName, password);
    
    console.log('Registration response:', response);
    
    if (response.user && response.token) {
      console.log('Saving user data locally...');
      
      // Save user data locally for quick access
      await chrome.storage.local.set({
        user: response.user,
        isRegistered: true
      });
      
      console.log('Notifying background script...');
      
      // Notify background script
      await send({action: 'userRegistered', user: response.user});
      
      console.log('Redirecting to popup...');
      
      registerBtn.innerHTML = '<i class="fas fa-check"></i> Account Created!';
      
      // Redirect to main app
      setTimeout(() => {
        window.location.href = 'popup.html';
      }, 1000);
    } else {
      console.error('Invalid response structure:', response);
      showError('Registration failed. Invalid response from server.');
      registerBtn.disabled = false;
      registerBtn.innerHTML = '<i class="fas fa-rocket"></i> Create Account';
    }
  } catch (error) {
    console.error('Registration error:', error);
    showError(error.message || 'Registration failed. Please try again.');
    registerBtn.disabled = false;
    registerBtn.innerHTML = '<i class="fas fa-rocket"></i> Create Account';
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

// Check if already registered
chrome.storage.local.get(['user', 'isRegistered', 'authToken'], async (data) => {
  if (data.isRegistered && data.user && data.authToken) {
    // Verify token is still valid by fetching profile
    try {
      await API.getProfile();
      window.location.href = 'popup.html';
    } catch (error) {
      // Token invalid, clear and show registration
      await chrome.storage.local.remove(['authToken', 'user', 'isRegistered']);
    }
  }
});
