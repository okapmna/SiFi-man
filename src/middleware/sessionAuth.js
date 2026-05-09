const sessionAuth = (req, res, next) => {
    if (req.session && req.session.adminId) {
        return next();
    }
    // Jika tidak ada session, redirect ke login
    res.redirect('/admin/login');
};

module.exports = sessionAuth;
