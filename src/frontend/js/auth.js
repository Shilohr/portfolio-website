// ===================================
// AUTHENTICATION JAVASCRIPT
// ===================================

// DOM Elements
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');

// Get CSRF token from window variable (set by security.js)
function getCsrfToken() {
    return window.csrfToken || '';
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Wait a bit for CSRF token to initialize, then check auth status
    setTimeout(() => {
        checkAuthStatus();
    }, 100);
});

// Handle Login
async function handleLogin(e) {
    e.preventDefault();
    
    // Check if CSRF token is available
    if (!window.csrfToken) {
        showMessage('Security token not ready. Please wait a moment...', 'error');
        return;
    }
    
    const formData = new FormData(loginForm);
    const loginData = {
        username: formData.get('username'),
        password: formData.get('password')
    };
    
    try {
        showMessage('Logging in...', 'info');
        
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.csrfToken
            },
            body: JSON.stringify(loginData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('Login successful! Redirecting...', 'success');
            
            // Redirect to admin
            setTimeout(() => {
                window.location.href = '/admin.html';
            }, 1000);
            
        } else {
            showMessage(data.error || 'Login failed', 'error');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showMessage('Network error. Please try again.', 'error');
    }
}

// Check Authentication Status
function checkAuthStatus() {
    // Verify token is still valid via cookie (no CSRF needed for GET profile)
    fetch('/api/auth/profile', {
        credentials: 'include',
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            console.log('Auth check failed - user not logged in');
            // Only logout if we're not on the login page
            if (!window.location.pathname.includes('login.html')) {
                logout();
            }
        } else {
            console.log('Auth check passed - user is logged in');
        }
    })
    .catch(error => {
        console.error('Auth check error:', error);
        // Don't logout on network errors, only on auth failures
    });
}

// Logout Function
async function logout() {
    try {
        // Call logout endpoint (CSRF token optional for logout)
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.csrfToken || ''
            }
        });
        
        if (!response.ok) {
            console.error('Logout failed:', response.status);
        }
    } catch (error) {
        console.error('Logout API error:', error);
    }
    
    // Redirect to login
    window.location.href = '/login.html';
}

// User Registration
async function register(userData) {
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': await getCsrfToken()
            },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('Registration successful! Please login.', 'success');
            return { success: true, data };
        } else {
            showMessage(data.error || 'Registration failed', 'error');
            return { success: false, error: data.error };
        }
        
    } catch (error) {
        console.error('Registration error:', error);
        showMessage('Network error during registration', 'error');
        return { success: false, error: 'Network error' };
    }
}

// Protected Route Access
async function requireAuth() {
    try {
        const response = await fetch('/api/auth/profile', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            logout();
            return false;
        }
        
        const data = await response.json();
        return data.user;
        
    } catch (error) {
        console.error('Auth verification error:', error);
        logout();
        return false;
    }
}

// Get Current User
async function getCurrentUser() {
    try {
        const response = await fetch('/api/auth/profile', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.user;
        }
        return null;
    } catch (error) {
        console.error('Get current user error:', error);
        return null;
    }
}

// Show Message
function showMessage(message, type) {
    if (!loginMessage) return;
    
    loginMessage.className = type === 'error' ? 'error-message' : 
                           type === 'info' ? 'info-message' : 'success-message';
    loginMessage.textContent = message;
    loginMessage.style.display = 'block';
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        if (loginMessage) {
            loginMessage.style.display = 'none';
        }
    }, 5000);
}

// API Request Helper with Auth
async function authenticatedFetch(url, options = {}) {
    const defaultOptions = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    const finalOptions = {
        ...defaultOptions,
        ...options,
        credentials: 'include',
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };
    
    try {
        const response = await fetch(url, finalOptions);
        
        // Handle 401 Unauthorized
        if (response.status === 401) {
            logout();
            throw new Error('Authentication required');
        }
        
        return response;
        
    } catch (error) {
        console.error('Authenticated fetch error:', error);
        throw error;
    }
}

// Token Refresh (if implemented)
async function refreshToken() {
    try {
        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.token;
        } else {
            logout();
            return false;
        }
        
    } catch (error) {
        console.error('Token refresh error:', error);
        logout();
        return false;
    }
}

// Form Validation
function validateLoginForm(formData) {
    const errors = [];
    
    if (!formData.get('username') || formData.get('username').trim().length < 3) {
        errors.push('Username must be at least 3 characters long');
    }
    
    if (!formData.get('password') || formData.get('password').length < 6) {
        errors.push('Password must be at least 6 characters long');
    }
    
    return errors;
}

function validateRegistrationForm(formData) {
    const errors = [];
    const username = formData.get('username');
    const email = formData.get('email');
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    
    if (!username || username.trim().length < 3) {
        errors.push('Username must be at least 3 characters long');
    }
    
    if (!email || !isValidEmail(email)) {
        errors.push('Please enter a valid email address');
    }
    
    if (!password || password.length < 6) {
        errors.push('Password must be at least 6 characters long');
    }
    
    if (password !== confirmPassword) {
        errors.push('Passwords do not match');
    }
    
    return errors;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Export for use in other files
window.authUtils = {
    logout,
    login: handleLogin,
    register,
    requireAuth,
    getCurrentUser,
    getToken: () => null, // Tokens are now stored in httpOnly cookies
    getUser: async () => {
        const user = await getCurrentUser();
        return user || {};
    },
    isAuthenticated: async () => {
        try {
            const response = await fetch('/api/auth/profile', {
                credentials: 'include'
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    },
    authenticatedFetch,
    refreshToken,
    validateLoginForm,
    validateRegistrationForm,
    showMessage
};

// Auto-logout on token expiration
let tokenCheckInterval;
function startTokenCheck() {
    // Check token validity every 5 minutes
    tokenCheckInterval = setInterval(() => {
        fetch('/api/auth/profile', {
            credentials: 'include'
        })
        .then(response => {
            if (!response.ok) {
                logout();
            }
        })
        .catch(error => {
            console.error('Token check error:', error);
        });
    }, 5 * 60 * 1000); // 5 minutes
}

// Start token check if on a protected page
if (window.location.pathname.includes('admin')) {
    startTokenCheck();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (tokenCheckInterval) {
        clearInterval(tokenCheckInterval);
    }
});

console.log(' Authentication module loaded');