const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    default: '📦'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  itemCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

//Item count method
categorySchema.methods.updateItemCount = async function() {
  const Item = require('./Item');
  const count = await Item.countDocuments({ category: this.name });
  this.itemCount = count;
  return this.save();
};

//Static method to get all categories with item counts
categorySchema.statics.getCategoriesWithCounts = async function() {
  const categories = await this.find({ isActive: true }).sort({ name: 1 });
  
  const Item = require('./Item');
  const categoriesWithCounts = await Promise.all(
    categories.map(async (category) => {
      const itemCount = await Item.countDocuments({ category: category.name });
      return {
        ...category.toObject(),
        itemCount
      };
    })
  );
  
  return categoriesWithCounts;
};

//Index for better performance
categorySchema.index({ name: 1 });
categorySchema.index({ isActive: 1 });

const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);
module.exports = Category;