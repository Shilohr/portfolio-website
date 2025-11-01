// Security utilities for XSS protection and CSRF handling

export function getCSPNonce() {
    const metaTag = document.querySelector('meta[name="csp-nonce"]');
    return metaTag ? metaTag.getAttribute('content') : '';
}

export function applyStyleWithNonce(element, styles) {
    const nonce = getCSPNonce();
    if (nonce) {
        element.setAttribute('nonce', nonce);
    }
    Object.assign(element.style, styles);
}

export function showErrorMessage(message) {
    const errorToast = document.createElement('div');
    errorToast.className = 'error-toast';
    errorToast.setAttribute('role', 'alert');
    errorToast.setAttribute('aria-live', 'assertive');
    errorToast.textContent = message;
    
    // Apply styles with nonce for CSP compliance
    applyStyleWithNonce(errorToast, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'var(--warning)',
        color: 'white',
        padding: '1rem',
        borderRadius: '8px',
        zIndex: '10000',
        maxWidth: '300px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        animation: 'slideIn 0.3s ease-out'
    });
    
    document.body.appendChild(errorToast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorToast.parentNode) {
            errorToast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (errorToast.parentNode) {
                    document.body.removeChild(errorToast);
                }
            }, 300);
        }
    }, 5000);
}

export function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\//g, "&#x2F;")
        .replace(/=/g, "&#x3D;");
}

export async function makeAPIRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include'
    };

    // Add CSRF token to state-changing requests if available
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase()) && window.csrfToken) {
        defaultOptions.headers['X-CSRF-Token'] = window.csrfToken;
    }

    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(url, mergedOptions);
        
        // Handle CSRF errors specifically
        if (response.status === 403) {
            const errorData = await response.json().catch(() => ({}));
            
            if (errorData.requiresRefresh || errorData.requiresToken) {
                console.warn(' CSRF token expired, refreshing...');
                await refreshCSRFToken();
                
                // Retry request with new token
                if (window.csrfToken) {
                    mergedOptions.headers['X-CSRF-Token'] = window.csrfToken;
                    return await fetch(url, mergedOptions);
                }
            }
        }
        
        // Handle authentication errors
        if (response.status === 401) {
            console.warn(' Authentication failed, session may have expired');
            // Don't automatically retry 401 errors - let the handleAPIResponse deal with them
            return response;
        }
        
        return response;
        
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

export async function initializeCSRFProtection() {
    try {
        console.log('Initializing CSRF protection...');
        
        const response = await fetch('/api/csrf-token', { 
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        window.csrfToken = data.data.csrfToken;
        
        console.log('CSRF protection initialized successfully');
        
        // Refresh CSRF token periodically (every 30 minutes)
        setInterval(refreshCSRFToken, 30 * 60 * 1000);
        
    } catch (error) {
        console.error('Failed to initialize CSRF protection:', error);
        // Don't throw error - let the application continue without CSRF
        console.warn('Continuing without CSRF protection - some features may not work properly');
    }
}

async function refreshCSRFToken() {
    try {
        console.log('Refreshing CSRF token...');
        
        const response = await fetch('/api/csrf-token', { 
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        window.csrfToken = data.data.csrfToken;
        
        console.log('CSRF token refreshed successfully');
        
    } catch (error) {
        console.error('Failed to refresh CSRF token:', error);
    }
}

export async function handleAPIResponse(response, errorMessage = 'API request failed') {
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { error: errorMessage };
        }
        
        // Handle specific error types with user-friendly messages
        let userMessage = errorMessage;
        if (errorData.error) {
            switch (errorData.code) {
                case 'UNAUTHORIZED':
                    userMessage = 'Authentication required. Please log in again.';
                    // Redirect to login page after a short delay
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                    break;
                case 'FORBIDDEN':
                    userMessage = 'Access denied. Admin privileges required.';
                    break;
                case 'CONFIG_ERROR':
                    userMessage = 'GitHub configuration issue. Syncing public repositories without authentication.';
                    break;
                case 'RATE_LIMIT':
                    userMessage = 'GitHub API rate limit exceeded. Please try again later.';
                    break;
                case 'NOT_FOUND':
                    userMessage = 'GitHub user not found or has no public repositories.';
                    break;
                case 'EXTERNAL_API_ERROR':
                    userMessage = 'Failed to connect to GitHub API. Please check your internet connection.';
                    break;
                default:
                    userMessage = errorData.error;
            }
        }
        
        const error = new Error(userMessage);
        error.code = errorData.code;
        error.data = errorData;
        throw error;
    }
    
    return await response.json();
}

export function handleCSRFError(error, response, announceToScreenReader) {
    if (response && response.status === 403) {
        const errorData = error.response?.data || {};
        
        if (errorData.requiresRefresh) {
            showErrorMessage('Session expired. Please refresh the page.');
            if (announceToScreenReader) announceToScreenReader('Security validation failed. Please refresh the page.');
        } else if (errorData.requiresToken) {
            showErrorMessage('Security token required. Please refresh the page.');
            if (announceToScreenReader) announceToScreenReader('Security token required. Please refresh the page.');
        } else {
            showErrorMessage('Security validation failed. Please refresh the page.');
            if (announceToScreenReader) announceToScreenReader('Security validation failed. Please refresh the page.');
        }
        return true;
    }
    return false;
}



