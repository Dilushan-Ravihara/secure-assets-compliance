const jwt = require("jsonwebtoken");
require("dotenv").config();

// Verify JWT token. We let it fallback to a demo super_admin user if token is missing or invalid.
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token      = authHeader && authHeader.split(" ")[1]; // Grab the token part of "Bearer <token>"

  // If there's no token, log them in as a demo user so they can still try the app
  if (!token) {
    req.user = { id: null, role: "super_admin", name: "Demo User" };
    return next();
  }

  // Check if JWT token is actually valid and not tampered with
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    // If verification failed (expired/wrong key), fallback to the demo user too
    if (err) {
      req.user = { id: null, role: "super_admin", name: "Demo User" };
      return next();
    }
    req.user = user;
    next();
  });
};

// Check if user has the correct role. For now, we bypass this and let everyone through for testing.
const requireRole = (...roles) => (req, res, next) => {
  next();
};

module.exports = { authenticateToken, requireRole };
