import type { SettingState } from "../setting";
import { defaultAMLLDbServer } from "@/utils/meta";

/**
 * 当前设置 Schema 版本号
 */
export const CURRENT_SETTING_SCHEMA_VERSION = 1;

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
  /**
   * 迁移到版本 1
   */
  1: () => {
    return {
      schemaVersion: 1,
      // amllDbServer 同步为新的默认值
      amllDbServer: defaultAMLLDbServer,
    };
  },
};

/**
 * 执行迁移
 * @param state 当前状态
 * @param fromVersion 当前版本号（如果不存在则为 0）
 * @param toVersion 目标版本号
 * @returns 迁移后的状态
 */
export const migrateSettingState = (
  state: Partial<SettingState>,
  fromVersion: number,
  toVersion: number,
): Partial<SettingState> => {
  let migratedState = { ...state };

  // 按版本顺序执行迁移
  for (let version = fromVersion + 1; version <= toVersion; version++) {
    const migration = settingMigrations[version];
    if (migration) {
      // 迁移函数返回需要更新的字段，自动合并到原有状态
      const updates = migration(migratedState);
      migratedState = { ...migratedState, ...updates };
    } else {
      console.warn(`[Setting Migration] 未找到版本 ${version} 的迁移脚本，跳过`);
    }
  }

  return migratedState;
};
