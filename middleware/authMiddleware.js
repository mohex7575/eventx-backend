const jwt = require('jsonwebtoken');

const protect = async (req, res, next) => {
  try {
    let token;

    // 1. Get the token from the header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1]; // Gets the token after "Bearer "
    }

    // 2. Check if token exists
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    // 3. Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. If verification is successful, move to the next middleware
    console.log("Token verified successfully for user ID:", decoded.id);
    req.user = { id: decoded.id }; // Attach user ID to the request object
    next();

  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = { protect };