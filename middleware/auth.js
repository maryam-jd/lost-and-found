// Simple authentication middleware
const isLoggedIn = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  req.session.errorMessage = 'Please log in to access this page';
  res.redirect('/auth/login');
};

const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.session.errorMessage = 'Admin access required';
  res.redirect('/');
};

module.exports = {
  isLoggedIn,
  isAdmin
};