const axios = require('axios');
const tokenService = require('./token');

// 使用 v2 API（v1 已于 2025年10月停用）
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

async function refreshAccessToken() {
  const token = tokenService.getToken();
  if (!token || !token.refresh_token) {
    throw new Error('AUTH_REQUIRED');
  }

  try {
    const response = await axios.post(WHOOP_TOKEN_URL, new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const newToken = tokenService.saveToken({
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in
    });

    console.log('Token refreshed successfully');
    return newToken;
  } catch (err) {
    console.error('Failed to refresh token:', err.response?.data || err.message);
    tokenService.clearToken();
    throw new Error('AUTH_REQUIRED');
  }
}

async function getWithAuth(endpoint) {
  // 检查是否需要刷新
  if (tokenService.isTokenExpired()) {
    await refreshAccessToken();
  }

  const token = tokenService.getToken();
  if (!token) {
    throw new Error('AUTH_REQUIRED');
  }

  try {
    const response = await axios.get(`${WHOOP_API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token.access_token}`
      }
    });
    return response.data;
  } catch (err) {
    // 如果是 401，尝试刷新后重试一次
    if (err.response?.status === 401) {
      await refreshAccessToken();
      const newToken = tokenService.getToken();
      const retryResponse = await axios.get(`${WHOOP_API_BASE}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${newToken.access_token}`
        }
      });
      return retryResponse.data;
    }
    throw err;
  }
}

// 获取最近睡眠数据
async function getLatestSleep() {
  const data = await getWithAuth('/activity/sleep?limit=1');
  if (!data.records || data.records.length === 0) {
    return null;
  }
  return data.records[0];
}

// 获取最近恢复数据（需要先获取 cycle，再获取 recovery）
async function getLatestRecovery() {
  // 先获取最近的 cycle
  const cycleData = await getWithAuth('/cycle?limit=1');
  if (!cycleData.records || cycleData.records.length === 0) {
    return null;
  }

  const cycle = cycleData.records[0];

  // 通过 cycle ID 获取 recovery
  try {
    const recovery = await getWithAuth(`/cycle/${cycle.id}/recovery`);
    return recovery;
  } catch (err) {
    // 如果没有 recovery 数据，返回 null
    if (err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

// 获取最近周期数据
async function getLatestCycle() {
  const data = await getWithAuth('/cycle?limit=1');
  if (!data.records || data.records.length === 0) {
    return null;
  }
  return data.records[0];
}

// 获取用户信息
async function getUserProfile() {
  return await getWithAuth('/user/profile/basic');
}

// 生成训练建议的 flags
function generateFlags(sleep, recovery) {
  const flags = [];

  if (sleep) {
    // 睡眠时长少于 6 小时
    const sleepDurationHours = (sleep.score?.stage_summary?.total_in_bed_time_milli || 0) / 3600000;
    if (sleepDurationHours < 6) {
      flags.push('short_sleep');
    }

    // 深度睡眠不足
    const deepSleepMins = (sleep.score?.stage_summary?.total_slow_wave_sleep_time_milli || 0) / 60000;
    if (deepSleepMins < 60) {
      flags.push('low_deep_sleep');
    }
  }

  if (recovery) {
    // HRV 低于平均
    if (recovery.score?.hrv_rmssd_milli && recovery.score.hrv_rmssd_milli < 50) {
      flags.push('low_hrv');
    }

    // 恢复分数低
    if (recovery.score?.recovery_score && recovery.score.recovery_score < 34) {
      flags.push('low_recovery');
    }
  }

  return flags;
}

// 生成训练建议
function generateTrainingHint(recovery) {
  if (!recovery?.score?.recovery_score) {
    return { intensity: 'unknown', focus: 'rest' };
  }

  const score = recovery.score.recovery_score;

  if (score >= 67) {
    return { intensity: 'high', focus: 'strength or HIIT' };
  } else if (score >= 34) {
    return { intensity: 'moderate', focus: 'cardio or skill work' };
  } else {
    return { intensity: 'low', focus: 'active recovery or rest' };
  }
}

// 聚合今日摘要
async function getTodaySummary() {
  const [sleep, recovery] = await Promise.all([
    getLatestSleep().catch(() => null),
    getLatestRecovery().catch(() => null)
  ]);

  const flags = generateFlags(sleep, recovery);
  const trainingHint = generateTrainingHint(recovery);

  return {
    date: new Date().toISOString().split('T')[0],
    sleep: sleep ? {
      start: sleep.start,
      end: sleep.end,
      score: sleep.score?.sleep_performance_percentage,
      duration_hours: sleep.score?.stage_summary?.total_in_bed_time_milli
        ? (sleep.score.stage_summary.total_in_bed_time_milli / 3600000).toFixed(1)
        : null,
      deep_sleep_mins: sleep.score?.stage_summary?.total_slow_wave_sleep_time_milli
        ? Math.round(sleep.score.stage_summary.total_slow_wave_sleep_time_milli / 60000)
        : null,
      rem_sleep_mins: sleep.score?.stage_summary?.total_rem_sleep_time_milli
        ? Math.round(sleep.score.stage_summary.total_rem_sleep_time_milli / 60000)
        : null
    } : null,
    recovery: recovery ? {
      score: recovery.score?.recovery_score,
      hrv: recovery.score?.hrv_rmssd_milli,
      rhr: recovery.score?.resting_heart_rate,
      timestamp: recovery.created_at
    } : null,
    flags,
    training_hint: trainingHint
  };
}

// 获取最近训练数据
async function getLatestWorkout() {
  const data = await getWithAuth('/activity/workout?limit=1');
  if (!data.records || data.records.length === 0) {
    return null;
  }
  return data.records[0];
}

// 获取训练历史（最近 7 天）
async function getWorkoutHistory(limit = 10) {
  const data = await getWithAuth(`/activity/workout?limit=${limit}`);
  return data.records || [];
}

// 获取身体数据
async function getBodyMeasurement() {
  return await getWithAuth('/user/measurement/body');
}

// 获取睡眠历史
async function getSleepHistory(limit = 7) {
  const data = await getWithAuth(`/activity/sleep?limit=${limit}`);
  return data.records || [];
}

// 获取恢复历史（通过多个 cycles）
async function getRecoveryHistory(limit = 7) {
  const cycleData = await getWithAuth(`/cycle?limit=${limit}`);
  if (!cycleData.records || cycleData.records.length === 0) {
    return [];
  }

  const recoveries = [];
  for (const cycle of cycleData.records) {
    try {
      const recovery = await getWithAuth(`/cycle/${cycle.id}/recovery`);
      recoveries.push({
        cycle_id: cycle.id,
        date: cycle.start,
        ...recovery
      });
    } catch (err) {
      // 跳过没有 recovery 的 cycle
    }
  }
  return recoveries;
}

// 获取周期历史
async function getCycleHistory(limit = 7) {
  const data = await getWithAuth(`/cycle?limit=${limit}`);
  return data.records || [];
}

// 获取完整健康报告（过去 7 天趋势）
async function getWeeklyReport() {
  const [sleepHistory, cycleHistory] = await Promise.all([
    getSleepHistory(7).catch(() => []),
    getCycleHistory(7).catch(() => [])
  ]);

  // 计算睡眠趋势
  const sleepScores = sleepHistory
    .filter(s => s.score?.sleep_performance_percentage)
    .map(s => s.score.sleep_performance_percentage);

  const avgSleepScore = sleepScores.length > 0
    ? Math.round(sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length)
    : null;

  // 计算平均 strain
  const strains = cycleHistory
    .filter(c => c.score?.strain)
    .map(c => c.score.strain);

  const avgStrain = strains.length > 0
    ? (strains.reduce((a, b) => a + b, 0) / strains.length).toFixed(1)
    : null;

  return {
    period: '7 days',
    sleep: {
      average_score: avgSleepScore,
      total_records: sleepHistory.length,
      recent: sleepHistory.slice(0, 3).map(s => ({
        date: s.start,
        score: s.score?.sleep_performance_percentage,
        duration_hours: s.score?.stage_summary?.total_in_bed_time_milli
          ? (s.score.stage_summary.total_in_bed_time_milli / 3600000).toFixed(1)
          : null
      }))
    },
    strain: {
      average: avgStrain,
      recent: cycleHistory.slice(0, 3).map(c => ({
        date: c.start,
        strain: c.score?.strain?.toFixed(1)
      }))
    }
  };
}

module.exports = {
  refreshAccessToken,
  getWithAuth,
  getLatestSleep,
  getLatestRecovery,
  getLatestCycle,
  getUserProfile,
  getTodaySummary,
  getLatestWorkout,
  getWorkoutHistory,
  getBodyMeasurement,
  getSleepHistory,
  getRecoveryHistory,
  getCycleHistory,
  getWeeklyReport
};
