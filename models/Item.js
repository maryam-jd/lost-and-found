const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  // ============ YOUR EXISTING FIELDS (KEEP THESE) ============
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['lost', 'found'],
    required: true
  },
  category: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['available', 'claim_pending', 'returned'],
    default: 'available'
  },
  location: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  contactInfo: {
    email: String,
    phone: String
  },
  // KEEP THIS - Existing reference
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  claimedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedDate: Date,
  
  // ============ NEW: EMBEDDED FIELDS (ADD THESE) ============
  // Embedded reporter info for faster access
  reporterInfo: {
    name: String,
    email: String,
    role: String,
    universityId: String
  },
  
  // Embedded quick stats (denormalized)
  stats: {
    totalClaims: { type: Number, default: 0 },
    pendingClaims: { type: Number, default: 0 },
    approvedClaims: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  
  // Recent claim summary (embedded)
  recentClaim: {
    claimantName: String,
    claimedAt: Date,
    status: String,
    message: String
  },
  
  // Tags for better search (embedded array)
  searchTags: [String]
  
}, {
  timestamps: true  // Keep this if you have it
});

// ============ KEEP ALL YOUR EXISTING METHODS ============

// ============ NEW: EMBEDDING MIDDLEWARE ============
// Auto-populate embedded data when item is saved
itemSchema.pre('save', async function(next) {
  // Only run if this is a new item or reporter changed
  if (this.isNew || this.isModified('reportedBy')) {
    try {
      // Safely require models
      const User = mongoose.models.User || require('./User');
      
      // Get reporter info
      const reporter = await User.findById(this.reportedBy)
        .select('name email role universityId')
        .lean();
      
      if (reporter) {
        // Populate embedded reporter info
        this.reporterInfo = {
          name: reporter.name,
          email: reporter.email,
          role: reporter.role,
          universityId: reporter.universityId || ''
        };
      }
    } catch (error) {
      console.log('📝 Note: Could not populate reporter info:', error.message);
      // Don't stop save operation if embedding fails
    }
  }
  
  // Generate search tags from name and description
  if (this.isModified('name') || this.isModified('description') || this.isNew) {
    const tags = [];
    if (this.name) {
      tags.push(...this.name.toLowerCase().split(' ').filter(t => t.length > 2));
    }
    if (this.description) {
      tags.push(...this.description.toLowerCase().split(' ').filter(t => t.length > 2));
    }
    // Remove duplicates
    this.searchTags = [...new Set(tags)].slice(0, 10);
  }
  
  next();
});

// After saving, update stats from claims
itemSchema.post('save', async function(doc) {
  try {
    // Update stats asynchronously (don't block save)
    setTimeout(async () => {
      try {
        const Item = mongoose.models.Item || require('./Item');
        const Claim = mongoose.models.Claim || require('./Claim');
        const User = mongoose.models.User || require('./User');
        
        const claims = await Claim.find({ item: doc._id });
        
        // Update stats
        doc.stats = {
          totalClaims: claims.length,
          pendingClaims: claims.filter(c => c.status === 'pending').length,
          approvedClaims: claims.filter(c => c.status === 'approved').length,
          lastUpdated: new Date()
        };
        
        // Update recent claim
        const recent = claims.sort((a, b) => b.createdAt - a.createdAt)[0];
        if (recent) {
          const claimant = await User.findById(recent.claimant).select('name').lean();
          doc.recentClaim = {
            claimantName: claimant ? claimant.name : 'Unknown',
            claimedAt: recent.createdAt,
            status: recent.status,
            message: recent.message ? recent.message.substring(0, 50) + '...' : ''
          };
        }
        
        // Save without triggering hooks again
        await Item.findByIdAndUpdate(doc._id, {
          stats: doc.stats,
          recentClaim: doc.recentClaim
        });
        
      } catch (error) {
        console.log('📊 Could not update item stats:', error.message);
      }
    }, 100); // Small delay
  } catch (error) {
    console.log('⚠️ Post-save error:', error.message);
  }
});

// Static method to update stats for an item
itemSchema.statics.updateItemStats = async function(itemId) {
  try {
    const Claim = mongoose.models.Claim || require('./Claim');
    const User = mongoose.models.User || require('./User');
    
    const claims = await Claim.find({ item: itemId });
    
    const stats = {
      totalClaims: claims.length,
      pendingClaims: claims.filter(c => c.status === 'pending').length,
      approvedClaims: claims.filter(c => c.status === 'approved').length,
      lastUpdated: new Date()
    };
    
    // Get recent claim
    let recentClaim = null;
    const recent = claims.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (recent) {
      const claimant = await User.findById(recent.claimant).select('name').lean();
      recentClaim = {
        claimantName: claimant ? claimant.name : 'Unknown',
        claimedAt: recent.createdAt,
        status: recent.status,
        message: recent.message ? recent.message.substring(0, 50) + '...' : ''
      };
    }
    
    // Update item
    await this.findByIdAndUpdate(itemId, {
      stats,
      recentClaim
    });
    
    return { stats, recentClaim };
  } catch (error) {
    console.error('❌ Error updating item stats:', error);
    throw error;
  }
};

// ============ KEEP EXISTING INDEXES AND VIRTUALS ============
// Add text index for searchTags
itemSchema.index({ searchTags: 1 });
itemSchema.index({ 'reporterInfo.name': 1 });
itemSchema.index({ 'stats.totalClaims': -1 });

// Export model (keep existing export)
const Item = mongoose.models.Item || mongoose.model('Item', itemSchema);
module.exports = Item;