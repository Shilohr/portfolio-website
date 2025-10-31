// Core functionality - essential for initial page load
import { initializeCSRFProtection } from '../utils/security.js';
import { initializeWithErrorBoundary, hidePageLoader, announceToScreenReader, closeModal, openModal } from '../utils/helpers.js';
import { showErrorMessage } from '../utils/security.js';

// Global Variables
let typingTimeout;
let starfieldInterval;
let starfieldAnimationId;
let typingAnimationId;
let backgroundInterval;

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

// Background System
export function initBackgroundSystem() {
    if (!backgroundContainer) return;
    
    const images = backgroundContainer.querySelectorAll('.background-image');
    if (images.length === 0) return;
    
    images[0].classList.add('active');
    initLazyLoading();
    
    // Proper interval management with cleanup
    backgroundInterval = setInterval(cycleBackground, 8000);
    
    // Add beforeunload event listener for cleanup
    window.addEventListener('beforeunload', cleanupBackgroundInterval);
    
    console.log(' Background system initialized (with lazy loading)');
}

function cleanupBackgroundInterval() {
    if (backgroundInterval) {
        clearInterval(backgroundInterval);
        backgroundInterval = null;
        console.log('🧹 Background interval cleaned up');
    }
}

function initLazyLoading() {
    const lazyImages = document.querySelectorAll('.background-image.lazy');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    imageObserver.unobserve(img);
                }
            });
        });
        
        lazyImages.forEach(img => imageObserver.observe(img));
    } else {
        lazyImages.forEach(img => {
            img.src = img.dataset.src;
            img.classList.remove('lazy');
        });
    }
}

let currentBackgroundIndex = 0;
function cycleBackground() {
    const images = backgroundContainer.querySelectorAll('.background-image');
    if (images.length === 0) return;
    
    images[currentBackgroundIndex].classList.remove('active');
    currentBackgroundIndex = (currentBackgroundIndex + 1) % images.length;
    
    const nextImage = images[currentBackgroundIndex];
    if (nextImage.classList.contains('lazy')) {
        nextImage.src = nextImage.dataset.src;
        nextImage.classList.remove('lazy');
    }
    
    nextImage.classList.add('active');
    
    console.log(` Background changed to image ${currentBackgroundIndex + 1}`);
}

// Starfield Effect
export function initStarfield() {
    if (!starfield) return;
    
    createStars();
    
    let lastTime = 0;
    const targetFPS = 30;
    const frameInterval = 1000 / targetFPS;
    
    function animateStars(currentTime) {
        if (currentTime - lastTime >= frameInterval) {
            moveStars();
            lastTime = currentTime;
        }
        starfieldAnimationId = requestAnimationFrame(animateStars);
    }
    
    starfieldAnimationId = requestAnimationFrame(animateStars);
    
    console.log('Starfield initialized (optimized)');
}

function createStars() {
    const starCount = 80;
    
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.dataset.speed = (Math.random() * 0.5 + 0.1).toString();
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.width = Math.random() * 3 + 'px';
        star.style.height = star.style.width;
        star.style.animationDelay = Math.random() * 3 + 's';
        star.style.animationDuration = (Math.random() * 3 + 2) + 's';
        
        starfield.appendChild(star);
    }
}

function moveStars() {
    const stars = starfield.querySelectorAll('.star');
    stars.forEach(star => {
        const speed = parseFloat(star.dataset.speed);
        const currentTop = parseFloat(star.style.top);
        const newTop = currentTop + speed;
        
        if (newTop > 100) {
            star.style.top = '-5px';
            star.style.left = Math.random() * 100 + '%';
        } else {
            star.style.top = newTop + '%';
        }
    });
}

// Typing Animation
export function initTypingAnimation() {
    if (!typingText) return;
    
    let titleIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let lastTypeTime = 0;
    let announcedTitle = '';
    
    function typeTitle(currentTime) {
        if (!lastTypeTime) lastTypeTime = currentTime;
        
        const currentTitle = TITLES[titleIndex];
        const elapsed = currentTime - lastTypeTime;
        
        let typeSpeed = isDeleting ? 50 : 100;
        
        if (!isDeleting && charIndex === currentTitle.length) {
            typeSpeed = 2000;
            isDeleting = true;
            if (currentTitle !== announcedTitle) {
                announceToScreenReader(`Current role: ${currentTitle}`);
                announcedTitle = currentTitle;
            }
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            titleIndex = (titleIndex + 1) % TITLES.length;
            typeSpeed = 500;
        }
        
        if (elapsed >= typeSpeed) {
            if (isDeleting) {
                typingText.textContent = currentTitle.substring(0, charIndex - 1);
                charIndex--;
            } else {
                typingText.textContent = currentTitle.substring(0, charIndex + 1);
                charIndex++;
            }
            
            lastTypeTime = currentTime;
        }
        
        typingAnimationId = requestAnimationFrame(typeTitle);
    }
    
    typingAnimationId = requestAnimationFrame(typeTitle);
    console.log('⌨️ Typing animation initialized (optimized with accessibility)');
}

// Navigation System
export function initNavigation() {
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', toggleMobileMenu);
        mobileMenuToggle.addEventListener('keydown', handleMobileMenuKeydown);
    }
    
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', handleNavLinkClick);
        link.addEventListener('keydown', handleNavLinkKeydown);
    });
    
    window.addEventListener('scroll', highlightActiveSection);
    initKeyboardNavigation();
    
    console.log('🧭 Navigation system initialized');
}

function toggleMobileMenu() {
    const isActive = navMenu.classList.toggle('active');
    
    if (mobileMenuToggle) {
        mobileMenuToggle.setAttribute('aria-expanded', isActive);
    }
    
    const spans = mobileMenuToggle ? mobileMenuToggle.querySelectorAll('span') : [];
    spans.forEach((span, index) => {
        if (isActive) {
            if (index === 0) span.style.transform = 'rotate(45deg) translateY(8px)';
            if (index === 1) span.style.opacity = '0';
            if (index === 2) span.style.transform = 'rotate(-45deg) translateY(-8px)';
        } else {
            span.style.transform = '';
            span.style.opacity = '';
        }
    });
    
    announceToScreenReader(isActive ? 'Menu opened' : 'Menu closed');
    
    if (isActive) {
        const firstNavLink = navMenu.querySelector('.nav-link');
        if (firstNavLink) {
            setTimeout(() => firstNavLink.focus(), 100);
        }
    }
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
        
        setTimeout(() => {
            const targetHeading = targetSection.querySelector('h1, h2, h3');
            if (targetHeading) {
                targetHeading.setAttribute('tabindex', '-1');
                targetHeading.focus();
                targetHeading.removeAttribute('tabindex');
            }
        }, 500);
        
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

function initKeyboardNavigation() {
    // Global keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (navMenu && navMenu.classList.contains('active')) {
                toggleMobileMenu();
                mobileMenuToggle.focus();
            }
            
            const openModal = document.querySelector('.project-modal.active');
            if (openModal) {
                closeModal(openModal, announceToScreenReader);
            }
        }
        
        // Alt + S for skip to main content
        if (e.altKey && e.key === 's') {
            e.preventDefault();
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.scrollIntoView({ behavior: 'smooth' });
                const firstHeading = mainContent.querySelector('h1, h2, h3');
                if (firstHeading) {
                    firstHeading.setAttribute('tabindex', '-1');
                    firstHeading.focus();
                    firstHeading.removeAttribute('tabindex');
                }
            }
        }
        
        // Alt + N for skip to navigation
        if (e.altKey && e.key === 'n') {
            e.preventDefault();
            const navigation = document.getElementById('navigation');
            if (navigation) {
                navigation.scrollIntoView({ behavior: 'smooth' });
                const firstNavLink = navigation.querySelector('.nav-link');
                if (firstNavLink) {
                    firstNavLink.focus();
                }
            }
        }
    });
    
    // Enhanced focus management for interactive elements
    enhanceInteractiveElements();
}

function enhanceInteractiveElements() {
    // Add proper ARIA attributes to interactive elements
    const buttons = document.querySelectorAll('button:not([aria-label])');
    buttons.forEach(button => {
        if (!button.getAttribute('aria-label') && !button.textContent.trim()) {
            button.setAttribute('aria-label', 'Interactive button');
        }
    });
    
    // Add role="button" to clickable elements that need it
    const clickables = document.querySelectorAll('.clickable, [onclick]');
    clickables.forEach(element => {
        if (!element.getAttribute('role')) {
            element.setAttribute('role', 'button');
            element.setAttribute('tabindex', '0');
            element.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    element.click();
                }
            });
        }
    });
    
    // Add live regions for dynamic content
    addLiveRegions();
}

function addLiveRegions() {
    // Create live region for announcements
    if (!document.getElementById('aria-live-region')) {
        const liveRegion = document.createElement('div');
        liveRegion.id = 'aria-live-region';
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className = 'sr-only';
        document.body.appendChild(liveRegion);
    }
    
    // Create live region for alerts
    if (!document.getElementById('aria-alert-region')) {
        const alertRegion = document.createElement('div');
        alertRegion.id = 'aria-alert-region';
        alertRegion.setAttribute('aria-live', 'assertive');
        alertRegion.setAttribute('aria-atomic', 'true');
        alertRegion.className = 'sr-only';
        document.body.appendChild(alertRegion);
    }
}

function handleMobileMenuKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleMobileMenu();
    }
}

function handleNavLinkKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleNavLinkClick(e);
    }
}

// Keyboard detection for accessibility
function detectKeyboardUser() {
    let keyboardUser = false;
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            keyboardUser = true;
            document.body.classList.add('keyboard-user');
        }
    });
    
    document.addEventListener('mousedown', () => {
        keyboardUser = false;
        document.body.classList.remove('keyboard-user');
    });
}

// Main initialization function
export async function initializeCore() {
    try {
        console.log('Initializing Core Portfolio App...');
        
        // Initialize accessibility features first
        detectKeyboardUser();
        
        await initializeWithErrorBoundary('Background System', initBackgroundSystem);
        await initializeWithErrorBoundary('Starfield', initStarfield);
        await initializeWithErrorBoundary('Typing Animation', initTypingAnimation);
        await initializeWithErrorBoundary('Navigation', initNavigation);
        await initializeWithErrorBoundary('CSRF Protection', initializeCSRFProtection);
        
        setTimeout(() => {
            hidePageLoader();
        }, 2000);
        
        console.log('Core Portfolio App Initialized Successfully');
        
    } catch (error) {
        console.error('Failed to initialize core app:', error);
        showErrorMessage('Failed to load portfolio. Please refresh the page.');
        
        setTimeout(() => {
            hidePageLoader();
        }, 3000);
    }
}

// Cleanup
window.addEventListener('beforeunload', () => {
    if (typingTimeout) clearTimeout(typingTimeout);
    if (starfieldInterval) clearInterval(starfieldInterval);
    if (starfieldAnimationId) cancelAnimationFrame(starfieldAnimationId);
    if (typingAnimationId) cancelAnimationFrame(typingAnimationId);
    if (backgroundInterval) clearInterval(backgroundInterval);
});

// All imports are at the top of the file