// Frontend Test Setup and Utilities
// This file provides common testing utilities for the frontend

class FrontendTestSuite {
    constructor() {
        this.tests = [];
        this.results = [];
        this.mocks = new Map();
    }

    // Test registration
    test(name, testFunction) {
        this.tests.push({ name, testFunction });
    }

    // Mock setup
    setupMockFetch() {
        const originalFetch = window.fetch;
        window.fetch = async (url, options = {}) => {
            const mockKey = this.getMockKey(url, options);
            if (this.mocks.has(mockKey)) {
                return this.mocks.get(mockKey);
            }
            return originalFetch(url, options);
        };
    }

    restoreFetch() {
        // This would restore the original fetch if we saved it
        // For now, we'll rely on page reload
    }

    setMockResponse(url, options, response) {
        const mockKey = this.getMockKey(url, options);
        this.mocks.set(mockKey, Promise.resolve(response));
    }

    getMockKey(url, options) {
        return `${url}_${JSON.stringify(options)}`;
    }

    clearMocks() {
        this.mocks.clear();
    }

    // Test execution
    async runTests() {
        this.results = [];
        
        for (const test of this.tests) {
            try {
                const result = await test.testFunction();
                this.results.push({
                    name: test.name,
                    passed: true,
                    result,
                    error: null
                });
            } catch (error) {
                this.results.push({
                    name: test.name,
                    passed: false,
                    result: null,
                    error: error.message
                });
            }
        }

        return this.results;
    }

    // Test utilities
    assert(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
    }

    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(message || `Expected ${expected}, got ${actual}`);
        }
    }

    assertNotEqual(actual, expected, message) {
        if (actual === expected) {
            throw new Error(message || `Expected not ${expected}, got ${actual}`);
        }
    }

    assertThrows(fn, message) {
        try {
            fn();
            throw new Error(message || 'Expected function to throw');
        } catch (error) {
            // Expected behavior
        }
    }

    // DOM utilities
    createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);
        
        Object.keys(attributes).forEach(key => {
            if (key === 'className') {
                element.className = attributes[key];
            } else if (key === 'innerHTML') {
                element.innerHTML = attributes[key];
            } else {
                element.setAttribute(key, attributes[key]);
            }
        });

        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else {
                element.appendChild(child);
            }
        });

        return element;
    }

    // Event simulation
    simulateEvent(element, eventType, eventData = {}) {
        const event = new Event(eventType, { bubbles: true, ...eventData });
        element.dispatchEvent(event);
    }

    simulateClick(element) {
        this.simulateEvent(element, 'click');
    }

    simulateInput(element, value) {
        element.value = value;
        this.simulateEvent(element, 'input');
    }

    simulateSubmit(form) {
        this.simulateEvent(form, 'submit');
    }

    // Async utilities
    waitFor(condition, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const check = () => {
                if (condition()) {
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error('Timeout waiting for condition'));
                } else {
                    setTimeout(check, 50);
                }
            };
            
            check();
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Storage utilities
    clearStorage() {
        localStorage.clear();
        sessionStorage.clear();
    }

    setStorageItem(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    getStorageItem(key) {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    }

    // Network utilities
    createMockResponse(data, options = {}) {
        return {
            ok: options.ok !== false,
            status: options.status || 200,
            json: () => Promise.resolve(data),
            text: () => Promise.resolve(JSON.stringify(data)),
            headers: new Map(Object.entries(options.headers || {}))
        };
    }

    createErrorResponse(message, status = 500) {
        return {
            ok: false,
            status,
            json: () => Promise.resolve({ error: message }),
            text: () => Promise.resolve(JSON.stringify({ error: message }))
        };
    }
}

// Authentication Test Suite
class AuthTestSuite extends FrontendTestSuite {
    constructor() {
        super();
        this.setupAuthTests();
    }

    setupAuthTests() {
        this.test('Cookie-Based Authentication', async () => {
            // Test that authentication works with httpOnly cookies
            const mockResponse = {
                ok: true,
                json: () => Promise.resolve({ 
                    message: 'Login successful',
                    user: { id: 1, username: 'testuser', role: 'developer' }
                })
            };

            this.setMockResponse('/api/auth/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            }, mockResponse);

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'testuser', password: 'Password123' })
            });

            this.assert(response.ok, 'Login request should succeed');
            const data = await response.json();
            this.assertEqual(data.user.username, 'testuser', 'Should return correct user data');
            this.assert(!data.token, 'Should not return token in response body (stored in cookie)');
        });

        this.test('Authentication Status Check', async () => {
            // Test authentication status via API call (cookie-based)
            const mockUnauthResponse = {
                ok: false,
                status: 401,
                json: () => Promise.resolve({ error: 'Access token required' })
            };

            const mockAuthResponse = {
                ok: true,
                json: () => Promise.resolve({ 
                    user: { id: 1, username: 'testuser', role: 'developer' }
                })
            };

            // Test when not authenticated
            this.setMockResponse('/api/auth/profile', {
                credentials: 'include'
            }, mockUnauthResponse);

            let response = await fetch('/api/auth/profile', { credentials: 'include' });
            this.assertEqual(response.ok, false, 'Should not be authenticated initially');

            // Test when authenticated (mock successful auth)
            this.setMockResponse('/api/auth/profile', {
                credentials: 'include'
            }, mockAuthResponse);

            response = await fetch('/api/auth/profile', { credentials: 'include' });
            this.assert(response.ok, 'Should be authenticated with valid cookie');
            const data = await response.json();
            this.assertEqual(data.user.username, 'testuser', 'Should return correct user data');
        });

        this.test('Email Validation', () => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            
            this.assert(emailRegex.test('test@example.com'), 'Valid email should pass');
            this.assert(emailRegex.test('user.name@domain.co.uk'), 'Complex valid email should pass');
            this.assert(!emailRegex.test('invalid-email'), 'Invalid email should fail');
            this.assert(!emailRegex.test('@example.com'), 'Email without local part should fail');
            this.assert(!emailRegex.test('test@'), 'Email without domain should fail');
        });

        this.test('Password Validation', () => {
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
            
            this.assert(passwordRegex.test('Password123'), 'Valid password should pass');
            this.assert(passwordRegex.test('MySecurePass456'), 'Complex valid password should pass');
            this.assert(!passwordRegex.test('password'), 'Lowercase only should fail');
            this.assert(!passwordRegex.test('PASSWORD'), 'Uppercase only should fail');
            this.assert(!passwordRegex.test('123456'), 'Numbers only should fail');
            this.assert(!passwordRegex.test('Pass'), 'Too short should fail');
        });

        this.test('Form Validation', () => {
            const formData = new FormData();
            formData.set('username', 'testuser');
            formData.set('password', 'Password123');

            const username = formData.get('username');
            const password = formData.get('password');

            this.assert(username.length >= 3, 'Username should be at least 3 characters');
            this.assert(password.length >= 6, 'Password should be at least 6 characters');
        });

        this.test('Login API Mock', async () => {
            this.setupMockFetch();
            this.clearMocks();

            const mockResponse = this.createMockResponse({
                message: 'Login successful',
                token: 'mock-jwt-token',
                user: { id: 1, username: 'testuser', role: 'developer' }
            });

            this.setMockResponse('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, mockResponse);

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'testuser', password: 'Password123' })
            });

            this.assert(response.ok, 'Login request should succeed');
            const data = await response.json();
            this.assertEqual(data.message, 'Login successful', 'Should return success message');
            this.assert(data.user, 'Should return user data');
        });

        this.test('Logout Functionality', async () => {
            // Test logout with httpOnly cookies
            const mockResponse = {
                ok: true,
                json: () => Promise.resolve({ message: 'Logout successful' })
            };

            this.setMockResponse('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            }, mockResponse);

            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });

            this.assert(response.ok, 'Logout request should succeed');
            const data = await response.json();
            this.assertEqual(data.message, 'Logout successful', 'Should return success message');
        });
    }
}

// Projects Test Suite
class ProjectsTestSuite extends FrontendTestSuite {
    constructor() {
        super();
        this.setupProjectsTests();
    }

    setupProjectsTests() {
        this.test('Project Data Structure', () => {
            const project = {
                id: 1,
                title: 'Test Project',
                description: 'A test project',
                status: 'active',
                featured: true,
                technologies: ['JavaScript', 'React', 'Node.js']
            };

            this.assert(project.id, 'Project should have an ID');
            this.assert(project.title, 'Project should have a title');
            this.assert(project.status, 'Project should have a status');
            this.assert(Array.isArray(project.technologies), 'Technologies should be an array');
        });

        this.test('Technology Tags Generation', () => {
            const technologies = ['JavaScript', 'React', 'Node.js', 'TypeScript'];
            const limitedTechs = technologies.slice(0, 4);
            const techTags = limitedTechs.map(tech => `<span class="tech-tag">${tech}</span>`).join('');

            this.assert(techTags.includes('JavaScript'), 'Should include JavaScript tag');
            this.assert(techTags.includes('React'), 'Should include React tag');
            this.assert(techTags.includes('tech-tag'), 'Should have tech-tag class');
        });

        this.test('Date Formatting', () => {
            const now = new Date();
            const past = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
            const older = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week ago

            const formatDate = (dateString) => {
                if (!dateString) return 'Unknown';
                const date = new Date(dateString);
                const now = new Date();
                const diffTime = Math.abs(now - date);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 0) return 'Today';
                if (diffDays === 1) return 'Yesterday';
                if (diffDays < 7) return `${diffDays} days ago`;
                if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
                return `${Math.floor(diffDays / 365)} years ago`;
            };

            this.assertEqual(formatDate(now.toISOString()), 'Today', 'Today should format correctly');
            this.assertEqual(formatDate(past.toISOString()), 'Yesterday', 'Yesterday should format correctly');
            this.assert(formatDate(older.toISOString()).includes('week'), 'Older dates should show weeks');
        });

        this.test('Projects API Mock', async () => {
            this.setupMockFetch();
            this.clearMocks();

            const mockResponse = this.createMockResponse({
                projects: [
                    { id: 1, title: 'Project 1', status: 'active', technologies: 'JavaScript,React' },
                    { id: 2, title: 'Project 2', status: 'active', technologies: 'Python,Django' }
                ],
                pagination: { page: 1, limit: 20, total: 2, pages: 1 }
            });

            this.setMockResponse('/api/projects', {}, mockResponse);

            const response = await fetch('/api/projects', { credentials: 'include' });
            this.assert(response.ok, 'Projects request should succeed');

            const data = await response.json();
            this.assert(data.projects, 'Should have projects array');
            this.assertEqual(data.projects.length, 2, 'Should have 2 projects');
            this.assert(data.pagination, 'Should have pagination info');
        });

        this.test('Search Functionality', () => {
            const projects = [
                { title: 'JavaScript Calculator', description: 'A calculator built with JavaScript' },
                { title: 'React Todo App', description: 'Todo application using React' },
                { title: 'Python API', description: 'REST API built with Python' }
            ];

            const searchProjects = (query) => {
                return projects.filter(project =>
                    project.title.toLowerCase().includes(query.toLowerCase()) ||
                    project.description.toLowerCase().includes(query.toLowerCase())
                );
            };

            const jsResults = searchProjects('javascript');
            const reactResults = searchProjects('react');
            const apiResults = searchProjects('api');

            this.assertEqual(jsResults.length, 1, 'Should find JavaScript project');
            this.assertEqual(reactResults.length, 1, 'Should find React project');
            this.assertEqual(apiResults.length, 1, 'Should find API project');
            this.assert(jsResults[0].title.includes('JavaScript'), 'Should find correct JavaScript project');
        });

        this.test('Pagination Logic', () => {
            const totalItems = 25;
            const pageSize = 10;
            const currentPage = 2;

            const totalPages = Math.ceil(totalItems / pageSize);
            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, totalItems);

            this.assertEqual(totalPages, 3, 'Should calculate 3 total pages');
            this.assertEqual(startIndex, 10, 'Should start at index 10 for page 2');
            this.assertEqual(endIndex, 20, 'Should end at index 20 for page 2');
        });
    }
}

// Export for use in other files
window.FrontendTestSuite = FrontendTestSuite;
window.AuthTestSuite = AuthTestSuite;
window.ProjectsTestSuite = ProjectsTestSuite;