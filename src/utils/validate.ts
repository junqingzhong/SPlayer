/**
 * @file validate.ts
 * @description 常用验证函数
 * @author imsyy
 */

/**
 * 验证字符串是否为有效的 URL。
 * 此函数能正确处理包含 localhost、IP 地址和端口号的 URL。
 * @param urlString 要验证的字符串。
 * @returns 如果是有效 URL，则返回 true；否则返回 false。
 */
export const isValidURL = (urlString: string): boolean => {
  const urlValue = urlString.trim();
  if (!urlValue) {
    return false;
  }

  // 如果用户未输入协议头，则自动添加 http:// 以便 URL 构造函数进行验证
  const urlWithProtocol =
    urlValue.startsWith("http://") || urlValue.startsWith("https://")
      ? urlValue
      : `http://${urlValue}`;

  try {
    // 使用内置的 URL 构造函数进行稳健的验证
    new URL(urlWithProtocol);
    return true;
  } catch (error) {
    return false;
  }
};