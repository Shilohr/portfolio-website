// ===================================
// AUTHENTICATION JAVASCRIPT
// ===================================

// DOM Elements
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Check if already logged in
    checkAuthStatus();
});

// Handle Login
async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(loginForm);
    const loginData = {
        username: formData.get('username'),
        password: formData.get('password')
    };
    
    try {
        showMessage('Logging in...', 'info');
        
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(loginData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Store token
            localStorage.setItem('portfolio_token', data.token);
            localStorage.setItem('portfolio_user', JSON.stringify(data.user));
            
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
    const token = localStorage.getItem('portfolio_token');
    const user = localStorage.getItem('portfolio_user');
    
    if (token && user) {
        // Verify token is still valid
        fetch('/api/auth/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                // Token invalid, clear storage
                logout();
            }
        })
        .catch(error => {
            console.error('Auth check error:', error);
        });
    }
}

// Logout Function
function logout() {
    const token = localStorage.getItem('portfolio_token');
    
    // Call logout endpoint if token exists
    if (token) {
        fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .catch(error => {
            console.error('Logout API error:', error);
        });
    }
    
    // Clear local storage
    localStorage.removeItem('portfolio_token');
    localStorage.removeItem('portfolio_user');
    
    // Redirect to login
    window.location.href = '/login.html';
}

// User Registration
async function register(userData) {
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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
    const token = localStorage.getItem('portfolio_token');
    
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    
    try {
        const response = await fetch('/api/auth/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
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
function getCurrentUser() {
    const userStr = localStorage.getItem('portfolio_user');
    return userStr ? JSON.parse(userStr) : null;
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
    const token = localStorage.getItem('portfolio_token');
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        }
    };
    
    const finalOptions = {
        ...defaultOptions,
        ...options,
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
    const token = localStorage.getItem('portfolio_token');
    
    if (!token) {
        return false;
    }
    
    try {
        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('portfolio_token', data.token);
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
    getToken: () => localStorage.getItem('portfolio_token'),
    getUser: () => JSON.parse(localStorage.getItem('portfolio_user') || '{}'),
    isAuthenticated: () => !!localStorage.getItem('portfolio_token'),
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
        const token = localStorage.getItem('portfolio_token');
        if (token) {
            fetch('/api/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(response => {
                if (!response.ok) {
                    logout();
                }
            })
            .catch(error => {
                console.error('Token check error:', error);
            });
        }
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

console.log('🔐 Authentication module loaded');