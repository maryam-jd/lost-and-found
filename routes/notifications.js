const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Get user notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    const user = await User.findById(userId)
      .populate('notifications.relatedItem', 'name type category')
      .select('notifications');
    
    res.json({
      success: true,
      notifications: user.notifications,
      unreadCount: user.notifications.filter(n => !n.isRead).length
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Mark all notifications as read
router.put('/read', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    await User.findByIdAndUpdate(userId, {
      $set: { 'notifications.$[].isRead': true }
    });
    
    res.json({ 
      success: true,
      message: 'All notifications marked as read' 
    });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Mark single notification as read
router.put('/:notificationId/read', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { notificationId } = req.params;
    
    const user = await User.findById(userId);
    const notification = user.notifications.id(notificationId);
    
    if (notification) {
      notification.isRead = true;
      await user.save();
    }
    
    res.json({ 
      success: true,
      message: 'Notification marked as read' 
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Clear all notifications
router.delete('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    await User.findByIdAndUpdate(userId, {
      $set: { notifications: [] }
    });
    
    res.json({ 
      success: true,
      message: 'All notifications cleared' 
    });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

module.exports = router;