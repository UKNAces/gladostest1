import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  size: number;
}

interface NeuralWebProps {
  isSpeaking: boolean;
  audioVolume?: number; // 0 to 1
  color?: string;
  mood?: 'NORMAL' | 'LEARNING' | 'ANGRY' | 'ROMANTIC';
}

export const NeuralWeb: React.FC<NeuralWebProps> = ({ 
  isSpeaking, 
  audioVolume = 0,
  color = '242, 125, 38', // Default Aperture Orange (RGB)
  mood = 'NORMAL'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animationFrameId = useRef<number>(0);
  const mousePos = useRef<{ x: number; y: number }>({ x: -1000, y: -1000 });
  
  // Use refs to avoid stale closures in the animation loop
  const isSpeakingRef = useRef(isSpeaking);
  const audioVolumeRef = useRef(audioVolume);
  const colorRef = useRef(color);
  const moodRef = useRef(mood);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    audioVolumeRef.current = audioVolume;
  }, [audioVolume]);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const initParticles = (width: number, height: number) => {
    const count = 68; // Increased by 8 as requested
    particles.current = Array.from({ length: count }, () => {
      const x = Math.random() * width;
      const y = Math.random() * height;
      return {
        x,
        y,
        baseX: x,
        baseY: y,
        vx: (Math.random() - 0.5) * 0.15, 
        vy: (Math.random() - 0.5) * 0.15,
        size: Math.random() * 0.8 + 0.4,
      };
    });
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    
    const currentIsSpeaking = isSpeakingRef.current;
    const currentVolume = audioVolumeRef.current;
    const currentMood = moodRef.current;
    
    let currentColor = colorRef.current;
    if (currentMood === 'LEARNING') currentColor = '0, 166, 255'; // Aperture Blue
    if (currentMood === 'ANGRY') currentColor = '220, 38, 38'; // Aperture Red
    if (currentMood === 'ROMANTIC') currentColor = '255, 105, 180'; // Hot Pink

    // Reactivity based on audioVolume and mood
    const moodMultiplier = currentMood !== 'NORMAL' ? 1.5 : 1;
    const speedMultiplier = currentIsSpeaking ? 2 + currentVolume * 4 : 1.01 * moodMultiplier; 
    const connectionDistance = currentIsSpeaking ? 180 + currentVolume * 70 : 130 * moodMultiplier; 
    const opacity = currentIsSpeaking ? 0.8 + currentVolume * 0.2 : (currentMood !== 'NORMAL' ? 0.7 : 0.4);

    // Update and draw particles
    particles.current.forEach((p, i) => {
      // 1. Repulsion from mouse
      const dxMouse = p.x - mousePos.current.x;
      const dyMouse = p.y - mousePos.current.y;
      const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
      const mouseRadius = 180;

      if (distMouse < mouseRadius) {
        const force = (mouseRadius - distMouse) / mouseRadius;
        p.x += (dxMouse / distMouse) * force * 12;
        p.y += (dyMouse / distMouse) * force * 12;
      }

      // 2. Attraction to base position (Elastic return)
      const dxBase = p.baseX - p.x;
      const dyBase = p.baseY - p.y;
      p.x += dxBase * 0.06;
      p.y += dyBase * 0.06;

      // 3. Update base position (Constant drift)
      p.baseX += p.vx * speedMultiplier;
      p.baseY += p.vy * speedMultiplier;

      // 4. Wrapping with coordinate sync to prevent "snapping"
      if (p.baseX < 0) { p.baseX = width; p.x += width; }
      if (p.baseX > width) { p.baseX = 0; p.x -= width; }
      if (p.baseY < 0) { p.baseY = height; p.y += height; }
      if (p.baseY > height) { p.baseY = 0; p.y -= height; }

      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.02 + currentVolume * 1), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${currentColor}, ${opacity})`;
      ctx.shadowBlur = currentIsSpeaking ? 5 + currentVolume * 15 : 2;
      ctx.shadowColor = `rgba(${currentColor}, 0.4)`;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw connections
      for (let j = i + 1; j < particles.current.length; j++) {
        const p2 = particles.current[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = connectionDistance;

        if (dist < maxDist) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          const lineOpacity = (1 - dist / maxDist) * (opacity * 0.8);
          ctx.strokeStyle = `rgba(${currentColor}, ${lineOpacity})`;
          ctx.lineWidth = currentIsSpeaking ? 1.5 + currentVolume * 2 : 0.6;
          ctx.stroke();
        }
      }
    });

    animationFrameId.current = requestAnimationFrame(() => draw(ctx, width, height));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles(canvas.width, canvas.height);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    draw(ctx, canvas.width, canvas.height);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-10 opacity-70 mix-blend-screen"
      style={{ filter: `drop-shadow(0 0 4px rgba(${color}, 0.3))` }}
    />
  );
};
