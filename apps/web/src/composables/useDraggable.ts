import { ref } from "vue";

export function useDraggable(threshold = 3) {
  const dialogPos = ref({ x: 0, y: 0 });
  const dragging = ref(false);
  const dragStart = ref({ x: 0, y: 0 });
  const dragOffset = ref({ x: 0, y: 0 });

  const startDrag = (e: MouseEvent) => {
    dragging.value = false;
    dragStart.value = { x: e.clientX, y: e.clientY };
    dragOffset.value = {
      x: e.clientX - dialogPos.value.x,
      y: e.clientY - dialogPos.value.y,
    };
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
  };

  const onDrag = (e: MouseEvent) => {
    const dx = Math.abs(e.clientX - dragStart.value.x);
    const dy = Math.abs(e.clientY - dragStart.value.y);
    if (dx < threshold && dy < threshold) return;
    dragging.value = true;
    dialogPos.value = {
      x: e.clientX - dragOffset.value.x,
      y: e.clientY - dragOffset.value.y,
    };
  };

  const stopDrag = () => {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
  };

  return { dialogPos, dragging, startDrag };
}
