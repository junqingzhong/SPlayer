<template>
  <div class="activities-container">
    <div class="activities-header">
      <h2>活动列表</h2>
      <n-space>
        <n-button type="primary" @click="openAddModal" class="add-btn" v-if="hasToken">
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
      <n-select v-model:value="yearFilter" :options="yearOptions" placeholder="年份筛选" clearable class="year-filter" @update:value="handleYearFilterChange" />
      <n-select v-model:value="categoryFilter" :options="[{ label: '全部分类', value: undefined, type: 'ignored' }, ...categoryOptions]" placeholder="分类筛选" clearable class="category-filter" @update:value="handleCategoryFilterChange" />
      <n-select v-model:value="statusFilter" :options="[{ label: '全部状态', value: undefined, type: 'ignored' }, ...statusOptions]" placeholder="状态筛选" clearable class="status-filter" @update:value="handleStatusFilterChange" />
      <n-button @click="toggleSortOrder" class="sort-button">
        {{ sortText }}
      </n-button>
      <div class="activity-count">
        共 {{ filteredActivities.length }} 条记录
      </div>
    </div>

    <!-- 日历视图 -->
    <n-modal v-model:show="showCalendar" preset="card" title="活动日历" class="calendar-view" :mask-closable="true"
      :style="{ width: '80%' }">
      <n-calendar v-model:value="selectedDate" :style="{ height: '460px' }" #="{ year, month, date }" @update:value="handleDateSelect">
        <template v-if="hasActivitiesOnDate(year, month, date)">
          <!-- 查找并显示对应日期的活动名称 -->
          <div v-for="activity in activities.filter((act) => {
              const activityDate = getActivityDate(act.date)?.getTime();
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
      <n-spin :show="loading" description="正在加载活动数据...">
        <n-empty v-if="filteredActivities.length === 0 && !loading && hasActiveFilters" description="暂无符合条件的活动数据">
        </n-empty>
        <n-list v-else-if="!loading" hoverable clickable class="list-div">
          <!-- 当没有活跃筛选条件且过滤后数据为空时，显示原始数据 -->
          <template v-if="filteredActivities.length === 0 && !hasActiveFilters">
            <n-list-item v-for="activity in activities" :key="activity.id"
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
          </template>
          <!-- 当有活跃筛选条件或有过滤后的数据时，显示过滤后的数据 -->
          <template v-else>
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
          </template>
        </n-list>
      </n-spin>
      <!-- 底部间距，防止被播放器遮挡 -->
      <div class="bottom-spacing"></div>
    </div>

    <!-- 回到顶部按钮 -->
    <div class="back-to-top" @click="scrollToTop" v-show="showBackToTop">
      <n-button circle type="primary" size="large">
        <template #icon>
          <svg-icon name="ArrowUp" />
        </template>
      </n-button>
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
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useMessage, NButton, NSpace, NTag } from "naive-ui";
import type { FormInst, FormRules } from "naive-ui";
import axios from "axios";
import { useSettingStore, useDataStore} from "@/stores";
import { formatDate } from "@/utils/helper";
import * as XLSX from "xlsx-js-style";
import { setCookies } from "@/utils/cookie";
import { updateUserData } from "@/utils/auth";

// 全局消息
const message = useMessage();
const router = useRouter();

const goToCategoryManagement = () => {
  router.push({ name: "category-management" });
};

const goToUserManagement = () => {
  router.push({ name: "UserManagement" });
};

// 状态管理
const activities = ref<any[]>([]);
const searchKeyword = ref<string | undefined>(undefined);
const statusFilter = ref<string | undefined>(undefined);
const categoryFilter = ref<number | undefined>(undefined);
const yearFilter = ref<number | undefined>(undefined);
const sortOrder = ref('desc');
const loading = ref(false);
const showAddModal = ref(false);
const showDeleteModal = ref(false);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);
const isEditing = ref(false);
const deleteId = ref<number | null>(null);
const hasToken = ref(false);
const categories = ref<any[]>([]);
const userId = ref<number | null>(null);
const showBackToTop = ref(false);

// 日历视图
const showCalendar = ref(false);
const isselectedDateActivities = ref(false);
const selectedDateactivities = ref<any[]>([]);
const selectedDate = ref(new Date().getTime());

// 切换日历视图
const toggleCalendarView = () => {
  showCalendar.value = !showCalendar.value;
};

// 处理日期选择
const handleDateSelect = (date: number) => {
  selectedDateactivities.value = activities.value.filter((act) => {
    const activityDate = getActivityDate(act.date)?.getTime() ?? 0;
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
    const activityDate = getActivityDate(activity.date)?.getTime() ?? 0;
    return activityDate === checkTimestamp;
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

    } catch (error: any) {
      console.error("Cookie 登录出错：", error);
    }
  }
  return autoLoginCookie;
};

// 小工具：统一解析活动日期字段，返回 Date 或 null
const getActivityDate = (dateField: any): Date | null => {
  if (!dateField && dateField !== 0) return null;
  if (typeof dateField === 'number') {
    try {
      const d = new Date(dateField);
      d.setHours(0,0,0,0);
      return d;
    } catch {
      return null;
    }
  }
  if (typeof dateField === 'string') {
    const parsed = parseChineseDate(dateField);
    if (parsed) {
      parsed.setHours(0,0,0,0);
    }
    return parsed;
  }
  if (dateField instanceof Date) {
    const copy = new Date(dateField.getTime());
    copy.setHours(0,0,0,0);
    return copy;
  }
  return null;
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

// 年份选项
const yearOptions = computed(() => {
  try {
    const years = new Set<number>();

    if (!activities.value || !Array.isArray(activities.value)) {
      return [{ label: '全部年份', value: undefined, type: 'ignored' as const }];
    }

    activities.value.forEach(activity => {
      try {
        if (activity && activity.date) {
          const date = getActivityDate(activity.date);
          if (date && !isNaN(date.getFullYear())) {
            years.add(date.getFullYear());
          }
        }
      } catch (dateError: any) {
        console.warn('解析活动日期失败:', dateError, activity);
      }
    });

    // 按年份倒序排列
    const sortedYears = Array.from(years).sort((a, b) => b - a);

    return [
      { label: '全部年份', value: undefined, type: 'ignored' as const },
      ...sortedYears.map(year => ({ label: `${year}年`, value: year }))
    ];
  } catch (error: any) {
    console.error('生成年份选项失败:', error);
    return [{ label: '全部年份', value: undefined, type: 'ignored' as const }];
  }
});

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

// 处理搜索输入变化
const handleSearch = (value) => {
  searchKeyword.value = value;
  // 清除搜索关键词时自动重新筛选，只显示当前命中条件的数据
  if (!value || value.trim() === '') {
    searchKeyword.value = undefined;
    console.log('搜索关键词已清除，自动重新筛选数据');
  }
};

// 回到顶部函数
const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
};

// 监听滚动事件，控制回到顶部按钮显示
const handleScroll = () => {
  showBackToTop.value = window.scrollY > 300;
};

// 处理年份筛选变化
const handleYearFilterChange = (value) => {
  yearFilter.value = value;
  // 清除条件时自动重新筛选，只显示当前命中条件的数据
  if (value === undefined || value === null) {
    yearFilter.value = undefined;
    console.log('年份筛选已清除，自动重新筛选数据');
  }
};

// 处理分类筛选变化
const handleCategoryFilterChange = (value) => {
  categoryFilter.value = value;
  // 清除条件时自动重新筛选，只显示当前命中条件的数据
  if (value === undefined || value === null) {
    categoryFilter.value = undefined;
    console.log('分类筛选已清除，自动重新筛选数据');
  }
};

// 处理状态筛选变化
const handleStatusFilterChange = (value) => {
  statusFilter.value = value;
  // 清除条件时自动重新筛选，只显示当前命中条件的数据
  if (value === undefined || value === null || value === '') {
    statusFilter.value = undefined;
    console.log('状态筛选已清除，自动重新筛选数据');
  }
};
/**
 * 切换排序顺序
 */
const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
};

// 绑定到模板的排序文字
const sortText = computed(() => {
  return sortOrder.value === 'desc' ? '按时间正序' : '按时间倒序';
});

// 判断是否有活跃的筛选条件
const hasActiveFilters = computed(() => {
  return (searchKeyword.value !== undefined && searchKeyword.value !== '') ||
         yearFilter.value !== undefined ||
         categoryFilter.value !== undefined ||
         (statusFilter.value !== undefined && statusFilter.value !== '');
});

// 过滤活动列表
const filteredActivities = computed(() => {
  let filtered = activities.value.slice();

  // Apply search filter
  if (searchKeyword.value) {
    const keyword = String(searchKeyword.value).toLowerCase();
    filtered = filtered.filter(activity =>
      (activity.name || '').toLowerCase().includes(keyword) ||
      (activity.remark || '').toLowerCase().includes(keyword)
    );
  }

  // Apply year filter
  if (yearFilter.value !== undefined) {
    filtered = filtered.filter(activity => {
      const date = getActivityDate(activity.date);
      return date && date.getFullYear() === yearFilter.value;
    });
  }

  // Apply category filter
  if (categoryFilter.value !== undefined) {
    filtered = filtered.filter(activity => activity.categoryId === categoryFilter.value);
  }

  // Apply status filter
  if (statusFilter.value !== undefined && statusFilter.value !== '') {
    filtered = filtered.filter(activity => activity.status === statusFilter.value);
  }

  // Sort by date 使用 getActivityDate
  filtered.sort((a, b) => {
    const dateA = getActivityDate(a.date)?.getTime() ?? 0;
    const dateB = getActivityDate(b.date)?.getTime() ?? 0;
    return sortOrder.value === 'desc' ? dateB - dateA : dateA - dateB;
  });

  return filtered;
});

// 获取活动列表
const fetchActivities = async (retryCountOrEvent: number | MouseEvent = 0) => {
  const retryCount = typeof retryCountOrEvent === "number" ? retryCountOrEvent : 0;
  loading.value = true;
  try {
    const token = await checkToken(); // 添加 await
    if (!token) {
      message.warning("您尚未设置Cookie或Token，无法获取用户信息和活动列表");
      activities.value = [];
      return;
    }
    const { activitiesApiBaseUrl } = useSettingStore();
    let apiUrl = `${activitiesApiBaseUrl}/lists`;

    // 添加搜索、年份、分类和状态筛选参数
    const params = new URLSearchParams();
    if (searchKeyword.value) {
      params.append('keyword', String(searchKeyword.value));
    }
    if (yearFilter.value !== undefined) {
      params.append('year', String(yearFilter.value));
    }
    if (categoryFilter.value !== undefined) {
      params.append('categoryId', String(categoryFilter.value));
    }
    if (statusFilter.value !== undefined && statusFilter.value !== '') {
      params.append('status', String(statusFilter.value));
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
      // 数据验证
      if (response.data.data && Array.isArray(response.data.data.activities)) {
        activities.value = response.data.data.activities;
        // 验证分类数据
        if (response.data.data.user?.settings?.categories && Array.isArray(response.data.data.user.settings.categories)) {
          categories.value = response.data.data.user.settings.categories;
        } else {
          console.warn('分类数据格式异常，使用默认值');
          categories.value = ['活动后台'];
        }

        // 验证用户ID
        if (response.data.data.user?.id) {
          userId.value = response.data.data.user.id;
        } else {
          console.warn('用户ID数据异常');
          userId.value = null;
        }

        // 如果活动数据为空，给出友好提示
        if (activities.value.length === 0) {
          message.info('暂无活动数据，可以添加新活动');
        } else {
          console.log(`成功获取 ${activities.value.length} 条活动数据`);
          // 初始加载时确保数据按时间倒序排列
          activities.value.sort((a, b) => {
            const dateA = getActivityDate(a.date)?.getTime() ?? 0;
            const dateB = getActivityDate(b.date)?.getTime() ?? 0;
            return dateB - dateA; // 按时间倒序排列
          });
        }
      } else {
        console.error('API返回数据格式异常:', response.data);
        message.error('数据格式错误，请联系管理员');
        activities.value = [];
        categories.value = [];
        userId.value = null;
      }
    } else {
      message.error(response.data.data?.message || "获取活动列表失败");
      activities.value = [];
      categories.value = [];
      userId.value = null;
    }
  } catch (error: any) {
    console.error("获取活动列表失败:", error);

    // 网络错误或超时，尝试重试
    if (retryCount < 2 && (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || !error.response)) {
      message.warning(`网络连接失败，正在重试(${retryCount + 1}/3)...`);
      setTimeout(() => fetchActivities(retryCount + 1), 1000 * (retryCount + 1));
      return;
    }

    // 提供详细的错误信息
    let errorMessage = "获取活动列表失败";
    if (error.response) {
      // 服务器响应错误
      if (error.response.status === 401) {
        errorMessage = "认证失败，请检查Token是否有效";
      } else if (error.response.status === 404) {
        errorMessage = "API接口不存在，请检查API域名配置";
      } else if (error.response.status >= 500) {
        errorMessage = "服务器错误，请稍后重试";
      } else {
        errorMessage = error.response.data?.message || `服务器错误 (${error.response.status})`;
      }
    } else if (error.request) {
      errorMessage = "网络连接失败，请检查网络连接或API域名配置";
    } else {
      errorMessage = error.message || "未知错误，请刷新页面重试";
    }

    message.error(errorMessage);
    activities.value = [];
  } finally {
    loading.value = false;
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
  } catch (error: any) {
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
  } catch (error: any) {
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
  } catch (error: any) {
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
    const d = new Date(year, month, day);
    d.setHours(0,0,0,0);
    return d;
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
 * @description 打开新增活动弹窗，重置表单数据
 */
const openAddModal = () => {
  // 重置表单数据
  activityForm.value = {
    id: null,
    name: '',
    address: '',
    remark: '',
    date: null,
    status: '未完成',
    categoryId: 0,
    userId: null
  };
  isEditing.value = false;
  showAddModal.value = true;
};

/**
 * @description 导出活动数据到CSV文件
 */
const exportToExcel = () => {
  // 始终导出当前显示的数据（filteredActivities）
  const exportData = filteredActivities.value;

  if (exportData.length === 0) {
    message.info('没有数据可导出');
    return;
  }

  // 构建筛选条件信息
  const filterInfo: string[] = [];
  if (yearFilter.value !== undefined) {
    filterInfo.push(`年份: ${yearFilter.value}年`);
  }
  if (categoryFilter.value !== undefined) {
    filterInfo.push(`分类: ${categories.value[categoryFilter.value as number] || '未知分类'}`);
  }
  if (statusFilter.value) {
    filterInfo.push(`状态: ${statusFilter.value}`);
  }
  if (searchKeyword.value) {
    filterInfo.push(`搜索: ${searchKeyword.value}`);
  }

  const headers = [
    { key: 'name', label: '活动名称' },
    { key: 'category', label: '分类' },
    { key: 'date', label: '日期' },
    { key: 'address', label: '地址' },
    { key: 'remark', label: '备注' },
    { key: 'status', label: '状态' },
  ];

  const data = exportData.map(activity => ({
    name: activity.name,
    category: categories.value[activity.categoryId] || '活动后台',
    date: activity.date,
    address: activity.address,
    remark: activity.remark,
    status: activity.status,
  }));

  // 创建工作簿
  const wb = XLSX.utils.book_new();
  // 将数据转换为工作表
  const ws = XLSX.utils.json_to_sheet(data, { header: headers.map(h => h.key) });

  // 添加筛选条件信息和总行数
  let startRow = 1;

  // 添加标题行
  XLSX.utils.sheet_add_aoa(ws, [headers.map(h => h.label)], { origin: `A${startRow}` });

  // 设置筛选信息行样式
  const infoStyle = {
    font: { bold: true, sz: 10, color: { rgb: '666666' } },
    alignment: { horizontal: 'left' },
  };
  for (let r = 0; r < startRow - 1; r++) {
    const cellRef = XLSX.utils.encode_cell({ r: r, c: 0 });
    if (!ws[cellRef]) ws[cellRef] = {};
    ws[cellRef].s = infoStyle;
  }

  // 设置标题行样式：加粗、字体加大、自动换行
  const headerStyle = {
    font: { bold: true, sz: 12 }, // 加粗，字体大小14
    alignment: { wrapText: true, vertical: 'center', horizontal: 'center' }, // 自动换行，垂直居中，水平居中
  };
  headers.forEach((_, colIndex) => {
    const cellRef = XLSX.utils.encode_cell({ r: startRow - 1, c: colIndex });
    if (!ws[cellRef]) ws[cellRef] = {};
    ws[cellRef].s = headerStyle;
  });

  // 设置所有数据单元格样式：自动换行
  for (let r = startRow + 1; r <= startRow + data.length; r++) {
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
      const token = await checkToken();
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
    } catch (error: any) {
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

  // 确保内容渲染完成
  await nextTick();

  // 添加滚动事件监听
  window.addEventListener('scroll', handleScroll);

  console.log('活动列表组件已挂载，数据加载完成');
});

// 监听活动数据变化，确保内容渲染完成
watch(activities, async (newActivities) => {
  // 等待DOM更新完成
  await nextTick();
  console.log(`活动数据已更新，当前活动数量: ${newActivities.length}`);
}, { deep: true });

// 监听token变化，重新获取活动列表
watch(() => useSettingStore().autoLoginCookie, () => {
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

.year-filter {
  width: 150px;
}

.category-filter {
  width: 150px;
}

.status-filter {
  width: 150px;
}

.activity-count {
  margin-left: auto;
  color: #666;
  font-size: 14px;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

/* 筛选状态显示栏样式 */
.filter-status-bar {
  margin: 16px 0;
  padding: 12px 16px;
  background-color: #f5f5f5;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
}

/* 修复下拉框被遮挡的问题 */
:deep(.n-base-select-menu) {
  z-index: 9999 !important;
}

:deep(.n-select-menu) {
  z-index: 9999 !important;
}

/* 底部间距样式 */
.bottom-spacing {
  height: 60px;
  width: 100%;
}

/* 回到顶部按钮样式 */
.back-to-top {
  position: fixed;
  right: 30px;
  bottom: 100px;
  z-index: 1000;
  cursor: pointer;
  transition: all 0.3s ease;
}

.back-to-top:hover {
  transform: translateY(-2px);
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

  .year-filter,
  .category-filter,
  .status-filter,
  .sort-button {
    width: 100%;
  }

  /* 移动端回到顶部按钮调整 */
  .back-to-top {
    right: 20px;
    bottom: 80px;
  }

  .activity-count {
    width: 100%;
    text-align: center;
    margin-top: 10px;
    margin-left: 0;
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

