import Cookies from "js-cookie";

// 获取 Cookie
export const getCookie = (key: string) => {
  return Cookies.get(key) ?? localStorage.getItem(`cookie-${key}`);
};

// 移除 Cookie
export const removeCookie = (key: string) => {
  Cookies.remove(key);
  localStorage.removeItem(`cookie-${key}`);
};

// 清除所有 Cookie
export const clearAllCookies = () => {
  // 清除 js-cookie 管理的 cookie
  const allCookies = Cookies.get();
  for (const name in allCookies) {
    Cookies.remove(name);
  }

  // 清除 document.cookie
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i];
    const eqPos = cookie.indexOf('=');
    const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
  }

  // 清除 localStorage 中存储的 cookie
  const localStorageKeys = Object.keys(localStorage);
  for (const key of localStorageKeys) {
    if (key.startsWith('cookie-')) {
      localStorage.removeItem(key);
    }
  }

  console.log('已清除所有Cookie');
};

// 设置 Cookie
export const setCookies = (cookieValue: string) => {
  if (!cookieValue || cookieValue.trim() === '') {
    console.warn('Cookie值为空，跳过设置');
    return;
  }

  const cookies = cookieValue.split(";");
  const date = new Date();
  // 永不过期
  date.setFullYear(date.getFullYear() + 50);
  const expires = `expires=${date.toUTCString()}`;
  // 写入
  cookies.forEach((cookie) => {
    // document.cookie = cookie;
    const cookieParts = cookie.split(";");
    const nameValuePair = cookieParts[0].split("=");
    const name = nameValuePair[0]?.trim();
    const value = nameValuePair[1]?.trim();

    if (!name || !value) {
      console.warn(`无效的Cookie: ${cookie}`);
      return;
    }

    console.info(`设置Cookie: ${name}=${value.substring(0, 3)}...`);
    // 设置 cookie
    document.cookie = `${name}=${value}; ${expires}; path=/`;
    // 保存 cookie
    localStorage.setItem(`cookie-${name}`, value);
  });

  console.log(`成功设置 ${cookies.length} 个Cookie`);
};
