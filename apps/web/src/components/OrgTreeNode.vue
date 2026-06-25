<script setup lang="ts">
import { ref, computed } from "vue";
import { getWecomDepartments, getWecomDepartmentUsers } from "../services/api";
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
const loaded = ref(false);
const loadingChildren = ref(false);
const children = ref<TreeNode[]>([]);

const isDepartment = computed(() => props.node.type === "department");
const nodeIdStr = computed(() => String(props.node.id));
const nodeIdNum = computed(() => props.node.id as number);

const isSelected = computed(() => {
  if (isDepartment.value) return props.selectedDepts.has(nodeIdNum.value);
  return props.selectedUsers.has(nodeIdStr.value);
});

// Visibility: matches search OR has descendant that matches
const isVisible = computed(() => {
  if (!props.searchQuery) return true;
  const q = props.searchQuery.toLowerCase();
  if (props.node.name.toLowerCase().includes(q)) return true;
  // Check children recursively
  if (isDepartment.value && children.value.length > 0) {
    return children.value.some(c => checkChildVisible(c, q));
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
  // Load children if not yet loaded
  if (!loaded.value && !loadingChildren.value) {
    await loadChildren();
  }
  expanded.value = true;
};

const loadChildren = async () => {
  loadingChildren.value = true;
  try {
    const deptId = nodeIdNum.value;
    const { departments } = await getWecomDepartments(deptId);
    const childDepts = departments.filter((d) => d.parentId === deptId);
    const { users } = await getWecomDepartmentUsers(deptId);

    const childNodes: TreeNode[] = [];

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

    for (const u of users) {
      childNodes.push({
        type: "user",
        id: u.userid,
        name: u.name || u.userid,
      });
    }

    children.value = childNodes;
    loaded.value = true;
  } catch {
    // Ignore load errors
  } finally {
    loadingChildren.value = false;
  }
};
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
          <span v-if="loadingChildren" class="inline-block animate-spin">⟳</span>
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
      <!-- Children -->
      <div v-if="expanded && children.length > 0" class="ml-3 border-l border-slate-700/40 pl-2">
        <OrgTreeNode
          v-for="child in children"
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
