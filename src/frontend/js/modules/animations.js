// Animation effects module - loaded after core functionality
import { initializeWithErrorBoundary } from '../utils/helpers.js';
import { showErrorMessage } from '../utils/security.js';
import { announceToScreenReader } from '../utils/helpers.js';

// Scroll Effects
export function initScrollEffects() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(handleIntersection, observerOptions);
    
    const elementsToObserve = document.querySelectorAll('.section, .project-card, .contact-item');
    elementsToObserve.forEach(element => {
        observer.observe(element);
    });
    
    console.log('Scroll effects initialized');
}

function handleIntersection(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-fadeInUp');
        }
    });
}

// Copy Buttons
export function initCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-button');
    
    copyButtons.forEach(button => {
        button.addEventListener('click', handleCopyClick);
        button.addEventListener('keydown', handleCopyKeydown);
    });
    
    console.log(' Copy buttons initialized');
}

async function handleCopyClick(e) {
    const button = e.target;
    const targetId = button.getAttribute('data-copy');
    const targetElement = document.getElementById(targetId);
    
    if (!targetElement) return;
    
    const textToCopy = targetElement.textContent;
    
    try {
        await navigator.clipboard.writeText(textToCopy);
        
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.classList.add('copied');
        button.setAttribute('aria-label', `${originalText} copied to clipboard`);
        
        announceToScreenReader(`${textToCopy} copied to clipboard`);
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
            button.setAttribute('aria-label', originalText);
        }, 2000);
        
        console.log(` Copied to clipboard: ${textToCopy}`);
        
    } catch (error) {
        console.error('Failed to copy text:', error);
        showErrorMessage('Failed to copy text to clipboard');
        announceToScreenReader('Failed to copy text to clipboard');
    }
}

function handleCopyKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCopyClick(e);
    }
}

// Performance-optimized animations
export function initPerformanceAnimations() {
    // Reduce animations on low-end devices
    const isLowEndDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
    
    if (isLowEndDevice) {
        document.body.classList.add('reduce-animations');
        console.log(' Low-end device detected, reducing animations');
    }
    
    // Pause animations when page is not visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            document.body.classList.add('animations-paused');
        } else {
            document.body.classList.remove('animations-paused');
        }
    });
}

// Initialize all animations
export async function initializeAnimations() {
    try {
        await initializeWithErrorBoundary('Scroll Effects', initScrollEffects);
        await initializeWithErrorBoundary('Copy Buttons', initCopyButtons);
        await initializeWithErrorBoundary('Performance Animations', initPerformanceAnimations);
        
        console.log('All animations initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize animations:', error);
    }
}

