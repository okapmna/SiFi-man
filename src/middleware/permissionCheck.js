const permissionCheck = (requiredPermission) => {
    return (req, res, next) => {
        if (!req.session || !req.session.permissions) {
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(403).json({ success: false, error: 'Access denied: missing permissions data in session' });
            }
            return res.status(403).render('admin/error', { message: 'Access denied: missing permissions data in session' });
        }

        const userPermissions = req.session.permissions;
        
        // If the specific permission is true, allow access
        if (userPermissions[requiredPermission]) {
            return next();
        }

        // Permission denied
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(403).json({ success: false, error: 'Access denied: insufficient permissions' });
        }
        
        // Render an error page or redirect (assuming you have an error view, or just send text)
        res.status(403).send('Access denied: You do not have permission to perform this action.');
    };
};

module.exports = permissionCheck;
