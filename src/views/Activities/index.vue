<template>
  <div class="activities-container">
    <div class="activities-header">
      <h2>活动列表</h2>
      <n-space>
        <n-button type="primary" @click="showAddModal = true" class="add-btn" v-if="hasToken">
          <template #icon>
            <SvgIcon name="Add" />
          </template>
          添加活动
        </n-button>
        <n-button @click="goToCategoryManagement" class="category-btn" v-if="hasToken">
          <template #icon>
            <SvgIcon name="Category" />
          </template>
          分类管理
        </n-button>
        <n-button type="info" @click="goToUserManagement" class="user-btn" v-if="hasToken">
          <template #icon>
            <SvgIcon name="User" />
          </template>
          用户管理
        </n-button>
        <n-button @click="fetchActivities" class="refresh-btn">
          <template #icon>
            <SvgIcon name="Refresh" />
          </template>
          刷新
        </n-button>
        <n-button @click="exportToExcel" class="export-btn" v-if="hasToken">
          <template #icon>
            <SvgIcon name="Download" />
          </template>
          导出EXCEL
        </n-button>
        <n-button @click="toggleCalendarView" class="calendar-btn">
          <template #icon>
            <SvgIcon :name="showCalendar ? 'List' : 'Calendar'" />
          </template>
          {{ showCalendar ? '列表视图' : '日历视图' }}
        </n-button>
      </n-space>
    </div>

    <!-- 搜索和筛选 -->
    <div class="filter-container">
      <n-input v-model:value="searchKeyword" placeholder="搜索活动标题或内容" clearable class="search-input"
        @update:value="handleSearch">
        <template #prefix>
          <SvgIcon name="Search" />
        </template>
      </n-input>
      <n-select v-model:value="statusFilter" :options="[{ label: '全部', value: null }, ...statusOptions]" placeholder="状态筛选" clearable class="status-filter"
        @update:value="handleStatusFilterChange" />
      <n-button @click="toggleSortOrder" class="sort-button">
        {{ sortOrder === 'desc' ? '按时间正序' : '按时间倒序' }}
      </n-button>
    </div>

    <!-- 日历视图 -->
    <n-modal v-model:show="showCalendar" preset="card" title="活动日历" class="calendar-view" :mask-closable="true"
      :style="{ width: '80%',height:'60%' }">
      <n-calendar v-model:value="selectedDate" #="{ year, month, date }" @update:value="handleDateSelect">
        <template v-if="hasActivitiesOnDate(year, month, date)">
          <!-- 查找并显示对应日期的活动名称 -->
          <div v-for="activity in activities.filter((act) => {
              const activityDate = parseChineseDate(act.date)?.getTime();
              const checkDate = new Date(year, month - 1, date).getTime();
              return activityDate === checkDate;
            })" :key="activity.id" class="activity-name-ellipsis" :class="{
              'activity-complete': activity.status === '已完成',
              'activity-incomplete': activity.status !== '已完成',
            }">
            {{ activity.name }}
          </div>
        </template>
      </n-calendar>

      <n-modal v-model:show="isselectedDateActivities" preset="card" :title="selectedDateactivities[0]?.date" :mask-closable="true"
        :style="{ width: '70%',height:'60%' }">
        <div class="list-view">
          <n-list hoverable clickable class="list-div">
            <n-list-item v-for="activity in selectedDateactivities" :key="activity.id"
              :class="getActivityClass(activity.status)">
              <n-thing @click="updateActivityStatus(activity.id, activity.status)" :title="activity.name"
                :description="activity.address">
                <template #header-extra>
                  <n-space>
                    <n-tag :type="getStatusType(activity.status)">
                      {{ activity.status }}
                    </n-tag>
                    <n-tag type="warning">
                      {{ categories[activity.categoryId] ? categories[activity.categoryId] : '活动后台' }}
                    </n-tag>
                  </n-space>
                </template>
                <span>{{ activity.remark }}</span>
              </n-thing>
            </n-list-item>
          </n-list>
        </div>
      </n-modal>
    </n-modal>
    <!-- 列表视图 -->
    <div class="list-view">
      <n-empty v-if="filteredActivities.length === 0" description="暂无活动数据" />
      <n-list v-else hoverable clickable class="list-div">
        <n-list-item v-for="activity in filteredActivities" :key="activity.id"
          :class="getActivityClass(activity.status)">
          <n-thing @click="updateActivityStatus(activity.id, activity.status)" :title="activity.name"
            :description="activity.address">
            <template #header-extra>
              <n-space>
                <n-tag :type="getStatusType(activity.status)">
                  {{ activity.status }}
                </n-tag>
                <n-tag type="warning">
                  {{ categories[activity.categoryId] ? categories[activity.categoryId] : '活动后台' }}
                </n-tag>
              </n-space>
            </template>
            <span>{{ activity.remark }}</span>
          </n-thing>
          <n-space justify="space-between">
            <span>{{ activity.date }}</span>
            <n-space>
              <n-button size="small" type="info" @click="editActivity(activity)">
                编辑
              </n-button>
              <n-button size="small" type="error" @click="deleteActivity(activity.id)">
                删除
              </n-button>
            </n-space>
          </n-space>
        </n-list-item>
      </n-list>
    </div>

    <!-- 添加/编辑活动弹窗 -->
    <n-modal v-model:show="showAddModal" preset="card" :title="isEditing ? '编辑活动' : '添加活动'" class="activity-modal"
      :mask-closable="false">
      <n-form ref="formRef" :model="activityForm" :rules="rules" label-placement="left" label-width="auto"
        require-mark-placement="right-hanging">
        <n-form-item label="标题" path="name">
          <n-input v-model:value="activityForm.name" placeholder="请输入活动标题" />
        </n-form-item>
        <n-form-item label="地点" path="address">
          <n-input v-model:value="activityForm.address" placeholder="请输入活动地点" />
        </n-form-item>
        <n-form-item label="备注" path="remark">
          <n-input v-model:value="activityForm.remark" type="textarea" placeholder="请输入活动备注" :autosize="{
              minRows: 3,
              maxRows: 5
            }" />
        </n-form-item>
        <n-form-item label="日期" path="date">
          <n-date-picker v-model:value="activityForm.date" type="date" clearable style="width: 100%" />
        </n-form-item>
        <n-form-item label="状态" path="status">
          <n-select v-model:value="activityForm.status" :options="statusOptions" placeholder="请选择活动状态" />
        </n-form-item>
        <n-form-item label="分类" path="categoryId">
          <n-select v-model:value="activityForm.categoryId" :options="categoryOptions" placeholder="请选择活动分类" />
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
    <n-modal v-model:show="showDeleteModal" preset="dialog" title="确认删除" content="确定要删除这个活动吗？此操作不可恢复。"
      positive-text="确定" negative-text="取消" @positive-click="confirmDelete"
      @negative-click="() => { showDeleteModal = false; deleteId = null; }" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useMessage, NButton, NSpace, NTag, NDropdown } from "naive-ui";
import type { FormInst, FormRules, UploadFileInfo } from "naive-ui";
import { getCookie } from "@/utils/cookie";
import axios from "axios";
import { useSettingStore, useDataStore} from "@/stores";
import { formatDate } from "@/utils/helper";
import * as XLSX from "xlsx-js-style";
import { setCookies } from "@/utils/cookie";
import { updateUserData } from "@/utils/auth";

// 全局消息
const message = useMessage();
const router = useRouter();

// 状态管理
const activities = ref<any[]>([]);
const searchKeyword = ref("");
const statusFilter = ref(null);
const sortOrder = ref('desc');
const showAddModal = ref(false);
const showDeleteModal = ref(false);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);
const isEditing = ref(false);
const deleteId = ref<number | null>(null);
const hasToken = ref(false);
const categories = ref<any[]>([]);
const userId = ref<number | null>(null);

// 日历视图
const showCalendar = ref(false);
const isselectedDateActivities = ref(false);
const selectedDateactivities = ref<any[]>([]);
const selectedDate = ref(new Date().getTime());

// 计算选中日期的时间戳
const selectedDateTimestamp = computed(() => {
  const date = new Date(selectedDate.value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
});

// 切换日历视图
const toggleCalendarView = () => {
  showCalendar.value = !showCalendar.value;
};

// 处理日期选择
const handleDateSelect = (date: Date) => {
  selectedDateactivities.value = activities.value.filter((act) => {
    const activityDate = parseChineseDate(act.date)?.getTime();
    const checkDate = date;
    return activityDate === checkDate;
  })
  if(selectedDateactivities.value.length === 0) {
    message.warning('该日期没有活动');
    return;
  }
  isselectedDateActivities.value = true;
};

// 检查日期是否有活动
const hasActivitiesOnDate = (year: number, month: number, date: number) => {
  const checkDate = new Date(year, month - 1, date);
  checkDate.setHours(0, 0, 0, 0);
  const checkTimestamp = checkDate.getTime();
  return activities.value.some(activity => {
    const activityDate = parseChineseDate(activity.date);
    return activityDate?.getTime() === checkTimestamp;
  });
};

// 表单数据
const activityForm = ref({
  id: null as number | null,
  name: "",
  address: "",
  remark: "",
  date: null as number | null,
  status: "未完成",
  categoryId: null as number | null, // 改为 number 类型
  userId: null as number | null
});

// 表单验证规则
const rules: FormRules = {
  name: {
    required: true,
    message: "请输入活动标题",
    trigger: ["blur", "input"],
  },
  address: {
    required: true,
    message: "请输入活动地点",
    trigger: ["blur", "input"],
  },
  date: {
    required: true,
    type: "number",
    message: "请选择活动日期",
    trigger: ["blur", "change"],
  },
  status: {
    required: true,
    message: "请选择活动状态",
    trigger: ["blur", "change"],
  },
};

/**
 * 检查是否有token并尝试自动登录
 */
const checkToken = async () => {
  const { autoLoginCookie } = useSettingStore();
  const dataStore = useDataStore();
  hasToken.value = !!autoLoginCookie;
  // 如果有 autoLoginCookie 且用户未登录，则尝试自动登录
  if (autoLoginCookie && !dataStore.userLoginStatus) {
    try {
      dataStore.userLoginStatus = true;
      dataStore.loginType = "cookie";
      window.$message.success("登录成功");
      // 保存 cookie
      setCookies(autoLoginCookie);
      // 保存登录时间
      localStorage.setItem("lastLoginTime", Date.now().toString());
      // 获取用户信息
      await updateUserData();

    } catch (error) {
      console.error("Cookie 登录出错：", error);
    }
  }
  return autoLoginCookie;
};

// 导航到用户管理页面
const goToUserManagement = () => {
  router.push('/user-management');
};

// 导航到分类管理页面
const goToCategoryManagement = () => {
  router.push('/category-management');
};

// 状态选项
const statusOptions = [
  {
    label: "未完成",
    value: "未完成",
  },
  {
    label: "已完成",
    value: "已完成",
  }
];

// 分类选项
const categoryOptions = computed(() => {
  return categories.value.map((categoryName, index) => ({
    label: categoryName, // 显示分类名称
    value: index // 绑定数组索引
  }));
});

// 获取状态类型
const getStatusType = (status: string) => {
  switch (status) {
    case "未完成":
      return "warning";
    case "已完成":
      return "success";
    default:
      return "default";
  }
};

// 获取活动类名（用于设置背景色）
const getActivityClass = (status: string) => {
  switch (status) {
    case "未完成":
      return "activity-incomplete";
    case "已完成":
      return "activity-complete";
    default:
      return "";
  }
};

// 获取状态下拉选项
const getStatusOptions = (activity: any) => {
  return statusOptions
    .filter((option) => option.value !== activity.status)
    .map((option) => ({
      label: `标记为${option.label}`,
      key: option.value,
    }));
};

// 处理搜索输入变化
const handleSearch = (value) => {
  searchKeyword.value = value;
};

// 处理状态筛选变化
const handleStatusFilterChange = (value) => {
  statusFilter.value = value;
};
/**
 * 切换排序顺序
 */
const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
};

// 过滤活动列表
const filteredActivities = computed(() => {
  let filtered = activities.value;

  // Apply search filter
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase();
    filtered = filtered.filter(activity =>
      activity.name.toLowerCase().includes(keyword) ||
      activity.remark.toLowerCase().includes(keyword)
    );
  }

  // Apply status filter
  if (statusFilter.value !== null) {
    filtered = filtered.filter(activity => activity.status === statusFilter.value);
  }

  // Sort by date
  filtered.sort((a, b) => {
    const dateA = parseChineseDate(a.date).getTime();
    const dateB = parseChineseDate(b.date).getTime();
    return sortOrder.value === 'desc' ? dateB - dateA : dateA - dateB;
  });

  return filtered;
});

// 获取活动列表
const fetchActivities = async () => {
  try {
    const token = await checkToken(); // 添加 await
    if (!token) {
      message.warning("您尚未设置Cookie或Token，无法获取用户信息和活动列表");
      activities.value = [];
      return;
    }
    const { activitiesApiBaseUrl } = useSettingStore();
    let apiUrl = `${activitiesApiBaseUrl}/lists`;

    // 添加搜索和状态筛选参数
    const params = new URLSearchParams();
    if (searchKeyword.value) {
      params.append('keyword', searchKeyword.value);
    }
    if (statusFilter.value) {
      params.append('status', statusFilter.value);
    }

    // 如果有参数，添加到URL
    if (params.toString()) {
      apiUrl += `?${params.toString()}`;
    }
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.status === 200) {
      activities.value = response.data.data.activities;
      categories.value = response.data.data.user.settings.categories;
      userId.value = response.data.data.user.id;
    } else {
      message.error(response.data.data.message || "获取活动列表失败");
      activities.value = [];
    }
  } catch (error) {
    console.error("获取活动列表失败:", error);
    message.error("获取活动列表失败，请检查网络连接或API域名配置");
    activities.value = [];
  }
};

// 添加活动
const addActivity = async () => {
  try {
    const token = await checkToken(); // 添加 await
    if (!token) {
      message.error("您尚未设置Cookie或Token，无法添加活动");
      return false;
    }

    const { activitiesApiBaseUrl } = useSettingStore();
    const apiUrl = `${activitiesApiBaseUrl}/addlist`;

    // 格式化日期
    const formattedDate = formatDate(new Date(activityForm.value.date!), "yyyy年MM月dd日");

    const payload = {
      name: activityForm.value.name,
      address: activityForm.value.address,
      remark: activityForm.value.remark,
      date: formattedDate,
      status: activityForm.value.status,
      categoryId: activityForm.value.categoryId,
      userId: userId.value
    };

    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // 添加活动成功后刷新列表
    if (response.data.status === 200) {
      message.success("添加活动成功");
      await fetchActivities();
      resetForm();
      return true;
    }
    else {
      message.error(response.data.data.message || "添加活动失败");
      return false;
    }
  } catch (error) {
    console.error("添加活动失败:", error);
    message.error("添加活动失败，请检查网络连接或API域名配置");
    return false;
  }
};

// 更新活动
const updateActivity = async () => {
  try {
    const token = await checkToken(); // 添加 await
    if (!token) {
      message.error("您尚未设置Cookie或Token，无法更新活动");
      return false;
    }

    if (!activityForm.value.id) {
      message.error("活动ID不存在，无法更新");
      return false;
    }

    const { activitiesApiBaseUrl } = useSettingStore();
    const apiUrl = `${activitiesApiBaseUrl}/editlist/${activityForm.value.id}`;

    // 格式化日期
    const formattedDate = formatDate(new Date(activityForm.value.date!), "yyyy年MM月dd日");

    const payload = {
      name: activityForm.value.name,
      address: activityForm.value.address,
      remark: activityForm.value.remark,
      date: formattedDate,
      status: activityForm.value.status,
      categoryId: activityForm.value.categoryId,
      userId: userId.value
    };

    const response = await axios.put(apiUrl, payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // 更新活动成功后刷新列表
    if (response.data.status === 200) {
      message.success("更新活动成功");
      await fetchActivities();
      resetForm();
      return true;
    }
    else {
      message.error(response.data.data.message || "更新活动失败");
      return false;
    }
  } catch (error) {
    console.error("更新活动失败:", error);
    message.error("更新活动失败，请检查网络连接或API域名配置");
    return false;
  }
};

// 更新活动状态
const updateActivityStatus = async (id: number, currentStatus: string) => {
  try {
    const token = await checkToken(); // 添加 await
    if (!token) {
      message.error("您尚未设置Cookie或Token，无法更新活动状态");
      return;
    }

    const newStatus = currentStatus === "未完成" ? "已完成" : "未完成";

    const { activitiesApiBaseUrl } = useSettingStore();
    const apiUrl = `${activitiesApiBaseUrl}/update_activity_status/${id}?status=${encodeURIComponent(newStatus)}`;

    const response = await axios.put(apiUrl, {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // 更新活动状态成功后刷新列表
    if (response.data.status === 200) {
      message.success("活动状态更新成功");
      // 查找并更新 activities 数组中对应的活动状态
      const index = activities.value.findIndex(activity => activity.id === id);
      if (index !== -1) {
        activities.value[index].status = newStatus;
      } else {
        await fetchActivities(); // 重新获取活动列表以确保数据一致性
      }
    } else {
      message.error(response.data.data.message || "更新活动状态失败");
    }
  } catch (error) {
    console.error("更新活动状态失败:", error);
    message.error("更新活动状态失败，请检查网络连接或API域名配置");
  }
};

// 提交活动表单
const submitActivity = () => {
  formRef.value?.validate(async (errors) => {
    if (errors) {
      return;
    }

    submitting.value = true;
    try {
      let success;
      if (isEditing.value) {
        success = await updateActivity();
      } else {
        success = await addActivity();
      }

      if (success) {
        showAddModal.value = false;
      }
    } finally {
      submitting.value = false;
    }
  });
};

// 重置表单
const resetForm = () => {
  activityForm.value = {
    id: null,
    name: "",
    address: "",
    remark: "",
    date: null,
    status: "未完成",
    categoryId: null,
    userId: null
  };
  isEditing.value = false;
};

/**
 * 解析 "yyyy年MM月dd日" 格式的日期字符串为 Date 对象
 * @param dateString 日期字符串，例如 "2025年05月31日"
 * @returns 解析后的 Date 对象，如果解析失败则返回 null
 */
const parseChineseDate = (dateString: string): Date | null => {
  const match = dateString.match(/(\d{4})年(\d{2})月(\d{2})日/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 月份是0-11
    const day = parseInt(match[3], 10);
    return new Date(year, month, day);
  }
  return null;
};

// 编辑活动
const editActivity = (activity: any) => {
  let parsedDate: Date | null = null;
  if (typeof activity.date === 'string') {
    parsedDate = parseChineseDate(activity.date);
  } else if (typeof activity.date === 'number') {
    parsedDate = new Date(activity.date);
  } else if (activity.date instanceof Date) {
    parsedDate = activity.date;
  }

  activityForm.value = {
    id: activity.id,
    name: activity.name,
    address: activity.address,
    remark: activity.remark,
    date: parsedDate ? parsedDate.getTime() : null, // 使用解析后的日期时间戳
    status: activity.status,
    categoryId: activity.categoryId, // 将分类名称转换为索引
    userId: activity.userId
  };
  isEditing.value = true;
  showAddModal.value = true;
};

// 删除活动
const deleteActivity = (id: number) => {
  deleteId.value = id;
  showDeleteModal.value = true;
};
/**
 * @description 导出活动数据到CSV文件
 */
const exportToExcel = () => {
  if (filteredActivities.value.length === 0) {
    message.info('没有数据可导出');
    return;
  }

  const headers = [
    { key: 'name', label: '活动名称' },
    { key: 'categoryId', label: '类别' },
    { key: 'date', label: '日期' },
    { key: 'address', label: '地址' },
    { key: 'remark', label: '备注' },
    { key: 'status', label: '状态' },
  ];

  const data = filteredActivities.value.map(activity => ({
    name: activity.name,
    categoryId: categories.value[activity.categoryId] || '活动后台',
    date: activity.date,
    address: activity.address,
    remark: activity.remark,
    status: activity.status,
  }));

  // 创建工作簿
  const wb = XLSX.utils.book_new();
  // 将数据转换为工作表
  const ws = XLSX.utils.json_to_sheet(data, { header: headers.map(h => h.key) });

  // 添加标题行
  XLSX.utils.sheet_add_aoa(ws, [headers.map(h => h.label)], { origin: 'A1' });

  // 设置标题行样式：加粗、字体加大、自动换行
  const headerStyle = {
    font: { bold: true, sz: 12 }, // 加粗，字体大小14
    alignment: { wrapText: true, vertical: 'center', horizontal: 'center' }, // 自动换行，垂直居中，水平居中
  };
  headers.forEach((_, colIndex) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
    if (!ws[cellRef]) ws[cellRef] = {};
    ws[cellRef].s = headerStyle;
  });

  // 设置所有数据单元格样式：自动换行
  for (let r = 1; r <= data.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = { alignment: { wrapText: true, vertical: 'center' } }; // 自动换行，顶部对齐
    }
  }

  // 计算列宽
  const colWidths = headers.map(header => {
    const maxLength = Math.max(
      header.label.toString().length, // 考虑标题长度
      ...data.map(row => (row[header.key] || '').toString().length) // 考虑数据长度
    );
    return { wch: maxLength + 8 }; // 增加一些额外空间
  });
  ws['!cols'] = colWidths;
  // 将工作表添加到工作簿
  XLSX.utils.book_append_sheet(wb, ws, '活动数据');

  // 导出文件，文件名包含当前日期
  const fileName = `活动列表_${formatDate(selectedDate.value, "yyyyMMdd")}.xlsx`;
  XLSX.writeFile(wb, fileName);

  message.success('活动数据已导出');
};

// 确认删除
const confirmDelete = async () => {
  if (deleteId.value) {
    try {
      const token = checkToken();
      if (!token) {
        message.error("您尚未设置Cookie或Token，无法删除活动");
        showDeleteModal.value = false;
        deleteId.value = null;
        return;
      }

      const { activitiesApiBaseUrl } = useSettingStore();
      const apiUrl = `${activitiesApiBaseUrl}/dellist/${deleteId.value}`;

      const response = await axios.delete(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // 删除活动成功后刷新列表
      if (response.data.status === 200) {
        message.success("删除活动成功");
        await fetchActivities();
      } else {
        message.error(response.data.data.message || "删除活动失败");
      }
    } catch (error) {
      console.error("删除活动失败:", error);
      message.error("删除活动失败，请检查网络连接或API域名配置");
    }
  }
  showDeleteModal.value = false;
  deleteId.value = null;
};

onMounted(async () => {
  await checkToken(); // 在组件挂载时执行检查和自动登录
  await fetchActivities();
});

// 监听token变化，重新获取活动列表
watch(() => useSettingStore().autoLoginCookie, (newVal) => {
  fetchActivities();
});
</script>

<style scoped>
.activities-container {
  padding: 20px;
}

.activities-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.filter-container {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.search-input {
  flex: 1;
}

.status-filter {
  width: 150px;
}

/* 响应式样式 */
@media screen and (max-width: 768px) {
  .activities-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .activities-header .n-space {
    margin-top: 10px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .filter-container {
    flex-direction: column;
  }

  .status-filter,
  .sort-button {
    width: 100%;
  }
}

.calendar-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.calendar-cell {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
}

.calendar-date {
  font-size: 14px;
}

.has-activities {
  font-weight: bold;
}

.activity-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #18a058;
  position: absolute;
  bottom: 2px;
}

.selected-date-activities {
  margin-top: 20px;
}

.activity-modal {
  width: 500px;
  max-width: 90vw;
}

.list-div {
  border-radius: 5px;
}

/* 活动状态背景色 */
.activity-incomplete {
  background-color: rgba(245, 76, 245, 0.2);
}

.activity-complete {
  background-color: rgba(157, 248, 149, 0.2); /* 灰色 */
  text-decoration: solid line-through blue;
}
.activity-name-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

