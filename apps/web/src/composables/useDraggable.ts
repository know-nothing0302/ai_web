import { ref } from "vue";

function getClientXY(e: MouseEvent | TouchEvent): { clientX: number; clientY: number } {
  if ("touches" in e) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  return { clientX: e.clientX, clientY: e.clientY };
}

export function useDraggable(threshold = 5) {
  const dialogPos = ref({ x: 0, y: 0 });
  const dragging = ref(false);
  const dragStart = ref({ x: 0, y: 0 });
  const dragOffset = ref({ x: 0, y: 0 });

  const startDrag = (e: MouseEvent | TouchEvent) => {
    const { clientX, clientY } = getClientXY(e);
    dragging.value = false;
    dragStart.value = { x: clientX, y: clientY };
    dragOffset.value = {
      x: clientX - dialogPos.value.x,
      y: clientY - dialogPos.value.y,
    };
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchmove", onDrag, { passive: false });
    document.addEventListener("touchend", stopDrag);
  };

  const onDrag = (e: MouseEvent | TouchEvent) => {
    const { clientX, clientY } = getClientXY(e);
    const dx = Math.abs(clientX - dragStart.value.x);
    const dy = Math.abs(clientY - dragStart.value.y);
    if (dx < threshold && dy < threshold) return;
    dragging.value = true;
    dialogPos.value = {
      x: clientX - dragOffset.value.x,
      y: clientY - dragOffset.value.y,
    };
  };

  const stopDrag = () => {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("touchmove", onDrag);
    document.removeEventListener("touchend", stopDrag);
  };

  return { dialogPos, dragging, startDrag };
}
