const express = require('express');
const whoopService = require('../services/whoop');

const router = express.Router();

// 统一错误处理
function handleError(res, err) {
  if (err.message === 'AUTH_REQUIRED') {
    return res.status(401).json({
      error: 'AUTH_REQUIRED',
      message: 'Please authorize at /auth/start'
    });
  }

  console.error('WHOOP API error:', err.response?.data || err.message);
  return res.status(500).json({
    error: 'API_ERROR',
    message: err.response?.data?.message || err.message
  });
}

// GET /whoop/sleep/latest - 最近睡眠数据
router.get('/sleep/latest', async (req, res) => {
  try {
    const sleep = await whoopService.getLatestSleep();
    if (!sleep) {
      return res.status(404).json({
        error: 'NO_DATA',
        message: 'No sleep data found'
      });
    }
    res.json(sleep);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /whoop/recovery/latest - 最近恢复数据
router.get('/recovery/latest', async (req, res) => {
  try {
    const recovery = await whoopService.getLatestRecovery();
    if (!recovery) {
      return res.status(404).json({
        error: 'NO_DATA',
        message: 'No recovery data found'
      });
    }
    res.json(recovery);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /whoop/cycle/latest - 最近周期数据
router.get('/cycle/latest', async (req, res) => {
  try {
    const cycle = await whoopService.getLatestCycle();
    if (!cycle) {
      return res.status(404).json({
        error: 'NO_DATA',
        message: 'No cycle data found'
      });
    }
    res.json(cycle);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /whoop/profile - 用户信息
router.get('/profile', async (req, res) => {
  try {
    const profile = await whoopService.getUserProfile();
    res.json(profile);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /whoop/summary/today - 聚合摘要（GPT-S 主要使用的接口）
router.get('/summary/today', async (req, res) => {
  try {
    const summary = await whoopService.getTodaySummary();
    res.json(summary);
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
