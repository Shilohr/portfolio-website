// Lazy loading utility for dynamic module imports
export class LazyLoader {
    constructor() {
        this.loadedModules = new Set();
        this.loadingPromises = new Map();
    }

    async loadModule(modulePath, moduleName) {
        // Return cached module if already loaded
        if (this.loadedModules.has(modulePath)) {
            console.log(`${moduleName} module already loaded`);
            return true;
        }

        // Return existing promise if currently loading
        if (this.loadingPromises.has(modulePath)) {
            return await this.loadingPromises.get(modulePath);
        }

        // Create and store loading promise
        const loadingPromise = this._loadModuleInternal(modulePath, moduleName);
        this.loadingPromises.set(modulePath, loadingPromise);

        try {
            const result = await loadingPromise;
            this.loadedModules.add(modulePath);
            this.loadingPromises.delete(modulePath);
            return result;
        } catch (error) {
            this.loadingPromises.delete(modulePath);
            throw error;
        }
    }

    async _loadModuleInternal(modulePath, moduleName) {
        try {
            console.log(`Loading ${moduleName} module...`);
            performance.mark(`${moduleName}-load-start`);
            
            const module = await import(modulePath);
            
            // Initialize module if it has an initialize function
            if (module.initializeAnimations) {
                await module.initializeAnimations();
            } else if (module.initializeProjects) {
                await module.initializeProjects();
            }
            
            performance.mark(`${moduleName}-load-end`);
            performance.measure(`${moduleName} Load Time`, `${moduleName}-load-start`, `${moduleName}-load-end`);
            
            console.log(` ${moduleName} module loaded successfully`);
            return module;
            
        } catch (error) {
            console.error(` Failed to load ${moduleName} module:`, error);
            return null;
        }
    }

    // Preload modules based on user interaction
    preloadOnHover(element, modulePath, moduleName) {
        let preloadTimeout;
        
        element.addEventListener('mouseenter', () => {
            preloadTimeout = setTimeout(() => {
                this.loadModule(modulePath, moduleName);
            }, 200);
        });
        
        element.addEventListener('mouseleave', () => {
            if (preloadTimeout) {
                clearTimeout(preloadTimeout);
            }
        });
    }

    // Load modules when they enter viewport
    loadOnIntersection(selector, modulePath, moduleName, threshold = 0.1) {
        const element = document.querySelector(selector);
        if (!element) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadModule(modulePath, moduleName);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold });

        observer.observe(element);
    }

    // Get loading statistics
    getStats() {
        return {
            loadedModules: Array.from(this.loadedModules),
            loadingModules: Array.from(this.loadingPromises.keys()),
            totalLoaded: this.loadedModules.size
        };
    }
}

// Global lazy loader instance
export const lazyLoader = new LazyLoader();

// Performance monitoring for module loading
if ('PerformanceObserver' in window) {
    const perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.entryType === 'measure') {
                console.log(`⏱️ ${entry.name}: ${entry.duration.toFixed(2)}ms`);
            }
        }
    });
    
    perfObserver.observe({ entryTypes: ['measure'] });
}