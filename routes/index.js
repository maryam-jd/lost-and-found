const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const User = require('../models/User');
const Claim = require('../models/Claim');

// Home page
router.get('/', async (req, res) => {
  try {
    // Safely fetch recent items with fallback
    const recentItems = await Item.find({ status: 'available' })
      .populate('reportedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(4)
      .catch(err => {
        console.log('Recent items fetch error:', err.message);
        return [];
      });

    // Get statistics with individual error handling
    let totalItems = 0, recoveredItems = 0, activeUsers = 0, successfulClaims = 0, totalClaims = 0;
    
    try {
      totalItems = await Item.countDocuments().catch(() => 0);
    } catch (e) { console.log('Total items error:', e.message); }
    
    try {
      recoveredItems = await Item.countDocuments({ status: 'returned' }).catch(() => 0);
    } catch (e) { console.log('Recovered items error:', e.message); }
    
    try {
      activeUsers = await User.countDocuments({ isVerified: true }).catch(() => 0);
    } catch (e) { console.log('Active users error:', e.message); }
    
    try {
      successfulClaims = await Claim.countDocuments({ status: 'approved' }).catch(() => 0);
    } catch (e) { console.log('Successful claims error:', e.message); }
    
    try {
      totalClaims = await Claim.countDocuments().catch(() => 0);
    } catch (e) { console.log('Total claims error:', e.message); }
    
    // Calculate success rate
    const successRate = totalClaims > 0 ? Math.round((successfulClaims / totalClaims) * 100) : 0;
    
    // Calculate average response time with safe fallback
    let avgResponse = 24;
    try {
      const avgResponseTime = await Claim.aggregate([
        {
          $match: { status: 'approved' }
        },
        {
          $project: {
            responseHours: {
              $divide: [
                { $subtract: ['$updatedAt', '$createdAt'] },
                1000 * 60 * 60
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
      ]).catch(() => []);
      
      avgResponse = avgResponseTime.length > 0 ? Math.round(avgResponseTime[0].avgResponse) : 24;
    } catch (e) {
      console.log('Avg response time error:', e.message);
    }

    res.render('index', { 
      title: 'Lost & Found Portal',
      user: req.session.user,
      recentItems: recentItems || [],
      stats: {
        totalItems,
        recoveredItems,
        activeUsers,
        successRate,
        avgResponse
      }
    });
  } catch (error) {
    console.error('Home page critical error:', error);
    
    // Ultimate fallback - always render the page
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