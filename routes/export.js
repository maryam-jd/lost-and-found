const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const User = require('../models/User');
const Claim = require('../models/Claim');

const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
};

const adminAuth = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

// Export items to CSV
router.get('/items.csv', requireAuth, adminAuth, async (req, res) => {
    try {
        const items = await Item.find()
            .populate('reportedBy', 'name email')
            .sort({ createdAt: -1 });

        let csv = 'Name,Type,Category,Status,Location,Date,Reported By,Reported Email\n';
        
        items.forEach(item => {
            const row = [
                `"${item.name}"`,
                item.type,
                item.category,
                item.status,
                `"${item.location}"`,
                new Date(item.date).toISOString().split('T')[0],
                `"${item.reportedBy.name}"`,
                item.reportedBy.email
            ].join(',');
            
            csv += row + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=items-export.csv');
        res.send(csv);
        
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).send('Error generating export');
    }
});

// Export claims to CSV
router.get('/claims.csv', requireAuth, adminAuth, async (req, res) => {
    try {
        const claims = await Claim.find()
            .populate('item', 'name type category')
            .populate('claimant', 'name email')
            .populate('resolvedBy', 'name')
            .sort({ createdAt: -1 });

        let csv = 'Item Name,Item Type,Item Category,Claimant,Claimant Email,Status,Message,Submitted Date,Resolved Date,Resolved By\n';
        
        claims.forEach(claim => {
            const row = [
                `"${claim.item.name}"`,
                claim.item.type,
                claim.item.category,
                `"${claim.claimant.name}"`,
                claim.claimant.email,
                claim.status,
                `"${claim.message.replace(/"/g, '""')}"`,
                new Date(claim.createdAt).toISOString().split('T')[0],
                claim.resolvedDate ? new Date(claim.resolvedDate).toISOString().split('T')[0] : '',
                claim.resolvedBy ? `"${claim.resolvedBy.name}"` : ''
            ].join(',');
            
            csv += row + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=claims-export.csv');
        res.send(csv);
        
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).send('Error generating export');
    }
});

// Export users to CSV
router.get('/users.csv', requireAuth, adminAuth, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });

        let csv = 'Name,Email,Role,University ID,Phone,Verified,Created At\n';
        
        users.forEach(user => {
            const row = [
                `"${user.name}"`,
                user.email,
                user.role,
                user.universityId,
                user.phone || '',
                user.isVerified ? 'Yes' : 'No',
                new Date(user.createdAt).toISOString().split('T')[0]
            ].join(',');
            
            csv += row + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=users-export.csv');
        res.send(csv);
        
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).send('Error generating export');
    }
});

module.exports = router;