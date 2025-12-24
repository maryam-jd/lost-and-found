const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const Claim = require('../models/Claim');
const User = require('../models/User');
const { isLoggedIn } = require('../middleware/auth');
const { sendClaimNotificationEmail, sendClaimContactEmail } = require('../utils/emailService');

// Submit a claim - ONLY FOR FOUND ITEMS
router.post('/:itemId/claim', isLoggedIn, async (req, res) => {
  try {
    const { message, proofDescription, contactEmail, contactPhone } = req.body;
    const itemId = req.params.itemId;
    const claimantId = req.user._id;

    const item = await Item.findById(itemId).populate('reportedBy');
    
    if (!item) {
      req.session.errorMessage = 'Item not found';
      return res.redirect('/items');
    }

    // Only allow claims on FOUND items
    if (item.type !== 'found') {
      req.session.errorMessage = 'Claims can only be made on found items';
      return res.redirect(`/items/${itemId}`);
    }

    // Check if user is claiming their own item
    if (item.reportedBy._id.toString() === claimantId.toString()) {
      req.session.errorMessage = 'You cannot claim your own found item';
      return res.redirect(`/items/${itemId}`);
    }

    // Check if item is available for claiming
    if (item.status !== 'available') {
      req.session.errorMessage = 'This item is not available for claiming';
      return res.redirect(`/items/${itemId}`);
    }

    // Check for existing pending claim by same user
    const existingClaim = await Claim.findOne({
      item: itemId,
      claimant: claimantId,
      status: 'pending'
    });

    if (existingClaim) {
      req.session.errorMessage = 'You already have a pending claim for this item';
      return res.redirect(`/items/${itemId}`);
    }

    // Create new claim
    const claim = new Claim({
      item: itemId,
      claimant: claimantId,
      owner: item.reportedBy._id,
      message,
      proofDescription,
      contactEmail: contactEmail || req.user.email,
      contactPhone
    });

    await claim.save();

    // Update item status
    item.status = 'claim_pending';
    await item.save();

    // Send notification email to item owner (person who found the item)
    await sendClaimNotificationEmail({
      to: item.reportedBy.email,
      ownerName: item.reportedBy.name,
      itemName: item.name,
      itemType: item.type,
      claimantName: req.user.name,
      claimMessage: message,
      itemId: item._id
    });

    req.session.successMessage = 'Claim submitted successfully! The person who found the item has been notified.';
    res.redirect(`/items/${itemId}`);

  } catch (error) {
    console.error('Claim submission error:', error);
    req.session.errorMessage = 'Error submitting claim';
    res.redirect('/items');
  }
});

// Get claims for user's FOUND items (for people who found items)
router.get('/my-claims', isLoggedIn, async (req, res) => {
  try {
    const claims = await Claim.find({ owner: req.user._id })
      .populate('item')
      .populate('claimant', 'name email')
      .sort({ createdAt: -1 });

    res.render('dashboard/claims-management', {
      title: 'Manage Claims on Your Found Items',
      user: req.user,
      claims
    });
  } catch (error) {
    console.error('Error fetching claims:', error);
    req.session.errorMessage = 'Error loading claims';
    res.redirect('/dashboard');
  }
});

// Get claims made by user (claims user submitted on others' found items)
router.get('/my-submitted-claims', isLoggedIn, async (req, res) => {
  try {
    const claims = await Claim.find({ claimant: req.user._id })
      .populate('item')
      .populate('owner', 'name')
      .sort({ createdAt: -1 });

    res.render('dashboard/my-submitted-claims', {
      title: 'My Submitted Claims',
      user: req.user,
      claims
    });
  } catch (error) {
    console.error('Error fetching submitted claims:', error);
    req.session.errorMessage = 'Error loading your claims';
    res.redirect('/dashboard');
  }
});

// Approve a claim (when finder approves someone's claim on their found item)
router.post('/:claimId/approve', isLoggedIn, async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.claimId)
      .populate('item')
      .populate('claimant');

    if (!claim) {
      req.session.errorMessage = 'Claim not found';
      return res.redirect('/dashboard');
    }

    // Check if current user is the item owner (person who found it)
    if (claim.owner.toString() !== req.user._id.toString()) {
      req.session.errorMessage = 'Not authorized to approve this claim';
      return res.redirect('/dashboard');
    }

    // Update claim status
    claim.status = 'approved';
    claim.approvedAt = new Date();
    await claim.save();

    // Update item status to returned
    const item = await Item.findById(claim.item._id);
    item.status = 'returned';
    item.resolvedDate = new Date();
    await item.save();

    req.session.successMessage = 'Claim approved successfully! The item has been marked as returned.';
    res.redirect('/claims/my-claims');

  } catch (error) {
    console.error('Claim approval error:', error);
    req.session.errorMessage = 'Error approving claim';
    res.redirect('/dashboard');
  }
});

// Reject a claim
router.post('/:claimId/reject', isLoggedIn, async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.claimId)
      .populate('item');

    if (!claim) {
      req.session.errorMessage = 'Claim not found';
      return res.redirect('/dashboard');
    }

    // Check if current user is the item owner
    if (claim.owner.toString() !== req.user._id.toString()) {
      req.session.errorMessage = 'Not authorized to reject this claim';
      return res.redirect('/dashboard');
    }

    // Update claim status
    claim.status = 'rejected';
    await claim.save();

    // ✅ FIX: Only reset item status if NO pending claims remain
    const pendingClaims = await Claim.countDocuments({
      item: claim.item._id,
      status: 'pending'
    });

    if (pendingClaims === 0) {
      const item = await Item.findById(claim.item._id);
      item.status = 'available';
      await item.save();
    }

    req.session.successMessage = 'Claim rejected successfully';
    res.redirect('/claims/my-claims');

  } catch (error) {
    console.error('Claim rejection error:', error);
    req.session.errorMessage = 'Error rejecting claim';
    res.redirect('/dashboard');
  }
});

// Contact claimant (send email)
router.post('/:claimId/contact', isLoggedIn, async (req, res) => {
  try {
    const { message } = req.body;
    const claim = await Claim.findById(req.params.claimId)
      .populate('item')
      .populate('claimant', 'name email');

    if (!claim) {
      req.session.errorMessage = 'Claim not found';
      return res.redirect('/dashboard');
    }

    // Check if current user is the item owner
    if (claim.owner.toString() !== req.user._id.toString()) {
      req.session.errorMessage = 'Not authorized to contact this claimant';
      return res.redirect('/dashboard');
    }

    // Send email to claimant
    const emailSent = await sendClaimContactEmail({
      to: claim.contactEmail,
      from: req.user.email,
      itemName: claim.item.name,
      ownerName: req.user.name,
      message: message,
      itemId: claim.item._id
    });

    if (emailSent) {
      req.session.successMessage = 'Email sent to claimant successfully!';
    } else {
      req.session.errorMessage = 'Failed to send email';
    }

    res.redirect('/claims/my-claims');

  } catch (error) {
    console.error('Contact claimant error:', error);
    req.session.errorMessage = 'Error sending email';
    res.redirect('/dashboard');
  }
});

module.exports = router;