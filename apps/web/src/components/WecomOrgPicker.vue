<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getWecomDepartments, getWecomDepartmentUsers } from "../services/api";

const props = defineProps<{
  modelValue: {
    department_ids: number[];
    user_ids: string[];
    department_names: string[];
    user_names: string[];
  };
}>();

const emit = defineEmits<{
  "update:modelValue": [value: typeof props.modelValue];
}>();

interface TreeNode {
  type: "department" | "user";
  id: number | string;
  name: string;
  parentId?: number;
  children?: TreeNode[];
  loaded?: boolean;
  loading?: boolean;
}

const rootNodes = ref<TreeNode[]>([]);
const loading = ref(true);
const error = ref("");

const selectedDepts = ref<Map<number, string>>(new Map());
const selectedUsers = ref<Map<string, string>>(new Map());

// Initialize from modelValue
onMounted(async () => {
  if (props.modelValue) {
    for (let i = 0; i < props.modelValue.department_ids.length; i++) {
      selectedDepts.value.set(
        props.modelValue.department_ids[i]!,
        props.modelValue.department_names[i] ?? ""
      );
    }
    for (let i = 0; i < props.modelValue.user_ids.length; i++) {
      selectedUsers.value.set(
        props.modelValue.user_ids[i]!,
        props.modelValue.user_names[i] ?? ""
      );
    }
  }
  try {
    const { departments } = await getWecomDepartments();
    const topLevel = departments.filter((d) => d.parentId === 0);
    rootNodes.value = topLevel.map((d) => ({
      type: "department" as const,
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      children: [],
      loaded: false,
      loading: false,
    }));
  } catch (e) {
    error.value = "获取部门列表失败";
  } finally {
    loading.value = false;
  }
});

const toggleDepartment = async (node: TreeNode) => {
  const deptId = node.id as number;

  if (selectedDepts.value.has(deptId)) {
    selectedDepts.value.delete(deptId);
    syncToParent();
    return;
  }

  if (!node.loaded && !node.loading) {
    node.loading = true;
    try {
      // Load sub-departments
      const { departments } = await getWecomDepartments(deptId);
      const childDepts = departments.filter((d) => d.parentId === deptId);

      // Load users in this department
      const { users } = await getWecomDepartmentUsers(deptId);

      // Fetch all departments to build child tree
      const childNodes: TreeNode[] = [];

      // Add child departments
      for (const d of childDepts) {
        childNodes.push({
          type: "department",
          id: d.id,
          name: d.name,
          parentId: d.parentId,
          children: [],
          loaded: false,
          loading: false,
        });
      }

      // Add users
      for (const u of users) {
        childNodes.push({
          type: "user",
          id: u.userid,
          name: u.name || u.userid,
        });
      }

      node.children = childNodes;
      node.loaded = true;
    } catch {
      // Ignore load errors for individual departments
    } finally {
      node.loading = false;
    }
  }

  selectedDepts.value.set(deptId, node.name);
  syncToParent();
};

const toggleUser = (node: TreeNode) => {
  const userId = String(node.id);
  if (selectedUsers.value.has(userId)) {
    selectedUsers.value.delete(userId);
  } else {
    selectedUsers.value.set(userId, node.name);
  }
  syncToParent();
};

const syncToParent = () => {
  emit("update:modelValue", {
    department_ids: [...selectedDepts.value.keys()],
    user_ids: [...selectedUsers.value.keys()],
    department_names: [...selectedDepts.value.values()],
    user_names: [...selectedUsers.value.values()],
  });
};

const removeDept = (id: number) => {
  selectedDepts.value.delete(id);
  syncToParent();
};

const removeUser = (id: string) => {
  selectedUsers.value.delete(id);
  syncToParent();
};
</script>

<template>
  <div class="org-picker">
    <div v-if="loading" class="text-slate-400 text-sm py-4">加载通讯录...</div>
    <div v-else-if="error" class="text-red-400 text-sm py-4">{{ error }}</div>
    <div v-else class="space-y-4">
      <!-- Selected items summary -->
      <div
        v-if="selectedDepts.size > 0 || selectedUsers.size > 0"
        class="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
      >
        <div class="text-xs text-slate-400 mb-2">已选择：</div>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="[id, name] in selectedDepts"
            :key="'dept-' + id"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-cyan-500/15 text-cyan-300 border border-cyan-500/25"
          >
            📁 {{ name }}
            <button @click="removeDept(id)" class="ml-0.5 hover:text-cyan-100">&times;</button>
          </span>
          <span
            v-for="[id, name] in selectedUsers"
            :key="'user-' + id"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-500/15 text-purple-300 border border-purple-500/25"
          >
            👤 {{ name }}
            <button @click="removeUser(id)" class="ml-0.5 hover:text-purple-100">&times;</button>
          </span>
        </div>
      </div>

      <!-- Tree -->
      <div class="max-h-80 overflow-y-auto space-y-0.5">
        <template v-for="node in rootNodes" :key="node.id">
          <!-- Department node -->
          <div v-if="node.type === 'department'" class="select-none">
            <button
              @click="toggleDepartment(node)"
              class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm hover:bg-slate-700/40 transition-colors"
              :class="{
                'bg-cyan-500/10 border border-cyan-500/25': selectedDepts.has(
                  node.id as number
                ),
                'text-slate-300': !selectedDepts.has(node.id as number),
                'text-cyan-200': selectedDepts.has(node.id as number),
              }"
            >
              <span v-if="node.loading" class="animate-spin text-xs">⏳</span>
              <span v-else class="text-xs">{{ selectedDepts.has(node.id as number) ? '📂' : '📁' }}</span>
              <span class="flex-1">{{ node.name }}</span>
              <span v-if="selectedDepts.has(node.id as number)" class="text-cyan-400">✓</span>
            </button>

            <!-- Children -->
            <div
              v-if="node.loaded && node.children && node.children.length"
              class="ml-4 border-l border-slate-700/40 pl-2"
            >
              <template v-for="child in node.children" :key="child.id">
                <!-- Child department -->
                <button
                  v-if="child.type === 'department'"
                  @click="toggleDepartment(child)"
                  class="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm hover:bg-slate-700/40 transition-colors"
                  :class="{
                    'bg-cyan-500/10 border border-cyan-500/25': selectedDepts.has(
                      child.id as number
                    ),
                    'text-slate-300': !selectedDepts.has(child.id as number),
                    'text-cyan-200': selectedDepts.has(child.id as number),
                  }"
                >
                  <span class="text-xs">{{ selectedDepts.has(child.id as number) ? '📂' : '📁' }}</span>
                  <span class="flex-1">{{ child.name }}</span>
                  <span v-if="selectedDepts.has(child.id as number)" class="text-cyan-400">✓</span>
                </button>

                <!-- Child user -->
                <button
                  v-else
                  @click="toggleUser(child)"
                  class="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm hover:bg-slate-700/40 transition-colors"
                  :class="{
                    'bg-purple-500/10 border border-purple-500/25': selectedUsers.has(
                      String(child.id)
                    ),
                    'text-slate-400': !selectedUsers.has(String(child.id)),
                    'text-purple-200': selectedUsers.has(String(child.id)),
                  }"
                >
                  <span class="text-xs">👤</span>
                  <span class="flex-1">{{ child.name }}</span>
                  <span
                    v-if="selectedUsers.has(String(child.id))"
                    class="text-purple-400"
                    >✓</span
                  >
                </button>
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
