// ===================================
// PROJECTS PAGE JAVASCRIPT
// ===================================

// XSS Protection Utility
function escapeHtml(unsafe) {
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

class ProjectsPage {
    constructor() {
        this.projects = [];
        this.currentPage = 1;
        this.totalPages = 1;
        this.totalProjects = 0;
        this.filters = {
            language: '',
            sort: 'stars',
            search: ''
        };
        this.pageSize = 12;
        this.apiBase = 'http://localhost:8080/api';
        this.debounceTimer = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadProjects();
    }

    setupEventListeners() {
        // Language filter
        const languageFilter = document.getElementById('languageFilter');
        if (languageFilter) {
            languageFilter.addEventListener('change', () => {
                this.filters.language = languageFilter.value;
                this.currentPage = 1;
                this.loadProjects();
            });
        }

        // Sort filter
        const sortFilter = document.getElementById('sortFilter');
        if (sortFilter) {
            sortFilter.addEventListener('change', () => {
                this.filters.sort = sortFilter.value;
                this.currentPage = 1;
                this.loadProjects();
            });
        }

        // Search input with debouncing
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    this.filters.search = e.target.value;
                    this.currentPage = 1;
                    this.loadProjects();
                }, 300);
            });

            // Handle Enter key
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    clearTimeout(this.debounceTimer);
                    this.filters.search = e.target.value;
                    this.currentPage = 1;
                    this.loadProjects();
                }
            });
        }
    }

    async loadProjects() {
        const grid = document.getElementById('allProjectsGrid');
        const pagination = document.getElementById('pagination');
        
        // Show loading state
        this.showLoadingState(grid);

        try {
            // Build query parameters
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.pageSize
            });

            // Add filters
            if (this.filters.language) {
                params.append('language', this.filters.language);
            }
            
            if (this.filters.sort) {
                params.append('sort', this.filters.sort);
            }
            
            if (this.filters.search) {
                params.append('search', this.filters.search);
            }

            const response = await fetch(`${this.apiBase}/projects?${params}`, { credentials: 'include' });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            this.projects = data.data?.projects || [];
            this.currentPage = data.data?.pagination?.page || 1;
            this.totalPages = data.data?.pagination?.pages || 1;
            this.totalProjects = data.data?.pagination?.total || 0;

            this.renderProjects();
            this.renderPagination();

        } catch (error) {
            console.error('Error loading projects:', error);
            this.showErrorState(grid, error.message);
        }
    }

    showLoadingState(container) {
        container.innerHTML = `
            <div class="loading-state text-center" style="grid-column: 1 / -1;">
                <div class="loading-spinner"></div>
                <p class="neon-text">Loading projects from the cosmos...</p>
            </div>
        `;
        pagination.innerHTML = '';
    }

    showErrorState(container, message) {
        container.innerHTML = `
            <div class="error-state text-center" style="grid-column: 1 / -1;">
                <div class="error-icon"></div>
                <h3 class="neon-pink">Error Loading Projects</h3>
                <p>${escapeHtml(message)}</p>
                <button class="btn" onclick="projectsPage.loadProjects()">Try Again</button>
            </div>
        `;
    }

    renderProjects() {
        const grid = document.getElementById('allProjectsGrid');
        
        if (this.projects.length === 0) {
            grid.innerHTML = `
                <div class="no-projects text-center" style="grid-column: 1 / -1;">
                    <div class="no-results-icon"></div>
                    <h3 class="neon-text">No Projects Found</h3>
                    <p>No projects match your current filters. Try adjusting your search criteria.</p>
                    <button class="btn btn-outline" onclick="projectsPage.resetFilters()">Reset Filters</button>
                </div>
            `;
            return;
        }

        const projectsHTML = this.projects.map((project, index) => 
            this.createProjectCard(project, index)
        ).join('');

        grid.innerHTML = projectsHTML;
        
        // Add animations and interactions
        this.enhanceProjectCards();
    }

    createProjectCard(project, index) {
        const technologies = project.technologies && project.technologies.length > 0 
            ? project.technologies.slice(0, 4).map(tech => 
                `<span class="tech-tag">${escapeHtml(tech)}</span>`
            ).join('')
            : '';

        const featuredBadge = project.featured ? '<div class="featured-badge"> Featured</div>' : '';
        
        const language = project.primary_language || project.language || '';
        const languageColor = this.getLanguageColor(language);
        
        return `
            <div class="project-card glass-card" data-id="${escapeHtml(project.id)}" style="animation-delay: ${index * 0.1}s">
                ${featuredBadge}
                <div class="project-header">
                    <div class="project-title-container">
                        <h3 class="project-title">${escapeHtml(project.title || project.name)}</h3>
                        ${language ? `<span class="project-language" style="background: ${languageColor}">${escapeHtml(language)}</span>` : ''}
                    </div>
                    <div class="project-stats">
                        ${project.stars !== undefined ? `<span class="stat"> ${project.stars}</span>` : ''}
                        ${project.forks !== undefined ? `<span class="stat"> ${project.forks}</span>` : ''}
                    </div>
                </div>
                
                <p class="project-description">
                    ${escapeHtml(project.description || 'No description available')}
                </p>
                
                ${technologies ? `<div class="project-technologies">${technologies}</div>` : ''}
                
                <div class="project-meta">
                    <span class="project-status status-${escapeHtml(project.status || 'active')}">${escapeHtml(project.status || 'Active')}</span>
                    <span class="project-date">${escapeHtml(this.formatDate(project.updated_at || project.created_at))}</span>
                </div>
                
                <div class="project-actions">
                    ${project.github_url ? `<a href="${escapeHtml(project.github_url)}" target="_blank" class="btn btn-small btn-secondary">GitHub</a>` : ''}
                    ${project.live_url ? `<a href="${escapeHtml(project.live_url)}" target="_blank" class="btn btn-small">Live Demo</a>` : ''}
                    ${project.html_url ? `<a href="${escapeHtml(project.html_url)}" target="_blank" class="btn btn-small">View</a>` : ''}
                </div>
            </div>
        `;
    }

    enhanceProjectCards() {
        const cards = document.querySelectorAll('.project-card');
        
        cards.forEach((card) => {
            // Add animation class
            card.classList.add('animate-in');
            
            // Add hover effects
            card.addEventListener('mouseenter', () => {
                card.classList.add('hover');
            });
            
            card.addEventListener('mouseleave', () => {
                card.classList.remove('hover');
            });

            // Add click handler for project details
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking on a link
                if (!e.target.closest('a')) {
                    this.showProjectDetails(card.dataset.id);
                }
            });
        });
    }

    renderPagination() {
        const pagination = document.getElementById('pagination');
        
        if (this.totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let paginationHTML = '<div class="pagination-controls">';

        // Previous button
        paginationHTML += `
            <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} 
                    onclick="projectsPage.goToPage(${this.currentPage - 1})">
                ← Previous
            </button>
        `;

        // Page numbers with ellipsis
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        // First page and ellipsis
        if (startPage > 1) {
            paginationHTML += `<button class="pagination-btn" onclick="projectsPage.goToPage(1)">1</button>`;
            if (startPage > 2) {
                paginationHTML += `<span class="pagination-ellipsis">...</span>`;
            }
        }

        // Visible page numbers
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}" 
                        onclick="projectsPage.goToPage(${i})">
                    ${i}
                </button>
            `;
        }

        // Last page and ellipsis
        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                paginationHTML += `<span class="pagination-ellipsis">...</span>`;
            }
            paginationHTML += `<button class="pagination-btn" onclick="projectsPage.goToPage(${this.totalPages})">${this.totalPages}</button>`;
        }

        // Next button
        paginationHTML += `
            <button class="pagination-btn" ${this.currentPage === this.totalPages ? 'disabled' : ''} 
                    onclick="projectsPage.goToPage(${this.currentPage + 1})">
                Next →
            </button>
        `;

        paginationHTML += '</div>';

        // Project count info
        paginationHTML += `
            <div class="pagination-info">
                <span class="neon-text">
                    Showing ${Math.min((this.currentPage - 1) * this.pageSize + 1, this.totalProjects)}-${Math.min(this.currentPage * this.pageSize, this.totalProjects)} of ${this.totalProjects} projects
                </span>
            </div>
        `;

        pagination.innerHTML = paginationHTML;
    }

    goToPage(page) {
        if (page < 1 || page > this.totalPages || page === this.currentPage) {
            return;
        }
        
        this.currentPage = page;
        this.loadProjects();
        
        // Scroll to top of projects grid
        const grid = document.getElementById('allProjectsGrid');
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    resetFilters() {
        // Reset filter values
        const languageFilter = document.getElementById('languageFilter');
        const sortFilter = document.getElementById('sortFilter');
        const searchInput = document.getElementById('searchInput');

        if (languageFilter) languageFilter.value = '';
        if (sortFilter) sortFilter.value = 'stars';
        if (searchInput) searchInput.value = '';

        this.filters = {
            language: '',
            sort: 'stars',
            search: ''
        };
        
        this.currentPage = 1;
        this.loadProjects();
    }

    showProjectDetails(projectId) {
        const project = this.projects.find(p => p.id == projectId);
        if (!project) return;

        // Create modal content
        const modalHTML = `
            <div class="project-modal" id="projectModal">
                <div class="modal-backdrop" onclick="projectsPage.closeProjectDetails()"></div>
                <div class="modal-content glass-card">
                    <div class="modal-header">
                        <h2 class="neon-text">${project.title || project.name}</h2>
                        <button class="modal-close" onclick="projectsPage.closeProjectDetails()">×</button>
                    </div>
                    <div class="modal-body">
                        ${project.description ? `<p class="project-description">${project.description}</p>` : ''}
                        
                        ${project.technologies && project.technologies.length > 0 ? `
                            <div class="project-technologies">
                                <h4>Technologies:</h4>
                                ${project.technologies.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
                            </div>
                        ` : ''}
                        
                        <div class="project-meta-details">
                            <div class="meta-item">
                                <strong>Status:</strong> <span class="project-status status-${project.status || 'active'}">${project.status || 'Active'}</span>
                            </div>
                            <div class="meta-item">
                                <strong>Created:</strong> ${this.formatDate(project.created_at)}
                            </div>
                            ${project.updated_at ? `
                                <div class="meta-item">
                                    <strong>Last Updated:</strong> ${this.formatDate(project.updated_at)}
                                </div>
                            ` : ''}
                            ${project.stars !== undefined ? `
                                <div class="meta-item">
                                    <strong>Stars:</strong>  ${project.stars}
                                </div>
                            ` : ''}
                            ${project.forks !== undefined ? `
                                <div class="meta-item">
                                    <strong>Forks:</strong>  ${project.forks}
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="project-links-full">
                            ${project.github_url ? `<a href="${project.github_url}" target="_blank" class="btn">View on GitHub</a>` : ''}
                            ${project.live_url ? `<a href="${project.live_url}" target="_blank" class="btn">Live Demo</a>` : ''}
                            ${project.html_url ? `<a href="${project.html_url}" target="_blank" class="btn">View Repository</a>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add animation
        setTimeout(() => {
            document.getElementById('projectModal').classList.add('active');
        }, 10);
    }

    closeProjectDetails() {
        const modal = document.getElementById('projectModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    }

    getLanguageColor(language) {
        const colors = {
            'JavaScript': '#f1e05a',
            'TypeScript': '#2b7489',
            'Python': '#3572A5',
            'Go': '#00ADD8',
            'Rust': '#dea584',
            'HTML': '#e34c26',
            'CSS': '#563d7c',
            'Java': '#b07219',
            'C++': '#f34b7d',
            'C#': '#239120',
            'PHP': '#4F5D95',
            'Ruby': '#701516',
            'Swift': '#ffac45',
            'Kotlin': '#F18E33',
            'Scala': '#c22d40',
            'Shell': '#89e051',
            'Dockerfile': '#384d54',
            'Vue': '#41b883',
            'React': '#61dafb'
        };
        return colors[language] || '#666';
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }
}

// Initialize projects page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize on projects page
    if (window.location.pathname.includes('projects.html')) {
        window.projectsPage = new ProjectsPage();
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectsPage;
}