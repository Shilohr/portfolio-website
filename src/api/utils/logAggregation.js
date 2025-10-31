const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

class LogAggregator {
  constructor(logDir = 'logs') {
    this.logDir = logDir;
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  async aggregateLogs(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const logFiles = this.getLogFiles(targetDate);
    
    const aggregatedLogs = {
      date: targetDate,
      summary: {
        totalRequests: 0,
        errorCount: 0,
        securityEvents: 0,
        auditEvents: 0,
        performanceMetrics: []
      },
      errors: [],
      securityEvents: [],
      auditEvents: [],
      performanceMetrics: [],
      topEndpoints: {},
      userActivity: {},
      errorRates: {}
    };

    for (const file of logFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const logEntry = JSON.parse(line);
            this.processLogEntry(logEntry, aggregatedLogs);
          } catch (parseError) {
            logger.warn('Failed to parse log line', null, { 
              line: line.substring(0, 100),
              error: parseError.message
            });
          }
        }
      } catch (fileError) {
        logger.error('Failed to read log file', null, { 
          file,
          error: fileError.message
        });
      }
    }

    return aggregatedLogs;
  }

  processLogEntry(entry, aggregatedLogs) {
    const { message, level, metadata = {} } = entry;
    
    // Count total requests
    if (message.includes('REQUEST_')) {
      aggregatedLogs.summary.totalRequests++;
      
      // Track top endpoints
      const endpoint = metadata.url || 'unknown';
      aggregatedLogs.topEndpoints[endpoint] = (aggregatedLogs.topEndpoints[endpoint] || 0) + 1;
      
      // Track user activity
      if (metadata.userId) {
        const userId = metadata.userId;
        aggregatedLogs.userActivity[userId] = (aggregatedLogs.userActivity[userId] || 0) + 1;
      }
    }

    // Count errors
    if (level === 'error') {
      aggregatedLogs.summary.errorCount++;
      aggregatedLogs.errors.push({
        timestamp: metadata.timestamp || entry.timestamp,
        message,
        requestId: metadata.requestId,
        userId: metadata.userId,
        endpoint: metadata.url,
        error: metadata.error
      });
    }

    // Process security events
    if (message.includes('SECURITY:')) {
      aggregatedLogs.summary.securityEvents++;
      aggregatedLogs.securityEvents.push({
        timestamp: metadata.timestamp || entry.timestamp,
        event: metadata.security?.securityEvent,
        severity: metadata.security?.severity,
        requestId: metadata.requestId,
        userId: metadata.userId,
        ip: metadata.ip,
        details: metadata.security
      });
    }

    // Process audit events
    if (message.includes('AUDIT:')) {
      aggregatedLogs.summary.auditEvents++;
      aggregatedLogs.auditEvents.push({
        timestamp: metadata.timestamp || entry.timestamp,
        action: metadata.audit?.action,
        resource: metadata.audit?.resource,
        requestId: metadata.requestId,
        userId: metadata.userId,
        details: metadata.audit
      });
    }

    // Process performance metrics
    if (message.includes('PERFORMANCE:')) {
      const perfData = {
        timestamp: metadata.timestamp || entry.timestamp,
        operation: metadata.performance?.operation,
        duration: metadata.performance?.duration,
        requestId: metadata.requestId,
        userId: metadata.userId
      };
      aggregatedLogs.performanceMetrics.push(perfData);
      aggregatedLogs.summary.performanceMetrics.push(perfData);
    }
  }

  getLogFiles(date) {
    const files = [];
    
    try {
      const allFiles = fs.readdirSync(this.logDir);
      
      for (const file of allFiles) {
        if (file.includes(date) && file.endsWith('.log')) {
          files.push(path.join(this.logDir, file));
        }
      }
    } catch (error) {
      logger.error('Failed to read log directory', null, { 
        logDir: this.logDir,
        error: error.message
      });
    }
    
    return files;
  }

  async generateReport(date = null) {
    const aggregatedLogs = await this.aggregateLogs(date);
    
    const report = {
      ...aggregatedLogs,
      generatedAt: new Date().toISOString(),
      insights: this.generateInsights(aggregatedLogs)
    };

    return report;
  }

  generateInsights(logs) {
    const insights = {
      health: 'good',
      recommendations: [],
      alerts: []
    };

    // Error rate analysis
    const errorRate = logs.summary.totalRequests > 0 
      ? (logs.summary.errorCount / logs.summary.totalRequests) * 100 
      : 0;

    if (errorRate > 5) {
      insights.health = 'poor';
      insights.alerts.push(`High error rate: ${errorRate.toFixed(2)}%`);
      insights.recommendations.push('Investigate frequent errors and improve error handling');
    } else if (errorRate > 2) {
      insights.health = 'warning';
      insights.alerts.push(`Elevated error rate: ${errorRate.toFixed(2)}%`);
      insights.recommendations.push('Monitor error patterns and consider preventive measures');
    }

    // Security event analysis
    if (logs.summary.securityEvents > 10) {
      insights.health = 'warning';
      insights.alerts.push(`High number of security events: ${logs.summary.securityEvents}`);
      insights.recommendations.push('Review security logs for potential threats');
    }

    // Performance analysis
    const slowOperations = logs.performanceMetrics.filter(
      perf => parseInt(perf.duration) > 1000
    );

    if (slowOperations.length > 0) {
      insights.recommendations.push(`${slowOperations.length} slow operations detected (>1s)`);
    }

    // Top error patterns
    const errorPatterns = {};
    logs.errors.forEach(error => {
      const pattern = error.message || 'Unknown error';
      errorPatterns[pattern] = (errorPatterns[pattern] || 0) + 1;
    });

    const topErrors = Object.entries(errorPatterns)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    if (topErrors.length > 0) {
      insights.topErrors = topErrors;
    }

    return insights;
  }

  async saveReport(report, filename = null) {
    const reportFilename = filename || `log-report-${report.date}.json`;
    const reportPath = path.join(this.logDir, reportFilename);
    
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      logger.info('Log report saved', null, { 
        reportPath,
        reportDate: report.date 
      });
      return reportPath;
    } catch (error) {
      logger.error('Failed to save log report', null, { 
        reportPath,
        error: error.message
      });
      throw error;
    }
  }

  async cleanupOldLogs(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      }

      logger.info('Old log files cleaned up', null, { 
        deletedCount,
        daysToKeep
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old logs', null, { 
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = LogAggregator;