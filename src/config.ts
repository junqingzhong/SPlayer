/**
 * @Author: ZJQ
 * @Date: 2025-04-29
 * @Description: 全局配置文件
 */

// 默认配置
const defaultConfig = {
  // API服务器端口
  serverPort: Number(import.meta.env.VITE_SERVER_PORT || 25884),
  // API基础URL
  apiBaseUrl: import.meta.env.VITE_API_URL || '/api/netease',
  // 解锁API URL
  unblockApiUrl: '/api/unblock',
  // 网易云音乐API URL
  neteaseApiUrl: '/api/netease',
  // 默认真实IP
  defaultRealIP: '116.25.146.177',
  // 全局代理配置
  globalProxyConfig: {
    enabled: false,
    type: 'http',
    host: '',
    port: 0,
    username: '',
    password: ''
  }
};

// 获取用户自定义配置（如果有）
const getUserConfig = () => {
  try {
    const userConfigStr = localStorage.getItem('splayer-config');
    if (userConfigStr) {
      return JSON.parse(userConfigStr);
    }
  } catch (error) {
    console.error('读取用户配置失败:', error);
  }
  return {};
};

// 合并默认配置和用户配置
const config = {
  ...defaultConfig,
  ...getUserConfig()
};

/**
 * 更新配置
 * @param newConfig 新配置
 */
export const updateConfig = (newConfig: Partial<typeof config>) => {
  Object.assign(config, newConfig);
  try {
    localStorage.setItem('splayer-config', JSON.stringify(config));
  } catch (error) {
    console.error('保存配置失败:', error);
  }
};

export default config;