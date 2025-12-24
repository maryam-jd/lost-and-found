const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Display login page
router.get('/login', (req, res) => {
  // If user is already logged in, redirect to home
  if (req.session.user) {
    return res.redirect('/');
  }
  
  res.render('auth/login', {
    title: 'Login',
    user: null,
    error: null,
    success: req.query.success
  });
});

// Display registration page
router.get('/register', (req, res) => {
  // If user is already logged in, redirect to home
  if (req.session.user) {
    return res.redirect('/');
  }
  
  res.render('auth/register', {
    title: 'Register',
    user: null,
    error: null,
    formData: {}
  });
});

// Handle user registration
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword, universityId, phone, role } = req.body;

    // Validation
    if (!name || !email || !password || !confirmPassword || !universityId) {
      return res.render('auth/register', {
        title: 'Register',
        user: null,
        error: 'All required fields must be filled',
        formData: req.body
      });
    }

    if (password !== confirmPassword) {
      return res.render('auth/register', {
        title: 'Register',
        user: null,
        error: 'Passwords do not match',
        formData: req.body
      });
    }

    if (password.length < 6) {
      return res.render('auth/register', {
        title: 'Register',
        user: null,
        error: 'Password must be at least 6 characters long',
        formData: req.body
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { universityId: universityId }
      ]
    });

    if (existingUser) {
      return res.render('auth/register', {
        title: 'Register',
        user: null,
        error: 'User with this email or university ID already exists',
        formData: req.body
      });
    }

    // Create new user
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      universityId: universityId.trim(),
      phone: phone ? phone.trim() : '',
      role: role || 'student',
      isVerified: true // Auto-verify for now
    });

    await user.save();

    // Set success message and redirect to login
    req.session.successMessage = 'Registration successful! Please login with your credentials.';
    res.redirect('/auth/login');

  } catch (error) {
    console.error('Registration error:', error);
    
    let errorMessage = 'Registration failed. Please try again.';
    if (error.code === 11000) {
      errorMessage = 'User with this email or university ID already exists.';
    }

    res.render('auth/register', {
      title: 'Register',
      user: null,
      error: errorMessage,
      formData: req.body
    });
  }
});

// Handle user login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.render('auth/login', {
        title: 'Login',
        user: null,
        error: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      return res.render('auth/login', {
        title: 'Login',
        user: null,
        error: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = abc;
    
    if (!isPasswordValid) {
      return res.render('auth/login', {
        title: 'Login',
        user: null,
        error: 'Invalid email or password'
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.render('auth/login', {
        title: 'Login',
        user: null,
        error: 'Account not verified. Please contact administrator.'
      });
    }

    // Set user session
    req.session.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      universityId: user.universityId
    };

    // Set success message
    req.session.successMessage = `Welcome back, ${user.name}!`;

    // Redirect based on role
    if (user.role === 'admin') {
      res.redirect('/admin');
    } else {
      res.redirect('/dashboard/my-items');
    }

  } catch (error) {
    console.error('Login error:', error);
    res.render('auth/login', {
      title: 'Login',
      user: null,
      error: 'Login failed. Please try again.'
    });
  }
});

// Handle user logout (GET request)
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});
// Forgot password page
router.get('/forgot-password', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  
  res.render('auth/forgot-password', {
    title: 'Forgot Password',
    user: null,
    error: null,
    success: null
  });
});

// Handle forgot password submission
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.render('auth/forgot-password', {
        title: 'Forgot Password',
        user: null,
        error: 'Email is required',
        success: null
      });
    }

    // Check if user exists
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      // Don't reveal that user doesn't exist for security
      return res.render('auth/forgot-password', {
        title: 'Forgot Password',
        user: null,
        error: null,
        success: 'If an account exists with that email, password reset instructions have been sent.'
      });
    }

    // For now, just show success message (email service can be added later)
    res.render('auth/forgot-password', {
      title: 'Forgot Password',
      user: null,
      error: null,
      success: 'Password reset instructions have been sent to your email.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.render('auth/forgot-password', {
      title: 'Forgot Password',
      user: null,
      error: 'An error occurred. Please try again.',
      success: null
    });
  }
});
module.exports = router;