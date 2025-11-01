// Projects and GitHub functionality - loaded on demand
import { makeAPIRequest, handleAPIResponse, escapeHtml } from '../utils/security.js';
import { initializeWithErrorBoundary, announceToScreenReader } from '../utils/helpers.js';

// Projects API
export async function loadProjects() {
    try {
        const response = await makeAPIRequest('/api/projects?featured=true&limit=3');
        const data = await handleAPIResponse(response, 'Failed to fetch projects');
        
        // Defensive programming - handle undefined data structure
        const projects = (data && data.data && data.data.projects) ? data.data.projects : [];
        
        displayProjects(projects);
        
        console.log(` Loaded ${projects.length} featured projects`);
        
    } catch (error) {
        console.error(' Error loading projects:', error);
        displayProjectsError();
    }
}

function displayProjects(projects) {
    const projectsGrid = document.getElementById('projectsGrid');
    if (!projectsGrid) return;
    
    // Defensive programming - ensure projects is an array
    if (!projects || !Array.isArray(projects)) {
        console.error('displayProjects: projects is not an array:', projects);
        projects = [];
    }
    
    if (projects.length === 0) {
        projectsGrid.innerHTML = '<p class="text-center" role="status">No projects found.</p>';
        announceToScreenReader('No projects found');
        return;
    }
    
    projectsGrid.innerHTML = projects.map((project, index) => `
        <div class="project-card" tabindex="0" role="article" aria-labelledby="project-title-${index}" aria-describedby="project-desc-${index}">
            <h3 class="project-title" id="project-title-${index}">${escapeHtml(project.title)}</h3>
            <p class="project-description" id="project-desc-${index}">${escapeHtml(project.description || 'No description available.')}</p>
            <div class="project-technologies" role="list" aria-label="Technologies used">
                ${project.technologies.map(tech => `<span class="tech-tag" role="listitem">${escapeHtml(tech)}</span>`).join('')}
            </div>
            <div class="project-links" role="group" aria-label="Project links">
                ${project.github_url ? `<a href="${escapeHtml(project.github_url)}" target="_blank" class="project-link" rel="noopener noreferrer" aria-label="View ${escapeHtml(project.title)} on GitHub">GitHub</a>` : ''}
                ${project.live_url ? `<a href="${escapeHtml(project.live_url)}" target="_blank" class="project-link" rel="noopener noreferrer" aria-label="View live demo of ${escapeHtml(project.title)}">Live Demo</a>` : ''}
            </div>
        </div>
    `).join('');
    
    announceToScreenReader(`Loaded ${projects.length} projects`);
}

function displayProjectsError() {
    const projectsGrid = document.getElementById('projectsGrid');
    if (projectsGrid) {
        projectsGrid.innerHTML = '<p class="text-center" role="alert">Failed to load projects. Please try again later.</p>';
        announceToScreenReader('Failed to load projects');
    }
}

// GitHub API
export async function loadGitHubRepos() {
    try {
        const response = await makeAPIRequest('/api/github/repos?limit=6');
        const data = await handleAPIResponse(response, 'Failed to fetch GitHub repos');
        
        // Defensive programming - handle undefined data structure
        const repositories = (data && data.data && data.data.repositories) ? data.data.repositories : [];
        
        displayGitHubRepos(repositories);
        
        console.log(` Loaded ${repositories.length} GitHub repositories`);
        
    } catch (error) {
        console.error(' Error loading GitHub repos:', error);
        displayGitHubError();
    }
}

function displayGitHubRepos(repos) {
    const githubContainer = document.getElementById('githubContainer');
    if (!githubContainer) return;
    
    if (repos.length === 0) {
        githubContainer.innerHTML = '<p class="text-center" role="status">No repositories found.</p>';
        announceToScreenReader('No GitHub repositories found');
        return;
    }
    
    githubContainer.innerHTML = `
        <div class="projects-grid" role="list" aria-label="GitHub repositories">
            ${repos.map((repo, index) => `
                <div class="project-card" tabindex="0" role="listitem" aria-labelledby="repo-title-${index}" aria-describedby="repo-desc-${index}">
                    <h3 class="project-title" id="repo-title-${index}">${escapeHtml(repo.name)}</h3>
                    <p class="project-description" id="repo-desc-${index}">${escapeHtml(repo.description || 'No description available.')}</p>
                    <div class="project-technologies" role="list" aria-label="Repository statistics">
                        ${repo.language ? `<span class="tech-tag" role="listitem">${escapeHtml(repo.language)}</span>` : ''}
                        <span class="tech-tag" role="listitem" aria-label="${repo.stars} stars"> ${repo.stars}</span>
                        <span class="tech-tag" role="listitem" aria-label="${repo.forks} forks"> ${repo.forks}</span>
                    </div>
                    <div class="project-links" role="group" aria-label="Repository links">
                        <a href="${escapeHtml(repo.html_url)}" target="_blank" class="project-link" rel="noopener noreferrer" aria-label="View ${escapeHtml(repo.name)} repository on GitHub">View on GitHub</a>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    announceToScreenReader(`Loaded ${repos.length} GitHub repositories`);
}

function displayGitHubError() {
    const githubContainer = document.getElementById('githubContainer');
    if (githubContainer) {
        githubContainer.innerHTML = '<p class="text-center" role="alert">Failed to load GitHub repositories. Please try again later.</p>';
        announceToScreenReader('Failed to load GitHub repositories');
    }
}

// GitHub Sync Button
export function initGitHubSync() {
    const syncGithubBtn = document.getElementById('syncGithub');
    if (syncGithubBtn) {
        syncGithubBtn.addEventListener('click', handleGitHubSync);
        syncGithubBtn.addEventListener('keydown', handleGitHubSyncKeydown);
    }
}

async function handleGitHubSync() {
    const syncGithubBtn = document.getElementById('syncGithub');
    if (!syncGithubBtn) return;
    
    try {
        // Ensure we have a fresh CSRF token before making request
        try {
            // Try to refresh the CSRF token to ensure it's valid
            const response = await fetch('/api/csrf-token', {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                window.csrfToken = data.data.csrfToken;
                
            }
        } catch (error) {
            console.warn('Failed to refresh CSRF token:', error);
        }
        
        if (!window.csrfToken) {
            throw new Error('CSRF token not available. Please refresh the page and try again.');
        }
        
        const originalText = syncGithubBtn.textContent;
        syncGithubBtn.textContent = 'Syncing...';
        syncGithubBtn.disabled = true;
        syncGithubBtn.setAttribute('aria-label', 'Syncing GitHub repositories...');
        
        announceToScreenReader('Syncing GitHub repositories...');
        
        
        const response = await makeAPIRequest('/api/github/sync', { method: 'POST' });
        const data = await handleAPIResponse(response, 'Failed to sync GitHub');
        console.log(' GitHub sync successful:', data);
        
        await loadGitHubRepos();
        
        syncGithubBtn.textContent = 'Sync Complete!';
        syncGithubBtn.setAttribute('aria-label', 'GitHub sync completed successfully');
        announceToScreenReader('GitHub sync completed successfully');
        
        setTimeout(() => {
            syncGithubBtn.textContent = originalText;
            syncGithubBtn.disabled = false;
            syncGithubBtn.setAttribute('aria-label', 'Sync GitHub repositories');
        }, 2000);
        
    } catch (error) {
        console.error(' GitHub sync error:', error);
        
        // Show appropriate error message based on error type
        let errorMessage = 'GitHub sync failed';
        let announcement = 'GitHub sync failed';
        
        if (error.code === 'CONFIG_ERROR') {
            errorMessage = 'Config Error';
            announcement = 'GitHub configuration issue. Syncing public repositories.';
        } else if (error.code === 'RATE_LIMIT') {
            errorMessage = 'Rate Limited';
            announcement = 'GitHub API rate limit exceeded. Please try again later.';
        } else if (error.code === 'NOT_FOUND') {
            errorMessage = 'Not Found';
            announcement = 'GitHub user not found or has no public repositories.';
        } else if (error.code === 'EXTERNAL_API_ERROR') {
            errorMessage = 'Connection Error';
            announcement = 'Failed to connect to GitHub API. Please check your internet connection.';
        }
        
        syncGithubBtn.textContent = errorMessage;
        syncGithubBtn.setAttribute('aria-label', announcement);
        announceToScreenReader(announcement);
        
        // Show error toast for better UX
        if (typeof showErrorMessage === 'function') {
            showErrorMessage(error.message);
        }
        
        setTimeout(() => {
            syncGithubBtn.textContent = 'Sync GitHub';
            syncGithubBtn.disabled = false;
            syncGithubBtn.setAttribute('aria-label', 'Sync GitHub repositories');
        }, 3000);
    }
}

function handleGitHubSyncKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleGitHubSync();
    }
}

// Initialize all project-related functionality
export async function initializeProjects() {
    try {
        await initializeWithErrorBoundary('Projects', loadProjects);
        await initializeWithErrorBoundary('GitHub Repos', loadGitHubRepos);
        await initializeWithErrorBoundary('GitHub Sync', initGitHubSync);
        
        console.log(' All project functionality initialized successfully');
        
    } catch (error) {
        console.error(' Failed to initialize projects:', error);
    }
}