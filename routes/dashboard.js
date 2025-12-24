const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const Claim = require('../models/Claim');

// Main Dashboard Route - FIXED to show proper dashboard
router.get('/', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/auth/login');
    }

    // Get user's stats
    const userItemsCount = await Item.countDocuments({ reportedBy: req.session.user._id });
    const userClaimsCount = await Claim.countDocuments({ claimant: req.session.user._id });
    const recentItems = await Item.find({ reportedBy: req.session.user._id })
      .sort({ createdAt: -1 })
      .limit(3);

    res.render('dashboard/index', {
      title: 'Dashboard',
      user: req.session.user,
      activeTab: 'dashboard', // ADD THIS LINE
      stats: {
        itemsCount: userItemsCount,
        claimsCount: userClaimsCount
      },
      recentItems: recentItems || []
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('dashboard/index', {
      title: 'Dashboard',
      user: req.session.user,
      activeTab: 'dashboard', // ADD THIS LINE
      stats: {
        itemsCount: 0,
        claimsCount: 0
      },
      recentItems: []
    });
  }
});

// My Items route
router.get('/my-items', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/auth/login');
    }

    const userItems = await Item.find({ reportedBy: req.session.user._id })
      .sort({ createdAt: -1 });

    res.render('dashboard/my-items', {
      title: 'My Items',
      user: req.session.user,
      activeTab: 'my-items',
      userItems: userItems || []
    });
  } catch (error) {
    console.error('My items error:', error);
    res.render('dashboard/my-items', {
      title: 'My Items',
      user: req.session.user,
      activeTab: 'my-items',
      userItems: []
    });
  }
});

// My Claims route
router.get('/my-claims', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/auth/login');
    }

    let userClaims = [];
    try {
      userClaims = await Claim.find({ claimant: req.session.user._id })
        .populate('item')
        .sort({ createdAt: -1 });
    } catch (dbError) {
      console.log('Claims collection might not exist yet:', dbError.message);
    }

    res.render('dashboard/my-claims', {
      title: 'My Claims',
      user: req.session.user,
      activeTab: 'my-claims',
      userClaims: userClaims || []
    });
  } catch (error) {
    console.error('My claims error:', error);
    res.render('dashboard/my-claims', {
      title: 'My Claims',
      user: req.session.user,
      activeTab: 'my-claims',
      userClaims: []
    });
  }
});

module.exports = router;