const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
require('dotenv').config();

const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    store: new SQLiteStore({ dir: './src/config', db: 'sessions.sqlite' }),
    secret: process.env.SESSION_SECRET || 'super_secret_ota_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View Routes
const viewRoutes = require('./routes/view');
app.use('/', viewRoutes);

// Admin Routes
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

// API Routes
app.use('/api', routes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        status: 'error',
        message: err.message || 'Internal Server Error'
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Upload endpoint: http://localhost:${PORT}/api/upload`);
    console.log(`OTA Check endpoint: http://localhost:${PORT}/api/ota/check`);
});
