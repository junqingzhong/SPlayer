import type { SettingState } from "../setting";
import { defaultAMLLDbServer } from "@/utils/meta";
import { SongUnlockServer } from "@/core/player/SongManager";

/**
 * 当前设置 Schema 版本号
 */
export const CURRENT_SETTING_SCHEMA_VERSION = 4;

/**
 * 迁移函数类型
 * 迁移函数只需返回需要更新的字段，系统会自动合并到原有状态
 */
export type MigrationFunction = (state: Partial<SettingState>) => Partial<SettingState>;

/**
 * 迁移脚本映射表
 * key: 目标版本号
 * value: 从上一版本迁移到该版本的函数
 */
export const settingMigrations: Record<number, MigrationFunction> = {
  3: () => {
    return {
      // ttml 同步
      enableTTMLLyric: false,
      amllDbServer: defaultAMLLDbServer,
    };
  },
  4: (state) => {
    // 确保 songUnlockServer 包含所有音源
    const defaultServers = [
      { key: SongUnlockServer.NETEASE, enabled: true },
      { key: SongUnlockServer.QQ, enabled: true },
      { key: SongUnlockServer.KUGOU, enabled: true },
      { key: SongUnlockServer.KUWO, enabled: true },
      { key: SongUnlockServer.BILIBILI, enabled: true },
      { key: SongUnlockServer.BODIAN, enabled: true },
      { key: SongUnlockServer.GEQUBAO, enabled: true },
    ];

    // 如果当前配置缺少音源，使用完整的默认配置
    if (!state.songUnlockServer || state.songUnlockServer.length < defaultServers.length) {
      return {
        songUnlockServer: defaultServers,
      };
    }

    // 如果配置存在但可能缺少某些音源，合并现有配置与默认配置
    const existingKeys = state.songUnlockServer.map(s => s.key);
    const missingServers = defaultServers.filter(s => !existingKeys.includes(s.key));

    if (missingServers.length > 0) {
      return {
        songUnlockServer: [...state.songUnlockServer, ...missingServers],
      };
    }

    return {};
  },
};

