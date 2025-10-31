// Performance monitoring and optimization utilities
export class PerformanceMonitor {
    constructor() {
        this.metrics = {};
        this.observers = [];
    }

    // Initialize performance monitoring
    init() {
        this.measurePageLoad();
        this.measureResourceTiming();
        this.measureUserInteractions();
        this.setupPerformanceObserver();
    }

    // Measure page load performance
    measurePageLoad() {
        if ('performance' in window) {
            window.addEventListener('load', () => {
                setTimeout(() => {
                    const navigation = performance.getEntriesByType('navigation')[0];
                    this.metrics.pageLoad = {
                        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
                        totalTime: navigation.loadEventEnd - navigation.fetchStart,
                        domInteractive: navigation.domInteractive - navigation.fetchStart
                    };
                    
                    console.log(' Page Load Metrics:', this.metrics.pageLoad);
                }, 0);
            });
        }
    }

    // Measure resource loading performance
    measureResourceTiming() {
        if ('PerformanceObserver' in window) {
            const resourceObserver = new PerformanceObserver((list) => {
                const resources = list.getEntries();
                const jsResources = resources.filter(r => r.name.includes('.js'));
                
                this.metrics.jsResources = jsResources.map(resource => ({
                    name: resource.name.split('/').pop(),
                    size: resource.transferSize,
                    duration: resource.duration,
                    cached: resource.transferSize === 0
                }));
                
                const totalJSSize = jsResources.reduce((total, r) => total + (r.transferSize || 0), 0);
                console.log(` Total JS bundle size: ${(totalJSSize / 1024).toFixed(2)} KB`);
            });
            
            resourceObserver.observe({ entryTypes: ['resource'] });
            this.observers.push(resourceObserver);
        }
    }

    // Measure user interaction performance
    measureUserInteractions() {
        // Measure First Input Delay (FID)
        if ('PerformanceObserver' in window) {
            const fidObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    if (entry.name === 'first-input') {
                        this.metrics.firstInputDelay = entry.processingStart - entry.startTime;
                        console.log(` First Input Delay: ${this.metrics.firstInputDelay.toFixed(2)}ms`);
                    }
                });
            });
            
            fidObserver.observe({ entryTypes: ['first-input'] });
            this.observers.push(fidObserver);
        }
    }

    // Setup performance observer for custom metrics
    setupPerformanceObserver() {
        if ('PerformanceObserver' in window) {
            const perfObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'measure') {
                        console.log(`⏱️ ${entry.name}: ${entry.duration.toFixed(2)}ms`);
                        
                        // Store custom metrics
                        if (!this.metrics.custom) this.metrics.custom = {};
                        this.metrics.custom[entry.name] = entry.duration;
                    }
                }
            });
            
            perfObserver.observe({ entryTypes: ['measure'] });
            this.observers.push(perfObserver);
        }
    }

    // Measure Core Web Vitals
    measureCoreWebVitals() {
        // Largest Contentful Paint (LCP)
        if ('PerformanceObserver' in window) {
            const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                this.metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
                console.log(` Largest Contentful Paint: ${this.metrics.lcp.toFixed(2)}ms`);
            });
            
            lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
            this.observers.push(lcpObserver);
        }

        // Cumulative Layout Shift (CLS)
        if ('PerformanceObserver' in window) {
            let clsValue = 0;
            const clsObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                    }
                }
                this.metrics.cls = clsValue;
                console.log(` Cumulative Layout Shift: ${clsValue.toFixed(4)}`);
            });
            
            clsObserver.observe({ entryTypes: ['layout-shift'] });
            this.observers.push(clsObserver);
        }
    }

    // Get performance report
    getReport() {
        return {
            ...this.metrics,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            connection: navigator.connection ? {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink
            } : null
        };
    }

    // Log performance summary
    logSummary() {
        console.log(' Performance Summary:', this.getReport());
        
        // Bundle size comparison
        if (this.metrics.jsResources) {
            const totalSize = this.metrics.jsResources.reduce((total, r) => total + (r.size || 0), 0);
            const cachedSize = this.metrics.jsResources.filter(r => r.cached).reduce((total, r) => total + (r.size || 0), 0);
            
            console.log(` Bundle Analysis:`);
            console.log(`  Total JS Size: ${(totalSize / 1024).toFixed(2)} KB`);
            console.log(`  Cached Size: ${(cachedSize / 1024).toFixed(2)} KB`);
            console.log(`  Network Transfer: ${((totalSize - cachedSize) / 1024).toFixed(2)} KB`);
            console.log(`  Cache Hit Ratio: ${((cachedSize / totalSize) * 100).toFixed(1)}%`);
        }
    }

    // Cleanup observers
    cleanup() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
    }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Auto-initialize when imported
performanceMonitor.init();
performanceMonitor.measureCoreWebVitals();

// Log performance summary after page load
window.addEventListener('load', () => {
    setTimeout(() => {
        performanceMonitor.logSummary();
    }, 3000);
});