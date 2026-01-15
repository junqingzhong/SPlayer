/*
 * @Author: ZJQ
 * @Date: 2025-12-10 16:41:55
 * @LastEditors: zjq zjq@xkb.com.cn
 * @LastEditTime: 2026-01-14 17:04:32
 * @FilePath: \tea\src\composables\List\useListDetail.ts
 * @Description:
 *
 * Copyright (c) 2026 by ${git_name_email}, All Rights Reserved.
 */
import type { CoverType, SongType } from "@/types/main";
import { useStatusStore, useSettingStore } from "@/stores";

/**
 * 列表详情逻辑
 */
export const useListDetail = () => {
  const statusStore = useStatusStore();
  const settingStore = useSettingStore();

  const detailData = ref<CoverType | null>(null);
  const listData = shallowRef<SongType[]>([]);
  const loading = ref<boolean>(true);

  /**
   * 计算列表高度
   */
  const getSongListHeight = (listScrolling: boolean) => {
    const headerHeight = settingStore.isMobileMode ? 160 : 240;
    const collapsedHeight = settingStore.isMobileMode ? 80 : 120;
    return statusStore.mainContentHeight - (listScrolling ? collapsedHeight : headerHeight);
  };

  /**
   * 重置数据
   */
  const resetData = (resetList: boolean = true) => {
    detailData.value = null;
    if (resetList) {
      listData.value = [];
    }
  };

  /**
   * 设置详情数据
   */
  const setDetailData = (data: CoverType | null) => {
    detailData.value = data;
  };

  /**
   * 设置列表数据
   */
  const setListData = (data: SongType[]) => {
    listData.value = data;
  };

  /**
   * 追加列表数据
   */
  const appendListData = (data: SongType[]) => {
    listData.value = [...listData.value, ...data];
  };

  /**
   * 设置加载状态
   */
  const setLoading = (value: boolean) => {
    loading.value = value;
  };

  return {
    detailData,
    listData,
    loading,
    getSongListHeight,
    resetData,
    setDetailData,
    setListData,
    appendListData,
    setLoading,
  };
};
