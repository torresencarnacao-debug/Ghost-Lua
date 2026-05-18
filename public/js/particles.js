// ─── PARTICLE CONSTELLATION NETWORK BACKGROUND ───────────────────────────────
(function () {
  // 1. Create canvas element and inject it in the DOM
  const canvas = document.createElement('canvas');
  canvas.id = 'particles-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.zIndex = '-1';
  canvas.style.pointerEvents = 'none';
  canvas.style.background = 'transparent';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');

  let particles = [];
  let animationFrameId;

  // Configuration
  const config = {
    particleCount: 50,
    minDist: 150,
    colorParticle: 'rgba(168, 85, 247, 0.45)', // bright neon purple/violet
    colorLine: 'rgba(168, 85, 247, 0.12)',
    maxSpeed: 0.5,
    minSpeed: 0.15
  };

  // Adjust particle count on mobile screens for performance and layout aesthetics
  function updateParticleCount() {
    if (window.innerWidth < 768) {
      config.particleCount = 25;
      config.minDist = 100;
    } else {
      config.particleCount = 55;
      config.minDist = 160;
    }
  }

  // Handle Resize
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    updateParticleCount();
    initParticles();
  }

  // Particle Class
  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      
      const angle = Math.random() * Math.PI * 2;
      const speed = config.minSpeed + Math.random() * (config.maxSpeed - config.minSpeed);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;

      this.radius = 1.5 + Math.random() * 2;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      // Bounce/Wrap boundaries
      if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
      if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = config.colorParticle;
      // Add subtle glow matching the neon reference image
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
      ctx.fill();
      ctx.shadowBlur = 0; // reset shadow for lines
    }
  }

  // Initialize Particles
  function initParticles() {
    particles = [];
    for (let i = 0; i < config.particleCount; i++) {
      particles.push(new Particle());
    }
  }

  // Line Draw Helper
  function drawLines() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const p1 = particles[i];
        const p2 = particles[j];

        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < config.minDist) {
          // Dynamic alpha based on distance (closer = more opaque, just like the reference photo!)
          const alpha = (1 - dist / config.minDist) * 0.22;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
  }

  // Animation Loop
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw lines first
    drawLines();

    // Draw and update particles
    particles.forEach(p => {
      p.update();
      p.draw();
    });

    animationFrameId = requestAnimationFrame(animate);
  }

  // Start Everything
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  animate();
})();
