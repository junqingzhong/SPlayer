<template>
  <div class="user-management-container">
    <div class="user-management-header">
      <h2>用户管理</h2>
      <n-space class="header-buttons">
        <n-button type="primary" @click="showAddUserModal = true" class="add-btn">
          <template #icon>
            <SvgIcon name="Add" />
          </template>
          添加用户
        </n-button>
        <n-button @click="fetchUsers" class="refresh-btn">
          <template #icon>
            <SvgIcon name="Refresh" />
          </template>
          刷新
        </n-button>
      </n-space>
    </div>

    <!-- 用户列表 -->
    <div class="table-wrapper">
      <n-data-table :columns="columns" :data="users" :pagination="pagination" :bordered="false" :loading="loading"
        striped />
    </div>

    <!-- 添加/编辑用户弹窗 -->
    <n-modal v-model:show="showAddUserModal" preset="card" :title="isEditing ? '编辑用户' : '添加用户'" class="user-modal"
      :mask-closable="false">
      <n-form ref="formRef" :model="userForm" :rules="rules" label-placement="left" label-width="auto"
        require-mark-placement="right-hanging">
        <n-form-item label="用户名" path="username">
          <n-input v-model:value="userForm.username" placeholder="请输入用户名" />
        </n-form-item>
        <n-form-item label="背景图" path="backgroundImage">
          <n-upload :default-upload="false" :max="1" :on-before-upload="beforeUpload" @change="handleUploadChange">
            <template #default>
              <n-upload-dragger>
                <div style="padding: 20px 0">
                  <n-icon size="48" :depth="3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path fill="currentColor"
                        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5c0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4c0-2.05 1.53-3.76 3.56-3.97l1.07-.11l.5-.95A5.469 5.469 0 0 1 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5l1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3zm-5-5h-2v3h-2v-3H8l4-4l4 4z" />
                    </svg>
                  </n-icon>
                  <p>点击或拖动文件到此区域上传</p>
                  <p style="margin: 8px 0 0 0">
                    支持单个或批量上传，严禁上传非图片文件
                  </p>
                </div>
              </n-upload-dragger>
              <n-button>选择文件</n-button>
            </template>
          </n-upload>
          <div v-if="userForm.settings.backgroundImage" class="preview-image">
            <n-image object-fit="cover" height="190" alt="背景图预览" :src="userForm.settings.backgroundImage" />
            <n-button @click="if (userForm.settings) { userForm.settings.backgroundImage = ''; }">清除背景图</n-button>
          </div>
        </n-form-item>
        <n-form-item label="cookie" path="cookie">
          <n-input v-model:value="userForm.cookie" placeholder="请输入cookie" />
          <template #help>
            可以手动设置cookie，也可以留空系统自动生成
          </template>
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddUserModal = false">取消</n-button>
          <n-button type="primary" @click="submitUser" :loading="submitting">
            确定
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 删除确认弹窗 -->
    <n-modal v-model:show="showDeleteModal" preset="dialog" title="确认删除" content="确定要删除这个用户吗？此操作不可恢复，且会删除该用户的所有活动数据。"
      positive-text="确定" negative-text="取消" @positive-click="confirmDelete" @negative-click="cancelDelete" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from "vue";
import { useMessage, NButton, NSpace, useDialog, NImage } from "naive-ui";
import type { FormInst, FormRules, DataTableColumns, UploadFileInfo } from "naive-ui";
import axios from "axios";
import { useSettingStore } from "@/stores";

// 全局对话框
window.$dialog = useDialog();

interface User {
  id: number;
  username: string;
  createdAt: string;
  updatedAt?: string;
  settings?: {
    backgroundImage: string;
  };
  cookie?: string;
}

// 状态管理
const message = useMessage();
const users = ref<User[]>([]);
const loading = ref(false);
const showAddUserModal = ref(false);
const showDeleteModal = ref(false);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);
const deleteId = ref<number | null>(null);
const isEditing = ref(false);
const hasToken = ref(false);

// 分页设置
const pagination = ref({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 20, 30, 40],
  onChange: (page: number) => {
    pagination.value.page = page;
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.value.pageSize = pageSize;
    pagination.value.page = 1;
  },
});

// 表单数据
const userForm = ref<{
  id?: number;
  username: string;
  cookie: string;
  settings: {
    backgroundImage: string;
  };
}>({
  username: "",
  cookie: "",
  settings: {
    backgroundImage: "",
  },
});

// 表单验证规则
const rules: FormRules = {
  username: {
    required: true,
    message: "请输入用户名",
    trigger: ["blur", "input"],
  }
};

// 检查是否有token
const checkToken = () => {
  const { autoLoginCookie } = useSettingStore();
  hasToken.value = !!autoLoginCookie;
  return autoLoginCookie;
};

// 表格列定义
const createColumns = (): DataTableColumns<User> => {
  return [
    {
      title: "ID",
      key: "id",
      width: 80,
      resizable: true
    },
    {
      title: "用户名",
      key: "username",
      width: 120,
      resizable: true
    },
    {
      title: "Cookie",
      key: "cookie",
      width: 180,
      ellipsis: {
        tooltip: true,
      },
      resizable: true
    },
    {
      title: "最后更新时间",
      key: "updatedAt",
      width: 180,
      resizable: true
    },
    {
      title: "背景图",
      key: "backgroundImage",
      width: 120,
      render(row) {
        // 确保 row.settings 存在且 backgroundImage 存在
        return row.settings && row.settings.backgroundImage
          ? h(NImage, {
            src: row.settings.backgroundImage,
            style: 'width: 50px; height: 50px; object-fit: cover; border-radius: 4px;',
          })
          : '无';
      },
      resizable: true
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      render(row) {
        return h(
          NSpace,
          { justify: "center" },
          {
            default: () => [
              h(
                NButton,
                {
                  size: "small",
                  type: "info",
                  onClick: () => editUser(row),
                },
                { default: () => "编辑" }
              ),
              h(
                NButton,
                {
                  size: "small",
                  type: "error",
                  onClick: () => deleteUser(row.id),
                },
                { default: () => "删除" }
              ),
            ],
          }
        );
      },
      resizable: true
    },
  ];
};

const columns = createColumns();

// 获取用户列表
const fetchUsers = async () => {
  try {
    loading.value = true;
    const { activitiesApiBaseUrl } = useSettingStore();
    const cookie = checkToken();

    if (!cookie) {
      message.warning("您尚未设置Cookie或Token，无法获取用户列表");
      users.value = [];
      loading.value = false;
      return;
    }

    const apiUrl = `${activitiesApiBaseUrl}/users`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${cookie}`
    };

    const response = await axios.get(apiUrl, { headers });

    if (response.data.status === 200) {
      users.value = response.data.data;
    } else {
      message.error("获取用户列表失败");
      users.value = [];
    }
  } catch (error) {
    message.error("获取用户列表失败，请检查网络连接或API域名配置");
    users.value = [];
  } finally {
    loading.value = false;
  }
};

// 上传前检查
const beforeUpload = (data: { file: UploadFileInfo }) => {
  const { file } = data;
  // 检查文件类型
  if (!file.file?.type.startsWith('image/')) {
    message.error('只能上传图片文件');
    return false;
  }
  // 检查文件大小（限制为2MB）
  if (file.file.size > 10 * 1024 * 1024) {
    message.error('图片大小不能超过10MB');
    return false;
  }
  return true;
};

// 处理上传变化
const handleUploadChange = async (options: { fileList: UploadFileInfo[] }) => {
  const { fileList } = options;
  if (fileList.length === 0) {
    userForm.value.settings.backgroundImage = ''; // 修改此处
    return;
  }

  const file = fileList[0].file;
  if (!file) return;

  try {
    const { activitiesApiBaseUrl } = useSettingStore();
    const cookie = checkToken();

    if (!cookie) {
      message.error("您尚未设置Cookie或Token，无法上传图片");
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(`${activitiesApiBaseUrl}/upload`, formData, {
      headers: {
        'Authorization': `Bearer ${cookie}`,
        'Content-Type': 'multipart/form-data'
      }
    });

    if (response.data.status === 200 || response.data.data.url) {
      userForm.value.settings.backgroundImage = response.data.data.url; // 修改此处
      message.success("图片上传成功");
    } else {
      message.error("图片上传失败");
    }
  } catch (error) {
    console.error("上传图片失败:", error);
    message.error("上传图片失败，请检查网络连接或API域名配置");
  }
};

// 提交用户表单
const submitUser = () => {
  formRef.value?.validate(async (errors) => {
    if (errors) {
      return;
    }

    submitting.value = true;
    try {
      const { activitiesApiBaseUrl } = useSettingStore();
      const cookie = checkToken();

      if (!cookie) {
        message.error("您尚未设置Cookie或Token，无法提交用户信息");
        submitting.value = false;
        return;
      }

      const headers = {
        'Authorization': `Bearer ${cookie}`,
        'Content-Type': 'application/json'
      };

      let response;
      if (isEditing.value && userForm.value.id) {
        // 更新用户
        const apiUrl = `${activitiesApiBaseUrl}/users/${userForm.value.id}`;
        response = await axios.put(apiUrl, {
            username: userForm.value.username,
            cookie: userForm.value.cookie,
            settings: userForm.value.settings, // 修改此处
        }, { headers });
      } else {
        // 创建用户
        const apiUrl = `${activitiesApiBaseUrl}/register`;
        response = await axios.post(apiUrl, {
          username: userForm.value.username,
          cookie: userForm.value.cookie,
          settings: userForm.value.settings, // 修改此处
        }, { headers });
      }

      if (response.data.status === 200 || response.data.status === 201) {
        message.success(isEditing.value ? "用户更新成功" : "用户创建成功");
        showAddUserModal.value = false;
        fetchUsers();
      } else {
        message.error(response.data.data.message || (isEditing.value ? "更新用户失败" : "创建用户失败"));
      }
    } catch (error: any) {
      console.error("提交用户信息失败:", error);
      const errorMsg = error.response?.data?.data?.message || (isEditing.value ? "更新用户失败" : "创建用户失败");
      message.error(errorMsg);
    } finally {
      submitting.value = false;
    }
  });
};

// 编辑用户
const editUser = (user: User) => {
  isEditing.value = true;
  userForm.value = {
    id: user.id,
    username: user.username,
    cookie: user.cookie || "",
    settings: user.settings || { backgroundImage: '' }, // 修改此处，确保settings存在
  };
  showAddUserModal.value = true;
};

// 删除用户
const deleteUser = (id: number) => {
  deleteId.value = id;
  showDeleteModal.value = true;
};

// 确认删除
const confirmDelete = async () => {
  if (deleteId.value) {
    try {
      const { activitiesApiBaseUrl } = useSettingStore();
      const cookie = checkToken();

      if (!cookie) {
        message.error("您尚未设置Cookie或Token，无法删除用户");
        return;
      }

      const apiUrl = `${activitiesApiBaseUrl}/deluser/${deleteId.value}`;
      const response = await axios.delete(apiUrl, {
        headers: {
          'Authorization': `Bearer ${cookie}`
        }
      });

      if (response.data.status === 200) {
        message.success("用户删除成功");
        fetchUsers();
      } else {
        message.error(response.data.data.message || "删除用户失败");
      }
    } catch (error) {
      console.error("删除用户失败:", error);
      message.error("删除用户失败，请检查网络连接或API域名配置");
    }
  }
  showDeleteModal.value = false;
  deleteId.value = null;
};

// 取消删除
const cancelDelete = () => {
  showDeleteModal.value = false;
  deleteId.value = null;
};

onMounted(() => {
  checkToken();
  fetchUsers();
});
</script>

<style scoped>
.user-management-container {
  padding: 20px;
}

.user-management-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.user-modal {
  width: 500px;
  max-width: 90vw;
}

.preview-image {
  border-radius: 4px;
  padding: 5px;
  width: 100%;
  max-height: 240px;
  overflow: hidden;
}

/* 媒体查询 */
@media (max-width: 768px) {
  .user-management-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-buttons {
    margin-top: 10px;
    width: 100%;
    justify-content: space-between;
  }

  .add-btn,
  .refresh-btn {
    flex-grow: 1;
    margin: 0 5px;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .user-modal {
    width: 95vw;
    margin: 0 auto;
  }
}
</style>