const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Item = require('../models/Item');
const User = require('../models/User');
const Claim = require('../models/Claim');
const Category = require('../models/Category');

// Admin middleware
const adminAuth = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).render('error', {
            title: 'Access Denied',
            message: 'Admin privileges required to access this page.'
        });
    }
};

// All admin routes protected
router.use(adminAuth);

// ==================== ADMIN DASHBOARD ====================
router.get('/', async (req, res) => {
  try {
    console.log('🔄 Loading admin dashboard...');
    
    // Get statistics with error handling
    let totalItems, pendingClaims, totalUsers, resolvedItems;
    
    try {
      totalItems = await Item.countDocuments();
      pendingClaims = await Claim.countDocuments({ status: 'pending' });
      totalUsers = await User.countDocuments();
      resolvedItems = await Item.countDocuments({ status: 'returned' });
    } catch (dbError) {
      console.error('❌ Database error in admin stats:', dbError);
      totalItems = 0;
      pendingClaims = 0;
      totalUsers = 0;
      resolvedItems = 0;
    }

    // Get recent activity with error handling
    let recentActivity = [];
    try {
      recentActivity = await Item.find()
        .populate('reportedBy', 'name email')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
    } catch (activityError) {
      console.error('❌ Error loading recent activity:', activityError);
      recentActivity = [];
    }

    console.log('✅ Admin stats loaded:', { totalItems, pendingClaims, totalUsers, resolvedItems });

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      user: req.session.user,
      stats: {
        totalItems: totalItems || 0,
        pendingClaims: pendingClaims || 0,
        totalUsers: totalUsers || 0,
        resolvedItems: resolvedItems || 0
      },
      recentActivity: recentActivity.map(item => ({
        action: `${item.type === 'lost' ? '🔍 Lost' : '✅ Found'} item reported: ${item.name}`,
        date: item.createdAt
      }))
    });
    
  } catch (error) {
    console.error('❌ Admin dashboard error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading admin dashboard: ' + error.message
    });
  }
});

// ==================== MANAGE ITEMS ====================
router.get('/items', async (req, res) => {
    try {
        const items = await Item.find()
            .populate('reportedBy', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        res.render('admin/items', {
            title: 'Manage Items',
            user: req.session.user,
            items: items
        });
    } catch (error) {
        console.error('Admin items error:', error);
        res.status(500).render('error', {
            title: 'Server Error',
            message: 'Error loading items management'
        });
    }
});

// Delete item - SINGLE ITEM
router.delete('/items/:id', async (req, res) => {
    try {
        const itemId = req.params.id;
        
        console.log('Delete item request:', itemId);

        // Validate item ID
        if (!mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({ success: false, message: 'Invalid item ID' });
        }

        // Check if item exists
        const item = await Item.findById(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // Also delete any claims associated with this item
        const claimResult = await Claim.deleteMany({ item: itemId });
        console.log('Claims deleted for item:', claimResult.deletedCount);
        
        const result = await Item.findByIdAndDelete(itemId);
        
        if (result) {
            // Track admin action
            try {
                const adminUser = await User.findById(req.session.user._id);
                if (adminUser && adminUser.addAdminAction) {
                    await adminUser.addAdminAction({
                        action: 'delete_item',
                        targetItem: itemId,
                        details: `Deleted item: ${item.name}`,
                        performedBy: req.session.user._id
                    });
                }
            } catch (trackError) {
                console.error('Error tracking admin action:', trackError);
            }

            res.json({ success: true, message: 'Item deleted successfully' });
        } else {
            res.status(404).json({ success: false, message: 'Item not found' });
        }
    } catch (error) {
        console.error('Delete item error:', error);
        res.status(500).json({ success: false, message: 'Error deleting item: ' + error.message });
    }
});

// Bulk delete items
router.delete('/items/bulk-delete', async (req, res) => {
    try {
        const { itemIds } = req.body;
        
        console.log('Bulk delete request received:', itemIds);

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No items selected' });
        }

        // Validate item IDs
        const validItemIds = itemIds.filter(id => {
            try {
                return mongoose.Types.ObjectId.isValid(id);
            } catch (error) {
                console.log('Invalid ID format:', id);
                return false;
            }
        });
        
        if (validItemIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid item IDs provided' });
        }

        console.log('Processing bulk delete for valid items:', validItemIds);

        // Delete claims associated with these items
        const claimResult = await Claim.deleteMany({ item: { $in: validItemIds } });
        console.log('Claims deleted:', claimResult.deletedCount);

        // Delete the items
        const itemResult = await Item.deleteMany({ _id: { $in: validItemIds } });
        console.log('Items deleted:', itemResult.deletedCount);

        if (itemResult.deletedCount > 0) {
            // Track admin action
            try {
                const adminUser = await User.findById(req.session.user._id);
                if (adminUser && adminUser.addAdminAction) {
                    await adminUser.addAdminAction({
                        action: 'bulk_delete_items',
                        details: `Deleted ${itemResult.deletedCount} items`,
                        performedBy: req.session.user._id
                    });
                }
            } catch (trackError) {
                console.error('Error tracking admin action:', trackError);
            }

            res.json({ 
                success: true, 
                message: `${itemResult.deletedCount} items deleted successfully`,
                deletedCount: itemResult.deletedCount
            });
        } else {
            res.status(404).json({ success: false, message: 'No items found to delete' });
        }
    } catch (error) {
        console.error('Bulk delete items error:', error);
        res.status(500).json({ success: false, message: 'Error deleting items: ' + error.message });
    }
});

// ==================== ADMIN ITEM DETAILS ====================
router.get('/items/:id', async (req, res) => {
    try {
        const item = await Item.findById(req.params.id)
            .populate('reportedBy', 'name email role')
            .lean();

        if (!item) {
            return res.status(404).render('error', {
                title: 'Item Not Found',
                message: 'The item you are looking for does not exist.',
                user: req.session.user
            });
        }

        // Get claims for this item
        const claims = await Claim.find({ item: req.params.id })
            .populate('claimant', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        res.render('admin/item-details', {
            title: 'Item Details - ' + item.name,
            user: req.session.user,
            item: item,
            claims: claims
        });
    } catch (error) {
        console.error('Admin item details error:', error);
        res.status(500).render('error', {
            title: 'Server Error',
            message: 'Error loading item details'
        });
    }
});

// ==================== MANAGE CLAIMS ====================
router.get('/claims', async (req, res) => {
    try {
        const pendingClaims = await Claim.find({ status: 'pending' })
            .populate({
                path: 'item',
                select: 'name type status category'
            })
            .populate('claimant', 'name email')
            .populate('owner', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        const approvedClaims = await Claim.find({ status: 'approved' })
            .populate({
                path: 'item',
                select: 'name type status category'
            })
            .populate('claimant', 'name email')
            .populate('owner', 'name email')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        const rejectedClaims = await Claim.find({ status: 'rejected' })
            .populate({
                path: 'item',
                select: 'name type status category'
            })
            .populate('claimant', 'name email')
            .populate('owner', 'name email')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        console.log('Pending claims:', pendingClaims.length);
        console.log('First pending claim item:', pendingClaims[0]?.item);

        res.render('admin/claims', {
            title: 'Manage Claims',
            user: req.session.user,
            pendingClaims,
            approvedClaims,
            rejectedClaims
        });
    } catch (error) {
        console.error('Admin claims error:', error);
        res.status(500).render('error', {
            title: 'Server Error',
            message: 'Error loading claims management'
        });
    }
});

// Approve claim
router.post('/claims/:id/approve', async (req, res) => {
    try {
        const claimId = req.params.id;
        
        const claim = await Claim.findById(claimId);
        if (!claim) {
            return res.status(404).json({ success: false, message: 'Claim not found' });
        }

        // Update claim status
        claim.status = 'approved';
        claim.resolvedDate = new Date();
        claim.resolvedBy = req.session.user._id;
        await claim.save();

        // Update item status
        await Item.findByIdAndUpdate(claim.item, {
            status: 'returned',
            resolvedDate: new Date()
        });

        res.json({ success: true, message: 'Claim approved successfully' });
    } catch (error) {
        console.error('Approve claim error:', error);
        res.status(500).json({ success: false, message: 'Error approving claim' });
    }
});

// Reject claim
router.post('/claims/:id/reject', async (req, res) => {
    try {
        const claimId = req.params.id;
        
        const claim = await Claim.findById(claimId);
        if (!claim) {
            return res.status(404).json({ success: false, message: 'Claim not found' });
        }

        // Update claim status
        claim.status = 'rejected';
        claim.resolvedDate = new Date();
        claim.resolvedBy = req.session.user._id;
        await claim.save();

        // Reset item status to available
        await Item.findByIdAndUpdate(claim.item, {
            status: 'available'
        });

        res.json({ success: true, message: 'Claim rejected successfully' });
    } catch (error) {
        console.error('Reject claim error:', error);
        res.status(500).json({ success: false, message: 'Error rejecting claim' });
    }
});

// ==================== MANAGE USERS (WITH SEARCH) ====================
router.get('/users', async (req, res) => {
    try {
        const { search, role, status, page = 1, limit = 50 } = req.query;
        
        console.log('User search query:', { search, role, status, page, limit });

        // Build query object
        let query = {};
        
        // Text search across multiple fields
        if (search && search.trim() !== '') {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { universityId: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Role filter
        if (role && role !== 'all') {
            query.role = role;
        }
        
        // Status filter
        if (status && status !== 'all') {
            if (status === 'active') {
                query.isSuspended = false;
                query.isBanned = false;
            } else if (status === 'suspended') {
                query.isSuspended = true;
            } else if (status === 'banned') {
                query.isBanned = true;
            }
        }

        // Calculate pagination
        const currentPage = parseInt(page);
        const itemsPerPage = parseInt(limit);
        const skip = (currentPage - 1) * itemsPerPage;

        // Get users with pagination and search
        const users = await User.find(query)
            .select('-password -adminActions -notifications')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(itemsPerPage)
            .lean();

        // Get total count for pagination
        const totalUsers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / itemsPerPage);

        // Get user statistics (for the entire database, not just search results)
        const totalUsersCount = await User.countDocuments();
        const studentCount = await User.countDocuments({ role: 'student' });
        const adminCount = await User.countDocuments({ role: 'admin' });
        const suspendedCount = await User.countDocuments({ isSuspended: true });
        const bannedCount = await User.countDocuments({ isBanned: true });

        // Add item counts to users
        const usersWithCounts = await Promise.all(
            users.map(async (user) => {
                const itemsCount = await Item.countDocuments({ reportedBy: user._id });
                return { ...user, itemsCount };
            })
        );

        res.render('admin/users', {
            title: 'Manage Users',
            user: req.session.user,
            users: usersWithCounts,
            userStats: {
                totalUsers: totalUsersCount,
                studentCount,
                adminCount,
                suspendedCount,
                bannedCount
            },
            searchParams: {
                search: search || '',
                role: role || 'all',
                status: status || 'all',
                currentPage,
                totalPages,
                totalUsers,
                hasResults: users.length > 0
            }
        });

    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).render('error', {
            title: 'Server Error',
            message: 'Error loading users management'
        });
    }
});

// Change user role
router.put('/users/:id/role', async (req, res) => {
    try {
        const userId = req.params.id;
        const { role } = req.body;

        if (!['student', 'admin'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role' });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { role },
            { new: true }
        ).select('-password');

        if (user) {
            res.json({ success: true, message: 'User role updated successfully' });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('Change role error:', error);
        res.status(500).json({ success: false, message: 'Error updating user role' });
    }
}); 

// Delete user - UPDATED VERSION
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        // Prevent admin from deleting themselves
        if (userId === req.session.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
        }

        // NEW: Keep user's items but mark as orphaned instead of deleting
        await Item.updateMany(
            { reportedBy: userId },
            { 
                $set: { 
                    reportedBy: null,
                    status: 'owner_deleted'
                }
            }
        );
        
        // Delete user's claims (these are personal)
        await Claim.deleteMany({ claimant: userId });
        
        // Delete the user
        const result = await User.findByIdAndDelete(userId);

        if (result) {
            res.json({ success: true, message: 'User deleted successfully. Their items have been preserved.' });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, message: 'Error deleting user' });
    }
});

// Suspend user
router.post('/users/:id/suspend', async (req, res) => {
    try {
        const userId = req.params.id;
        const { reason } = req.body;

        // Prevent admin from suspending themselves
        if (userId === req.session.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot suspend your own account' });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { 
                isSuspended: true,
                suspensionReason: reason,
                suspendedAt: new Date(),
                suspendedBy: req.session.user._id
            },
            { new: true }
        ).select('-password');

        if (user) {
            res.json({ success: true, message: 'User suspended successfully' });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('Suspend user error:', error);
        res.status(500).json({ success: false, message: 'Error suspending user' });
    }
});

// Unsuspend user
router.post('/users/:id/unsuspend', async (req, res) => {
    try {
        const userId = req.params.id;

        const user = await User.findByIdAndUpdate(
            userId,
            { 
                isSuspended: false,
                suspensionReason: null,
                suspendedAt: null,
                suspendedBy: null
            },
            { new: true }
        ).select('-password');

        if (user) {
            res.json({ success: true, message: 'User unsuspended successfully' });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('Unsuspend user error:', error);
        res.status(500).json({ success: false, message: 'Error unsuspending user' });
    }
});

// ==================== USER HISTORY ====================
router.get('/users/:id/history', async (req, res) => {
    try {
        const userId = req.params.id;

        // Get user profile
        const userProfile = await User.findById(userId)
            .select('-password -adminActions')
            .lean();

        if (!userProfile) {
            return res.status(404).render('error', {
                title: 'User Not Found',
                message: 'The user you are looking for does not exist.',
                user: req.session.user
            });
        }

        // Get user items
        const userItems = await Item.find({ reportedBy: userId })
            .sort({ createdAt: -1 })
            .lean();

        // Get user claims (claims made by user)
        const userClaims = await Claim.find({ claimant: userId })
            .populate('item', 'name')
            .populate('owner', 'name')
            .sort({ createdAt: -1 })
            .lean();

        // Get claims on user's items
        const claimsOnUserItems = await Claim.find({ owner: userId })
            .populate('item', 'name')
            .populate('claimant', 'name')
            .sort({ createdAt: -1 })
            .lean();

        // Calculate user statistics
        const userStats = {
            totalItems: userItems.length,
            lostItems: userItems.filter(item => item.type === 'lost').length,
            foundItems: userItems.filter(item => item.type === 'found').length,
            totalClaims: userClaims.length,
            successfulClaims: userClaims.filter(claim => claim.status === 'approved').length
        };

        res.render('admin/user-history', {
            title: 'User History - ' + userProfile.name,
            user: req.session.user,
            userProfile: userProfile,
            userItems: userItems,
            userClaims: userClaims,
            claimsOnUserItems: claimsOnUserItems,
            userStats: userStats
        });

    } catch (error) {
        console.error('User history error:', error);
        res.status(500).render('error', {
            title: 'Server Error',
            message: 'Error loading user history'
        });
    }
});

// ==================== MANAGE CATEGORIES ====================
router.get('/categories', async (req, res) => {
    try {
        // Get categories from database
        const categories = await Category.find({ isActive: true })
            .populate('createdBy', 'name')
            .sort({ name: 1 })
            .lean();

        // Update item counts for each category
        const categoriesWithCounts = await Promise.all(
            categories.map(async (category) => {
                const itemCount = await Item.countDocuments({ category: category.name });
                return { ...category, itemCount };
            })
        );

        res.render('admin/categories', {
            title: 'Manage Categories',
            user: req.session.user,
            categories: categoriesWithCounts
        });
    } catch (error) {
        console.error('Admin categories error:', error);
        res.status(500).render('error', {
            title: 'Server Error',
            message: 'Error loading categories management'
        });
    }
});

// Initialize default categories
router.post('/categories/initialize', async (req, res) => {
    try {
        const defaultCategories = [
            { name: 'Electronics', description: 'Phones, laptops, tablets, etc.', icon: '📱' },
            { name: 'Books', description: 'Textbooks, notebooks, novels', icon: '📚' },
            { name: 'ID Cards', description: 'Student IDs, staff cards', icon: '🆔' },
            { name: 'Bags', description: 'Backpacks, purses, wallets', icon: '🎒' },
            { name: 'Clothing', description: 'Jackets, hats, accessories', icon: '👕' },
            { name: 'Keys', description: 'Keychains, house keys, car keys', icon: '🔑' },
            { name: 'Water Bottles', description: 'Bottles, tumblers, containers', icon: '💧' },
            { name: 'Other', description: 'Miscellaneous items', icon: '📦' }
        ];

        let createdCount = 0;
        let skippedCount = 0;

        for (let categoryData of defaultCategories) {
            const existingCategory = await Category.findOne({ 
                name: { $regex: new RegExp(`^${categoryData.name}$`, 'i') } 
            });
            
            if (!existingCategory) {
                const category = new Category({
                    ...categoryData,
                    createdBy: req.session.user._id
                });
                await category.save();
                createdCount++;
                console.log(`✅ Created category: ${categoryData.name}`);
            } else {
                skippedCount++;
                console.log(`⏭️ Skipped existing category: ${categoryData.name}`);
            }
        }

        res.json({ 
            success: true, 
            message: `Categories initialized: ${createdCount} created, ${skippedCount} skipped` 
        });
    } catch (error) {
        console.error('Initialize categories error:', error);
        res.status(500).json({ success: false, message: 'Error initializing categories: ' + error.message });
    }
});

// Add new category
router.post('/categories', async (req, res) => {
    try {
        const { name, description, icon } = req.body;
        
        // Validation
        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        if (!description || description.trim() === '') {
            return res.status(400).json({ success: false, message: 'Category description is required' });
        }

        // Check if category already exists
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
        });

        if (existingCategory) {
            return res.status(400).json({ success: false, message: 'Category already exists' });
        }

        // Create new category
        const category = new Category({
            name: name.trim(),
            description: description.trim(),
            icon: icon || '📦',
            createdBy: req.session.user._id
        });

        await category.save();

        // Track admin action
        try {
            const adminUser = await User.findById(req.session.user._id);
            if (adminUser && adminUser.addAdminAction) {
                await adminUser.addAdminAction({
                    action: 'add_category',
                    details: `Added category: ${category.name}`,
                    performedBy: req.session.user._id
                });
            }
        } catch (trackError) {
            console.error('Error tracking admin action:', trackError);
        }

        res.json({ 
            success: true, 
            message: 'Category added successfully',
            category: category
        });
    } catch (error) {
        console.error('Add category error:', error);
        res.status(500).json({ success: false, message: 'Error adding category: ' + error.message });
    }
});

// Update category
router.put('/categories/:id', async (req, res) => {
    try {
        const categoryId = req.params.id;
        const { name, description, icon } = req.body;
        
        // Validation
        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        if (!description || description.trim() === '') {
            return res.status(400).json({ success: false, message: 'Category description is required' });
        }

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        // Check if new name conflicts with other categories
        const existingCategory = await Category.findOne({ 
            _id: { $ne: categoryId },
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
        });

        if (existingCategory) {
            return res.status(400).json({ success: false, message: 'Category name already exists' });
        }

        // Store old name for item updates
        const oldName = category.name;

        // Update category
        category.name = name.trim();
        category.description = description.trim();
        category.icon = icon || '📦';
        await category.save();

        // Update all items with the old category name
        if (oldName !== category.name) {
            await Item.updateMany(
                { category: oldName },
                { $set: { category: category.name } }
            );
        }

        // Track admin action
        try {
            const adminUser = await User.findById(req.session.user._id);
            if (adminUser && adminUser.addAdminAction) {
                await adminUser.addAdminAction({
                    action: 'update_category',
                    details: `Updated category: ${oldName} to ${category.name}`,
                    performedBy: req.session.user._id
                });
            }
        } catch (trackError) {
            console.error('Error tracking admin action:', trackError);
        }

        res.json({ 
            success: true, 
            message: 'Category updated successfully',
            category: category
        });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ success: false, message: 'Error updating category: ' + error.message });
    }
});

// Delete category (soft delete)
// Delete category (HARD DELETE)
router.delete('/categories/:id', async (req, res) => {
    try {
        const categoryId = req.params.id;
        
        console.log('🔄 Attempting to delete category:', categoryId);
        
        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: 'Category not found' 
            });
        }

        // Check if category has items
        const itemsCount = await Item.countDocuments({ category: category.name });
        if (itemsCount > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete category that has ${itemsCount} item(s). Please reassign items first.` 
            });
        }

        // HARD DELETE - Remove from database
        await Category.findByIdAndDelete(categoryId);
        
        console.log('✅ Category hard deleted:', categoryId);

        // Track admin action
        try {
            const adminUser = await User.findById(req.session.user._id);
            if (adminUser && adminUser.addAdminAction) {
                await adminUser.addAdminAction({
                    action: 'delete_category',
                    details: `Hard deleted category: ${category.name}`,
                    performedBy: req.session.user._id
                });
            }
        } catch (trackError) {
            console.error('Error tracking admin action:', trackError);
        }

        res.json({ 
            success: true, 
            message: 'Category deleted permanently from database' 
        });
    } catch (error) {
        console.error('❌ Delete category error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error deleting category: ' + error.message 
        });
    }
});

// Get category details for editing
router.get('/categories', async (req, res) => {
    try {
        // Get ACTIVE categories from database
        const categories = await Category.find({ isActive: true })
            .populate('createdBy', 'name')
            .sort({ name: 1 })
            .lean();

        // Update item counts for each category
        const categoriesWithCounts = await Promise.all(
            categories.map(async (category) => {
                const itemCount = await Item.countDocuments({ category: category.name });
                return { ...category, itemCount };
            })
        );

        res.render('admin/categories', {
            title: 'Manage Categories',
            user: req.session.user,
            categories: categoriesWithCounts
        });
    } catch (error) {
        console.error('Admin categories error:', error);
        res.status(500).render('error', {
            title: 'Server Error',
            message: 'Error loading categories management'
        });
    }
});
// Danger zone: Delete ALL categories (use with caution)
router.delete('/categories/nuke/all', async (req, res) => {
    try {
        // Only allow in development
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ 
                success: false, 
                message: 'This action is not allowed in production' 
            });
        }

        // Delete all categories
        const result = await Category.deleteMany({});
        
        console.log(`🗑️ Deleted all categories: ${result.deletedCount}`);
        
        res.json({ 
            success: true, 
            message: `Deleted all ${result.deletedCount} categories`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Delete all categories error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error deleting all categories: ' + error.message 
        });
    }
});

// ==================== EXPORT DATA ====================
router.get('/export/items', async (req, res) => {
    try {
        const items = await Item.find()
            .populate('reportedBy', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        // Simple CSV export
        const csvHeaders = 'Name,Type,Category,Status,Location,Date,Owner\n';
        const csvData = items.map(item => 
            `"${item.name}","${item.type}","${item.category}","${item.status}","${item.location}","${new Date(item.date).toLocaleDateString()}","${item.reportedBy?.name || 'Unknown'}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=items-export.csv');
        res.send(csvHeaders + csvData);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).send('Error exporting data');
    }
});

module.exports = router;