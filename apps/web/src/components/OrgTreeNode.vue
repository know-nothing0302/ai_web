<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { getWecomDepartmentUsers } from "../services/api";
import type { TreeNode } from "./OrgTreeTypes";

const props = defineProps<{
  node: TreeNode;
  searchQuery: string;
  selectedDepts: Map<number, string>;
  selectedUsers: Map<string, string>;
}>();

const emit = defineEmits<{
  "update:selection": [];
}>();

const expanded = ref(false);
const loadingUsers = ref(false);
const userNodes = ref<TreeNode[]>([]);
const usersLoaded = ref(false);

const isDepartment = computed(() => props.node.type === "department");
const nodeIdStr = computed(() => String(props.node.id));
const nodeIdNum = computed(() => props.node.id as number);

const isSelected = computed(() => {
  if (isDepartment.value) return props.selectedDepts.has(nodeIdNum.value);
  return props.selectedUsers.has(nodeIdStr.value);
});

const hasSearch = computed(() => props.searchQuery.trim().length > 0);

// Visibility: matches search OR has descendant that matches
const isVisible = computed(() => {
  if (!hasSearch.value) return true;
  const q = props.searchQuery.toLowerCase();
  if (props.node.name.toLowerCase().includes(q)) return true;
  // Check children recursively (pre-loaded departments + loaded users)
  const allChildren = [...(props.node.children ?? []), ...userNodes.value];
  if (isDepartment.value && allChildren.length > 0) {
    return allChildren.some(c => checkChildVisible(c, q));
  }
  return false;
});

const checkChildVisible = (node: TreeNode, q: string): boolean => {
  if (node.name.toLowerCase().includes(q)) return true;
  if (node.children && node.children.length > 0) {
    return node.children.some(c => checkChildVisible(c, q));
  }
  return false;
};

// Auto-expand when search is active
watch(hasSearch, (searching) => {
  if (searching && isDepartment.value) {
    expanded.value = true;
  }
});

let clickTimer: ReturnType<typeof setTimeout> | null = null;

const handleClick = () => {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
    // Double-click: expand/collapse department
    if (isDepartment.value) {
      toggleExpand();
    }
  } else {
    clickTimer = setTimeout(() => {
      clickTimer = null;
      // Single-click: toggle selection
      toggleSelection();
    }, 250);
  }
};

const toggleSelection = () => {
  if (isDepartment.value) {
    const id = nodeIdNum.value;
    if (props.selectedDepts.has(id)) {
      props.selectedDepts.delete(id);
    } else {
      props.selectedDepts.set(id, props.node.name);
    }
  } else {
    const id = nodeIdStr.value;
    if (props.selectedUsers.has(id)) {
      props.selectedUsers.delete(id);
    } else {
      props.selectedUsers.set(id, props.node.name);
    }
  }
  emit("update:selection");
};

const toggleExpand = async () => {
  if (!isDepartment.value) return;
  if (expanded.value) {
    expanded.value = false;
    return;
  }
  // Load users if not yet loaded
  if (!usersLoaded.value && !loadingUsers.value) {
    await loadUsers();
  }
  expanded.value = true;
};

const loadUsers = async () => {
  loadingUsers.value = true;
  try {
    const deptId = nodeIdNum.value;
    const { users } = await getWecomDepartmentUsers(deptId);

    userNodes.value = users.map((u) => ({
      type: "user" as const,
      id: u.userid,
      name: u.name || u.userid,
    }));
    usersLoaded.value = true;
  } catch {
    // Ignore load errors
  } finally {
    loadingUsers.value = false;
  }
};

// Combined children: pre-loaded departments + lazy-loaded users
const allChildren = computed(() => {
  return [...(props.node.children ?? []), ...userNodes.value];
});
</script>

<template>
  <div v-if="isVisible" class="org-tree-node">
    <!-- Department node -->
    <template v-if="isDepartment">
      <div
        class="flex items-center gap-1 select-none"
        :style="{ paddingLeft: (node.parentId ? 8 : 0) + 'px' }"
      >
        <span class="text-slate-600 text-[10px] w-4 shrink-0 text-center">
          <span v-if="loadingUsers" class="inline-block animate-spin">⟳</span>
          <span v-else-if="expanded">▼</span>
          <span v-else>▶</span>
        </span>
        <button
          @click="handleClick"
          @dblclick.prevent
          class="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm hover:bg-slate-700/40 transition-colors"
          :class="{
            'bg-cyan-500/10 border border-cyan-500/25': isSelected,
            'text-slate-300': !isSelected,
            'text-cyan-200': isSelected,
          }"
        >
          <span class="text-xs">{{ isSelected ? '📂' : '📁' }}</span>
          <span class="flex-1 truncate">{{ node.name }}</span>
          <span v-if="isSelected" class="text-cyan-400 shrink-0">✓</span>
        </button>
      </div>
      <!-- Children (shown when expanded OR when searching) -->
      <div v-if="(expanded || hasSearch) && allChildren.length > 0" class="ml-3 border-l border-slate-700/40 pl-2">
        <OrgTreeNode
          v-for="child in allChildren"
          :key="child.id"
          :node="child"
          :search-query="searchQuery"
          :selected-depts="selectedDepts"
          :selected-users="selectedUsers"
          @update:selection="emit('update:selection')"
        />
      </div>
    </template>

    <!-- User node -->
    <template v-else>
      <div class="flex items-center gap-1 select-none">
        <span class="text-slate-600 text-[10px] w-4 shrink-0 text-center"></span>
        <button
          @click="handleClick"
          class="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm hover:bg-slate-700/40 transition-colors"
          :class="{
            'bg-purple-500/10 border border-purple-500/25': isSelected,
            'text-slate-400': !isSelected,
            'text-purple-200': isSelected,
          }"
        >
          <span class="text-xs">👤</span>
          <span class="flex-1 truncate">{{ node.name }}</span>
          <span v-if="isSelected" class="text-purple-400 shrink-0">✓</span>
        </button>
      </div>
    </template>
  </div>
</template>
