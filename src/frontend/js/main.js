// Main entry point - handles dynamic imports and lazy loading
import { initializeCore } from './modules/core.js';
import { lazyLoader } from './utils/lazy-loader.js';
import { performanceMonitor } from './modules/performance.js';
import { bundleAnalyzer } from './bundle-analyzer.js';

// Initialize core functionality immediately
document.addEventListener('DOMContentLoaded', async function() {
    performance.mark('app-init-start');
    
    await initializeCore();
    
    performance.mark('core-init-end');
    performance.measure('Core Initialization', 'app-init-start', 'core-init-end');
    
    // Lazy load non-critical modules after initial render
    setTimeout(() => {
        loadNonCriticalModules();
    }, 1000);
    
    // Setup intelligent preloading
    setupIntelligentPreloading();
    
    performance.mark('app-init-end');
    performance.measure('Total App Initialization', 'app-init-start', 'app-init-end');
});

// Load non-critical modules with priority using lazy loader
async function loadNonCriticalModules() {
    // Load animations first (high priority for UX)
    await lazyLoader.loadModule('/js/modules/animations.js', 'Animations');
    
    // Load projects after a small delay (medium priority)
    setTimeout(async () => {
        console.log('Loading projects module...');
        await lazyLoader.loadModule('/js/modules/projects.js', 'Projects');
    }, 500);
    
    // Load any additional low-priority modules
    setTimeout(async () => {
        await loadLowPriorityModules();
    }, 1500);
}

// Load low-priority modules
async function loadLowPriorityModules() {
    // Analytics, tracking, or other non-essential modules can be loaded here
    console.log('Loading low-priority modules...');
    
    // Example: Load analytics if needed
    // await lazyLoader.loadModule('./modules/analytics.js', 'Analytics');
}

// Setup intelligent preloading based on user behavior
function setupIntelligentPreloading() {
    // Preload projects module when hovering over projects section
    const projectsSection = document.querySelector('#projects');
    if (projectsSection) {
        lazyLoader.preloadOnHover(projectsSection, '/js/modules/projects.js', 'Projects');
    }
    
    // Preload animations when user starts scrolling
    let hasScrolled = false;
    window.addEventListener('scroll', () => {
        if (!hasScrolled) {
            hasScrolled = true;
            lazyLoader.loadModule('/js/modules/animations.js', 'Animations');
        }
    }, { once: true });
    
    // Load projects when projects section enters viewport
    lazyLoader.loadOnIntersection('#projects', '/js/modules/projects.js', 'Projects', 0.3);
}

// Error handling for module loading
window.addEventListener('error', (e) => {
    if (e.target && e.target.tagName === 'SCRIPT') {
        console.error('Script loading error:', e.target.src);
    }
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});

// Log loading statistics after page load
window.addEventListener('load', () => {
    setTimeout(() => {
        const stats = lazyLoader.getStats();
        console.log('Module Loading Statistics:', stats);
    }, 3000);
});

console.log('Main entry point loaded with intelligent lazy loading');