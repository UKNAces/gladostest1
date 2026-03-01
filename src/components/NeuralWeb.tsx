import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

interface NeuralWebProps {
  isSpeaking: boolean;
  audioVolume?: number; // 0 to 1
  color?: string;
}

export const NeuralWeb: React.FC<NeuralWebProps> = ({ 
  isSpeaking, 
  audioVolume = 0,
  color = '242, 125, 38' // Default Aperture Orange (RGB)
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animationFrameId = useRef<number>(0);
  
  // Use refs to avoid stale closures in the animation loop
  const isSpeakingRef = useRef(isSpeaking);
  const audioVolumeRef = useRef(audioVolume);
  const colorRef = useRef(color);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    audioVolumeRef.current = audioVolume;
  }, [audioVolume]);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  const initParticles = (width: number, height: number) => {
    const count = 60; // Increased to help form the pattern
    particles.current = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.15, 
      vy: (Math.random() - 0.5) * 0.15,
      size: Math.random() * 0.8 + 0.4,
    }));
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    
    const currentIsSpeaking = isSpeakingRef.current;
    const currentVolume = audioVolumeRef.current;
    const currentColor = colorRef.current;

    // Reactivity based on audioVolume
    const speedMultiplier = currentIsSpeaking ? 2 + currentVolume * 4 : 1.01; 
    const connectionDistance = currentIsSpeaking ? 180 + currentVolume * 70 : 130; 
    const opacity = currentIsSpeaking ? 0.8 + currentVolume * 0.2 : 0.4;

    // Update and draw particles
    particles.current.forEach((p, i) => {
      p.x += p.vx * speedMultiplier;
      p.y += p.vy * speedMultiplier;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

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
