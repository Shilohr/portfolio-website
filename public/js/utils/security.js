// Security utilities for XSS protection and CSRF handling


export function showErrorMessage(message) {
    const errorToast = document.createElement('div');
    errorToast.className = 'error-toast';
    errorToast.setAttribute('role', 'alert');
    errorToast.setAttribute('aria-live', 'assertive');
    errorToast.textContent = message;
    errorToast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--warning);
        color: white;
        padding: 1rem;
        border-radius: 8px;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: slideIn 0.3s ease-out;
    `;
    
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

    // Add CSRF token to state-changing requests
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
                
                // Retry the request with new token
                if (window.csrfToken) {
                    mergedOptions.headers['X-CSRF-Token'] = window.csrfToken;
                    return await fetch(url, mergedOptions);
                }
            }
        }
        
        return response;
        
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

export async function initializeCSRFProtection() {
    try {
        const response = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch CSRF token');
        
        const data = await response.json();
        window.csrfToken = data.csrfToken;
        
        console.log('CSRF protection initialized');
        
        // Refresh CSRF token periodically (every 30 minutes)
        setInterval(refreshCSRFToken, 30 * 60 * 1000);
        
    } catch (error) {
        console.error('Failed to initialize CSRF protection:', error);
        throw error;
    }
}

async function refreshCSRFToken() {
    try {
        const response = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to refresh CSRF token');
        
        const data = await response.json();
        window.csrfToken = data.csrfToken;
        
        console.log('CSRF token refreshed');
        
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



