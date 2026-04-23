const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '../dashboard')));

// API Routes
app.use('/api', apiRoutes);

// Fallback to dashboard index
app.use((req, res, next) => {
    if (req.method === 'GET') {
        res.sendFile(path.join(__dirname, '../dashboard/index.html'));
    } else {
        next();
    }
});

module.exports = app;
console.log("http://localhost:3000/")
