function apiKeyAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header'
    });
  }

  const apiKey = authHeader.substring(7); // 去掉 "Bearer "

  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid API key'
    });
  }

  next();
}

module.exports = apiKeyAuth;
