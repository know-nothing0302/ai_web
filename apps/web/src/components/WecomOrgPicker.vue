<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { getWecomDepartments } from "../services/api";
import OrgTreeNode from "./OrgTreeNode.vue";
import type { TreeNode } from "./OrgTreeTypes";

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

const rootNodes = ref<TreeNode[]>([]);
const loading = ref(true);
const error = ref("");

const selectedDepts = ref<Map<number, string>>(new Map());
const selectedUsers = ref<Map<string, string>>(new Map());
const searchQuery = ref("");

// Full flat department list for search
const allDepartments = ref<Map<number, { id: number; name: string; parentId: number }>>(new Map());

// Build a full tree from flat department list (pre-populate children for search)
const buildTree = (
  deptList: { id: number; name: string; parentId: number }[],
  parentId: number
): TreeNode[] => {
  return deptList
    .filter((d) => d.parentId === parentId)
    .map((d) => ({
      type: "department" as const,
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      children: buildTree(deptList, d.id),
      loaded: true, // pre-loaded so search works
      loading: false,
    }));
};

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
    // Store full list for search
    for (const d of departments) {
      allDepartments.value.set(d.id, d);
    }
    // Build full tree (all children pre-populated) so search traverses unexpanded nodes
    rootNodes.value = buildTree(departments, 0);
  } catch (e) {
    error.value = "获取部门列表失败";
  } finally {
    loading.value = false;
  }
});

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

const hasSelection = computed(() => selectedDepts.value.size > 0 || selectedUsers.value.size > 0);

const onSelectionUpdate = () => {
  syncToParent();
};
</script>

<template>
  <div class="org-picker">
    <!-- Search input -->
    <div class="relative mb-3">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索部门或成员..."
        class="w-full px-3 py-2 bg-slate-900/60 border border-slate-600/40 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
      />
      <span v-if="searchQuery" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
        {{ searchQuery.length > 0 ? '🔍' : '' }}
      </span>
    </div>

    <div v-if="loading" class="text-slate-400 text-sm py-4">加载通讯录...</div>
    <div v-else-if="error" class="text-red-400 text-sm py-4">{{ error }}</div>
    <div v-else class="space-y-4">
      <!-- Selected items summary -->
      <div
        v-if="hasSelection"
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

      <!-- Tree: recursive rendering via OrgTreeNode -->
      <div class="max-h-80 overflow-y-auto space-y-0.5">
        <OrgTreeNode
          v-for="node in rootNodes"
          :key="node.id"
          :node="node"
          :search-query="searchQuery"
          :selected-depts="selectedDepts"
          :selected-users="selectedUsers"
          @update:selection="onSelectionUpdate"
        />
        <div v-if="rootNodes.length === 0 && !loading" class="text-slate-500 text-sm py-4 text-center">
          暂无部门数据
        </div>
      </div>
    </div>
  </div>
</template>
