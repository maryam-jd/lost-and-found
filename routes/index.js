const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const User = require('../models/User');
const Claim = require('../models/Claim');

// Home page
router.get('/', async (req, res) => {
  try {
    const recentItems = await Item.find({ status: 'available' })
      .populate('reportedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(4);
    
    // Get real statistics from database
    const totalItems = await Item.countDocuments();
    const recoveredItems = await Item.countDocuments({ status: 'returned' });
    const activeUsers = await User.countDocuments({ isVerified: true });
    const successfulClaims = await Claim.countDocuments({ status: 'approved' });
    const totalClaims = await Claim.countDocuments();
    
    // Calculate success rate
    const successRate = totalClaims > 0 ? Math.round((successfulClaims / totalClaims) * 100) : 0;
    
    // Calculate average response time (in hours)
    const avgResponseTime = await Claim.aggregate([
      {
        $match: { status: 'approved' }
      },
      {
        $project: {
          responseHours: {
            $divide: [
              { $subtract: ['$updatedAt', '$createdAt'] },
              1000 * 60 * 60 // Convert milliseconds to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgResponse: { $avg: '$responseHours' }
        }
      }
    ]);
    
    const avgResponse = avgResponseTime.length > 0 ? Math.round(avgResponseTime[0].avgResponse) : 24;

    res.render('index', { 
      title: 'Lost & Found Portal',
      user: req.session.user,
      recentItems,
      stats: {
        totalItems,
        recoveredItems,
        activeUsers,
        successRate,
        avgResponse
      }
    });
  } catch (error) {
    console.error('Home page error:', error);
    
    // Fallback stats in case of error
    res.render('index', { 
      title: 'Lost & Found Portal',
      user: req.session.user,
      recentItems: [],
      stats: {
        totalItems: 0,
        recoveredItems: 0,
        activeUsers: 0,
        successRate: 0,
        avgResponse: 24
      }
    });
  }
});

// How it works page
router.get('/how-it-works', (req, res) => {
  res.render('how-it-works', { 
    title: 'How It Works',
    user: req.session.user 
    
  });
});

module.exports = router;