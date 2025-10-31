// ===================================
// PERFORMANCE MONITORING MODULE
// ===================================

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            navigation: {},
            resources: [],
            vitals: {},
            errors: []
        };
        this.observers = new Map();
        this.init();
    }

    init() {
        this.measureNavigationTiming();
        this.observeResourceTiming();
        this.measureCoreWebVitals();
        this.trackErrors();
        this.measureFirstContentfulPaint();
    }

    // Navigation Timing API
    measureNavigationTiming() {
        if ('performance' in window && 'getEntriesByType' in performance) {
            const navigationEntries = performance.getEntriesByType('navigation');
            if (navigationEntries.length > 0) {
                const nav = navigationEntries[0];
                this.metrics.navigation = {
                    dns: nav.domainLookupEnd - nav.domainLookupStart,
                    tcp: nav.connectEnd - nav.connectStart,
                    ssl: nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0,
                    ttfb: nav.responseStart - nav.requestStart,
                    download: nav.responseEnd - nav.responseStart,
                    domParse: nav.domContentLoadedEventStart - nav.responseEnd,
                    domReady: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
                    loadComplete: nav.loadEventEnd - nav.loadEventStart,
                    total: nav.loadEventEnd - nav.navigationStart
                };
            }
        }
    }

    // Resource Timing API
    observeResourceTiming() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (entry.entryType === 'resource') {
                        this.metrics.resources.push({
                            name: entry.name,
                            type: this.getResourceType(entry.name),
                            size: entry.transferSize || 0,
                            duration: entry.duration,
                            cached: entry.transferSize === 0 && entry.decodedBodySize > 0
                        });
                    }
                });
            });
            
            observer.observe({ entryTypes: ['resource'] });
            this.observers.set('resource', observer);
        }
    }

    getResourceType(url) {
        if (url.includes('.js')) return 'script';
        if (url.includes('.css')) return 'stylesheet';
        if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) return 'image';
        if (url.includes('/api/')) return 'api';
        return 'other';
    }

    // Core Web Vitals
    measureCoreWebVitals() {
        // Largest Contentful Paint (LCP)
        if ('PerformanceObserver' in window) {
            const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                this.metrics.vitals.lcp = Math.round(lastEntry.startTime);
            });
            
            lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
            this.observers.set('lcp', lcpObserver);
        }

        // First Input Delay (FID)
        if ('PerformanceObserver' in window) {
            const fidObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (entry.entryType === 'first-input') {
                        this.metrics.vitals.fid = Math.round(entry.processingStart - entry.startTime);
                    }
                });
            });
            
            fidObserver.observe({ entryTypes: ['first-input'] });
            this.observers.set('fid', fidObserver);
        }

        // Cumulative Layout Shift (CLS)
        if ('PerformanceObserver' in window) {
            let clsValue = 0;
            const clsObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                        this.metrics.vitals.cls = Math.round(clsValue * 1000) / 1000;
                    }
                });
            });
            
            clsObserver.observe({ entryTypes: ['layout-shift'] });
            this.observers.set('cls', clsObserver);
        }
    }

    // First Contentful Paint
    measureFirstContentfulPaint() {
        if ('PerformanceObserver' in window) {
            const fcpObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (entry.name === 'first-contentful-paint') {
                        this.metrics.vitals.fcp = Math.round(entry.startTime);
                    }
                });
            });
            
            fcpObserver.observe({ entryTypes: ['paint'] });
            this.observers.set('fcp', fcpObserver);
        }
    }

    // Error Tracking
    trackErrors() {
        window.addEventListener('error', (event) => {
            this.metrics.errors.push({
                type: 'javascript',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                timestamp: Date.now()
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.metrics.errors.push({
                type: 'promise',
                message: event.reason?.message || event.reason,
                timestamp: Date.now()
            });
        });
    }

    // Get performance report
    getReport() {
        const report = {
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            ...this.metrics
        };

        // Calculate performance scores
        report.scores = this.calculateScores(report);
        
        return report;
    }

    calculateScores(report) {
        const scores = {};

        // LCP score (Good: <2.5s, Needs Improvement: 2.5s-4s, Poor: >4s)
        if (report.vitals.lcp) {
            if (report.vitals.lcp < 2500) scores.lcp = 'good';
            else if (report.vitals.lcp < 4000) scores.lcp = 'needs-improvement';
            else scores.lcp = 'poor';
        }

        // FID score (Good: <100ms, Needs Improvement: 100ms-300ms, Poor: >300ms)
        if (report.vitals.fid) {
            if (report.vitals.fid < 100) scores.fid = 'good';
            else if (report.vitals.fid < 300) scores.fid = 'needs-improvement';
            else scores.fid = 'poor';
        }

        // CLS score (Good: <0.1, Needs Improvement: 0.1-0.25, Poor: >0.25)
        if (report.vitals.cls !== undefined) {
            if (report.vitals.cls < 0.1) scores.cls = 'good';
            else if (report.vitals.cls < 0.25) scores.cls = 'needs-improvement';
            else scores.cls = 'poor';
        }

        // Overall performance score
        const goodCount = Object.values(scores).filter(score => score === 'good').length;
        const totalScores = Object.keys(scores).length;
        
        if (totalScores > 0) {
            const goodPercentage = goodCount / totalScores;
            if (goodPercentage >= 0.75) scores.overall = 'good';
            else if (goodPercentage >= 0.5) scores.overall = 'needs-improvement';
            else scores.overall = 'poor';
        }

        return scores;
    }

    // Send report to analytics (optional)
    sendReport() {
        const report = this.getReport();
        
        // Log to console in development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.group(' Performance Report');
            console.log('Navigation Timing:', report.navigation);
            console.log('Core Web Vitals:', report.vitals);
            console.log('Performance Scores:', report.scores);
            console.log('Resource Summary:', this.getResourceSummary(report.resources));
            if (report.errors.length > 0) {
                console.warn('Errors:', report.errors);
            }
            console.groupEnd();
        }

        // Send to analytics endpoint in production
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            fetch('/api/analytics/performance', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(report)
            }).catch(error => {
                console.warn('Failed to send performance report:', error);
            });
        }
    }

    getResourceSummary(resources) {
        const summary = {
            total: resources.length,
            totalSize: 0,
            cached: 0,
            byType: {}
        };

        resources.forEach(resource => {
            summary.totalSize += resource.size;
            if (resource.cached) summary.cached++;
            
            if (!summary.byType[resource.type]) {
                summary.byType[resource.type] = { count: 0, size: 0 };
            }
            summary.byType[resource.type].count++;
            summary.byType[resource.type].size += resource.size;
        });

        return summary;
    }

    // Cleanup observers
    cleanup() {
        this.observers.forEach(observer => {
            observer.disconnect();
        });
        this.observers.clear();
    }
}

// Initialize performance monitor
let performanceMonitor;

document.addEventListener('DOMContentLoaded', () => {
    performanceMonitor = new PerformanceMonitor();
    
    // Send report when page is fully loaded
    window.addEventListener('load', () => {
        setTimeout(() => {
            if (performanceMonitor) {
                performanceMonitor.sendReport();
            }
        }, 1000);
    });
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (performanceMonitor) {
        performanceMonitor.cleanup();
    }
});

// Export for use in other modules
window.performanceMonitor = performanceMonitor;