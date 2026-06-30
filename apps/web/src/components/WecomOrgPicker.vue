<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { getWecomDepartments, getWecomTags } from "../services/api";
import OrgTreeNode from "./OrgTreeNode.vue";
import type { TreeNode } from "./OrgTreeTypes";
import type { WecomTag } from "../services/api";

const props = defineProps<{
  modelValue: {
    department_ids: number[];
    user_ids: string[];
    department_names: string[];
    user_names: string[];
    tag_ids: number[];
    tag_names: string[];
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
const selectedTags = ref<Map<number, string>>(new Map());
const searchQuery = ref("");

// Tag state
const wecomTags = ref<WecomTag[]>([]);
const tagsLoading = ref(false);
const tagsError = ref("");

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
    for (let i = 0; i < props.modelValue.tag_ids.length; i++) {
      selectedTags.value.set(
        props.modelValue.tag_ids[i]!,
        props.modelValue.tag_names[i] ?? ""
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

  // Load tags
  tagsLoading.value = true;
  try {
    const { tags } = await getWecomTags();
    wecomTags.value = tags;
  } catch {
    tagsError.value = "获取标签列表失败";
  } finally {
    tagsLoading.value = false;
  }
});

const syncToParent = () => {
  emit("update:modelValue", {
    department_ids: [...selectedDepts.value.keys()],
    user_ids: [...selectedUsers.value.keys()],
    department_names: [...selectedDepts.value.values()],
    user_names: [...selectedUsers.value.values()],
    tag_ids: [...selectedTags.value.keys()],
    tag_names: [...selectedTags.value.values()],
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

const toggleTag = (tagId: number, tagName: string) => {
  if (selectedTags.value.has(tagId)) {
    selectedTags.value.delete(tagId);
  } else {
    selectedTags.value.set(tagId, tagName);
  }
  syncToParent();
};

const removeTag = (id: number) => {
  selectedTags.value.delete(id);
  syncToParent();
};

const hasSelection = computed(() =>
  selectedDepts.value.size > 0 ||
  selectedUsers.value.size > 0 ||
  selectedTags.value.size > 0
);

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
          <span
            v-for="[id, name] in selectedTags"
            :key="'tag-' + id"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-300 border border-amber-500/25"
          >
            🏷 {{ name }}
            <button @click="removeTag(id)" class="ml-0.5 hover:text-amber-100">&times;</button>
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

      <!-- Tags section -->
      <div class="mt-4 pt-4 border-t border-slate-700/40">
        <div class="text-xs text-slate-400 mb-2">🏷 企业微信标签</div>
        <div v-if="tagsLoading" class="text-slate-400 text-xs py-2">加载标签...</div>
        <div v-else-if="tagsError" class="text-red-400 text-xs py-2">{{ tagsError }}</div>
        <div v-else-if="wecomTags.length === 0" class="text-slate-500 text-xs py-2">暂无标签</div>
        <div v-else class="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
          <label
            v-for="tag in wecomTags"
            :key="tag.tagId"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-all"
            :class="selectedTags.has(tag.tagId)
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
              : 'bg-slate-800/30 border border-slate-700/30 text-slate-400 hover:border-slate-600/40'"
          >
            <input
              type="checkbox"
              :checked="selectedTags.has(tag.tagId)"
              @change="toggleTag(tag.tagId, tag.tagName)"
              class="accent-amber-500"
            />
            {{ tag.tagName }}
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
