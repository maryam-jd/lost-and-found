const mongoose = require('mongoose');

// Your existing Claim schema
const claimSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  claimant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  message: {
    type: String,
    required: true
  },
  proofDescription: String,
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  contactEmail: String,
  contactPhone: String,
  contactHistory: [{
    message: String,
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt: { type: Date, default: Date.now },
    emailSent: { type: Boolean, default: false }
  }],
  adminResponse: String,
  resolvedAt: Date,
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

// ============ KEEP YOUR EXISTING METHODS ============

// ============ NEW: HOOKS TO UPDATE ITEM STATS ============
// Update item stats when claim is created or updated
claimSchema.post('save', async function(doc) {
  try {
    // Update item stats asynchronously
    setTimeout(async () => {
      try {
        const Item = mongoose.models.Item || require('./Item');
        await Item.updateItemStats(doc.item);
        console.log(`📊 Updated stats for item ${doc.item}`);
      } catch (error) {
        console.log('⚠️ Could not update item stats after claim save:', error.message);
      }
    }, 100);
  } catch (error) {
    console.log('⚠️ Post-save hook error:', error.message);
  }
});

claimSchema.post('findOneAndUpdate', async function(doc) {
  try {
    if (doc && doc.item) {
      setTimeout(async () => {
        try {
          const Item = mongoose.models.Item || require('./Item');
          await Item.updateItemStats(doc.item);
        } catch (error) {
          console.log('⚠️ Could not update item stats after claim update:', error.message);
        }
      }, 100);
    }
  } catch (error) {
    console.log('⚠️ Post-update hook error:', error.message);
  }
});

claimSchema.post('findOneAndDelete', async function(doc) {
  try {
    if (doc && doc.item) {
      setTimeout(async () => {
        try {
          const Item = mongoose.models.Item || require('./Item');
          await Item.updateItemStats(doc.item);
        } catch (error) {
          console.log('⚠️ Could not update item stats after claim delete:', error.message);
        }
      }, 100);
    }
  } catch (error) {
    console.log('⚠️ Post-delete hook error:', error.message);
  }
});

// Export model
const Claim = mongoose.models.Claim || mongoose.model('Claim', claimSchema);
module.exports = Claim;