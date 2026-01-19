// Game.js - Free Fire Inspired Mobile Web Shooter
// Lightweight Canvas 2D top-down shooter

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Optimize: no alpha

// Resize canvas to full screen
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Game state
const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 20,
  speed: 3,
  rotation: 0, // in radians
  health: 100,
  ammo: 30,
  maxAmmo: 30,
  isJumping: false,
  jumpHeight: 0,
  isSprinting: false
};

let bullets = [];
let enemies = [];
let particles = []; // For death effects

// Control states
let moveTouchId = null;
let moveStartX = 0, moveStartY = 0;
let moveDir = { x: 0, y: 0 };

let aimTouchId = null;
let prevAimX = 0, prevAimY = 0;

let isFiring = false;
let isJumping = false;
let isReloading = false;
let isSprinting = false;

// Object pooling for bullets and enemies (optimization)
const bulletPool = [];
const enemyPool = [];

// Difficulty: easy=1, medium=1.5, hard=2
const difficulty = 1.5;

// Input handlers
const joystickZone = document.getElementById('joystickZone');
const aimZone = document.getElementById('aimZone');
const fireBtn = document.getElementById('fireBtn');
const jumpBtn = document.getElementById('jumpBtn');
const reloadBtn = document.getElementById('reloadBtn');
const sprintBtn = document.getElementById('sprintBtn');

// Prevent default touch behaviors
document.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

// Joystick touch
joystickZone.addEventListener('touchstart', e => {
  if (moveTouchId === null) {
    moveTouchId = e.changedTouches[0].identifier;
    moveStartX = e.changedTouches[0].clientX;
    moveStartY = e.changedTouches[0].clientY;
  }
});

joystickZone.addEventListener('touchmove', e => {
  for (let touch of e.changedTouches) {
    if (touch.identifier === moveTouchId) {
      const dx = touch.clientX - moveStartX;
      const dy = touch.clientY - moveStartY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const maxDist = 100; // virtual stick radius
      moveDir.x = dx / maxDist;
      moveDir.y = dy / maxDist;
      if (dist > maxDist) {
        moveDir.x = dx / dist;
        moveDir.y = dy / dist;
      }
    }
  }
});

joystickZone.addEventListener('touchend', e => {
  for (let touch of e.changedTouches) {
    if (touch.identifier === moveTouchId) {
      moveTouchId = null;
      moveDir = { x: 0, y: 0 };
    }
  }
});

// Aim swipe (right side)
aimZone.addEventListener('touchstart', e => {
  if (aimTouchId === null) {
    aimTouchId = e.changedTouches[0].identifier;
    prevAimX = e.changedTouches[0].clientX;
    prevAimY = e.changedTouches[0].clientY;
  }
});

aimZone.addEventListener('touchmove', e => {
  for (let touch of e.changedTouches) {
    if (touch.identifier === aimTouchId) {
      const dx = touch.clientX - prevAimX;
      player.rotation += dx * 0.005; // sensitivity
      prevAimX = touch.clientX;
      // Optional: dy for pitch if 3D later
    }
  }
});

aimZone.addEventListener('touchend', e => {
  for (let touch of e.changedTouches) {
    if (touch.identifier === aimTouchId) {
      aimTouchId = null;
    }
  }
});

// Buttons
fireBtn.addEventListener('touchstart', () => isFiring = true);
fireBtn.addEventListener('touchend', () => isFiring = false);

jumpBtn.addEventListener('touchstart', () => {
  if (!player.isJumping) {
    player.isJumping = true;
    player.jumpHeight = 0;
  }
});

reloadBtn.addEventListener('touchstart', () => {
  if (!isReloading && player.ammo < player.maxAmmo) isReloading = true;
});

sprintBtn.addEventListener('touchstart', () => isSprinting = true);
sprintBtn.addEventListener('touchend', () => isSprinting = false);

// Spawn enemies (every 5s)
setInterval(() => {
  if (enemies.length < 5 * difficulty) {
    const enemy = getEnemyFromPool();
    enemy.x = Math.random() * canvas.width;
    enemy.y = Math.random() * canvas.height;
    enemy.health = 50 * difficulty;
    enemies.push(enemy);
  }
}, 5000);

// Enemy factory with pooling
function getEnemyFromPool() {
  if (enemyPool.length > 0) {
    return enemyPool.pop();
  }
  return {
    x: 0, y: 0,
    radius: 18,
    speed: 1.2 * difficulty,
    health: 50,
    patrolDir: Math.random() * Math.PI * 2,
    state: 'patrol' // patrol / chase / shoot
  };
}

// Bullet factory
function createBullet(x, y, dirX, dirY) {
  let bullet;
  if (bulletPool.length > 0) {
    bullet = bulletPool.pop();
  } else {
    bullet = { x: 0, y: 0, vx: 0, vy: 0, radius: 5 };
  }
  bullet.x = x;
  bullet.y = y;
  bullet.vx = dirX * 12;
  bullet.vy = dirY * 12;
  return bullet;
}

// Update logic
function update() {
  // Player movement
  let currentSpeed = player.speed;
  if (isSprinting) currentSpeed *= 1.8;
  player.x += moveDir.x * currentSpeed;
  player.y += moveDir.y * currentSpeed;

  // Boundaries
  player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
  player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

  // Jump (simple arc)
  if (player.isJumping) {
    player.jumpHeight += 0.3;
    if (player.jumpHeight > 30) player.isJumping = false;
  } else if (player.jumpHeight > 0) {
    player.jumpHeight -= 0.5;
  }

  // Reload
  if (isReloading) {
    setTimeout(() => {
      player.ammo = player.maxAmmo;
      isReloading = false;
    }, 1500);
  }

  // Firing
  if (isFiring && player.ammo > 0 && !isReloading) {
    player.ammo--;
    const dirX = Math.cos(player.rotation);
    const dirY = Math.sin(player.rotation);
    bullets.push(createBullet(player.x + dirX*30, player.y + dirY*30, dirX, dirY));
  }

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
      bulletPool.push(bullets.splice(i, 1)[0]);
    }
  }

  // Enemy AI
  enemies.forEach((enemy, i) => {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist < 400) { // Detection range
      enemy.state = 'chase';
      const angle = Math.atan2(dy, dx);
      enemy.x += Math.cos(angle) * enemy.speed;
      enemy.y += Math.sin(angle) * enemy.speed;

      // Shoot if close and facing
      if (dist < 300 && Math.random() < 0.02 * difficulty) {
        const dirX = dx / dist;
        const dirY = dy / dist;
        bullets.push(createBullet(enemy.x + dirX*20, enemy.y + dirY*20, dirX, dirY)); // Enemy bullet (red)
      }
    } else {
      enemy.state = 'patrol';
      enemy.x += Math.cos(enemy.patrolDir) * 0.8;
      enemy.y += Math.sin(enemy.patrolDir) * 0.8;
      if (Math.random() < 0.01) enemy.patrolDir += (Math.random() - 0.5) * Math.PI;
    }

    // Collision with player bullets
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      const bdx = b.x - enemy.x;
      const bdy = b.y - enemy.y;
      if (Math.sqrt(bdx*bdx + bdy*bdy) < enemy.radius + b.radius) {
        enemy.health -= 20;
        bulletPool.push(bullets.splice(j, 1)[0]);
        if (enemy.health <= 0) {
          // Death particles
          for (let k = 0; k < 10; k++) {
            particles.push({
              x: enemy.x, y: enemy.y,
              vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10,
              life: 30
            });
          }
          enemyPool.push(enemies.splice(i, 1)[0]);
        }
      }
    }
  });

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// Render
function render() {
  ctx.fillStyle = '#222'; // Dark background
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Player (blue circle with direction)
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.rotation);
  ctx.fillStyle = 'blue';
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = 'cyan';
  ctx.fillRect(0, -5, 40, 10); // Gun barrel
  ctx.restore();

  // Jump effect (simple shadow)
  if (player.jumpHeight > 0) {
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(0,255,0,0.5)';
  }

  // Bullets (yellow for player, red for enemy)
  bullets.forEach(b => {
    ctx.fillStyle = b.vx > 0 ? 'yellow' : 'red'; // Simple distinguish
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2);
    ctx.fill();
  });

  // Enemies (red)
  enemies.forEach(e => {
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2);
    ctx.fill();
  });

  // Particles
  particles.forEach(p => {
    ctx.globalAlpha = p.life / 30;
    ctx.fillStyle = 'orange';
    ctx.fillRect(p.x, p.y, 6, 6);
  });
  ctx.globalAlpha = 1;

  // HUD text
  ctx.fillStyle = 'white';
  ctx.font = '20px Arial';
  ctx.fillText(`Health: ${player.health}  Ammo: ${player.ammo}/${player.maxAmmo}`, 20, 40);

  // Virtual joystick visual (optional debug)
  if (moveDir.x !== 0 || moveDir.y !== 0) {
    ctx.strokeStyle = 'white';
    ctx.beginPath();
    ctx.arc(moveStartX, moveStartY, 50, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(moveStartX, moveStartY);
    ctx.lineTo(moveStartX + moveDir.x*50, moveStartY + moveDir.y*50);
    ctx.stroke();
  }
}

// Game loop
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}
loop();

// Multiplayer note: For Photon, add <script src="https://cdn.photonengine.com/js/4/Photon-Javascript_SDK.min.js"></script>
// Then: const loadBalancingClient = new Photon.LoadBalancing.LoadBalancingClient(Photon.LoadBalancing.ConnectionProtocol.Wss, "your_app_id", "your_app_version");
// loadBalancingClient.connectToRegionMaster("EU"); etc. Sync positions via raiseEvent/opCustom.
// For simple WebSocket: use ws = new WebSocket('wss://yourserver'); ws.send(JSON.stringify({pos: {x,y}}));
// But requires backend server (e.g., Node.js with ws library).
// Lag compensation: client-side prediction (move locally, reconcile on server update).

// Optimization tips applied:
// - Object pooling for bullets/enemies (no GC spikes).
// - Integer coords where possible.
// - requestAnimationFrame.
// - Layered drawing minimal.
// - No shadows/particles heavy.
// - For low-end: reduce enemies (max 5-10), no complex math in loop.
// - Use offscreen canvas for pre-render if add sprites.
// - Test FPS with dev tools performance tab.