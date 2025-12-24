const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo'); // CRITICAL: Add this import

require('dotenv').config();

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ FIX: Use absolute path for static files
app.use(express.static(path.join(__dirname, 'public')));

// ✅ FIX: Add MongoStore to session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'lost-n-found-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/lost-n-found',
    ttl: 14 * 24 * 60 * 60, // 14 days
    autoRemove: 'native'
  }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // Dynamic for Vercel
    maxAge: 24 * 60 * 60 * 1000, 
    httpOnly: true
  }
}));

// ✅ FIX: Use absolute path for views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ✅ FIX: Improved database connection for Vercel
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lost-n-found';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully!');
  console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.log('⚠️  App will run in limited mode without database');
  // DON'T exit process - allow app to run in read-only mode
});

// Connection event listeners
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB reconnected');
});

// ✅ FIX: Make user data available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.successMessage = req.session.successMessage || null;
  res.locals.errorMessage = req.session.errorMessage || null;
  
  // Clear flash messages after use
  if (req.session.successMessage) delete req.session.successMessage;
  if (req.session.errorMessage) delete req.session.errorMessage;
  
  next();
});

// Debug middleware (optional - remove for production)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url} | User: ${req.session.user ? req.session.user.email : 'Guest'}`);
    next();
  });
}

// Test route for Vercel health check
app.get('/test', (req, res) => {
  res.json({ 
    message: '✅ Server is working!',
    user: req.session.user ? 'Logged in' : 'Guest',
    session: req.session.id,
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint for Vercel
app.get('/health', (req, res) => {
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  };
  res.json(status);
});

// Add redirect routes for clean URLs
app.get('/login', (req, res) => {
  res.redirect('/auth/login');
});

app.get('/register', (req, res) => {
  res.redirect('/auth/register');
});

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/items', require('./routes/items'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/admin', require('./routes/admin'));
app.use('/analytics', require('./routes/analytics'));
app.use('/export', require('./routes/export'));
app.use('/claims', require('./routes/claims'));
app.use('/api/notifications', require('./routes/notifications'));

// Clear login route
app.get('/clear-login', (req, res) => {
  res.redirect('/auth/login');
});

// ✅ FIX: Global error handling
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', err.stack);
  
  // Don't crash on Vercel - render error page instead
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

// Server startup
const PORT = process.env.PORT || 3000;

// Don't listen when running on Vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Visit: http://localhost:${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📁 Views directory: ${path.join(__dirname, 'views')}`);
  });
} else {
  // Export for Vercel serverless functions
  module.exports = app;
}