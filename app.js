const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'lost-n-found-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, 
    maxAge: 24 * 60 * 60 * 1000, 
    httpOnly: true
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database connection with error handling
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lost-n-found';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('Connected to MongoDB successfully!');
  console.log('Database:', mongoose.connection.db.databaseName);
})
.catch(err => {
  console.error('MongoDB connection error:', err.message);
  console.log('Tip: Make sure MongoDB is running: mongod');
  console.log('Or install MongoDB: https://www.mongodb.com/try/download/community');
  process.exit(1); // Exit if DB connection fails
});

// Connection event listeners
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected - attempting reconnect...');
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});

//Make user data available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null; // This makes 'user' available in all EJS templates
  next();
});

// Debug middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.url} | User: ${req.session.user ? req.session.user.email : 'Guest'}`);
  next();
});

// Test route (useful for debugging)
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Server is working!',
    user: req.session.user,
    session: req.session.id
  });
});

//ADD REDIRECT ROUTES FOR CLEAN URLs
app.get('/login', (req, res) => {
  res.redirect('/auth/login');
});

app.get('/register', (req, res) => {
  res.redirect('/auth/register');
});

//Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/items', require('./routes/items'));
app.use('/dashboard', require('./routes/dashboard')); // Make sure this line exists
app.use('/admin', require('./routes/admin'));
app.use('/analytics', require('./routes/analytics'));
app.use('/export', require('./routes/export'));
// Add this line with your other route imports
app.use('/claims', require('./routes/claims'));
// In app.js, add this with your other routes:

app.use('/analytics', require('./routes/analytics'));  // New aggregation routes

//Add notification routes 
app.use('/api/notifications', require('./routes/notifications'));
// Add this after existing routes in app.js
app.get('/clear-login', (req, res) => {
  // Clear any cached credentials
  res.redirect('/auth/login');
});
// Success message middleware 
app.use((req, res, next) => {
  // Success messages
  if (req.session.successMessage) {
    res.locals.successMessage = req.session.successMessage;
    delete req.session.successMessage;
  }
  
  // Error messages
  if (req.session.errorMessage) {
    res.locals.errorMessage = req.session.errorMessage;
    delete req.session.errorMessage;
  }
  
  next();
});

// Error handling middleware 
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', err.stack);
  res.status(500).render('error', { 
    title: 'Server Error',
    message: 'Something went wrong! Please try again later.',
    user: req.session.user 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { 
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    user: req.session.user 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Views directory: ${path.join(__dirname, 'views')}`);
});