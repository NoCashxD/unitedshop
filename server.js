require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const port = 5000;
const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';

app.use(bodyParser.json());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));

// Create a function to execute queries
async function executeQuery(query, params = []) {
    const connection = await mysql.createConnection({
        host: 'server959.iseencloud.net',
        user: 'dsrsrc_cassh',
        password: 'dsrsrc_cassh',
        database: 'dsrsrc_cassh',
        port: 3306
    });
    try {
        const [results] = await connection.execute(query, params);
        return results;
    } catch (error) {
        console.error('Database error:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

// Middleware to verify JWT token
function verifyToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).send({ message: 'Unauthorized' });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).send({ message: 'Invalid token' });
        req.user = decoded;
        next();
    });
}

// Test database connection
app.get('/api/test-db', async (req, res) => {
    try {
        await executeQuery('SELECT 1');
        res.send({ message: 'Database Connected' });
    } catch (error) {
        res.status(500).send({ message: 'Database Connection Failed', error: error.message });
    }
});

// Signup route
app.post('/api/signup', async (req, res) => {
    const { username, password, email } = req.body;
    try {
        const existingUser = await executeQuery('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existingUser.length > 0) return res.status(409).send({ message: 'Username or email already in use' });
        
        await executeQuery('INSERT INTO users (username, password, email) VALUES (?, ?, ?)', [username, password, email]);
        res.status(200).send({ message: 'Signup successful' });
    } catch (error) {
        res.status(500).send({ message: 'Database error' });
    }
});

// Login route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const users = await executeQuery('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
        if (users.length === 0) return res.status(401).send({ message: 'Invalid credentials' });
        
        const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
        res.status(200).send({ message: 'Login successful', token });
    } catch (error) {
        res.status(500).send({ message: 'Database error' });
    }
});

// Protected route example
app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        const user = await executeQuery('SELECT username, email FROM users WHERE username = ?', [req.user.username]);
        if (user.length === 0) return res.status(404).send({ message: 'User not found' });
        res.status(200).send(user[0]);
    } catch (error) {
        res.status(500).send({ message: 'Database error' });
    }
});

// Get balance
app.get('/api/balance', verifyToken, async (req, res) => {
    try {
        const results = await executeQuery('SELECT balance FROM users WHERE username = ?', [req.user.username]);
        if (results.length === 0) return res.status(404).send({ message: 'User not found' });
        res.send({ balance: results[0].balance });
    } catch (error) {
        res.status(500).send({ message: 'Database error' });
    }
});

// Purchase API
app.post('/api/purchase', verifyToken, async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).send({ message: 'Invalid request data' });
    
    try {
        let totalPrice = items.reduce((sum, item) => sum + item.price, 0);
        let user = await executeQuery('SELECT balance FROM users WHERE username = ?', [req.user.username]);
        
        if (user.length === 0 || user[0].balance < totalPrice) {
            return res.status(400).send({ message: 'Insufficient balance' });
        }

        await executeQuery('UPDATE users SET balance = balance - ? WHERE username = ?', [totalPrice, req.user.username]);
        res.status(200).send({ message: 'Purchase successful' });
    } catch (error) {
        res.status(500).send({ message: 'Database error' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});

module.exports = app;
