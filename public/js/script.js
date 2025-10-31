// ===================================
// MAIN JAVASCRIPT - PORTFOLIO WEBSITE
// ===================================

// Global Variables
let currentBackgroundIndex = 0;
let typingTimeout;
let starfieldInterval;

// DOM Elements
const pageLoader = document.getElementById('pageLoader');
const backgroundContainer = document.getElementById('backgroundContainer');
const starfield = document.getElementById('starfield');
const typingText = document.getElementById('typingText');
const navMenu = document.getElementById('navMenu');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');

// Configuration
const TITLES = [
    'Software Engineer',
    'Full Stack Developer',
    'Creative Coder',
    'Space Enthusiast',
    'Retro Modernist'
];

const BACKGROUND_IMAGES = [
    '/assets/images/weic2208a.jpg',
    '/assets/images/weic2301a.jpg',
    '/assets/images/weic2425a.jpg',
    '/assets/images/weic2513a.jpg'
];

// Initialize on DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Main Initialization Function
async function initializeApp() {
    try {
        console.log('🚀 Initializing Portfolio App...');
        
        // Initialize core systems
        initBackgroundSystem();
        initStarfield();
        initTypingAnimation();
        initNavigation();
        initCopyButtons();
        initScrollEffects();
        
        // Load dynamic content
        await loadProjects();
        await loadGitHubRepos();
        
        // Hide page loader after initialization
        setTimeout(() => {
            hidePageLoader();
        }, 2000);
        
        console.log('✅ Portfolio App Initialized Successfully');
        
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        showError('Failed to load portfolio. Please refresh the page.');
    }
}

// Page Loader Management
function hidePageLoader() {
    if (pageLoader) {
        pageLoader.classList.add('fade-out');
        setTimeout(() => {
            pageLoader.style.display = 'none';
        }, 1000);
    }
}

// Background System
function initBackgroundSystem() {
    if (!backgroundContainer) return;
    
    const images = backgroundContainer.querySelectorAll('.background-image');
    if (images.length === 0) return;
    
    // Set first image as active
    images[0].classList.add('active');
    
    // Start cycling backgrounds
    setInterval(cycleBackground, 8000);
    
    console.log('🌌 Background system initialized');
}

function cycleBackground() {
    const images = backgroundContainer.querySelectorAll('.background-image');
    if (images.length === 0) return;
    
    // Remove active class from current image
    images[currentBackgroundIndex].classList.remove('active');
    
    // Move to next image
    currentBackgroundIndex = (currentBackgroundIndex + 1) % images.length;
    
    // Add active class to next image
    images[currentBackgroundIndex].classList.add('active');
    
    console.log(`🖼️ Background changed to image ${currentBackgroundIndex + 1}`);
}

// Starfield Effect
function initStarfield() {
    if (!starfield) return;
    
    createStars();
    
    // Animate stars
    starfieldInterval = setInterval(() => {
        animateStars();
    }, 50);
    
    console.log('⭐ Starfield initialized');
}

function createStars() {
    const starCount = 100;
    
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.width = Math.random() * 3 + 'px';
        star.style.height = star.style.width;
        star.style.animationDelay = Math.random() * 3 + 's';
        star.style.animationDuration = (Math.random() * 3 + 2) + 's';
        
        starfield.appendChild(star);
    }
}

function animateStars() {
    const stars = starfield.querySelectorAll('.star');
    stars.forEach(star => {
        const currentTop = parseFloat(star.style.top);
        const newTop = currentTop + 0.1;
        
        if (newTop > 100) {
            star.style.top = '-5px';
            star.style.left = Math.random() * 100 + '%';
        } else {
            star.style.top = newTop + '%';
        }
    });
}

// Typing Animation
function initTypingAnimation() {
    if (!typingText) return;
    
    let titleIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    
    function typeTitle() {
        const currentTitle = TITLES[titleIndex];
        
        if (isDeleting) {
            typingText.textContent = currentTitle.substring(0, charIndex - 1);
            charIndex--;
        } else {
            typingText.textContent = currentTitle.substring(0, charIndex + 1);
            charIndex++;
        }
        
        let typeSpeed = isDeleting ? 50 : 100;
        
        if (!isDeleting && charIndex === currentTitle.length) {
            typeSpeed = 2000; // Pause at end
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            titleIndex = (titleIndex + 1) % TITLES.length;
            typeSpeed = 500; // Pause before new title
        }
        
        typingTimeout = setTimeout(typeTitle, typeSpeed);
    }
    
    typeTitle();
    console.log('⌨️ Typing animation initialized');
}

// Navigation System
function initNavigation() {
    // Mobile menu toggle
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    }
    
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', handleNavLinkClick);
    });
    
    // Update active navigation on scroll
    window.addEventListener('scroll', highlightActiveSection);
    
    console.log('🧭 Navigation system initialized');
}

function toggleMobileMenu() {
    navMenu.classList.toggle('active');
    
    // Animate hamburger menu
    const spans = mobileMenuToggle.querySelectorAll('span');
    spans.forEach((span, index) => {
        if (navMenu.classList.contains('active')) {
            if (index === 0) span.style.transform = 'rotate(45deg) translateY(8px)';
            if (index === 1) span.style.opacity = '0';
            if (index === 2) span.style.transform = 'rotate(-45deg) translateY(-8px)';
        } else {
            span.style.transform = '';
            span.style.opacity = '';
        }
    });
}

function handleNavLinkClick(e) {
    e.preventDefault();
    const targetId = e.target.getAttribute('href').substring(1);
    const targetSection = document.getElementById(targetId);
    
    if (targetSection) {
        targetSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
        
        // Close mobile menu if open
        if (navMenu.classList.contains('active')) {
            toggleMobileMenu();
        }
    }
}

function highlightActiveSection() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    
    let currentSection = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        const sectionHeight = section.offsetHeight;
        
        if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
            currentSection = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentSection}`) {
            link.classList.add('active');
        }
    });
}

// Copy Buttons
function initCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-button');
    
    copyButtons.forEach(button => {
        button.addEventListener('click', handleCopyClick);
    });
    
    console.log('📋 Copy buttons initialized');
}

async function handleCopyClick(e) {
    const button = e.target;
    const targetId = button.getAttribute('data-copy');
    const targetElement = document.getElementById(targetId);
    
    if (!targetElement) return;
    
    const textToCopy = targetElement.textContent;
    
    try {
        await navigator.clipboard.writeText(textToCopy);
        
        // Show success state
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
        
        console.log(`📋 Copied to clipboard: ${textToCopy}`);
        
    } catch (error) {
        console.error('❌ Failed to copy text:', error);
        showError('Failed to copy text to clipboard');
    }
}

// Scroll Effects
function initScrollEffects() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(handleIntersection, observerOptions);
    
    // Observe all sections and cards
    const elementsToObserve = document.querySelectorAll('.section, .project-card, .contact-item');
    elementsToObserve.forEach(element => {
        observer.observe(element);
    });
    
    console.log('🎬 Scroll effects initialized');
}

function handleIntersection(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-fadeInUp');
        }
    });
}

// API Functions
async function loadProjects() {
    try {
        const response = await fetch('/api/projects?featured=true&limit=3');
        if (!response.ok) throw new Error('Failed to fetch projects');
        
        const data = await response.json();
        displayProjects(data.projects);
        
        console.log(`📁 Loaded ${data.projects.length} featured projects`);
        
    } catch (error) {
        console.error('❌ Error loading projects:', error);
        displayProjectsError();
    }
}

function displayProjects(projects) {
    const projectsGrid = document.getElementById('projectsGrid');
    if (!projectsGrid) return;
    
    if (projects.length === 0) {
        projectsGrid.innerHTML = '<p class="text-center">No projects found.</p>';
        return;
    }
    
    projectsGrid.innerHTML = projects.map(project => `
        <div class="project-card">
            <h3 class="project-title">${project.title}</h3>
            <p class="project-description">${project.description || 'No description available.'}</p>
            <div class="project-technologies">
                ${project.technologies.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
            </div>
            <div class="project-links">
                ${project.github_url ? `<a href="${project.github_url}" target="_blank" class="project-link">GitHub</a>` : ''}
                ${project.live_url ? `<a href="${project.live_url}" target="_blank" class="project-link">Live Demo</a>` : ''}
            </div>
        </div>
    `).join('');
}

function displayProjectsError() {
    const projectsGrid = document.getElementById('projectsGrid');
    if (projectsGrid) {
        projectsGrid.innerHTML = '<p class="text-center">Failed to load projects. Please try again later.</p>';
    }
}

async function loadGitHubRepos() {
    try {
        const response = await fetch('/api/github/repos?limit=6');
        if (!response.ok) throw new Error('Failed to fetch GitHub repos');
        
        const data = await response.json();
        displayGitHubRepos(data.repositories);
        
        console.log(`🐙 Loaded ${data.repositories.length} GitHub repositories`);
        
    } catch (error) {
        console.error('❌ Error loading GitHub repos:', error);
        displayGitHubError();
    }
}

function displayGitHubRepos(repos) {
    const githubContainer = document.getElementById('githubContainer');
    if (!githubContainer) return;
    
    if (repos.length === 0) {
        githubContainer.innerHTML = '<p class="text-center">No repositories found.</p>';
        return;
    }
    
    githubContainer.innerHTML = `
        <div class="projects-grid">
            ${repos.map(repo => `
                <div class="project-card">
                    <h3 class="project-title">${repo.name}</h3>
                    <p class="project-description">${repo.description || 'No description available.'}</p>
                    <div class="project-technologies">
                        ${repo.language ? `<span class="tech-tag">${repo.language}</span>` : ''}
                        <span class="tech-tag">⭐ ${repo.stars}</span>
                        <span class="tech-tag">🍴 ${repo.forks}</span>
                    </div>
                    <div class="project-links">
                        <a href="${repo.html_url}" target="_blank" class="project-link">View on GitHub</a>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function displayGitHubError() {
    const githubContainer = document.getElementById('githubContainer');
    if (githubContainer) {
        githubContainer.innerHTML = '<p class="text-center">Failed to load GitHub repositories. Please try again later.</p>';
    }
}

// GitHub Sync Button
const syncGithubBtn = document.getElementById('syncGithub');
if (syncGithubBtn) {
    syncGithubBtn.addEventListener('click', async () => {
        try {
            syncGithubBtn.textContent = 'Syncing...';
            syncGithubBtn.disabled = true;
            
            const response = await fetch('/api/github/sync', { method: 'POST' });
            if (!response.ok) throw new Error('Failed to sync GitHub');
            
            const data = await response.json();
            console.log('✅ GitHub sync successful:', data);
            
            // Reload repositories
            await loadGitHubRepos();
            
            syncGithubBtn.textContent = 'Sync Complete!';
            setTimeout(() => {
                syncGithubBtn.textContent = 'Sync GitHub';
                syncGithubBtn.disabled = false;
            }, 2000);
            
        } catch (error) {
            console.error('❌ GitHub sync error:', error);
            syncGithubBtn.textContent = 'Sync Failed';
            setTimeout(() => {
                syncGithubBtn.textContent = 'Sync GitHub';
                syncGithubBtn.disabled = false;
            }, 2000);
        }
    });
}

// Utility Functions
function showError(message) {
    // Create error toast
    const errorToast = document.createElement('div');
    errorToast.className = 'error-toast';
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
        animation: slideInRight 0.3s ease-out;
    `;
    
    document.body.appendChild(errorToast);
    
    setTimeout(() => {
        errorToast.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(errorToast);
        }, 300);
    }, 3000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (typingTimeout) clearTimeout(typingTimeout);
    if (starfieldInterval) clearInterval(starfieldInterval);
});

// Error handling
window.addEventListener('error', (e) => {
    console.error('❌ JavaScript error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('❌ Unhandled promise rejection:', e.reason);
});

console.log('🌟 Portfolio script loaded successfully');