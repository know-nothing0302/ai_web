<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const canvasRef = ref<HTMLCanvasElement | null>(null);

// 粒子对象
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  layer: number;

  constructor(width: number, height: number) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.layer = Math.random() * 0.6 + 0.7;
    this.vx = (Math.random() - 0.5) * 0.35 * this.layer;
    this.vy = (Math.random() - 0.5) * 0.35 * this.layer;
    this.radius = Math.random() * 2.6 + 1.2;
    this.phase = Math.random() * Math.PI * 2;
  }

  update(width: number, height: number, t: number) {
    this.x += this.vx;
    this.y += this.vy;
    this.y += Math.sin(t + this.phase) * 0.08;

    if (this.x < 0 || this.x > width) this.vx = -this.vx;
    if (this.y < 0 || this.y > height) this.vy = -this.vy;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(79, 195, 247, 0.28)';
    ctx.fill();
  }
}

let animationFrameId: number;

const initCanvas = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = window.innerWidth;
  let height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  const particles: Particle[] = [];
  const particleCount = Math.min(Math.floor((width * height) / 45000), 34);

  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle(width, height));
  }

  const drawComplexShapes = () => {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 210) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          const midX = (particles[i].x + particles[j].x) / 2 + (particles[i].y - particles[j].y) * 0.03;
          const midY = (particles[i].y + particles[j].y) / 2 + (particles[j].x - particles[i].x) * 0.03;
          ctx.quadraticCurveTo(midX, midY, particles[j].x, particles[j].y);
          const opacity = 1 - distance / 210;
          ctx.strokeStyle = `rgba(2, 136, 209, ${opacity * 0.22})`;
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < particles.length - 2; i += 3) {
      const a = particles[i];
      const b = particles[i + 1];
      const c = particles[i + 2];
      const ab = Math.hypot(a.x - b.x, a.y - b.y);
      const bc = Math.hypot(b.x - c.x, b.y - c.y);
      const ca = Math.hypot(c.x - a.x, c.y - a.y);
      if (ab < 180 && bc < 180 && ca < 180) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(225, 245, 254, 0.28)';
        ctx.fill();
      }
    }
  };

  const animate = () => {
    const t = performance.now() * 0.001;
    ctx.clearRect(0, 0, width, height);

    particles.forEach((p) => {
      p.update(width, height, t);
      p.draw(ctx);
    });

    drawComplexShapes();
    animationFrameId = requestAnimationFrame(animate);
  };

  animate();

  const handleResize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  };

  window.addEventListener('resize', handleResize);
  
  return () => {
    window.removeEventListener('resize', handleResize);
    cancelAnimationFrame(animationFrameId);
  };
};

let cleanup: (() => void) | undefined;

onMounted(() => {
  cleanup = initCanvas();
});

onUnmounted(() => {
  if (cleanup) cleanup();
});
</script>

<template>
  <canvas 
    ref="canvasRef" 
    class="fixed inset-0 pointer-events-none -z-20 w-full h-full opacity-60"
  ></canvas>
</template>
