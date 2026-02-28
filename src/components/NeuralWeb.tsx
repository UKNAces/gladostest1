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
}

export const NeuralWeb: React.FC<NeuralWebProps> = ({ isSpeaking, audioVolume = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animationFrameId = useRef<number>(0);
  
  // Use refs to avoid stale closures in the animation loop
  const isSpeakingRef = useRef(isSpeaking);
  const audioVolumeRef = useRef(audioVolume);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    audioVolumeRef.current = audioVolume;
  }, [audioVolume]);

  const initParticles = (width: number, height: number) => {
    const count = 100;
    particles.current = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 1.5, // Increased base velocity
      vy: (Math.random() - 0.5) * 1.5,
      size: Math.random() * 1.5 + 0.5,
    }));
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    
    const currentIsSpeaking = isSpeakingRef.current;
    const currentVolume = audioVolumeRef.current;

    // Reactivity based on audioVolume
    const speedMultiplier = currentIsSpeaking ? 1 + currentVolume * 15 : 1;
    const connectionDistance = currentIsSpeaking ? 120 + currentVolume * 150 : 120;
    const opacity = currentIsSpeaking ? 0.2 + currentVolume * 0.6 : 0.2;

    // Update and draw particles
    particles.current.forEach((p, i) => {
      p.x += p.vx * speedMultiplier;
      p.y += p.vy * speedMultiplier;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + currentVolume * 2), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(242, 125, 38, ${opacity})`;
      ctx.fill();

      // Draw connections
      for (let j = i + 1; j < particles.current.length; j++) {
        const p2 = particles.current[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < connectionDistance) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          const lineOpacity = (1 - dist / connectionDistance) * opacity;
          ctx.strokeStyle = `rgba(242, 125, 38, ${lineOpacity})`;
          ctx.lineWidth = currentIsSpeaking ? 0.5 + currentVolume * 2 : 0.5;
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
  }, []); // Only run once on mount

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-40 mix-blend-screen"
      style={{ filter: 'drop-shadow(0 0 15px rgba(242, 125, 38, 0.3))' }}
    />
  );
};
