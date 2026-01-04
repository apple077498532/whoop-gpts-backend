const fs = require('fs');
const path = require('path');

// 生产环境使用 Render Disk（/data），本地使用项目目录
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '../../data');
const TOKEN_FILE = path.join(DATA_DIR, 'token.json');

// 预留 5 分钟 buffer，提前刷新
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

function saveToken({ access_token, refresh_token, expires_in }) {
  const expires_at = Date.now() + (expires_in * 1000);
  const tokenData = {
    access_token,
    refresh_token,
    expires_at,
    updated_at: Date.now()
  };

  // 确保 data 目录存在
  const dataDir = path.dirname(TOKEN_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  return tokenData;
}

function getToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    return null;
  }

  try {
    const data = fs.readFileSync(TOKEN_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to read token file:', err);
    return null;
  }
}

function isTokenExpired() {
  const token = getToken();
  if (!token) return true;

  // 当前时间 + buffer 是否超过过期时间
  return Date.now() + EXPIRY_BUFFER_MS >= token.expires_at;
}

function clearToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    fs.unlinkSync(TOKEN_FILE);
  }
}

module.exports = {
  saveToken,
  getToken,
  isTokenExpired,
  clearToken
};
