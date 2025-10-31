const { EventEmitter } = require('events');

// Mock connection class
class MockConnection extends EventEmitter {
    constructor() {
        super();
        this.connected = true;
        this.queryHistory = [];
    }

    async execute(sql, params) {
        this.queryHistory.push({ sql, params, timestamp: new Date() });
        
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        
        // Return empty result by default
        return [[]];
    }

    async query(sql, params) {
        return this.execute(sql, params);
    }

    async beginTransaction() {
        return Promise.resolve();
    }

    async commit() {
        return Promise.resolve();
    }

    async rollback() {
        return Promise.resolve();
    }

    release() {
        this.connected = false;
    }

    ping() {
        return Promise.resolve(this.connected);
    }

    end() {
        this.connected = false;
        return Promise.resolve();
    }
}

// Mock pool class
class MockPool {
    constructor(config = {}) {
        this.config = config;
        this.connections = [];
        this.queryHistory = [];
    }

    async execute(sql, params) {
        this.queryHistory.push({ sql, params, timestamp: new Date() });
        
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        
        // Return empty result by default
        return [[]];
    }

    async query(sql, params) {
        return this.execute(sql, params);
    }

    async getConnection() {
        const connection = new MockConnection();
        this.connections.push(connection);
        return connection;
    }

    async end() {
        // Close all connections
        await Promise.all(this.connections.map(conn => conn.end()));
        this.connections = [];
        return Promise.resolve();
    }

    ping() {
        return Promise.resolve(true);
    }
}

// Mock createPool function
const createPool = (config) => {
    return new MockPool(config);
};

// Mock createConnection function
const createConnection = (config) => {
    return new MockConnection();
};

module.exports = {
    createPool,
    createConnection,
    MockConnection,
    MockPool
};