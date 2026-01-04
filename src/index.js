require('dotenv').config();

const express = require('express');
const authRoutes = require('./routes/auth');
const whoopRoutes = require('./routes/whoop');
const apiKeyAuth = require('./middleware/apiKey');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());

// 健康检查
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'WHOOP GPT-S Backend',
    endpoints: {
      auth: '/auth/start, /auth/callback, /auth/status',
      whoop: '/whoop/sleep/latest, /whoop/recovery/latest, /whoop/summary/today'
    }
  });
});

// OAuth 路由（不需要 API Key）
app.use('/auth', authRoutes);

// WHOOP 业务路由（需要 API Key）
app.use('/whoop', apiKeyAuth, whoopRoutes);

// 错误处理
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`OAuth start: http://localhost:${PORT}/auth/start`);
});
