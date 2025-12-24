const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Admin middleware (same as admin.js)
const adminAuth = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    res.status(403).render('error', {
      title: 'Access Denied',
      message: 'Admin privileges required.'
    });
  }
};

// All analytics routes require admin
router.use(adminAuth);

// ==================== AGGREGATION ENDPOINTS ====================

// 1. DASHBOARD STATISTICS WITH AGGREGATION
router.get('/dashboard-stats', async (req, res) => {
  try {
    const Item = require('../models/Item');
    const Claim = require('../models/Claim');
    const User = require('../models/User');
    
    // Run multiple aggregations in parallel
    const [typeStats, statusStats, categoryStats, recentActivity] = await Promise.all([
      // Items by type (lost vs found)
      Item.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            percentage: { $avg: { $cond: [{ $eq: ['$status', 'returned'] }, 100, 0] } }
          }
        },
        { $sort: { count: -1 } }
      ]),
      
      // Items by status
      Item.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      
      // Top categories
      Item.aggregate([
        {
          $group: {
            _id: '$category',
            total: { $sum: 1 },
            returned: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
            resolutionRate: { 
              $avg: { $cond: [{ $eq: ['$status', 'returned'] }, 100, 0] } 
            }
          }
        },
        { $sort: { total: -1 } },
        { $limit: 5 }
      ]),
      
      // Recent activity (last 7 days)
      Item.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $project: {
            name: 1,
            type: 1,
            category: 1,
            status: 1,
            reportedBy: 1,
            createdAt: 1,
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
          }
        },
        { $sort: { createdAt: -1 } },
        { $limit: 10 }
      ])
    ]);
    
    // Additional simple counts (for compatibility)
    const totalItems = await Item.countDocuments();
    const totalUsers = await User.countDocuments();
    const pendingClaims = await Claim.countDocuments({ status: 'pending' });
    const resolvedItems = await Item.countDocuments({ status: 'returned' });
    
    res.json({
      success: true,
      stats: {
        typeStats,
        statusStats,
        categoryStats,
        recentActivity,
        summary: {
          totalItems,
          totalUsers,
          pendingClaims,
          resolvedItems,
          resolutionRate: totalItems > 0 ? (resolvedItems / totalItems * 100).toFixed(2) : 0
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. CATEGORY ANALYTICS WITH AGGREGATION
router.get('/category-analytics', async (req, res) => {
  try {
    const Item = require('../models/Item');
    
    const categoryStats = await Item.aggregate([
      {
        $group: {
          _id: '$category',
          totalItems: { $sum: 1 },
          lostItems: { $sum: { $cond: [{ $eq: ['$type', 'lost'] }, 1, 0] } },
          foundItems: { $sum: { $cond: [{ $eq: ['$type', 'found'] }, 1, 0] } },
          availableItems: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
          pendingItems: { $sum: { $cond: [{ $eq: ['$status', 'claim_pending'] }, 1, 0] } },
          returnedItems: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
          avgClaims: { $avg: '$stats.totalClaims' },
          // Get unique reporters count
          uniqueReporters: { $addToSet: '$reportedBy' }
        }
      },
      {
        $project: {
          category: '$_id',
          totalItems: 1,
          lostItems: 1,
          foundItems: 1,
          availableItems: 1,
          pendingItems: 1,
          returnedItems: 1,
          resolutionRate: {
            $multiply: [
              { $divide: ['$returnedItems', '$totalItems'] },
              100
            ]
          },
          avgClaims: { $round: ['$avgClaims', 2] },
          uniqueReporters: { $size: '$uniqueReporters' }
        }
      },
      { $sort: { totalItems: -1 } }
    ]);
    
    res.json({
      success: true,
      categoryStats
    });
    
  } catch (error) {
    console.error('❌ Category analytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. USER ACTIVITY REPORT
router.get('/user-activity', async (req, res) => {
  try {
    const Item = require('../models/Item');
    const Claim = require('../models/Claim');
    const User = require('../models/User');
    
    // Get top active users
    const activeUsers = await Item.aggregate([
      {
        $group: {
          _id: '$reportedBy',
          itemsReported: { $sum: 1 },
          itemsReturned: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
          lastActivity: { $max: '$createdAt' },
          categories: { $addToSet: '$category' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          userId: '$_id',
          userName: '$userInfo.name',
          userEmail: '$userInfo.email',
          userRole: '$userInfo.role',
          itemsReported: 1,
          itemsReturned: 1,
          resolutionRate: {
            $multiply: [
              { $divide: ['$itemsReturned', '$itemsReported'] },
              100
            ]
          },
          categoriesCount: { $size: '$categories' },
          lastActivity: 1,
          daysSinceLastActivity: {
            $divide: [
              { $subtract: [new Date(), '$lastActivity'] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      },
      { $sort: { itemsReported: -1 } },
      { $limit: 20 }
    ]);
    
    res.json({
      success: true,
      activeUsers,
      totalUsers: await User.countDocuments(),
      avgItemsPerUser: activeUsers.length > 0 
        ? (activeUsers.reduce((sum, user) => sum + user.itemsReported, 0) / activeUsers.length).toFixed(2)
        : 0
    });
    
  } catch (error) {
    console.error('❌ User activity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. TIME-BASED ANALYTICS (Daily/Weekly/Monthly)
router.get('/time-analytics/:period?', async (req, res) => {
  try {
    const period = req.params.period || 'monthly'; // daily, weekly, monthly
    const Item = require('../models/Item');
    const Claim = require('../models/Claim');
    
    let groupFormat;
    switch (period) {
      case 'daily':
        groupFormat = "%Y-%m-%d";
        break;
      case 'weekly':
        groupFormat = "%Y-%U"; // Year-Week number
        break;
      case 'monthly':
      default:
        groupFormat = "%Y-%m";
    }
    
    const timeStats = await Item.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: groupFormat, date: "$createdAt" }
          },
          date: { $first: "$createdAt" },
          totalItems: { $sum: 1 },
          lostItems: { $sum: { $cond: [{ $eq: ['$type', 'lost'] }, 1, 0] } },
          foundItems: { $sum: { $cond: [{ $eq: ['$type', 'found'] }, 1, 0] } },
          returnedItems: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
          avgResolutionTime: {
            $avg: {
              $cond: [
                { $and: [{ $ne: ['$resolvedDate', null] }, { $ne: ['$createdAt', null] }] },
                { $divide: [{ $subtract: ['$resolvedDate', '$createdAt'] }, 1000 * 60 * 60 * 24] },
                null
              ]
            }
          }
        }
      },
      {
        $project: {
          period: '$_id',
          date: 1,
          totalItems: 1,
          lostItems: 1,
          foundItems: 1,
          returnedItems: 1,
          resolutionRate: {
            $multiply: [
              { $divide: ['$returnedItems', '$totalItems'] },
              100
            ]
          },
          avgResolutionTime: { $round: ['$avgResolutionTime', 2] }
        }
      },
      { $sort: { date: 1 } }
    ]);
    
    // Get claims over time
    const claimStats = await Claim.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: groupFormat, date: "$createdAt" }
          },
          totalClaims: { $sum: 1 },
          approvedClaims: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          pendingClaims: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          approvalRate: {
            $avg: { $cond: [{ $eq: ['$status', 'approved'] }, 100, 0] }
          }
        }
      },
      {
        $project: {
          period: '$_id',
          totalClaims: 1,
          approvedClaims: 1,
          pendingClaims: 1,
          approvalRate: { $round: ['$approvalRate', 2] }
        }
      },
      { $sort: { period: 1 } }
    ]);
    
    res.json({
      success: true,
      period,
      itemStats: timeStats,
      claimStats,
      summary: {
        totalPeriods: timeStats.length,
        avgItemsPerPeriod: timeStats.length > 0 
          ? (timeStats.reduce((sum, stat) => sum + stat.totalItems, 0) / timeStats.length).toFixed(2)
          : 0,
        avgResolutionRate: timeStats.length > 0
          ? (timeStats.reduce((sum, stat) => sum + (stat.resolutionRate || 0), 0) / timeStats.length).toFixed(2)
          : 0
      }
    });
    
  } catch (error) {
    console.error('❌ Time analytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. SEARCH ANALYTICS (Popular searches)
router.get('/search-analytics', async (req, res) => {
  try {
    const Item = require('../models/Item');
    
    // Get popular search tags from embedded data
    const tagStats = await Item.aggregate([
      { $unwind: '$searchTags' },
      {
        $group: {
          _id: '$searchTags',
          count: { $sum: 1 },
          items: { $push: { name: '$name', id: '$_id' } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    
    // Get popular categories
    const popularCategories = await Item.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          items: { $push: '$name' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Get items with most claims
    const popularItems = await Item.aggregate([
      {
        $match: { 'stats.totalClaims': { $gt: 0 } }
      },
      {
        $project: {
          name: 1,
          category: 1,
          type: 1,
          status: 1,
          totalClaims: '$stats.totalClaims',
          pendingClaims: '$stats.pendingClaims',
          createdAt: 1
        }
      },
      { $sort: { totalClaims: -1 } },
      { $limit: 10 }
    ]);
    
    res.json({
      success: true,
      tagStats,
      popularCategories,
      popularItems
    });
    
  } catch (error) {
    console.error('❌ Search analytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. EMBEDDED DATA HEALTH CHECK
router.get('/embedded-health', async (req, res) => {
  try {
    const Item = require('../models/Item');
    
    const healthStats = await Item.aggregate([
      {
        $facet: {
          // Items with embedded data
          withEmbedded: [
            {
              $match: {
                $or: [
                  { 'reporterInfo.name': { $exists: true, $ne: null } },
                  { 'stats.totalClaims': { $exists: true } }
                ]
              }
            },
            { $count: 'count' }
          ],
          
          // Items without embedded data
          withoutEmbedded: [
            {
              $match: {
                $and: [
                  { 'reporterInfo.name': { $exists: false } },
                  { 'stats.totalClaims': { $exists: false } }
                ]
              }
            },
            { $count: 'count' }
          ],
          
          // Stats completeness
          statsCompleteness: [
            {
              $group: {
                _id: null,
                totalItems: { $sum: 1 },
                withReporterInfo: { $sum: { $cond: [{ $and: ['$reporterInfo.name', '$reporterInfo.email'] }, 1, 0] } },
                withStats: { $sum: { $cond: [{ $and: ['$stats.totalClaims', '$stats.lastUpdated'] }, 1, 0] } },
                withRecentClaim: { $sum: { $cond: ['$recentClaim.claimantName', 1, 0] } },
                withSearchTags: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$searchTags', []] } }, 0] }, 1, 0] } }
              }
            }
          ]
        }
      }
    ]);
    
    const result = healthStats[0];
    
    res.json({
      success: true,
      health: {
        withEmbedded: result.withEmbedded[0]?.count || 0,
        withoutEmbedded: result.withoutEmbedded[0]?.count || 0,
        completeness: result.statsCompleteness[0] || {},
        percentage: {
          reporterInfo: result.statsCompleteness[0] 
            ? (result.statsCompleteness[0].withReporterInfo / result.statsCompleteness[0].totalItems * 100).toFixed(2)
            : 0,
          stats: result.statsCompleteness[0]
            ? (result.statsCompleteness[0].withStats / result.statsCompleteness[0].totalItems * 100).toFixed(2)
            : 0
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. SIMPLE API TEST ENDPOINT
router.get('/test', async (req, res) => {
  try {
    const Item = require('../models/Item');
    
    // Simple aggregation to test
    const testResult = await Item.aggregate([
      { $match: {} },
      { $sample: { size: 5 } },
      {
        $project: {
          name: 1,
          type: 1,
          category: 1,
          status: 1,
          'reporterInfo.name': 1,
          'stats.totalClaims': 1,
          'recentClaim.claimantName': 1
        }
      }
    ]);
    
    res.json({
      success: true,
      message: 'Analytics API is working!',
      sampleData: testResult,
      endpoints: [
        '/analytics/dashboard-stats',
        '/analytics/category-analytics',
        '/analytics/user-activity',
        '/analytics/time-analytics/:period',
        '/analytics/search-analytics',
        '/analytics/embedded-health',
        '/analytics/test'
      ]
    });
    
  } catch (error) {
    console.error('❌ Test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;








