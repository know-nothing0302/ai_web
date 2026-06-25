export interface TreeNode {
  type: "department" | "user";
  id: number | string;
  name: string;
  parentId?: number;
  children?: TreeNode[];
  loaded?: boolean;
  loading?: boolean;
}
