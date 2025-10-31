#!/usr/bin/env node

const cron = require('node-cron');
const LogMonitor = require('./monitor');
const { logger } = require('../utils/logger');

class ProductionMonitor {
  constructor() {
    this.monitor = new LogMonitor();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      logger.warn('Production monitor already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting production monitoring service');

    // Schedule daily report generation at 2 AM
    cron.schedule('0 2 * * *', async () => {
      logger.info('Scheduled daily report generation started');
      try {
        await this.monitor.runDailyReport();
      } catch (error) {
        logger.error('Scheduled daily report failed', null, {
          error: error.message,
          stack: error.stack
        });
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Schedule log cleanup every Sunday at 3 AM
    cron.schedule('0 3 * * 0', async () => {
      logger.info('Scheduled log cleanup started');
      try {
        await this.monitor.runCleanup();
      } catch (error) {
        logger.error('Scheduled log cleanup failed', null, {
          error: error.message,
          stack: error.stack
        });
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Health check every hour
    cron.schedule('0 * * * *', async () => {
      await this.performHealthCheck();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    logger.info('Production monitoring schedules configured', null, {
      dailyReport: '0 2 * * * (UTC)',
      logCleanup: '0 3 * * 0 (UTC)',
      healthCheck: '0 * * * * (UTC)'
    });
  }

  async performHealthCheck() {
    try {
      const LogAggregator = require('../utils/logAggregation');
      const aggregator = new LogAggregator();
      
      // Check last hour's logs for critical issues
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const dateStr = oneHourAgo.toISOString().split('T')[0];
      
      const logs = await aggregator.aggregateLogs(dateStr);
      
      // Filter logs from the last hour
      const recentLogs = logs.errors.filter(error => {
        const errorTime = new Date(error.timestamp);
        return errorTime > oneHourAgo;
      });

      const recentSecurityEvents = logs.securityEvents.filter(event => {
        const eventTime = new Date(event.timestamp);
        return eventTime > oneHourAgo;
      });

      // Alert if there are critical issues
      if (recentLogs.length > 10) {
        logger.error('High error rate detected in last hour', null, {
          errorCount: recentLogs.length,
          timeWindow: '1 hour',
          severity: 'high'
        });
      }

      if (recentSecurityEvents.length > 5) {
        logger.security('High security event rate detected', null, 'high', {
          eventCount: recentSecurityEvents.length,
          timeWindow: '1 hour'
        });
      }

      logger.debug('Health check completed', null, {
        errorsInLastHour: recentLogs.length,
        securityEventsInLastHour: recentSecurityEvents.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Health check failed', null, {
        error: error.message,
        stack: error.stack
      });
    }
  }

  stop() {
    this.isRunning = false;
    logger.info('Production monitoring service stopped');
  }
}

// CLI interface
if (require.main === module) {
  const monitor = new ProductionMonitor();
  const command = process.argv[2];

  switch (command) {
    case 'start':
      monitor.start();
      logger.info('Production monitor started. Press Ctrl+C to stop.');
      
      // Keep the process running
      process.on('SIGINT', () => {
        logger.info('Received SIGINT, stopping monitor');
        monitor.stop();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, stopping monitor');
        monitor.stop();
        process.exit(0);
      });

      break;
      
    case 'health':
      monitor.performHealthCheck()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    default:
      console.log('Usage:');
      console.log('  node production-monitor.js start  - Start monitoring service');
      console.log('  node production-monitor.js health - Run one-time health check');
      process.exit(1);
  }
}

module.exports = ProductionMonitor;