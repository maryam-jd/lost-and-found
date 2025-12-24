const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['student','admin'],
    default: 'student'
  },
  universityId: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    trim: true
  },
  isVerified: {
    type: Boolean,
    default: true
  },
  verificationToken: {
    type: String
  },
  verificationTokenExpires: {
    type: Date
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  },
  isSuspended: {
    type: Boolean,
    default: false
  },
  suspensionReason: {
    type: String
  },
  suspendedAt: {
    type: Date
  },
  suspendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: {
    type: String
  },
  bannedAt: {
    type: Date
  },
  bannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  notifications: [{
    type: {
      type: String,
      enum: ['new_claim', 'claim_approved', 'claim_rejected', 'message_received'],
      required: true
    },
    message: {
      type: String,
      required: true
    },
    relatedItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item'
    },
    relatedClaim: {
      type: mongoose.Schema.Types.ObjectId
    },
    isRead: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  emailNotifications: {
    type: Boolean,
    default: true
  },
  
  //Admin action tracking
  adminActions: [{
    action: {
      type: String,
      required: true
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    targetItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item'
    },
    details: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    performedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

//Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Generate verification token
userSchema.methods.generateVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.verificationToken = token;
  this.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Add notification method
userSchema.methods.addNotification = function(notificationData) {
  this.notifications.unshift({
    type: notificationData.type,
    message: notificationData.message,
    relatedItem: notificationData.relatedItem,
    relatedClaim: notificationData.relatedClaim,
    isRead: false,
    createdAt: new Date()
  });
  
  // Keep only latest 50 notifications
  if (this.notifications.length > 50) {
    this.notifications = this.notifications.slice(0, 50);
  }
  
  return this.save();
};

//Track admin actions
userSchema.methods.addAdminAction = function(actionData) {
  this.adminActions.unshift({
    action: actionData.action,
    targetUser: actionData.targetUser,
    targetItem: actionData.targetItem,
    details: actionData.details,
    performedBy: actionData.performedBy,
    performedAt: new Date()
  });
  
  // Keep only latest 100 actions
  if (this.adminActions.length > 100) {
    this.adminActions = this.adminActions.slice(0, 100);
  }
  
  return this.save();
};

//Suspend user method
userSchema.methods.suspendUser = function(reason, suspendedBy) {
  this.isSuspended = true;
  this.suspensionReason = reason;
  this.suspendedAt = new Date();
  this.suspendedBy = suspendedBy;
  return this.save();
};

//Unsuspend user method
userSchema.methods.unsuspendUser = function() {
  this.isSuspended = false;
  this.suspensionReason = null;
  this.suspendedAt = null;
  this.suspendedBy = null;
  return this.save();
};

//Ban user method
userSchema.methods.banUser = function(reason, bannedBy) {
  this.isBanned = true;
  this.banReason = reason;
  this.bannedAt = new Date();
  this.bannedBy = bannedBy;
  return this.save();
};

//Check if user can perform actions
userSchema.methods.canPerformAction = function() {
  if (this.isBanned) {
    return { allowed: false, reason: 'Account is banned' };
  }
  if (this.isSuspended) {
    return { allowed: false, reason: 'Account is suspended' };
  }
  if (!this.isVerified) {
    return { allowed: false, reason: 'Account is not verified' };
  }
  return { allowed: true };
};

// Static method to get user statistics for admin panel
userSchema.statics.getUserStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 }
      }
    }
  ]);
};

// Static method to get users with item counts
userSchema.statics.getUsersWithItemCounts = function() {
  return this.aggregate([
    {
      $lookup: {
        from: 'items',
        localField: '_id',
        foreignField: 'reportedBy',
        as: 'userItems'
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        role: 1,
        universityId: 1,
        phone: 1,
        isVerified: 1,
        isSuspended: 1,
        suspensionReason: 1,
        suspendedAt: 1,
        isBanned: 1,
        banReason: 1,
        bannedAt: 1,
        createdAt: 1,
        itemsCount: { $size: '$userItems' }
      }
    },
    {
      $sort: { createdAt: -1 }
    }
  ]);
};

// NEW: Static method to get admin activity log
userSchema.statics.getAdminActivityLog = function(limit = 50) {
  return this.aggregate([
    {
      $match: {
        'adminActions.0': { $exists: true }
      }
    },
    {
      $unwind: '$adminActions'
    },
    {
      $sort: { 'adminActions.performedAt': -1 }
    },
    {
      $limit: limit
    },
    {
      $lookup: {
        from: 'users',
        localField: 'adminActions.performedBy',
        foreignField: '_id',
        as: 'adminUser'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'adminActions.targetUser',
        foreignField: '_id',
        as: 'targetUser'
      }
    },
    {
      $lookup: {
        from: 'items',
        localField: 'adminActions.targetItem',
        foreignField: '_id',
        as: 'targetItem'
      }
    },
    {
      $project: {
        action: '$adminActions.action',
        details: '$adminActions.details',
        performedAt: '$adminActions.performedAt',
        adminName: { $arrayElemAt: ['$adminUser.name', 0] },
        targetUserName: { $arrayElemAt: ['$targetUser.name', 0] },
        targetItemName: { $arrayElemAt: ['$targetItem.name', 0] }
      }
    }
  ]);
};

//Static method to get suspended users
userSchema.statics.getSuspendedUsers = function() {
  return this.find({
    $or: [
      { isSuspended: true },
      { isBanned: true }
    ]
  })
  .select('name email role isSuspended suspensionReason suspendedAt isBanned banReason bannedAt')
  .sort({ suspendedAt: -1 });
};

//Static method to get user activity summary
userSchema.statics.getUserActivitySummary = function(userId) {
  return this.aggregate([
    {
      $match: { _id: mongoose.Types.ObjectId(userId) }
    },
    {
      $lookup: {
        from: 'items',
        localField: '_id',
        foreignField: 'reportedBy',
        as: 'userItems'
      }
    },
    {
      $lookup: {
        from: 'claims',
        localField: '_id',
        foreignField: 'claimant',
        as: 'userClaims'
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        role: 1,
        joinedDate: '$createdAt',
        totalItems: { $size: '$userItems' },
        totalClaims: { $size: '$userClaims' },
        lostItems: {
          $size: {
            $filter: {
              input: '$userItems',
              as: 'item',
              cond: { $eq: ['$$item.type', 'lost'] }
            }
          }
        },
        foundItems: {
          $size: {
            $filter: {
              input: '$userItems',
              as: 'item',
              cond: { $eq: ['$$item.type', 'found'] }
            }
          }
        },
        successfulClaims: {
          $size: {
            $filter: {
              input: '$userClaims',
              as: 'claim',
              cond: { $eq: ['$$claim.status', 'approved'] }
            }
          }
        }
      }
    }
  ]);
};

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ universityId: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ verificationToken: 1 });
userSchema.index({ isSuspended: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ 'adminActions.performedAt': -1 });
userSchema.index({ name: 'text', email: 'text', universityId: 'text' });
userSchema.index({ createdAt: -1 });
userSchema.index({ isSuspended: 1, createdAt: -1 });
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ 'adminActions.performedAt': -1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;