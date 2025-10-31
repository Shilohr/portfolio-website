const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours

// Input validation middleware
const validateLogin = [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const validateRegister = [
    body('username').trim().isLength({ min: 3 }).isAlphanumeric().withMessage('Username must be alphanumeric'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8}).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must be 8+ chars with uppercase, lowercase, and number')
];

// Helper functions
const isAccountLocked = (user) => {
    return user.locked_until && user.locked_until > Date.now();
};

const hashPassword = async (password) => {
    return await bcrypt.hash(password, 12);
};

const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

const generateToken = (userId, username, role) => {
    return jwt.sign(
        { userId, username, role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Routes
router.post('/register', validateRegister, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, email, password } = req.body;
        const db = req.db;

        // Check if user already exists
        const [existingUsers] = await db.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Hash password and create user
        const passwordHash = await hashPassword(password);
        const [result] = await db.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, passwordHash]
        );

        // Log registration
        await db.execute(
            'INSERT INTO audit_log (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [result.insertId, 'USER_REGISTERED', req.ip, req.get('User-Agent')]
        );

        res.status(201).json({ 
            message: 'User registered successfully',
            userId: result.insertId
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

router.post('/login', validateLogin, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password } = req.body;
        const db = req.db;

        // Get user from database
        const [users] = await db.execute(
            'SELECT id, username, email, password_hash, role, is_active, login_attempts, locked_until FROM users WHERE username = ? OR email = ?',
            [username, username]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];

        // Check if account is locked
        if (isAccountLocked(user)) {
            return res.status(423).json({ 
                error: 'Account temporarily locked due to too many failed attempts',
                lockedUntil: user.locked_until
            });
        }

        // Check if account is active
        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is deactivated' });
        }

        // Verify password
        const isValidPassword = await comparePassword(password, user.password_hash);
        if (!isValidPassword) {
            // Increment login attempts
            const newAttempts = user.login_attempts + 1;
            const lockedUntil = newAttempts >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCK_TIME : null;

            await db.execute(
                'UPDATE users SET login_attempts = ?, locked_until = ? WHERE id = ?',
                [newAttempts, lockedUntil, user.id]
            );

            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Reset login attempts on successful login
        await db.execute(
            'UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );

        // Generate JWT token
        const token = generateToken(user.id, user.username, user.role);

        // Store session in database
        const tokenHash = await hashPassword(token);
        await db.execute(
            'INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
            [user.id, tokenHash, new Date(Date.now() + 24 * 60 * 60 * 1000), req.ip, req.get('User-Agent')]
        );

        // Log successful login
        await db.execute(
            'INSERT INTO audit_log (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [user.id, 'USER_LOGIN', req.ip, req.get('User-Agent')]
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

router.post('/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(400).json({ error: 'No token provided' });
        }

        // Decode token to get user info
        const decoded = jwt.verify(token, JWT_SECRET);
        const db = req.db;

        // Invalidate session
        await db.execute(
            'UPDATE user_sessions SET is_active = FALSE WHERE user_id = ? AND token_hash = ?',
            [decoded.userId, await hashPassword(token)]
        );

        // Log logout
        await db.execute(
            'INSERT INTO audit_log (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [decoded.userId, 'USER_LOGOUT', req.ip, req.get('User-Agent')]
        );

        res.json({ message: 'Logout successful' });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Token validation middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        try {
            const db = req.db;
            const [sessions] = await db.execute(
                'SELECT id FROM user_sessions WHERE user_id = ? AND token_hash = ? AND is_active = TRUE AND expires_at > NOW()',
                [decoded.userId, await hashPassword(token)]
            );

            if (sessions.length === 0) {
                return res.status(403).json({ error: 'Session expired or invalid' });
            }

            req.user = decoded;
            next();
        } catch (error) {
            console.error('Token validation error:', error);
            res.status(500).json({ error: 'Token validation failed' });
        }
    });
};

// Protected route example
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const db = req.db;
        const [users] = await db.execute(
            'SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?',
            [req.user.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0] });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;