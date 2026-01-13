/*
 * @Author: ZJQ
 * @Date: 2025-12-15 16:45:01
 * @LastEditors: zjq zjq@xkb.com.cn
 * @LastEditTime: 2025-12-15 16:48:55
 * @FilePath: \tea\src\utils\timeFormat.ts
 * @Description:
 *
 * Copyright (c) 2025 by ${git_name_email}, All Rights Reserved.
 */
/**
 * 统一时间格式化工具函数
 * @param seconds - 秒数
 * @param mode - 格式化模式：'HH:MM:SS' 或 'MM:SS'
 * @returns 格式化后的时间字符串
 */
export function formatTime(seconds: number, mode: 'HH:MM:SS' | 'MM:SS' = 'MM:SS'): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (mode === 'HH:MM:SS') {
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  }

  // MM:SS 模式：如果超过1小时，显示为 60+:MM:SS
  if (h > 0) {
    return `${h * 60 + m}:${s.toString().padStart(2, '0')}`;
  }

  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 将毫秒转换为秒
 * @param milliseconds - 毫秒数
 * @returns 秒数
 */
export function millisecondsToSeconds(milliseconds: number): number {
  return Math.floor(milliseconds / 1000);
}

/**
 * 将秒转换为毫秒
 * @param seconds - 秒数
 * @returns 毫秒数
 */
export function secondsToMilliseconds(seconds: number): number {
  return seconds * 1000;
}

/**
 * 解析时间字符串为秒数
 * @param timeStr - 时间字符串，格式为 MM:SS 或 HH:MM:SS
 * @returns 秒数
 */
export function parseTime(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;

  const parts = timeStr.split(':');
  if (parts.length === 0) return 0;

  let seconds = 0;

  if (parts.length === 3) {
    // HH:MM:SS 格式
    const [h, m, s] = parts.map(Number);
    seconds = h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    // MM:SS 格式
    const [m, s] = parts.map(Number);
    seconds = m * 60 + s;
  } else if (parts.length === 1) {
    // 纯秒数
    seconds = Number(parts[0]) || 0;
  }

  return isNaN(seconds) ? 0 : seconds;
}