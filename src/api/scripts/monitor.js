#!/usr/bin/env node

const LogAggregator = require('../utils/logAggregator');
const { logger } = require('../utils/logger');

class LogMonitor {
  constructor() {
    this.aggregator = new LogAggregator();
    this.isRunning = false;
  }

  async runDailyReport() {
    if (this.isRunning) {
      logger.warn('Daily report already running, skipping');
      return;
    }

    this.isRunning = true;
    
    try {
      logger.info('Starting daily log report generation');
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      
      const report = await this.aggregator.generateReport(dateStr);
      const reportPath = await this.aggregator.saveReport(report);
      
      logger.info('Daily log report completed', null, {
        date: dateStr,
        reportPath,
        totalRequests: report.summary.totalRequests,
        errorCount: report.summary.errorCount,
        securityEvents: report.summary.securityEvents,
        health: report.insights.health
      });

      // Send alerts if needed
      if (report.insights.alerts.length > 0) {
        logger.warn('Log report alerts', null, {
          alerts: report.insights.alerts,
          recommendations: report.insights.recommendations
        });
      }

    } catch (error) {
      logger.error('Daily log report failed', null, {
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.isRunning = false;
    }
  }

  async runCleanup() {
    try {
      logger.info('Starting log cleanup');
      const deletedCount = await this.aggregator.cleanupOldLogs(30);
      logger.info('Log cleanup completed', null, { deletedCount });
    } catch (error) {
      logger.error('Log cleanup failed', null, {
        error: error.message,
        stack: error.stack
      });
    }
  }

  async generateReportNow(date = null) {
    try {
      const report = await this.aggregator.generateReport(date);
      const reportPath = await this.aggregator.saveReport(report);
      
      // Log the report generation
      logger.info('Log report generated', null, {
        date: report.date,
        totalRequests: report.summary.totalRequests,
        errorCount: report.summary.errorCount,
        securityEvents: report.summary.securityEvents,
        health: report.insights.health,
        reportPath
      });

      // CLI output (console is appropriate for CLI tools)
      console.log('\n=== LOG REPORT ===');
      console.log(`Date: ${report.date}`);
      console.log(`Total Requests: ${report.summary.totalRequests}`);
      console.log(`Errors: ${report.summary.errorCount}`);
      console.log(`Security Events: ${report.summary.securityEvents}`);
      console.log(`Health: ${report.insights.health}`);
      
      if (report.insights.alerts.length > 0) {
        console.log('\n🚨 ALERTS:');
        report.insights.alerts.forEach(alert => console.log(`  - ${alert}`));
      }
      
      if (report.insights.recommendations.length > 0) {
        console.log('\n💡 RECOMMENDATIONS:');
        report.insights.recommendations.forEach(rec => console.log(`  - ${rec}`));
      }
      
      console.log(`\nReport saved to: ${reportPath}`);
      
      return report;
    } catch (error) {
      logger.error('Failed to generate report', null, {
        error: error.message,
        stack: error.stack
      });
      console.error('Failed to generate report:', error.message);
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const monitor = new LogMonitor();
  const command = process.argv[2];
  const dateArg = process.argv[3];

  switch (command) {
    case 'report':
      monitor.generateReportNow(dateArg)
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'cleanup':
      monitor.runCleanup()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    default:
      console.log('Usage:');
      console.log('  node monitor.js report [date]  - Generate report for date (YYYY-MM-DD)');
      console.log('  node monitor.js cleanup        - Clean up old logs');
      process.exit(1);
  }
}

module.exports = LogMonitor;