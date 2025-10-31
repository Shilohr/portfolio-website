// ===================================
// ADMIN DASHBOARD JAVASCRIPT
// ===================================

// Utility Functions
const utils = {
    // CSRF Token management
    async getCsrfToken() {
        try {
            const response = await fetch('/api/csrf-token', {
                credentials: 'include'
            });
            const data = await response.json();
            return data.csrfToken;
        } catch (error) {
            console.error('Failed to fetch CSRF token:', error);
            throw error;
        }
    },

    // API Request helper
    async apiRequest(endpoint, options = {}) {
        const url = `/api${endpoint}`;
        const token = this.getToken();
        
        const config = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        };

        // Add CSRF token to state-changing requests
        const method = (options.method || 'GET').toUpperCase();
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
            try {
                const csrfToken = await this.getCsrfToken();
                config.headers['X-CSRF-Token'] = csrfToken;
            } catch (error) {
                console.error('Failed to get CSRF token for request:', error);
                throw new Error('Security validation failed');
            }
        }

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API Request failed for ${endpoint}:`, error);
            throw error;
        }
    },

    // Token management - tokens are now stored in httpOnly cookies
    getToken() {
        return null; // Tokens are now in httpOnly cookies
    },

    setToken(token) {
        console.warn('setToken is deprecated - tokens are now stored in httpOnly cookies');
    },

    removeToken() {
        console.warn('removeToken is deprecated - tokens are now stored in httpOnly cookies');
    },

    // Alert system
    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer') || this.createAlertContainer();
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.innerHTML = `
            <span class="alert-message">${message}</span>
            <button class="alert-close" onclick="this.parentElement.remove()">×</button>
        `;
        
        alertContainer.appendChild(alert);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
            }
        }, 5000);
    },

    createAlertContainer() {
        const container = document.createElement('div');
        container.id = 'alertContainer';
        container.className = 'alert-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
        `;
        document.body.appendChild(container);
        return container;
    },

    // Date formatting
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    // Text truncation
    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    },

    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// Error Handler
const errorHandler = {
    handle(error, context = 'Unknown') {
        console.error(`Error in ${context}:`, error);
        utils.showAlert(error.message || `An error occurred in ${context}`, 'error');
    },

    handleApiError(error, endpoint) {
        const message = error.message || `Failed to communicate with ${endpoint}`;
        console.error(`API Error for ${endpoint}:`, error);
        utils.showAlert(message, 'error');
    }
};

// Loading States
const loading = {
    show(container, message = 'Loading...') {
        if (!container) return;
        
        const loadingElement = document.createElement('div');
        loadingElement.className = 'loading-overlay';
        loadingElement.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">${message}</div>
        `;
        loadingElement.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            color: white;
            font-family: 'Courier New', monospace;
        `;
        
        container.style.position = 'relative';
        container.appendChild(loadingElement);
    },

    hide(container) {
        if (!container) return;
        const loadingElement = container.querySelector('.loading-overlay');
        if (loadingElement) {
            loadingElement.remove();
        }
    }
};

// Form Utilities
const forms = {
    resetForm(form) {
        if (!form) return;
        form.reset();
        
        // Clear any validation errors
        const errorElements = form.querySelectorAll('.form-error');
        errorElements.forEach(element => element.remove());
    },

    showFieldError(field, message) {
        // Remove existing error
        const existingError = field.parentElement.querySelector('.form-error');
        if (existingError) {
            existingError.remove();
        }

        // Add new error
        const errorElement = document.createElement('div');
        errorElement.className = 'form-error';
        errorElement.textContent = message;
        errorElement.style.cssText = `
            color: #ff6b6b;
            font-size: 0.875rem;
            margin-top: 0.25rem;
        `;
        
        field.parentElement.appendChild(errorElement);
        field.classList.add('error');
    },

    clearErrors(field) {
        const existingError = field.parentElement.querySelector('.form-error');
        if (existingError) {
            existingError.remove();
        }
        field.classList.remove('error');
    }
};

// Authentication Manager
class AuthManager {
    constructor() {
        this.token = null;
        this.user = null;
        this.init();
    }

    init() {
        this.setupLogout();
        this.checkProtectedAccess();
    }

    setupLogout() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    async logout() {
        try {
            // Get fresh CSRF token for logout operation
            const csrfToken = await utils.getCsrfToken();
            
            await utils.apiRequest('/auth/logout', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': csrfToken
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.user = null;
            utils.showAlert('Logged out successfully', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1000);
        }
    }

    async checkProtectedAccess() {
        // Add a small delay to ensure cookies are properly set
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
            const response = await utils.apiRequest('/auth/profile');
            this.user = response.user;
        } catch (error) {
            console.error('Authentication check failed:', error);
            // Only redirect if we're not already on login page
            if (!window.location.pathname.includes('login.html')) {
                utils.showAlert('Session expired. Please login again.', 'warning');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            }
        }
    }

    getCurrentUser() {
        return this.user;
    }

    isAuthenticated() {
        return !!this.user;
    }

    isAdmin() {
        return this.user && this.user.role === 'admin';
    }
}

// Main Admin Dashboard Class
class AdminDashboard {
    constructor() {
        this.projects = [];
        this.githubRepos = [];
        this.auth = new AuthManager();
        this.init();
    }

    async init() {
        // Wait for authentication check to complete
        await this.auth.checkProtectedAccess();
        
        // Only initialize if authenticated
        if (!this.auth.isAuthenticated()) {
            return;
        }

        this.setupEventListeners();
        this.loadDashboardData();
    }

    setupEventListeners() {
        // Add Project button
        const addProjectBtn = document.getElementById('addProjectBtn');
        if (addProjectBtn) {
            addProjectBtn.addEventListener('click', () => this.showProjectForm());
        }

        // Sync GitHub button
        const syncGithubBtn = document.getElementById('syncGithubBtn');
        if (syncGithubBtn) {
            syncGithubBtn.addEventListener('click', () => this.syncGitHubRepos());
        }

        // Project form
        const projectForm = document.getElementById('projectManageForm');
        if (projectForm) {
            projectForm.addEventListener('submit', (e) => this.handleProjectSubmit(e));
        }

        // Cancel project button
        const cancelProjectBtn = document.getElementById('cancelProjectBtn');
        if (cancelProjectBtn) {
            cancelProjectBtn.addEventListener('click', () => this.hideProjectForm());
        }
    }

    async loadDashboardData() {
        try {
            await Promise.all([
                this.loadProjects(),
                this.loadGitHubRepos()
            ]);
        } catch (error) {
            errorHandler.handle(error, 'Load Dashboard Data');
        }
    }

    async loadProjects() {
        const container = document.getElementById('adminProjectsGrid');
        loading.show(container, 'Loading projects...');

        try {
            const response = await utils.apiRequest('/projects');
            this.projects = response.projects || [];
            this.renderProjects();
        } catch (error) {
            errorHandler.handleApiError(error, '/projects');
            container.innerHTML = '<p class="text-center">Failed to load projects.</p>';
        } finally {
            loading.hide(container);
        }
    }

    renderProjects() {
        const container = document.getElementById('adminProjectsGrid');
        
        if (this.projects.length === 0) {
            container.innerHTML = '<p class="text-center">No projects found.</p>';
            return;
        }

        const projectsHTML = this.projects.map(project => `
            <div class="admin-project-card glass-card">
                <div class="project-header">
                    <h3>${project.title}</h3>
                    <div class="project-actions">
                        <button class="btn btn-small edit-project" data-id="${project.id}">Edit</button>
                        <button class="btn btn-small btn-danger delete-project" data-id="${project.id}">Delete</button>
                    </div>
                </div>
                <p class="project-description">${utils.truncateText(project.description || 'No description', 100)}</p>
                <div class="project-meta">
                    <span class="status-badge status-${project.status}">${project.status}</span>
                    ${project.featured ? '<span class="featured-badge"> Featured</span>' : ''}
                </div>
                <div class="project-technologies">
                    ${project.technologies.slice(0, 3).map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
                </div>
                <div class="project-links">
                    ${project.github_url ? `<a href="${project.github_url}" target="_blank">GitHub</a>` : ''}
                    ${project.live_url ? `<a href="${project.live_url}" target="_blank">Live</a>` : ''}
                </div>
                <div class="project-date">Created: ${utils.formatDate(project.created_at)}</div>
            </div>
        `).join('');

        container.innerHTML = projectsHTML;

        // Add event listeners
        container.querySelectorAll('.edit-project').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const projectId = e.target.dataset.id;
                this.editProject(projectId);
            });
        });

        container.querySelectorAll('.delete-project').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const projectId = e.target.dataset.id;
                this.deleteProject(projectId);
            });
        });
    }

    async loadGitHubRepos() {
        const container = document.getElementById('adminGithubGrid');
        loading.show(container, 'Loading GitHub repositories...');

        try {
            const response = await utils.apiRequest('/github/repos');
            this.githubRepos = response.repositories || [];
            this.renderGitHubRepos();
        } catch (error) {
            errorHandler.handleApiError(error, '/github/repos');
            container.innerHTML = '<p class="text-center">Failed to load GitHub repositories.</p>';
        } finally {
            loading.hide(container);
        }
    }

    renderGitHubRepos() {
        const container = document.getElementById('adminGithubGrid');
        
        if (this.githubRepos.length === 0) {
            container.innerHTML = '<p class="text-center">No GitHub repositories found.</p>';
            return;
        }

        const reposHTML = this.githubRepos.map(repo => `
            <div class="github-repo-card glass-card">
                <div class="repo-header">
                    <h3>${repo.name}</h3>
                    <a href="${repo.html_url}" target="_blank" class="btn btn-small">View</a>
                </div>
                <p class="repo-description">${utils.truncateText(repo.description || 'No description', 100)}</p>
                <div class="repo-stats">
                    <span class="repo-stat"> ${repo.stars || 0}</span>
                    <span class="repo-stat"> ${repo.forks || 0}</span>
                    ${repo.language ? `<span class="repo-stat">${repo.language}</span>` : ''}
                </div>
                <div class="repo-date">Updated: ${utils.formatDate(repo.updated_at)}</div>
            </div>
        `).join('');

        container.innerHTML = reposHTML;
    }

    async showProjectForm(project = null) {
        const form = document.getElementById('projectForm');
        const formTitle = form.querySelector('h2');
        const formElement = document.getElementById('projectManageForm');
        
        try {
            // Get fresh CSRF token for the form
            const csrfToken = await utils.getCsrfToken();
            document.getElementById('csrfToken').value = csrfToken;
        } catch (error) {
            console.error('Failed to load CSRF token:', error);
            utils.showAlert('Security validation failed. Please refresh the page.', 'error');
            return;
        }
        
        if (project) {
            formTitle.textContent = 'Edit Project';
            document.getElementById('projectTitle').value = project.title;
            document.getElementById('projectDescription').value = project.description || '';
            document.getElementById('projectGithub').value = project.github_url || '';
            document.getElementById('projectLive').value = project.live_url || '';
            document.getElementById('projectStatus').value = project.status;
            document.getElementById('projectTechnologies').value = project.technologies.join(', ');
            document.getElementById('projectFeatured').checked = project.featured;
            
            // Store project ID for editing
            formElement.dataset.projectId = project.id;
        } else {
            formTitle.textContent = 'Add New Project';
            forms.resetForm(formElement);
            delete formElement.dataset.projectId;
        }
        
        form.classList.remove('hidden');
    }

    hideProjectForm() {
        const form = document.getElementById('projectForm');
        form.classList.add('hidden');
        forms.resetForm(document.getElementById('projectManageForm'));
    }

    async handleProjectSubmit(e) {
        e.preventDefault();
        
        const form = e.target;
        const formData = new FormData(form);
        const projectId = form.dataset.projectId;
        const csrfToken = formData.get('_csrf');
        
        const projectData = {
            title: formData.get('title'),
            description: formData.get('description'),
            github_url: formData.get('github_url'),
            live_url: formData.get('live_url'),
            status: formData.get('status'),
            featured: formData.get('featured') === 'on',
            technologies: formData.get('technologies')
                .split(',')
                .map(tech => tech.trim())
                .filter(tech => tech.length > 0)
        };

        // Basic validation
        if (!projectData.title.trim()) {
            forms.showFieldError(document.getElementById('projectTitle'), 'Title is required');
            return;
        }

        if (!csrfToken) {
            utils.showAlert('Security validation failed. Please refresh the page.', 'error');
            return;
        }

        try {
            let response;
            if (projectId) {
                response = await utils.apiRequest(`/projects/${projectId}`, {
                    method: 'PUT',
                    headers: {
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify(projectData)
                });
                utils.showAlert('Project updated successfully', 'success');
            } else {
                response = await utils.apiRequest('/projects', {
                    method: 'POST',
                    headers: {
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify(projectData)
                });
                utils.showAlert('Project created successfully', 'success');
            }

            this.hideProjectForm();
            await this.loadProjects();
        } catch (error) {
            errorHandler.handleApiError(error, projectId ? `/projects/${projectId}` : '/projects');
        }
    }

    editProject(projectId) {
        const project = this.projects.find(p => p.id == projectId);
        if (project) {
            this.showProjectForm(project);
        }
    }

    async deleteProject(projectId) {
        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            return;
        }

        try {
            // Get fresh CSRF token for delete operation
            const csrfToken = await utils.getCsrfToken();
            
            await utils.apiRequest(`/projects/${projectId}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': csrfToken
                }
            });
            
            utils.showAlert('Project deleted successfully', 'success');
            await this.loadProjects();
        } catch (error) {
            errorHandler.handleApiError(error, `/projects/${projectId}`);
        }
    }

    async syncGitHubRepos() {
        const syncBtn = document.getElementById('syncGithubBtn');
        const originalText = syncBtn.textContent;
        
        try {
            syncBtn.textContent = 'Syncing...';
            syncBtn.disabled = true;

            // Get fresh CSRF token for sync operation
            const csrfToken = await utils.getCsrfToken();

            const response = await utils.apiRequest('/github/sync', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': csrfToken
                }
            });

            utils.showAlert(`Successfully synced ${response.syncedCount || 0} repositories`, 'success');
            await this.loadGitHubRepos();
        } catch (error) {
            errorHandler.handleApiError(error, '/github/sync');
        } finally {
            syncBtn.textContent = originalText;
            syncBtn.disabled = false;
        }
    }
}

// Initialize admin dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    // Only initialize on admin page
    if (window.location.pathname.includes('admin.html')) {
        const dashboard = new AdminDashboard();
        await dashboard.init();
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminDashboard;
}