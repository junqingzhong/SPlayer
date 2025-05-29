<template>
  <div class="activities-container">
    <div class="activities-header">
      <div class="search-box">
        <n-input
          v-model:value="searchKeyword"
          placeholder="搜索任务名称"
          clearable
          class="search-input"
        >
          <template #prefix>
            <SvgIcon name="Search" />
          </template>
        </n-input>
      </div>
      <n-space>
        <n-button @click="fetchActivities" class="refresh-btn">
          <template #icon>
            <SvgIcon name="Refresh" />
          </template>
          刷新
        </n-button>
        <n-button type="primary" @click="showAddModal = true" class="add-btn">
          <template #icon>
            <SvgIcon name="Add" />
          </template>
          添加
        </n-button>
      </n-space>
    </div>

    <!-- Cookie提示 -->
    <n-alert v-if="!hasToken" type="warning" style="margin-bottom: 16px">
      <template #icon>
        <SvgIcon name="Warning" />
      </template>
      您尚未设置Cookie或Token，部分功能可能无法正常使用。请先在设置中添加Cookie。
    </n-alert>

    <div class="filter-tabs">
      <n-tabs type="line" v-model:value="currentTab" @update:value="handleTabChange">
        <n-tab name="all">全部</n-tab>
        <n-tab name="未开始">未开始</n-tab>
        <n-tab name="进行中">进行中</n-tab>
        <n-tab name="已完成">已完成</n-tab>
        <n-tab name="已取消">已取消</n-tab>
      </n-tabs>
      <n-space>
        <n-button text @click="toggleSortOrder">
          <template #icon>
            <SvgIcon :name="sortOrder === 'asc' ? 'ArrowUp' : 'ArrowDown'" />
          </template>
          按时间排序
        </n-button>
        <n-button text @click="exportToExcel">
          <template #icon>
            <SvgIcon name="Download" />
          </template>
          导出Excel
        </n-button>
        <n-button text @click="toggleCalendarView">
          <template #icon>
            <SvgIcon name="Calendar" />
          </template>
          {{ showCalendar ? '列表视图' : '日历视图' }}
        </n-button>
      </n-space>
    </div>

    <!-- 日历视图 -->
    <div v-if="showCalendar" class="calendar-view">
      <n-calendar
        :value="selectedDateTimestamp"
        #default="{ year, month, date }"
        @update:value="handleDateSelect"
      >
        <div
          class="calendar-cell"
          :class="{
            'has-activity': hasActivityOnDate(year, month, date),
            'is-selected': isSelectedDate(year, month, date)
          }"
        >
          <div class="calendar-date">{{ date }}</div>
          <div v-if="hasActivityOnDate(year, month, date)" class="activity-indicator"></div>
        </div>
      </n-calendar>

      <div v-if="selectedDateActivities.length > 0" class="selected-date-activities">
        <h3>{{ formatSelectedDate() }} 的活动</h3>
        <div class="activity-cards selected-activities">
          <div
            v-for="activity in selectedDateActivities"
            :key="activity.id"
            class="activity-card"
            @click="handleActivityClick(activity)"
          >
            <div class="activity-status" :class="activity.status">{{ activity.status }}</div>
            <div class="activity-title">{{ activity.name }}</div>
            <div class="activity-info">
              <div class="activity-date">{{ activity.date }}</div>
            </div>
            <div class="activity-actions">
              <n-button text @click.stop="editActivity(activity)">
                <template #icon>
                  <SvgIcon name="Edit" />
                </template>
              </n-button>
              <n-button text @click.stop="deleteActivity(activity.id)">
                <template #icon>
                  <SvgIcon name="Delete" />
                </template>
              </n-button>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="selectedDate" class="empty-state">
        {{ formatSelectedDate() }} 没有活动
      </div>
    </div>

    <!-- 列表视图 -->
    <div v-else class="activities-list">
      <n-empty v-if="filteredActivities.length === 0" description="暂无活动" />
      <div v-else class="activity-items">
        <n-card v-for="activity in filteredActivities" :key="activity.id" class="activity-card">
          <div class="activity-status">
            <n-tag :type="getStatusType(activity.status)" size="small">
              {{ activity.status }}
            </n-tag>
          </div>
          <div class="activity-title">
            <h3>{{ activity.name }}</h3>
          </div>
          <div class="activity-info">
            <div class="info-item">
              <SvgIcon name="Calendar" />
              <span>{{ activity.date }}</span>
            </div>
            <div v-if="activity.address" class="info-item">
              <SvgIcon name="Location" />
              <span>{{ activity.address }}</span>
            </div>
            <div v-if="activity.remark" class="info-item">
              <SvgIcon name="Info" />
              <span>{{ activity.remark }}</span>
            </div>
          </div>
          <div class="activity-actions">
            <n-button circle tertiary @click="editActivity(activity)">
              <template #icon>
                <SvgIcon name="Edit" />
              </template>
            </n-button>
            <n-button circle tertiary @click="deleteActivity(activity.id)">
              <template #icon>
                <SvgIcon name="Delete" />
              </template>
            </n-button>
          </div>
        </n-card>
      </div>
    </div>

    <!-- 添加/编辑活动弹窗 -->
    <n-modal
      v-model:show="showAddModal"
      preset="card"
      :title="isEditing ? '编辑活动' : '添加活动'"
      style="width: 500px"
      :mask-closable="false"
    >
      <n-form
        ref="formRef"
        :model="activityForm"
        :rules="rules"
        label-placement="left"
        label-width="80px"
        require-mark-placement="right-hanging"
      >
        <n-form-item label="活动名称" path="name">
          <n-input v-model:value="activityForm.name" placeholder="请输入活动名称" />
        </n-form-item>
        <n-form-item label="活动日期" path="date">
          <n-date-picker v-model:value="activityForm.date" type="date" clearable />
        </n-form-item>
        <n-form-item label="活动状态" path="status">
          <n-select
            v-model:value="activityForm.status"
            :options="[
              { label: '未开始', value: '未开始' },
              { label: '进行中', value: '进行中' },
              { label: '已完成', value: '已完成' },
              { label: '已取消', value: '已取消' },
            ]"
          />
        </n-form-item>
        <n-form-item label="活动地点" path="address">
          <n-input v-model:value="activityForm.address" placeholder="请输入活动地点" />
        </n-form-item>
        <n-form-item label="活动备注" path="remark">
          <n-input
            v-model:value="activityForm.remark"
            type="textarea"
            placeholder="请输入活动备注"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddModal = false">取消</n-button>
          <n-button type="primary" @click="submitActivity" :loading="submitting">
            确定
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 删除确认弹窗 -->
    <n-modal
      v-model:show="showDeleteModal"
      preset="dialog"
      title="确认删除"
      content="确定要删除这个活动吗？此操作不可恢复。"
      positive-text="确定"
      negative-text="取消"
      @positive-click="confirmDelete"
      @negative-click="cancelDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useMessage, NCalendar, NButton, NSpace } from "naive-ui";
import type { FormInst, FormRules } from "naive-ui";
import { formatDate } from "@/utils/helper";
import { getCookie } from "@/utils/cookie";
import axios from "axios";
import { useSettingStore } from "@/stores";

interface Activity {
  id: number;
  name: string;
  date: string;
  status: string;
  address?: string;
  remark?: string;
  categoryId?: number;
}

// 状态管理
const message = useMessage();
const activities = ref<Activity[]>([]);
const searchKeyword = ref("");
const currentTab = ref("all");
const sortOrder = ref<"asc" | "desc">("desc");
const showAddModal = ref(false);
const showDeleteModal = ref(false);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);
const deleteId = ref<number | null>(null);
const isEditing = ref(false);
const hasToken = ref(false);

// 日历相关
const showCalendar = ref(false);
const selectedDate = ref(new Date());
const selectedDateTimestamp = computed(() => {
  return selectedDate.value ? selectedDate.value.getTime() : new Date().getTime();
});

const selectedDateActivities = computed(() => {
  if (!selectedDate.value) return [];

  const year = selectedDate.value.getFullYear();
  const month = selectedDate.value.getMonth();
  const date = selectedDate.value.getDate();

  return activities.value.filter(activity => {
    const activityDate = parseDate(activity.date);
    if (typeof activityDate === 'number') return false;

    return (
      activityDate.getFullYear() === year &&
      activityDate.getMonth() === month &&
      activityDate.getDate() === date
    );
  });
});

// 切换日历/列表视图
const toggleCalendarView = () => {
  showCalendar.value = !showCalendar.value;
};

// 处理日期选择
const handleDateSelect = (timestamp: number) => {
  selectedDate.value = new Date(timestamp);
};

// 表单数据
const activityForm = ref<{
  id: number;
  name: string;
  date: number | null; // 修改为number | null，以适配n-date-picker的Value类型
  status: string;
  address?: string; // 设为可选
  remark?: string; // 设为可选
  categoryId?: number; // 设为可选
}>({
  id: 0,
  name: "",
  date: null, // 修改为null，以适配n-date-picker的Value类型
  status: "未开始",
  address: "",
  remark: "",
  categoryId: 0,
});

// 表单验证规则
const rules: FormRules = {
  name: {
    required: true,
    message: "请输入活动名称",
    trigger: ["blur", "input"],
  },
  date: {
    required: true,
    message: "请选择活动日期",
    trigger: ["blur", "change"],
  },
  status: {
    required: true,
    message: "请选择活动状态",
    trigger: ["blur", "change"],
  },
};

// 检查是否有token
const checkToken = () => {
  const token = getCookie('MUSIC_U') || localStorage.getItem('token');
  hasToken.value = !!token;
  return token;
};

// 过滤后的活动列表
const filteredActivities = computed(() => {
  let result = activities.value;

  // 关键词搜索
  if (searchKeyword.value) {
    result = result.filter((activity) =>
      activity.name.toLowerCase().includes(searchKeyword.value.toLowerCase())
    );
  }

  // 状态过滤
  if (currentTab.value !== "all") {
    result = result.filter((activity) => activity.status === currentTab.value);
  }

  // 排序
  result = [...result].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return sortOrder.value === "asc" ? dateA - dateB : dateB - dateA;
  });

  return result;
});

// 获取活动列表
const fetchActivities = async () => {
  try {
    const { activitiesApiBaseUrl } = useSettingStore();
    const token = checkToken();

    // 如果没有token，尝试使用公开API获取活动列表
    const apiUrl = token
      ? `${activitiesApiBaseUrl}/lists`
      : `${activitiesApiBaseUrl}/public/lists`;

    console.log('获取活动列表，API地址:', apiUrl);

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await axios.get(apiUrl, { headers });

    if (response.data.status === 200) {
      activities.value = response.data.data;
    } else {
      message.error("获取活动列表失败");
    }
  } catch (error) {
    console.error("获取活动列表失败:", error);
    message.error("获取活动列表失败，请检查网络连接或API域名配置");
  }
};

// 添加活动
const addActivity = async () => {
  try {
    const token = checkToken();
    if (!token) {
      message.warning("您尚未设置Cookie或Token，无法添加活动");
      return;
    }

    submitting.value = true;
    // 修复：处理date可能为null的情况
    const formattedDate = activityForm.value.date
      ? formatDate(new Date(activityForm.value.date), "yyyy年MM月dd日")
      : "";
    const payload = {
      ...activityForm.value,
      date: formattedDate,
    };

    const { activitiesApiBaseUrl } = useSettingStore();
    const apiUrl = `${activitiesApiBaseUrl}/addlist`;
    console.log('添加活动，API地址:', apiUrl);

    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.status === 201) {
      message.success("添加活动成功");
      showAddModal.value = false;
      await fetchActivities();
      resetForm();
    } else {
      message.error(response.data.data.message || "添加活动失败");
    }
  } catch (error) {
    console.error("添加活动失败:", error);
    message.error("添加活动失败，请检查网络连接或API域名配置");
  } finally {
    submitting.value = false;
  }
};

// 更新活动
const updateActivity = async () => {
  try {
    const token = checkToken();
    if (!token) {
      message.warning("您尚未设置Cookie或Token，无法更新活动");
      return;
    }

    submitting.value = true;
    // 修复：处理date可能为null的情况
    const formattedDate = activityForm.value.date
      ? formatDate(new Date(activityForm.value.date), "yyyy年MM月dd日")
      : "";
    const payload = {
      ...activityForm.value,
      date: formattedDate,
    };

    const { activitiesApiBaseUrl } = useSettingStore();
    const apiUrl = `${activitiesApiBaseUrl}/editlist/${activityForm.value.id}`;
    console.log('更新活动，API地址:', apiUrl);

    const response = await axios.put(apiUrl, payload, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.status === 200) {
      message.success("更新活动成功");
      showAddModal.value = false;
      await fetchActivities();
      resetForm();
    } else {
      message.error(response.data.data.message || "更新活动失败");
    }
  } catch (error) {
    console.error("更新活动失败:", error);
    message.error("更新活动失败，请检查网络连接或API域名配置");
  } finally {
    submitting.value = false;
  }
};

// 提交活动表单
const submitActivity = () => {
  formRef.value?.validate(async (errors) => {
    if (!errors) {
      if (isEditing.value) {
        await updateActivity();
      } else {
        await addActivity();
      }
    } else {
      message.error("请完善表单信息");
    }
  });
};

// 检查指定日期是否有活动
const hasActivityOnDate = (year: number, month: number, date: number) => {
  return activities.value.some(activity => {
    const activityDate = parseDate(activity.date);
    if (!(activityDate instanceof Date)) return false;

    return (
      activityDate.getFullYear() === year &&
      activityDate.getMonth() === month - 1 && // 日历组件的月份从1开始，而Date对象的月份从0开始
      activityDate.getDate() === date
    );
  });
};

// 检查是否为选中日期
const isSelectedDate = (year: number, month: number, date: number) => {
  if (!selectedDate.value) return false;

  return (
    selectedDate.value.getFullYear() === year &&
    selectedDate.value.getMonth() === month - 1 && // 日历组件的月份从1开始，而Date对象的月份从0开始
    selectedDate.value.getDate() === date
  );
};

// 格式化选中的日期
const formatSelectedDate = () => {
  if (!selectedDate.value) return "";
  return formatDate(selectedDate.value, "yyyy年MM月dd日");
};

// 处理活动点击
const handleActivityClick = (activity: Activity) => {
  // 可以在这里添加点击活动的处理逻辑
  console.log('点击了活动:', activity);
};

// 解析日期字符串为日期对象
const parseDate = (dateStr: string): Date => {
  const match = dateStr.match(/(\d{4})年(\d{2})月(\d{2})日/);
  if (match) {
    const [_, year, month, day] = match;
    return new Date(`${year}-${month}-${day}`);
  }
  return new Date(dateStr);
};

// 导出Excel（CSV格式）
const exportToExcel = async () => {
  try {
    // 检查是否有数据
    if (filteredActivities.value.length === 0) {
      message.warning("没有数据可导出");
      return;
    }

    const token = checkToken();
    if (!token) {
      message.warning("您尚未设置Cookie或Token，无法导出活动列表");
      return;
    }

    const { activitiesApiBaseUrl } = useSettingStore();

    // 构建API URL
    const apiUrl = `${activitiesApiBaseUrl}/export/lists`;

    // 使用axios直接获取文件
    const response = await axios.get(apiUrl, {
      responseType: 'blob',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // 创建Blob对象
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });

    // 使用FileSaver保存文件
    import('file-saver').then(({ saveAs }) => {
      saveAs(blob, `活动列表_${formatDate(new Date(), "yyyy-MM-dd")}.csv`);
      message.success("导出成功");
    });
  } catch (error) {
    console.error("导出Excel失败:", error);
    message.error("导出失败，请稍后再试");
  }
};

onMounted(() => {
  checkToken();
  fetchActivities();
});

const editActivity = (activity: Activity) => {
  isEditing.value = true;
  activityForm.value = {
    ...activity,
    // 将日期字符串转换为时间戳
    date: activity.date ? parseDate(activity.date).getTime() : null,
  };
  showAddModal.value = true;
};

// 删除活动
const deleteActivity = (id: number) => {
  deleteId.value = id;
  showDeleteModal.value = true;
};

// 确认删除
const confirmDelete = async () => {
  if (deleteId.value) {
    try {
      const token = checkToken();
      if (!token) {
        message.warning("您尚未设置Cookie或Token，无法删除活动");
        showDeleteModal.value = false;
        deleteId.value = null;
        return;
      }

      const { activitiesApiBaseUrl } = useSettingStore();
      const apiUrl = `${activitiesApiBaseUrl}/dellist/${deleteId.value}`;
      console.log('删除活动，API地址:', apiUrl);

      const response = await axios.delete(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.status === 200) {
        message.success("删除活动成功");
        await fetchActivities();
      } else {
        message.error(response.data.data.message || "删除活动失败");
      }
    } catch (error) {
      console.error("删除活动失败:", error);
      message.error("删除活动失败，请检查网络连接或API域名配置");
    } finally {
      showDeleteModal.value = false;
      deleteId.value = null;
    }
  }
};

// 取消删除
const cancelDelete = () => {
  showDeleteModal.value = false;
  deleteId.value = null;
};

// 重置表单
const resetForm = () => {
  activityForm.value = {
    id: 0,
    name: "",
    date: null,
    status: "未开始",
    address: "",
    remark: "",
    categoryId: 0,
  };
  isEditing.value = false;
};

// 切换排序方式
const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
};

// 处理标签切换
const handleTabChange = (tab: string) => {
  currentTab.value = tab;
};

// 获取状态类型
const getStatusType = (status: string): "default" | "error" | "info" | "success" | "warning" => {
  switch (status) {
    case "未开始":
      return "info";
    case "进行中":
      return "success";
    case "已完成":
      return "success";
    case "已取消":
      return "error";
    default:
      return "default";
  }
};

onMounted(() => {
  checkToken();
  fetchActivities();
});
</script>

<style lang="scss" scoped>
.activities-container {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;

  .activities-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    .search-box {
      flex: 1;
      max-width: 400px;
    }

    .refresh-btn {
      margin-right: 8px;
    }

    .add-btn {
      margin-left: 8px;
    }
  }

  .filter-tabs {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .activities-list {
    flex: 1;
    overflow-y: auto;

    .activity-items {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    .activity-card {
      position: relative;
      transition: all 0.3s ease;

      &:hover {
        transform: translateY(-5px);
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
      }

      .activity-status {
        position: absolute;
        top: 12px;
        right: 12px;
      }

      .activity-title {
        margin-bottom: 12px;

        h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }
      }

      .activity-info {
        margin-bottom: 16px;

        .info-item {
          display: flex;
          align-items: center;
          margin-bottom: 8px;

          svg {
            margin-right: 8px;
            opacity: 0.7;
          }

          span {
            font-size: 14px;
          }
        }
      }

      .activity-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
    }
  }

  .custom-bg-container {
    width: 100%;
    margin-top: 16px;

    .custom-bg-preview {
      margin-bottom: 16px;
      border-radius: 8px;
      overflow: hidden;
    }

    .custom-bg-actions {
      gap: 16px;
    }
  }

  /* 日历视图样式 */
  .calendar-view {
    margin-top: 16px;
    background-color: var(--n-card-color);
    border-radius: 8px;
    padding: 16px;
    box-shadow: var(--n-box-shadow);
    overflow-y: auto;
    flex: 1;
  }

  .calendar-cell {
    position: relative;
    height: 100%;
    min-height: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.3s;
  }

  .calendar-cell:hover {
    background-color: rgba(128, 128, 255, 0.1);
  }

  .calendar-cell.has-activity {
    font-weight: bold;
  }

  .calendar-cell.is-selected {
    background-color: rgba(128, 128, 255, 0.2);
  }

  .calendar-date {
    font-size: 14px;
    margin-bottom: 4px;
  }

  .activity-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #18a058;
    position: absolute;
    bottom: 4px;
  }

  .selected-date-activities {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--n-border-color);
  }

  .selected-date-activities h3 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 16px;
    font-weight: 500;
    color: var(--n-title-text-color);
  }

  .selected-activities {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 16px;
  }
}
</style>
