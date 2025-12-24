const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const Claim = require('../models/Claim');
const User = require('../models/User');
const Category = require('../models/Category');
const { sendClaimContactEmail, sendClaimNotificationEmail } = require('../utils/emailService');

// Middleware to check if user is authenticated
// Simple requireAuth middleware if not already defined
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
};

// Items list page with search and filters - FIXED SEARCH
router.get('/', async (req, res) => {
  try {
    const { 
      search, 
      category, 
      type, 
      status
    } = req.query;
    
    let query = {};
    
    // FIXED: Text search without aggregation
    if (search && search.trim() !== '') {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Other filters
    if (category && category !== 'all') query.category = category;
    if (type && type !== 'all') query.type = type;
    if (status && status !== 'all') query.status = status;

    const items = await Item.find(query)
      .populate('reportedBy', 'name')
      .sort({ createdAt: -1 });

    res.render('items/list', {
      title: 'Browse Items',
      user: req.session.user,
      items,
      search: search || '',
      selectedCategory: category || 'all',
      selectedType: type || 'all',
      selectedStatus: status || 'all',
      activeTab: req.session.user ? 'all-items' : null
    });

  } catch (error) {
    console.error('Items list error:', error);
    res.render('items/list', {
      title: 'Browse Items',
      user: req.session.user,
      items: [],
      search: '',
      selectedCategory: 'all',
      selectedType: 'all',
      selectedStatus: 'all',
      activeTab: req.session.user ? 'all-items' : null
    });
  }
});

// Report lost item page 
router.get('/report-lost', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  
  try {
    // Fetch categories from database
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    
    res.render('items/report-lost', {
      title: 'Report Lost Item',
      user: req.session.user,
      activeTab: 'report-lost',
      categories: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.render('items/report-lost', {
      title: 'Report Lost Item',
      user: req.session.user,
      activeTab: 'report-lost',
      categories: [] // Fallback to empty array
    });
  }
});

// Report found item page 
router.get('/report-found', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  
  try {
    // Fetch categories from database
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    
    res.render('items/report-found', {
      title: 'Report Found Item',
      user: req.session.user,
      activeTab: 'report-found',
      categories: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.render('items/report-found', {
      title: 'Report Found Item',
      user: req.session.user,
      activeTab: 'report-found',
      categories: [] // Fallback to empty array
    });
  }
});
// Handle lost item report submission
router.post('/report-lost', requireAuth, async (req, res) => {
  try {
    const { itemName, category, description, location, date, contactEmail, contactPhone } = req.body;
    
    console.log('📝 Report Lost Form Data:', req.body);
    
    // Validation
    if (!itemName || !category || !description || !location || !date) {
      return res.render('items/report-lost', {
        title: 'Report Lost Item',
        user: req.session.user,
        error: 'All required fields must be filled',
        formData: req.body,
        activeTab: 'report-lost'
      });
    }

    const item = new Item({
      name: itemName,
      category,
      description,
      type: 'lost',
      location,
      date: new Date(date),
      contactInfo: {
        email: contactEmail || req.session.user.email,
        phone: contactPhone
      },
      reportedBy: req.session.user._id
    });

    console.log('💾 Saving lost item:', item);
    
    await item.save();
    
    console.log('✅ Lost item saved successfully, ID:', item._id);
    
    req.session.successMessage = 'Lost item reported successfully!';
    res.redirect('/dashboard');

  } catch (error) {
    console.error('❌ Report lost error:', error);
    res.render('items/report-lost', {
      title: 'Report Lost Item',
      user: req.session.user,
      error: 'Failed to report lost item. Please try again.',
      formData: req.body,
      activeTab: 'report-lost'
    });
  }
});

// Handle found item report submission - UPDATED REDIRECT
router.post('/report-found', requireAuth, async (req, res) => {
  try {
    const { itemName, category, description, location, date, contactEmail, contactPhone } = req.body;
    
    console.log('📝 Report Found Form Data:', req.body);
    
    // Validation
    if (!itemName || !category || !description || !location || !date) {
      return res.render('items/report-found', {
        title: 'Report Found Item',
        user: req.session.user,
        error: 'All required fields must be filled',
        formData: req.body,
        activeTab: 'report-found'
      });
    }

    const item = new Item({
      name: itemName,
      category,
      description,
      type: 'found',
      location,
      date: new Date(date),
      contactInfo: {
        email: contactEmail || req.session.user.email,
        phone: contactPhone
      },
      reportedBy: req.session.user._id
    });

    console.log('Saving found item:', item);
    
    await item.save();
    
    console.log(' Found item saved successfully, ID:', item._id);
    
    req.session.successMessage = 'Found item reported successfully!';
    res.redirect('/dashboard');

  } catch (error) {
    console.error(' Report found error:', error);
    res.render('items/report-found', {
      title: 'Report Found Item',
      user: req.session.user,
      error: 'Failed to report found item. Please try again.',
      formData: req.body,
      activeTab: 'report-found'
    });
  }
});

// Item details page - FIXED WITH CLAIM FORM
router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('reportedBy', 'name email');

    if (!item) {
      return res.status(404).render('error', {
        title: 'Item Not Found',
        message: 'The item you are looking for does not exist.',
        user: req.session.user
      });
    }

    // Get similar items
    const similarItems = await Item.find({
      _id: { $ne: item._id },
      category: item.category,
      status: 'available'
    })
    .populate('reportedBy', 'name')
    .limit(4)
    .sort({ createdAt: -1 });

    // Get claim history for this item - FIXED: Added error handling for missing Claim model
    let claimHistory = [];
    try {
      claimHistory = await Claim.find({ item: item._id })
        .populate('claimant', 'name')
        .sort({ createdAt: -1 })
        .limit(5);
    } catch (claimError) {
      console.log('Claim history not available:', claimError.message);
    }

    res.render('items/details', {
      title: item.name,
      user: req.session.user,
      item,
      similarItems,
      claimHistory,
      success: req.query.success,
      error: req.query.error,
      activeTab: req.session.user ? 'all-items' : null
    });

  } catch (error) {
    console.error('Item details error:', error);
    // FIXED: Check for CastError (invalid ID format)
    if (error.name === 'CastError') {
      return res.status(404).render('error', {
        title: 'Item Not Found',
        message: 'The item you are looking for does not exist.',
        user: req.session.user
      });
    }
    res.status(500).render('error', {
      title: 'Error',
      message: 'Something went wrong while loading the item.',
      user: req.session.user
    });
  }
});

// FIXED: Claim route with better error handling and validation
router.post('/:id/claim', requireAuth, async (req, res) => {
  try {
    const { message, proofDescription, contactEmail, contactPhone } = req.body;
    const itemId = req.params.id;
    const userId = req.session.user._id;

    console.log('📝 Claim submission:', { itemId, userId, message });

    // Validate required fields
    if (!message || message.trim() === '') {
      return res.redirect(`/items/${itemId}?error=claim_message_required`);
    }

    // FIXED: Validate item ID format
    if (!itemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.redirect('/items?error=invalid_item_id');
    }

    const item = await Item.findById(itemId).populate('reportedBy');
    
    if (!item) {
      return res.redirect(`/items/${itemId}?error=item_not_found`);
    }

    // Check if user is the item owner
    if (item.reportedBy && item.reportedBy._id.toString() === userId.toString()) {
      return res.redirect(`/items/${itemId}?error=cannot_claim_own_item`);
    }

    // Check if item is available
    if (item.status !== 'available') {
      return res.redirect(`/items/${itemId}?error=item_not_available`);
    }

    // Check if user already claimed this item
    const existingUserClaim = await Claim.findOne({
      item: itemId,
      claimant: userId,
      status: 'pending'
    });

    if (existingUserClaim) {
      return res.redirect(`/items/${itemId}?error=already_claimed`);
    }

    //  Create claim with all required fields and proper validation
    const claimData = {
      item: itemId,
      claimant: userId,
      message: message.trim(),
      proofDescription: proofDescription || 'No additional proof provided',
      contactEmail: contactEmail || req.session.user.email,
      status: 'pending'
    };

    // Add owner field if item has a reportedBy
    if (item.reportedBy && item.reportedBy._id) {
      claimData.owner = item.reportedBy._id;
    }

    // Add phone if provided
    if (contactPhone) {
      claimData.contactPhone = contactPhone;
    }

    const claim = new Claim(claimData);
    await claim.save();

    // Update item status to show it has pending claims
    if (item.status === 'available') {
      item.status = 'claim_pending';
      await item.save();
    }

    // NOTIFY THE ITEM OWNER - FIXED: Added null checks
    try {
      if (item.reportedBy && item.reportedBy.email) {
        // Send email notification to item owner
        await sendClaimNotificationEmail({
          to: item.reportedBy.email,
          ownerName: item.reportedBy.name || 'Item Owner',
          itemName: item.name,
          itemType: item.type,
          claimantName: req.session.user.name,
          claimMessage: message,
          itemId: item._id
        });

        // Add notification to user if method exists
        const itemOwner = await User.findById(item.reportedBy._id);
        if (itemOwner && typeof itemOwner.addNotification === 'function') {
          await itemOwner.addNotification({
            type: 'new_claim',
            message: `Someone claimed your ${item.type} item: "${item.name}"`,
            relatedItem: itemId,
            relatedClaim: claim._id
          });
          console.log(' Notification sent to item owner');
        }
      }
    } catch (notifyError) {
      console.log(' Could not send notification:', notifyError.message);
    }

    console.log(` Claim submitted successfully. Claim ID: ${claim._id}`);
    
    res.redirect(`/items/${itemId}?success=claim_submitted`);

  } catch (error) {
    console.error(' Claim error:', error);
    //  Check for CastError
    if (error.name === 'CastError') {
      return res.redirect('/items?error=invalid_item_id');
    }
    res.redirect(`/items/${req.params.id}?error=claim_failed`);
  }
});

// Route for item owner to view claims on their item - FIXED: Added validation
// View claims for a specific item (for item owner) - FIXED VERSION
router.get('/:id/claims', async (req, res) => {
    try {
        console.log(' Loading claims for item:', req.params.id);
        console.log(' Current user:', req.session.user ? req.session.user._id : 'No user');
        
        if (!req.session.user) {
            req.session.errorMessage = 'Please login to view claims';
            return res.redirect('/auth/login');
        }
        
        const itemId = req.params.id;
        
        // Find the item with reportedBy populated
        const item = await Item.findById(itemId)
            .populate('reportedBy', 'name email')
            .lean();
        
        console.log(' Item found:', item ? 'Yes' : 'No');
        
        if (!item) {
            return res.status(404).render('error', {
                title: 'Item Not Found',
                message: 'The item you are looking for does not exist.',
                user: req.session.user
            });
        }
        
        // Check if current user is the item owner
        console.log('🔍 Checking ownership:');
        console.log('   Item owner:', item.reportedBy ? item.reportedBy._id : 'No owner');
        console.log('   Current user:', req.session.user._id);
        
        if (!item.reportedBy || item.reportedBy._id.toString() !== req.session.user._id.toString()) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You can only view claims for your own items.',
                user: req.session.user
            });
        }
        
        // Find claims for this specific item
        let claims = [];
        try {
            claims = await Claim.find({ item: itemId })
                .populate('claimant', 'name email universityId')
                .sort({ createdAt: -1 })
                .lean();
            
            console.log('📋 Claims found:', claims.length);
        } catch (claimError) {
            console.log('⚠️ No claims found or Claim model not available:', claimError.message);
            claims = [];
        }
        
        res.render('items/item-claims', {
            title: 'Claims for ' + item.name,
            user: req.session.user,
            item: item,
            claims: claims,
            activeTab: 'my-items'
        });
        
    } catch (error) {
        console.error('❌ Item claims error:', error);
        console.error('❌ Error stack:', error.stack);
        
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error loading claims for this item: ' + error.message,
            user: req.session.user
        });
    }
});


// Route for owner to approve a claim 
router.post('/:itemId/claims/:claimId/approve', requireAuth, async (req, res) => {
  try {
    const { itemId, claimId } = req.params;
    
    //Validate IDs format
    if (!itemId.match(/^[0-9a-fA-F]{24}$/) || !claimId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.redirect('/dashboard?error=invalid_id_format');
    }

    const item = await Item.findById(itemId);
    const claim = await Claim.findById(claimId).populate('claimant');
    
    // Verify ownership and claim exists
    if (!item || !claim || item.reportedBy.toString() !== req.session.user._id.toString()) {
      return res.redirect('/dashboard?error=invalid_action');
    }

    // Approve this claim
    claim.status = 'approved';
    claim.adminResponse = 'Claim approved by item owner';
    claim.resolvedAt = new Date();
    await claim.save();

    // Reject all other pending claims for this item
    await Claim.updateMany(
      { 
        item: itemId, 
        _id: { $ne: claimId }, 
        status: 'pending' 
      },
      { 
        status: 'rejected',
        adminResponse: 'Another claim was approved for this item.',
        resolvedAt: new Date()
      }
    );

    // Mark item as returned
    item.status = 'returned';
    item.claimedBy = claim.claimant._id;
    item.resolvedDate = new Date();
    await item.save();

    // NOTIFY THE CLAIMANT ABOUT APPROVAL - FIXED: Added null checks
    try {
      const claimant = await User.findById(claim.claimant._id);
      if (claimant && typeof claimant.addNotification === 'function') {
        await claimant.addNotification({
          type: 'claim_approved',
          message: `Your claim for "${item.name}" has been approved! Contact the owner to arrange pickup.`,
          relatedItem: itemId,
          relatedClaim: claimId
        });
        console.log('✅ Approval notification sent to claimant');
      }
    } catch (notifyError) {
      console.log('⚠️ Could not send approval notification:', notifyError.message);
    }

    req.session.successMessage = `Claim approved! Item marked as returned to ${claim.claimant.name}.`;
    res.redirect('/dashboard');

  } catch (error) {
    console.error('Approve claim error:', error);
    res.redirect('/dashboard?error=approve_failed');
  }
});

// Route for owner to reject a claim - FIXED: Added validation
router.post('/:itemId/claims/:claimId/reject', requireAuth, async (req, res) => {
  try {
    const { itemId, claimId } = req.params;
    const { rejectionReason } = req.body;
    
    // FIXED: Validate IDs format
    if (!itemId.match(/^[0-9a-fA-F]{24}$/) || !claimId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.redirect('/dashboard?error=invalid_id_format');
    }

    const item = await Item.findById(itemId);
    const claim = await Claim.findById(claimId).populate('claimant');
    
    // Verify ownership and claim exists
    if (!item || !claim || item.reportedBy.toString() !== req.session.user._id.toString()) {
      return res.redirect('/dashboard?error=invalid_action');
    }

    // Reject this claim
    claim.status = 'rejected';
    claim.adminResponse = rejectionReason || 'Claim rejected by item owner.';
    claim.resolvedAt = new Date();
    await claim.save();

    // NOTIFY THE CLAIMANT ABOUT REJECTION - FIXED: Added null checks
    try {
      const claimant = await User.findById(claim.claimant._id);
      if (claimant && typeof claimant.addNotification === 'function') {
        await claimant.addNotification({
          type: 'claim_rejected',
          message: `Your claim for "${item.name}" has been rejected.`,
          relatedItem: itemId,
          relatedClaim: claimId
        });
        console.log('✅ Rejection notification sent to claimant');
      }
    } catch (notifyError) {
      console.log('⚠️ Could not send rejection notification:', notifyError.message);
    }

    // If this was the only claim, set item back to available
    const pendingClaimsCount = await Claim.countDocuments({
      item: itemId,
      status: 'pending'
    });

    if (pendingClaimsCount === 0) {
      item.status = 'available';
      await item.save();
    }

    req.session.successMessage = 'Claim rejected successfully.';
    res.redirect(`/items/${itemId}/claims`);

  } catch (error) {
    console.error('Reject claim error:', error);
    res.redirect('/dashboard?error=reject_failed');
  }
});

// Contact claimant via email - FIXED: Added validation and error handling
router.post('/:itemId/claims/:claimId/contact', requireAuth, async (req, res) => {
  try {
    const { itemId, claimId } = req.params;
    const { message } = req.body;
    const userId = req.session.user._id;

    console.log('📧 Contact claimant request:', { itemId, claimId, userId });

    // FIXED: Validate IDs format
    if (!itemId.match(/^[0-9a-fA-F]{24}$/) || !claimId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.redirect('/dashboard?error=invalid_id_format');
    }

    // Validate message
    if (!message || message.trim() === '') {
      return res.redirect(`/items/${itemId}/claims?error=message_required`);
    }

    // Find item and claim
    const item = await Item.findById(itemId);
    const claim = await Claim.findById(claimId).populate('claimant');
    
    if (!item || !claim) {
      return res.redirect('/dashboard?error=item_or_claim_not_found');
    }

    // Verify current user is the item owner
    if (item.reportedBy.toString() !== userId.toString()) {
      return res.redirect('/dashboard?error=not_authorized');
    }

    // Verify claim belongs to this item
    if (claim.item.toString() !== itemId) {
      return res.redirect('/dashboard?error=invalid_claim');
    }

    // Get claimant user details
    const claimant = await User.findById(claim.claimant._id);
    
    if (!claimant) {
      return res.redirect('/dashboard?error=claimant_not_found');
    }

    // Send email to claimant - FIXED: Added error handling for email service
    let emailResult = { success: false };
    try {
      emailResult = await sendClaimContactEmail({
        to: claimant.email,
        from: req.session.user.email,
        itemName: item.name,
        ownerName: req.session.user.name,
        message: message,
        itemId: itemId
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      emailResult = { success: false, error: emailError.message };
    }

    // Update claim status and add contact history
    claim.contactStatus = 'contacted';
    claim.contactHistory = claim.contactHistory || [];
    claim.contactHistory.push({
      message: message,
      sentBy: userId,
      sentAt: new Date(),
      emailSent: emailResult.success
    });
    await claim.save();

    // NOTIFY THE CLAIMANT - FIXED: Added null checks
    try {
      if (claimant && typeof claimant.addNotification === 'function') {
        await claimant.addNotification({
          type: 'message_received',
          message: `The owner of "${item.name}" sent you a message about your claim`,
          relatedItem: itemId,
          relatedClaim: claimId
        });
        console.log('✅ Notification sent to claimant:', claimant.email);
      }
    } catch (notifyError) {
      console.log('⚠️ Could not send notification:', notifyError.message);
    }

    if (emailResult.success) {
      req.session.successMessage = `Message sent to ${claimant.name} successfully!`;
    } else {
      req.session.warningMessage = `Contact recorded, but email failed to send. Claimant email: ${claimant.email}`;
    }

    res.redirect(`/items/${itemId}/claims`);

  } catch (error) {
    console.error('❌ Contact claimant error:', error);
    res.redirect('/dashboard?error=contact_failed');
  }
});

// Mark item as returned - FIXED: Added validation
router.post('/:itemId/claims/:claimId/return', requireAuth, async (req, res) => {
  try {
    const { itemId, claimId } = req.params;
    const userId = req.session.user._id;

    console.log('🏷️ Mark as returned request:', { itemId, claimId, userId });

    // FIXED: Validate IDs format
    if (!itemId.match(/^[0-9a-fA-F]{24}$/) || !claimId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.redirect('/dashboard?error=invalid_id_format');
    }

    // Find item and claim
    const item = await Item.findById(itemId);
    const claim = await Claim.findById(claimId).populate('claimant');
    
    if (!item || !claim) {
      return res.redirect('/dashboard?error=item_or_claim_not_found');
    }

    // Verify current user is the item owner
    if (item.reportedBy.toString() !== userId.toString()) {
      return res.redirect('/dashboard?error=not_authorized');
    }

    // Verify claim belongs to this item
    if (claim.item.toString() !== itemId) {
      return res.redirect('/dashboard?error=invalid_claim');
    }

    // Update claim status to approved
    claim.status = 'approved';
    claim.adminResponse = 'Item has been returned to claimant';
    claim.resolvedAt = new Date();
    await claim.save();

    // Update item status to returned and set claimedBy
    item.status = 'returned';
    item.claimedBy = claim.claimant._id;
    item.resolvedDate = new Date();
    await item.save();

    // Reject all other pending claims for this item
    await Claim.updateMany(
      { 
        item: itemId, 
        _id: { $ne: claimId }, 
        status: 'pending' 
      },
      { 
        status: 'rejected',
        adminResponse: 'Item has been returned to another claimant.',
        resolvedAt: new Date()
      }
    );

    // NOTIFY THE CLAIMANT ABOUT SUCCESSFUL RETURN - FIXED: Added null checks
    try {
      const claimant = await User.findById(claim.claimant._id);
      if (claimant && typeof claimant.addNotification === 'function') {
        await claimant.addNotification({
          type: 'claim_approved',
          message: `Your claim for "${item.name}" has been approved! The item has been marked as returned.`,
          relatedItem: itemId,
          relatedClaim: claimId
        });
        console.log('✅ Return notification sent to claimant:', claimant.email);
      }
    } catch (notifyError) {
      console.log('⚠️ Could not send return notification:', notifyError.message);
    }

    req.session.successMessage = `Item marked as returned to ${claim.claimant.name}!`;
    res.redirect('/dashboard');

  } catch (error) {
    console.error('❌ Mark as returned error:', error);
    res.redirect('/dashboard?error=return_failed');
  }
});
// View claims for a specific item (for item owner)
router.get('/:id/claims', requireAuth, async (req, res) => {
    try {
        const itemId = req.params.id;
        
        // Find the item
        const item = await Item.findById(itemId);
        
        if (!item) {
            return res.status(404).render('error', {
                title: 'Item Not Found',
                message: 'The item you are looking for does not exist.',
                user: req.session.user
            });
        }
        
        // Check if current user is the item owner
        if (item.reportedBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You can only view claims for your own items.',
                user: req.session.user
            });
        }
        
        // Find claims for this specific item
        const claims = await Claim.find({ item: itemId })
            .populate('claimant', 'name email universityId')
            .populate('item', 'name type')
            .sort({ createdAt: -1 });
        
        res.render('items/item-claims', {
            title: 'Claims for ' + item.name,
            user: req.session.user,
            item: item,
            claims: claims,
            activeTab: 'my-items'
        });
        
    } catch (error) {
        console.error('Item claims error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error loading claims for this item.',
            user: req.session.user
        });
    }
});
// Approve claim for specific item
router.post('/:itemId/claims/:claimId/approve', requireAuth, async (req, res) => {
    try {
        const { itemId, claimId } = req.params;
        
        const item = await Item.findById(itemId);
        const claim = await Claim.findById(claimId).populate('claimant');
        
        if (!item || !claim || item.reportedBy.toString() !== req.session.user._id.toString()) {
            req.session.errorMessage = 'Not authorized';
            return res.redirect('/dashboard');
        }
        
        // Approve the claim
        claim.status = 'approved';
        claim.approvedAt = new Date();
        await claim.save();
        
        // Mark item as returned
        item.status = 'returned';
        item.claimedBy = claim.claimant._id;
        item.resolvedDate = new Date();
        await item.save();
        
        // Reject all other pending claims for this item
        await Claim.updateMany(
            { 
                item: itemId, 
                _id: { $ne: claimId }, 
                status: 'pending' 
            },
            { 
                status: 'rejected',
                rejectionReason: 'Another claim was approved for this item.',
                resolvedAt: new Date()
            }
        );
        
        req.session.successMessage = `Claim approved! Item marked as returned to ${claim.claimant.name}.`;
        res.redirect(`/items/${itemId}/claims`);
        
    } catch (error) {
        console.error('Approve claim error:', error);
        req.session.errorMessage = 'Error approving claim';
        res.redirect(`/items/${itemId}/claims`);
    }
});

// Reject claim for specific item
router.post('/:itemId/claims/:claimId/reject', requireAuth, async (req, res) => {
    try {
        const { itemId, claimId } = req.params;
        const { rejectionReason } = req.body;
        
        const item = await Item.findById(itemId);
        const claim = await Claim.findById(claimId);
        
        if (!item || !claim || item.reportedBy.toString() !== req.session.user._id.toString()) {
            req.session.errorMessage = 'Not authorized';
            return res.redirect('/dashboard');
        }
        
        // Reject the claim
        claim.status = 'rejected';
        claim.rejectionReason = rejectionReason || 'Claim rejected by item owner';
        claim.resolvedAt = new Date();
        await claim.save();
        
        // Check if any pending claims remain
        const pendingClaimsCount = await Claim.countDocuments({
            item: itemId,
            status: 'pending'
        });
        
        // If no pending claims, set item back to available
        if (pendingClaimsCount === 0) {
            item.status = 'available';
            await item.save();
        }
        
        req.session.successMessage = 'Claim rejected successfully';
        res.redirect(`/items/${itemId}/claims`);
        
    } catch (error) {
        console.error('Reject claim error:', error);
        req.session.errorMessage = 'Error rejecting claim';
        res.redirect(`/items/${itemId}/claims`);
    }
});

// Contact claimant for specific item
router.post('/:itemId/claims/:claimId/contact', requireAuth, async (req, res) => {
    try {
        const { itemId, claimId } = req.params;
        const { message } = req.body;
        
        const item = await Item.findById(itemId);
        const claim = await Claim.findById(claimId).populate('claimant');
        
        if (!item || !claim || item.reportedBy.toString() !== req.session.user._id.toString()) {
            req.session.errorMessage = 'Not authorized';
            return res.redirect('/dashboard');
        }
        
        // Send email (placeholder - implement your email service)
        console.log(`Email to ${claim.claimant.email}: ${message}`);
        
        // Record contact attempt
        claim.contactHistory = claim.contactHistory || [];
        claim.contactHistory.push({
            message: message,
            sentBy: req.session.user._id,
            sentAt: new Date()
        });
        await claim.save();
        
        req.session.successMessage = `Message sent to ${claim.claimant.name}`;
        res.redirect(`/items/${itemId}/claims`);
        
    } catch (error) {
        console.error('Contact claimant error:', error);
        req.session.errorMessage = 'Error contacting claimant';
        res.redirect(`/items/${itemId}/claims`);
    }
});
module.exports = router;