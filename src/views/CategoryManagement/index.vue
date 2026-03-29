<template>
  <div class="category-container">
    <div class="category-header">
      <h2>分类管理</h2>
      <n-space class="header-buttons">
        <n-button type="primary" @click="showAddModal = true" class="add-btn" v-if="hasToken">
          <template #icon>
            <SvgIcon name="Add" />
          </template>
          添加分类
        </n-button>
        <n-button @click="fetchCategories" class="refresh-btn">
          <template #icon>
            <SvgIcon name="Refresh" />
          </template>
          刷新
        </n-button>
      </n-space>
    </div>

    <!-- 分类列表 -->
    <div class="category-list">
      <n-empty v-if="categories.length === 0" description="暂无分类数据" />
      <n-data-table
        v-else
        :columns="columns"
        :data="categories"
        :pagination="pagination"
        :bordered="false"
        :single-line="false"
      />
    </div>

    <!-- 添加/编辑分类弹窗 -->
    <n-modal
      v-model:show="showAddModal"
      preset="card"
      :title="isEditing ? '编辑分类' : '添加分类'"
      class="category-modal"
      :mask-closable="false"
    >
      <n-form
        ref="formRef"
        :model="categoryForm"
        :rules="rules"
        label-placement="left"
        label-width="auto"
        require-mark-placement="right-hanging"
      >
        <n-form-item label="名称" path="name">
          <n-input v-model:value="categoryForm.name" placeholder="请输入分类名称" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddModal = false">取消</n-button>
          <n-button type="primary" @click="submitCategory" :loading="submitting"> 确定 </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 删除确认弹窗 -->
    <n-modal
      v-model:show="showDeleteModal"
      preset="dialog"
      title="确认删除"
      content="确定要删除这个分类吗？此操作不可恢复。"
      positive-text="确定"
      negative-text="取消"
      @positive-click="confirmDelete"
      @negative-click="
        () => {
          showDeleteModal = false;
          deleteId = null;
        }
      "
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, h } from "vue";
import { useMessage, NButton, NSpace } from "naive-ui";
import type { FormInst, FormRules, DataTableColumns } from "naive-ui";
import axios from "axios";
import { useSettingStore } from "@/stores";

// 全局消息
const message = useMessage();

// 状态管理
const userId = ref(1);
const categories = ref<any[]>([]);
const showAddModal = ref(false);
const showDeleteModal = ref(false);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);
const isEditing = ref(false);
const deleteId = ref<string | null>(null);
const hasToken = ref(false);

// 分页设置
const pagination = {
  pageSize: 10,
};

// 表格列定义
const columns: DataTableColumns = [
  {
    title: "名称",
    key: "name",
    width: 200,
    resizable: true,
  },
  {
    title: "操作",
    key: "actions",
    width: 200,
    render(row) {
      return h(
        NSpace,
        {},
        {
          default: () => [
            h(
              NButton,
              {
                size: "small",
                type: "info",
                onClick: () => editCategory(row.name as string), // 传递分类名称
              },
              { default: () => "编辑" },
            ),
            h(
              NButton,
              {
                size: "small",
                type: "error",
                onClick: () => deleteCategory(row.name as string), // 传递分类名称
              },
              { default: () => "删除" },
            ),
          ],
        },
      );
    },
  },
];

// 表单数据
const categoryForm = ref({
  name: "",
});

// 表单验证规则
const rules: FormRules = {
  name: {
    required: true,
    message: "请输入分类名称",
    trigger: ["blur", "input"],
  },
};

// 检查是否有token
const checkToken = () => {
  const { autoLoginCookie } = useSettingStore();
  hasToken.value = !!autoLoginCookie;
  return autoLoginCookie;
};

/**
 * @description 获取分类列表
 * 从用户设置中获取分类数据
 */
const fetchCategories = async () => {
  try {
    const token = checkToken();
    if (!token) {
      message.warning("您尚未设置Cookie或Token，无法获取分类列表");
      categories.value = [];
      return;
    }
    const { activitiesApiBaseUrl } = useSettingStore();
    const apiUrl = `${activitiesApiBaseUrl}/users?current_info=true`;

    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.data.status === 200 && response.data.data.length > 0) {
      // 从用户设置中提取分类数据
      const userSettings = response.data.data[0].settings;
      userId.value = response.data.data[0].id;
      if (userSettings && userSettings.categories && Array.isArray(userSettings.categories)) {
        categories.value = userSettings.categories.map((name: string) => ({ name }));
      } else {
        categories.value = [];
      }
    } else {
      message.error(response.data.data.message || "获取分类列表失败");
      categories.value = [];
    }
  } catch (error) {
    console.error("获取分类列表失败:", error);
    message.error("获取分类列表失败，请检查网络连接或API域名配置");
    categories.value = [];
  }
};

/**
 * @description 添加分类
 * 将新分类添加到用户设置中
 */
const addCategory = async () => {
  try {
    const token = checkToken();
    if (!token) {
      message.error("您尚未设置Cookie或Token，无法添加分类");
      return false;
    }

    const { activitiesApiBaseUrl } = useSettingStore();
    const apiUrl = `${activitiesApiBaseUrl}/user/${userId.value}`;

    // 获取当前用户的settings
    const currentUserResponse = await axios.get(`${activitiesApiBaseUrl}/users?current_info=true`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    let currentSettings = {};
    if (currentUserResponse.data.status === 200 && currentUserResponse.data.data.length > 0) {
      currentSettings = currentUserResponse.data.data[0].settings || {};
    }

    let existingCategories = (currentSettings as any).categories || [];
    if (!Array.isArray(existingCategories)) {
      existingCategories = [];
    }

    // 检查是否已存在同名分类
    if (existingCategories.includes(categoryForm.value.name)) {
      message.warning("分类名称已存在");
      return false;
    }

    const updatedCategories = [...existingCategories, categoryForm.value.name];

    const payload = {
      settings: { ...currentSettings, categories: updatedCategories },
    };

    const response = await axios.put(apiUrl, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.data.status === 200) {
      message.success("添加分类成功");
      await fetchCategories();
      resetForm();
      return true;
    } else {
      message.error(response.data.data.message || "添加分类失败");
      return false;
    }
  } catch (error) {
    console.error("添加分类失败:", error);
    message.error("添加分类失败，请检查网络连接或API域名配置");
    return false;
  }
};

/**
 * @description 更新分类
 * 更新用户设置中的分类数据
 */
const updateCategory = async () => {
  try {
    const token = checkToken();
    if (!token) {
      message.error("您尚未设置Cookie或Token，无法更新分类");
      return false;
    }

    if (!categoryForm.value.name) {
      message.error("分类名称不能为空，无法更新");
      return false;
    }

    const { activitiesApiBaseUrl } = useSettingStore();
    const apiUrl = `${activitiesApiBaseUrl}/user/${userId.value}`;

    // 获取当前用户的settings
    const currentUserResponse = await axios.get(`${activitiesApiBaseUrl}/users?current_info=true`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    let currentSettings = {};
    if (currentUserResponse.data.status === 200 && currentUserResponse.data.data.length > 0) {
      currentSettings = currentUserResponse.data.data[0].settings || {};
    }

    let existingCategories = (currentSettings as any).categories || [];
    if (!Array.isArray(existingCategories)) {
      existingCategories = [];
    }

    // 找到并更新分类名称
    const oldName = deleteId.value; // deleteId 在这里临时用作存储旧名称
    const index = existingCategories.indexOf(oldName);
    if (index !== -1) {
      // 检查新名称是否已存在（排除当前正在编辑的旧名称）
      if (
        existingCategories.includes(categoryForm.value.name) &&
        categoryForm.value.name !== oldName
      ) {
        message.warning("新分类名称已存在");
        return false;
      }
      existingCategories[index] = categoryForm.value.name;
    }

    const payload = {
      settings: { ...currentSettings, categories: existingCategories },
    };

    const response = await axios.put(apiUrl, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.data.status === 200) {
      message.success("更新分类成功");
      await fetchCategories();
      resetForm();
      return true;
    } else {
      message.error(response.data.data.message || "更新分类失败");
      return false;
    }
  } catch (error) {
    console.error("更新分类失败:", error);
    message.error("更新分类失败，请检查网络连接或API域名配置");
    return false;
  }
};

// 提交分类表单
const submitCategory = () => {
  formRef.value?.validate(async (errors) => {
    if (errors) {
      return;
    }

    submitting.value = true;
    try {
      let success;
      if (isEditing.value) {
        success = await updateCategory();
      } else {
        success = await addCategory();
      }

      if (success) {
        showAddModal.value = false;
      }
    } finally {
      submitting.value = false;
    }
  });
};

/**
 * @description 重置表单
 * 清空表单数据并重置编辑状态
 */
const resetForm = () => {
  categoryForm.value = {
    name: "",
  };
  isEditing.value = false;
  deleteId.value = null; // 清除旧名称
};

/**
 * @description 编辑分类
 * 填充表单数据以进行编辑
 * @param name 分类名称
 */
const editCategory = (name: string) => {
  categoryForm.value.name = name;
  isEditing.value = true;
  showAddModal.value = true;
  deleteId.value = name; // 临时存储旧名称，用于更新时查找
};

/**
 * @description 删除分类
 * 设置待删除分类的名称并显示确认弹窗
 * @param name 待删除分类的名称
 */
const deleteCategory = (name: string) => {
  deleteId.value = name;
  showDeleteModal.value = true;
};

/**
 * @description 确认删除
 * 从用户设置中删除分类
 */
const confirmDelete = async () => {
  if (deleteId.value) {
    try {
      const token = checkToken();
      if (!token) {
        message.error("您尚未设置Cookie或Token，无法删除分类");
        showDeleteModal.value = false;
        deleteId.value = null;
        return;
      }

      const { activitiesApiBaseUrl } = useSettingStore();
      const apiUrl = `${activitiesApiBaseUrl}/user/${userId.value}`;

      // 获取当前用户的settings
      const currentUserResponse = await axios.get(
        `${activitiesApiBaseUrl}/users?current_info=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      let currentSettings = {};
      if (currentUserResponse.data.status === 200 && currentUserResponse.data.data.length > 0) {
        currentSettings = currentUserResponse.data.data[0].settings || {};
      }

      let existingCategories = (currentSettings as any).categories || [];
      if (!Array.isArray(existingCategories)) {
        existingCategories = [];
      }

      const updatedCategories = existingCategories.filter(
        (name: string) => name !== deleteId.value,
      );

      const payload = {
        settings: { ...currentSettings, categories: updatedCategories },
      };

      const response = await axios.put(apiUrl, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.data.status === 200) {
        message.success("删除分类成功");
        await fetchCategories();
      } else {
        message.error(response.data.data.message || "删除分类失败");
      }
    } catch (error) {
      console.error("删除分类失败:", error);
      message.error("删除分类失败，请检查网络连接或API域名配置");
    }
  }
  showDeleteModal.value = false;
  deleteId.value = null;
};

onMounted(() => {
  fetchCategories();
});

// 监听token变化，重新获取分类列表
watch(
  () => useSettingStore().autoLoginCookie,
  () => {
    fetchCategories();
  },
);
// 移除未使用的watch
</script>

<style scoped>
.category-container {
  padding: 20px;
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.category-list {
  margin-top: 20px;
}

.category-modal {
  width: 500px;
  max-width: 90vw;
}

@media (max-width: 768px) {
  .category-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .category-header h2 {
    margin-bottom: 10px;
  }

  .category-header .header-buttons {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .category-header .header-buttons .n-button {
    margin-right: 8px; /* 按钮之间留一些间距 */
    margin-bottom: 8px; /* 按钮之间留一些间距 */
  }

  .category-modal {
    width: 95vw; /* 手机模式下模态框宽度更宽 */
    margin: 0 auto; /* 居中显示 */
  }

  /* 针对数据表格的响应式调整 */
  .category-list .n-data-table {
    overflow-x: auto; /* 允许水平滚动 */
  }

  .category-list .n-data-table .n-data-table-th,
  .category-list .n-data-table .n-data-table-td {
    white-space: nowrap; /* 防止内容换行 */
  }
}
</style>
