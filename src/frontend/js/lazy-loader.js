// ===================================
// LAZY LOADING MODULE
// ===================================

// Import security utilities
import { applyStyleWithNonce } from './utils/security.js';

class LazyLoader {
    constructor() {
        this.imageObserver = null;
        this.scriptObserver = null;
        this.loadedImages = new Set();
        this.loadedScripts = new Set();
        this.init();
    }

    init() {
        this.setupImageLazyLoading();
        this.setupScriptLazyLoading();
        this.setupIntersectionObserverPolyfill();
    }

    // Image Lazy Loading with WebP support
    setupImageLazyLoading() {
        if ('IntersectionObserver' in window) {
            this.imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        if (entry.target.tagName === 'PICTURE') {
                            this.loadPicture(entry.target);
                        } else {
                            this.loadImage(entry.target);
                        }
                        this.imageObserver.unobserve(entry.target);
                    }
                });
            }, {
                rootMargin: '50px 0px',
                threshold: 0.01
            });
        } else {
            // Fallback for older browsers
            this.loadAllImages();
        }

        // Observe all lazy images and pictures
        document.querySelectorAll('img[data-src], picture[data-src]').forEach(element => {
            if (this.imageObserver) {
                this.imageObserver.observe(element);
            }
        });
    }

    async loadImage(img) {
        const src = img.dataset.src;
        if (!src || this.loadedImages.has(src)) return;

        try {
            // Add loading state
            img.classList.add('loading');
            
            // Check WebP support
            const supportsWebP = await this.checkWebPSupport();
            
            // Create WebP version if supported
            const webpSrc = supportsWebP ? this.getWebPUrl(src) : src;
            
            // Preload the image
            const tempImg = new Image();
            
            return new Promise((resolve, reject) => {
                tempImg.onload = () => {
                    img.src = webpSrc;
                    img.classList.remove('lazy', 'loading');
                    img.classList.add('loaded');
                    this.loadedImages.add(src);
                    
                    // Add fade-in effect
                    applyStyleWithNonce(img, { opacity: '0' });
                    setTimeout(() => {
                        applyStyleWithNonce(img, {
                            transition: 'opacity 0.5s ease-in-out',
                            opacity: '1'
                        });
                    }, 10);
                    
                    resolve();
                };
                
                tempImg.onerror = () => {
                    // Fallback to original if WebP fails
                    if (webpSrc !== src) {
                        tempImg.src = src;
                    } else {
                        img.classList.remove('loading');
                        reject(new Error('Failed to load image'));
                    }
                };
                
                tempImg.src = webpSrc;
            });
        } catch (error) {
            console.warn('Failed to load image:', src, error);
            img.src = src; // Fallback to original
            img.classList.remove('lazy', 'loading');
        }
    }

    async loadPicture(pictureElement) {
        const img = pictureElement.querySelector('img');
        const sources = pictureElement.querySelectorAll('source');
        
        if (!img) return;

        try {
            // Add loading state to picture element
            pictureElement.classList.add('loading');
            
            // Check WebP support
            const supportsWebP = await this.checkWebPSupport();
            
            // Update source elements with data-src attributes
            sources.forEach(source => {
                const dataSrcset = source.dataset.srcset;
                if (dataSrcset) {
                    if (supportsWebP) {
                        source.srcset = dataSrcset;
                    } else {
                        // Fallback to non-WebP versions
                        source.srcset = dataSrcset.replace(/\.webp/g, '.jpg');
                    }
                }
            });
            
            // Load the image
            const imgSrc = img.dataset.src;
            if (imgSrc) {
                await this.loadImage(img);
            }
            
            pictureElement.classList.remove('lazy', 'loading');
            pictureElement.classList.add('loaded');
            
        } catch (error) {
            console.warn('Failed to load picture:', error);
            pictureElement.classList.remove('lazy', 'loading');
        }
    }

    checkWebPSupport() {
        return new Promise(resolve => {
            const webP = new Image();
            webP.onload = webP.onerror = () => {
                resolve(webP.height === 2);
            };
            webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
        });
    }

    getWebPUrl(originalUrl) {
        // Convert to WebP format
        if (originalUrl.match(/\.(jpg|jpeg|png)$/i)) {
            return originalUrl.replace(/\.(jpg|jpeg|png)$/i, '.webp');
        }
        return originalUrl;
    }

    loadAllImages() {
        document.querySelectorAll('img[data-src]').forEach(img => {
            this.loadImage(img);
        });
        document.querySelectorAll('picture[data-src]').forEach(picture => {
            this.loadPicture(picture);
        });
    }

    // Script Lazy Loading
    setupScriptLazyLoading() {
        if ('IntersectionObserver' in window) {
            this.scriptObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadScript(entry.target);
                        this.scriptObserver.unobserve(entry.target);
                    }
                });
            }, {
                rootMargin: '100px 0px',
                threshold: 0.01
            });
        }

        // Observe lazy scripts
        document.querySelectorAll('script[data-src]').forEach(script => {
            if (this.scriptObserver) {
                this.scriptObserver.observe(script);
            } else {
                this.loadScript(script);
            }
        });
    }

    loadScript(scriptElement) {
        const src = scriptElement.dataset.src;
        if (!src || this.loadedScripts.has(src)) return;

        const script = document.createElement('script');
        script.src = src;
        
        // Copy attributes
        Array.from(scriptElement.attributes).forEach(attr => {
            if (attr.name !== 'data-src') {
                script.setAttribute(attr.name, attr.value);
            }
        });

        script.onload = () => {
            this.loadedScripts.add(src);
            scriptElement.remove();
        };

        script.onerror = () => {
            console.warn('Failed to load script:', src);
            scriptElement.remove();
        };

        document.head.appendChild(script);
    }

    // Responsive Images with srcset
    createResponsiveImage(img) {
        const src = img.dataset.src || img.src;
        if (!src) return;

        // Create srcset for different screen sizes
        const sizes = [
            { width: 320, suffix: '-small' },
            { width: 768, suffix: '-medium' },
            { width: 1200, suffix: '-large' }
        ];

        const srcset = sizes.map(size => {
            const sizeUrl = src.replace(/(\.[^.]+)$/, `${size.suffix}$1`);
            return `${sizeUrl} ${size.width}w`;
        }).join(', ');

        img.setAttribute('srcset', srcset);
        img.setAttribute('sizes', '(max-width: 768px) 320px, (max-width: 1200px) 768px, 1200px');
    }

    // Setup Intersection Observer polyfill for older browsers
    setupIntersectionObserverPolyfill() {
        if (!('IntersectionObserver' in window)) {
            // Simple polyfill for basic lazy loading
            const lazyImages = document.querySelectorAll('img[data-src]');
            const lazyScripts = document.querySelectorAll('script[data-src]');
            
            const loadOnScroll = () => {
                lazyImages.forEach(img => {
                    if (this.isElementInViewport(img)) {
                        this.loadImage(img);
                    }
                });
                
                lazyScripts.forEach(script => {
                    if (this.isElementInViewport(script)) {
                        this.loadScript(script);
                    }
                });
            };

            window.addEventListener('scroll', loadOnScroll);
            window.addEventListener('resize', loadOnScroll);
            loadOnScroll(); // Initial check
        }
    }

    isElementInViewport(el) {
        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // Preload critical resources
    preloadCriticalResources() {
        const criticalResources = [
            '/style.css',
            '/js/main.js',
            '/js/modules/core.js'
        ];

        criticalResources.forEach(resource => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = resource;
            
            if (resource.endsWith('.css')) {
                link.as = 'style';
            } else if (resource.endsWith('.js')) {
                link.as = 'script';
            }
            
            document.head.appendChild(link);
        });
    }

    // Progressive image loading with blur effect
    setupProgressiveImageLoading() {
        document.querySelectorAll('img[data-blur]').forEach(img => {
            const blurUrl = img.dataset.blur;
            const fullUrl = img.dataset.src || img.src;

            // Load blur version first
            const blurImg = new Image();
            blurImg.onload = () => {
                img.src = blurUrl;
                applyStyleWithNonce(img, {
                    filter: 'blur(10px)',
                    transition: 'filter 0.3s ease-in-out'
                });
                
                // Then load full version
                const fullImg = new Image();
                fullImg.onload = () => {
                    img.src = fullUrl;
                    applyStyleWithNonce(img, { filter: 'blur(0)' });
                };
                fullImg.src = fullUrl;
            };
            blurImg.src = blurUrl;
        });
    }
}

// Initialize lazy loader
let lazyLoader;

document.addEventListener('DOMContentLoaded', () => {
    lazyLoader = new LazyLoader();
    
    // Preload critical resources
    lazyLoader.preloadCriticalResources();
    
    // Setup progressive image loading
    lazyLoader.setupProgressiveImageLoading();
});

// Export for use in other modules
window.lazyLoader = lazyLoader;