// General utility functions
import { applyStyleWithNonce } from './security.js';

export function initializeWithErrorBoundary(name, initFunction) {
    return new Promise(async (resolve) => {
        try {
            await initFunction();
            console.log(` ${name} initialized successfully`);
            resolve(true);
        } catch (error) {
            console.error(` Failed to initialize ${name}:`, error);
            resolve(false);
        }
    });
}

export function hidePageLoader() {
    const pageLoader = document.getElementById('pageLoader');
    if (pageLoader) {
        pageLoader.classList.add('fade-out');
        setTimeout(() => {
            applyStyleWithNonce(pageLoader, { display: 'none' });
        }, 1000);
    }
}

export function openModal(modal, announceToScreenReader) {
    if (!modal) return;
    
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('active');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    
    // Store the element that opened the modal
    const triggerElement = document.activeElement;
    modal.dataset.triggerElement = triggerElement ? triggerElement.outerHTML : '';
    
    const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    if (firstFocusable) {
        firstFocusable.focus();
    }
    
    // Enhanced focus trap with cleanup
    const trapFocus = (e) => {
        if (e.key === 'Tab') {
            if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable.focus();
                }
            } else {
                if (document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable.focus();
                }
            }
        } else if (e.key === 'Escape') {
            closeModal(modal, announceToScreenReader);
        }
    };
    
    modal.addEventListener('keydown', trapFocus);
    modal.dataset.focusTrapHandler = 'true';
    
    applyStyleWithNonce(document.body, { overflow: 'hidden' });
    
    if (announceToScreenReader) {
        announceToScreenReader('Modal opened');
    }
}

export function closeModal(modal, announceToScreenReader) {
    if (!modal) return;
    
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('active');
    modal.removeAttribute('role');
    modal.removeAttribute('aria-modal');
    
    // Remove focus trap event listener
    if (modal.dataset.focusTrapHandler === 'true') {
        modal.removeEventListener('keydown', modal._focusTrapHandler);
        delete modal.dataset.focusTrapHandler;
        delete modal._focusTrapHandler;
    }
    
    applyStyleWithNonce(document.body, { overflow: '' });
    
    // Restore focus to the element that opened the modal
    const triggerElement = document.querySelector('[data-modal-target]');
    if (triggerElement) {
        triggerElement.focus();
    } else if (modal.dataset.triggerElement) {
        // Try to restore focus to the stored trigger element
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = modal.dataset.triggerElement;
        const tempElement = tempDiv.firstChild;
        if (tempElement && tempElement.id) {
            const originalElement = document.getElementById(tempElement.id);
            if (originalElement) {
                originalElement.focus();
            }
        }
    }
    
    if (announceToScreenReader) {
        announceToScreenReader('Modal closed');
    }
}

// Screen reader announcements using live regions
export function announceToScreenReader(message, isAlert = false) {
    const regionId = isAlert ? 'aria-alert-region' : 'aria-live-region';
    let region = document.getElementById(regionId);
    
    if (!region) {
        // Fallback to creating temporary announcement
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            if (document.body.contains(announcement)) {
                document.body.removeChild(announcement);
            }
        }, 1000);
    } else {
        // Use existing live region
        region.textContent = message;
        
        // Clear after announcement
        setTimeout(() => {
            region.textContent = '';
        }, 1000);
    }
}