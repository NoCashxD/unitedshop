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
app.get('/api/debug-db', async (req, res) => {
    const startTime = Date.now(); // Track execution time

    try {
        console.log("🔍 Checking database connection...");

        // Create a new connection
        const connection = await mysql.createConnection({
           host: 'server959.iseencloud.net',
        user: 'dsrsrc_cassh',
        password: 'dsrsrc_cassh',
        database: 'dsrsrc_cassh',
        port: 3306
            connectTimeout: 10000 // 10 seconds timeout
        });

        // Run a simple query
        const [results] = await connection.execute('SELECT 1');

        await connection.end(); // Close connection
        const endTime = Date.now();

        console.log("✅ Database connected successfully!");
        res.status(200).send({
            message: "Database Connected",
            executionTime: `${endTime - startTime}ms`,
            results
        });

    } catch (error) {
        console.error("❌ Database connection failed:", error);

        // Detect common errors
        let errorType;
        if (error.code === 'ECONNREFUSED') {
            errorType = "Connection Refused: Database may be offline or credentials are wrong.";
        } else if (error.code === 'ETIMEDOUT') {
            errorType = "Connection Timed Out: Remote MySQL might be blocking access.";
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            errorType = "Access Denied: Wrong username or password.";
        } else if (error.code === 'ENOTFOUND') {
            errorType = "Host Not Found: Check DB_HOST in .env.";
        } else {
            errorType = "Unknown Error: Check logs.";
        }

        res.status(500).send({
            message: "Database Connection Failed",
            error: error.message,
            errorType,
            code: error.code
        });
    }
});

// Middleware to verify JWT token


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
