// Bundle size analysis and comparison tool
export class BundleAnalyzer {
    constructor() {
        this.baselineSize = null;
        this.currentSize = null;
        this.modules = new Map();
    }

    // Measure current bundle sizes
    async measureCurrentBundles() {
        const resources = performance.getEntriesByType('resource');
        const jsResources = resources.filter(r => r.name.includes('.js') && !r.name.includes('bundle-analyzer'));
        
        this.currentSize = {
            total: 0,
            modules: [],
            cached: 0,
            network: 0
        };

        for (const resource of jsResources) {
            const size = resource.transferSize || 0;
            const name = resource.name.split('/').pop();
            const isCached = size === 0;
            
            this.currentSize.modules.push({
                name,
                size,
                cached: isCached,
                duration: resource.duration
            });
            
            this.currentSize.total += size;
            
            if (isCached) {
                this.currentSize.cached += size;
            } else {
                this.currentSize.network += size;
            }
            
            this.modules.set(name, {
                size,
                cached: isCached,
                path: resource.name
            });
        }
        
        return this.currentSize;
    }

    // Set baseline for comparison (would be measured from monolithic version)
    setBaseline(baselineSize) {
        this.baselineSize = baselineSize;
    }

    // Calculate improvements
    calculateImprovements() {
        if (!this.baselineSize || !this.currentSize) {
            return null;
        }

        const improvement = {
            sizeReduction: this.baselineSize - this.currentSize.network,
            percentageReduction: ((this.baselineSize - this.currentSize.network) / this.baselineSize * 100).toFixed(1),
            cacheEfficiency: (this.currentSize.cached / this.currentSize.total * 100).toFixed(1),
            modulesLoaded: this.currentSize.modules.length,
            lazyLoadedModules: this.currentSize.modules.filter(m => !m.name.includes('main') && !m.name.includes('core')).length
        };

        return improvement;
    }

    // Generate detailed report
    generateReport() {
        const improvements = this.calculateImprovements();
        
        const report = {
            timestamp: new Date().toISOString(),
            current: this.currentSize,
            baseline: this.baselineSize,
            improvements,
            modules: Array.from(this.modules.entries()).map(([name, data]) => ({
                name,
                ...data
            }))
        };

        return report;
    }

    // Log analysis to console
    logAnalysis() {
        console.group('Bundle Size Analysis');
        
        if (this.currentSize) {
            console.log('Current Bundle Sizes:');
            console.table(this.currentSize.modules);
            
            console.log(`Total JS Size: ${(this.currentSize.total / 1024).toFixed(2)} KB`);
            console.log(`Network Transfer: ${(this.currentSize.network / 1024).toFixed(2)} KB`);
            console.log(`Cached: ${(this.currentSize.cached / 1024).toFixed(2)} KB`);
        }

        const improvements = this.calculateImprovements();
        if (improvements) {
            console.log('\nImprovements:');
            console.log(`Size Reduction: ${(improvements.sizeReduction / 1024).toFixed(2)} KB (${improvements.percentageReduction}%)`);
            console.log(`Cache Efficiency: ${improvements.cacheEfficiency}%`);
            console.log(`Modules Loaded: ${improvements.modulesLoaded}`);
            console.log(`Lazy Loaded Modules: ${improvements.lazyLoadedModules}`);
        }

        console.groupEnd();
    }

    // Export report as JSON
    exportReport() {
        const report = this.generateReport();
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `bundle-analysis-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
}

// Global bundle analyzer instance
export const bundleAnalyzer = new BundleAnalyzer();

// Auto-measure after page load
window.addEventListener('load', async () => {
    setTimeout(async () => {
        await bundleAnalyzer.measureCurrentBundles();
        
        // Set estimated baseline (monolithic script.js was ~95KB)
        bundleAnalyzer.setBaseline(95000);
        
        bundleAnalyzer.logAnalysis();
    }, 2000);
});