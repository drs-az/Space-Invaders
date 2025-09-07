/* Space Invaders — Vanilla JS + Canvas
   Features:
   - Keyboard + touch controls
   - Multiple levels & increasing difficulty
   - Shields, powerups, lives, score, hi-score (localStorage)
   - Pause, mute, responsive fit
*/
(() => {
  const $ = sel => document.querySelector(sel);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');

  // HUD
  const scoreEl = $('#score');
  const livesEl = $('#lives');
  const levelEl = $('#level');
  const pauseBtn = $('#pauseBtn');
  const muteBtn = $('#muteBtn');
  const speedBtn = $('#speedBtn');

  // Dimensions (virtual fixed), canvas is scaled by CSS
  const W = canvas.width, H = canvas.height;

  // Audio (very lightweight beeps)
  let muted = JSON.parse(localStorage.getItem('invaders_muted')||'false');
  const setMuteUI = () => muteBtn.textContent = muted ? '🔇' : '🔊';
  setMuteUI();

  function beep(freq=440, dur=0.06, type='square', vol=0.05) {
    if (muted) return;
    try {
      const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)());
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g); g.connect(ac.destination);
      o.start();
      setTimeout(() => { o.stop(); }, dur*1000);
    } catch(e) {}
  }

  // Game state
  const state = {
    playing: true,
    level: 1,
    score: 0,
    lives: 3,
    hiScore: Number(localStorage.getItem('invaders_hi')||0),
    keys: { left:false, right:false, fire:false },
    touch: { left:false, right:false, fire:false },
    cooldown: 0,
    enemies: [],
    bullets: [],
    eBullets: [],
    powerups: [],
    shields: [],
    particles: [],
    enemyDir: 1,
    enemyStepTimer: 0,
    enemySpeed: 80, // lower is faster (ms per step)

    enemyDrop: 16,
    enemyLeft: 60,
    enemyRight: W-60,
    waveCleared: false,
    gameOver: false,
    speed: 0.1,
  };

  // Entities
  const player = {

    x: W/2, y: H-80, w: 48, h: 20, speed: 12, inv: 0, tri: 0

  };

  function rect(a,b) {
    return !(a.x+a.w < b.x || b.x+b.w < a.x || a.y+a.h < b.y || b.y+b.h < a.y);
  }

  function spawnShields() {
    state.shields = [];
    const pad = 80, count = 3;
    for (let i=0;i<count;i++) {
      const sx = pad + i * ((W-2*pad)/(count-1));
      state.shields.push({x:sx-28, y:H-180, w:56, h:18, hp:8});
      state.shields.push({x:sx-36, y:H-202, w:72, h:18, hp:6});
    }
  }

  function makeWave(level=1) {
    state.enemies = [];
    const rows = 4 + Math.min(3, Math.floor(level/2));
    const cols = 8 + Math.min(4, level);
    const startX = 60, startY = 120;
    const gapX = (W-120)/(cols-1);
    for (let r=0;r<rows;r++) {
      for (let c=0;c<cols;c++) {
        state.enemies.push({
          x: startX + c*gapX - 18,
          y: startY + r*46,
          w: 36, h: 28,
          type: r<1 ? 'ufo' : (r<2 ? 'elite':'grunt'),
          hp: r<1 ? 2 : 1,
          anim: 0
        });
      }
    }

    state.enemySpeed = Math.max(30, 70 - level*3);

    state.enemyDir = 1;
    state.enemyLeft = 60;
    state.enemyRight = W-60;
    state.enemyStepTimer = 0;
  }

  function resetGame() {
    state.level = 1;
    state.score = 0;
    state.lives = 3;
    state.gameOver = false;
    player.inv = 0; player.tri = 0; player.x = W/2;
    spawnShields();
    makeWave(state.level);
  }

  // Drawing helpers
  function drawShip(x,y,w=player.w,h=player.h,color='#7dd3fc') {
    ctx.save();
    ctx.translate(x,y);
    ctx.fillStyle = color;
    ctx.fillRect(0,h-6,w,6);
    ctx.fillRect(w*0.35,h-12,w*0.3,6);
    ctx.fillRect(w*0.45,0,w*0.1,h-12);
    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save(); ctx.translate(e.x, e.y);
    const t = (Date.now()/120|0)%2;
    // body
    ctx.fillStyle = e.type==='ufo' ? '#f472b6' : e.type==='elite' ? '#a78bfa' : '#22d3ee';
    ctx.fillRect(0,0,e.w,e.h);
    // eyes
    ctx.fillStyle = '#0b1021';
    ctx.fillRect(6, 6+t, 6, 6);
    ctx.fillRect(e.w-12, 6+t, 6, 6);
    // legs
    ctx.fillRect(4, e.h-4, e.w-8, 3);
    ctx.restore();
  }

  function drawShield(s) {
    ctx.fillStyle = `rgba(125,211,252,${Math.max(.18, s.hp/8)})`;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.strokeRect(s.x+.5, s.y+.5, s.w-1, s.h-1);
  }

  function drawBullet(b) {
    ctx.fillStyle = b.enemy ? '#fca5a5' : '#e2e8f0';
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }

  function drawPowerup(p) {
    ctx.fillStyle = p.kind==='life' ? '#34d399' : p.kind==='tri' ? '#fde047' : '#60a5fa';
    ctx.fillRect(p.x,p.y,p.w,p.h);
  }

  function explode(x,y,color='#e2e8f0',count=12,spread=2.4) {
    for (let i=0;i<count;i++) {
      const a = Math.random()*Math.PI*2;
      const s = (Math.random()*2+1)*spread;
      state.particles.push({x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, life: 30, color});
    }
  }

  // Input
  const keys = state.keys;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') keys.fire = true;
    if (e.key.toLowerCase() === 'p') togglePause();
    if (e.key.toLowerCase() === 'm') { muted = !muted; localStorage.setItem('invaders_muted', JSON.stringify(muted)); setMuteUI(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') keys.fire = false;
  });

  // Touch controls
  const touch = document.getElementById('touch');
  touch.addEventListener('pointerdown', e => {
    const target = e.target.closest('.touch-btn'); if (!target) return;
    const act = target.getAttribute('data-action');
    if (act === 'left') state.touch.left = true;
    if (act === 'right') state.touch.right = true;
    if (act === 'fire') state.touch.fire = true;
  });
  touch.addEventListener('pointerup', e => {
    state.touch = {left:false,right:false,fire:false};
  });
  touch.addEventListener('pointercancel', () => state.touch = {left:false,right:false,fire:false});

  pauseBtn.addEventListener('click', () => togglePause());
  muteBtn.addEventListener('click', () => { muted = !muted; localStorage.setItem('invaders_muted', JSON.stringify(muted)); setMuteUI(); });

  const speedModes = [
    {label:'Slow', value:0.1},
    {label:'Fast', value:0.25},
  ];
  let speedIndex = 0;
  state.speed = speedModes[speedIndex].value;
  speedBtn.textContent = 'Speed: ' + speedModes[speedIndex].label;

  speedBtn.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % speedModes.length;
    state.speed = speedModes[speedIndex].value;
    speedBtn.textContent = 'Speed: ' + speedModes[speedIndex].label;
  });

  function togglePause() {
    if (state.gameOver) { resetGame(); return; }
    state.playing = !state.playing;
    pauseBtn.textContent = state.playing ? 'Pause' : 'Resume';
  }

  // Shooting
  function fireBullet() {
    if (state.cooldown > 0) return;
    const bx = player.x + player.w/2 - 2, by = player.y - 14;

    const bullets = [{x:bx, y:by, w:4, h:14, vy:-60, enemy:false}];
    if (player.tri>0) {
      bullets.push({x:bx-14, y:by, w:4, h:14, vy:-60, vx:-18, enemy:false});
      bullets.push({x:bx+14, y:by, w:4, h:14, vy:-60, vx:18, enemy:false});

    }
    state.bullets.push(...bullets);
    state.cooldown = player.tri>0 ? 10 : 12;

    beep(880, .05, 'square', .04);
  }

  function enemyShoot(e) {

    state.eBullets.push({x:e.x+e.w/2-2, y:e.y+e.h, w:4, h:14, vy: 3 + Math.random()*1, enemy:true});

  }

  // Powerups
  function maybeDropPowerup(ex,ey) {
    if (Math.random() < 0.12) {
      const kinds = ['life','tri','shield'];
      const kind = kinds[Math.floor(Math.random()*kinds.length)];

      state.powerups.push({x:ex, y:ey, w:18, h:18, vy:1, kind});

    }
  }

  function applyPowerup(kind) {
    if (kind==='life') { state.lives++; livesEl.textContent = state.lives; beep(620,.1,'sine',.06); }
    if (kind==='tri')  { player.tri = 900; beep(1200,.08,'sawtooth',.05); }
    if (kind==='shield') {
      // repair shields
      state.shields.forEach(s => s.hp = Math.min(8, s.hp+3));
      explode(player.x+player.w/2, player.y, '#60a5fa', 28, 3);
      beep(440,.06,'triangle',.05);
    }
  }

  // Init
  resetGame();

  // Main loop
  let last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(32, ts - last); last = ts;
    if (!state.playing) { draw(); return; }
    update(dt);
    draw();
  }
  requestAnimationFrame(loop);

  function update(dt) {
    // cooldowns
    if (state.cooldown>0) state.cooldown -= state.speed;
    if (player.inv>0) player.inv -= state.speed;
    if (player.tri>0) player.tri -= state.speed;

    // player move
    const movingLeft = keys.left || state.touch.left;
    const movingRight = keys.right || state.touch.right;
    if (movingLeft) player.x -= player.speed * state.speed;
    if (movingRight) player.x += player.speed * state.speed;
    player.x = Math.max(6, Math.min(W - player.w - 6, player.x));

    // fire
    if ((keys.fire || state.touch.fire) && !state.gameOver) fireBullet();

    // bullets
    for (const b of state.bullets) {
      b.y += b.vy * state.speed;
      if (b.vx) b.x += b.vx * state.speed;
    }
    state.bullets = state.bullets.filter(b => b.y + b.h > 0 && b.y < H && b.x>-10 && b.x<W+10);

    // enemy bullets
    for (const b of state.eBullets) b.y += b.vy * state.speed;
    state.eBullets = state.eBullets.filter(b => b.y < H+20);

    // enemies step (march)
    state.enemyStepTimer += dt * state.speed;
    if (state.enemyStepTimer >= state.enemySpeed) {
      state.enemyStepTimer = 0;
      let hitEdge = false;
      for (const e of state.enemies) {
        e.x += 10 * state.enemyDir;
        e.anim ^= 1;
        if (e.x < state.enemyLeft || e.x + e.w > state.enemyRight) hitEdge = true;
        // chance to shoot

    if (Math.random() < 0.01 + state.level*0.001) enemyShoot(e);

      }
      if (hitEdge) {
        for (const e of state.enemies) e.y += state.enemyDrop;
        state.enemyDir *= -1;
      }
    }

    // bullets vs enemies
    for (const b of state.bullets) {
      for (const e of state.enemies) {
        if (rect(b,e)) {
          e.hp -= 1;
          b._dead = true;
          if (e.hp<=0) {
            state.score += e.type==='ufo'? 50 : e.type==='elite'? 30 : 10;
            scoreEl.textContent = state.score;
            explode(e.x+e.w/2, e.y+e.h/2, '#f0abfc', 18, 2.1);
            maybeDropPowerup(e.x+e.w/2, e.y+e.h/2);
            e._dead = true;
            beep(260,.07,'square',.05);
          } else {
            beep(320,.04,'square',.03);
          }
        }
      }
    }
    state.enemies = state.enemies.filter(e => !e._dead);
    state.bullets = state.bullets.filter(b => !b._dead);

    // bullets vs shields
    for (const b of [...state.bullets, ...state.eBullets]) {
      for (const s of state.shields) {
        if (s.hp>0 && rect(b,s)) {
          s.hp -= 1; b._dead = true;
          explode(b.x, b.y, '#93c5fd', 6, 1.2);
        }
      }
    }
    state.bullets = state.bullets.filter(b => !b._dead);
    state.eBullets = state.eBullets.filter(b => !b._dead);
    state.shields = state.shields.filter(s => s.hp>0);

    // enemy bullets vs player
    if (player.inv<=0) {
      for (const b of state.eBullets) {
        if (rect(b, player)) {
          b._dead = true;
          player.inv = 60;
          state.lives -= 1; livesEl.textContent = state.lives;
          explode(player.x+player.w/2, player.y, '#fda4af', 26, 3);
          beep(140,.1,'sawtooth',.06);
          if (state.lives <= 0) {
            state.gameOver = true; state.playing = false;
            pauseBtn.textContent = 'Restart';
            if (state.score > state.hiScore) {
              state.hiScore = state.score;
              localStorage.setItem('invaders_hi', state.hiScore);
            }
          }
          break;
        }
      }
    }

    // enemies reach bottom
    for (const e of state.enemies) {
      if (e.y + e.h >= player.y - 4) {
        state.lives = 0; livesEl.textContent = state.lives;
        state.gameOver = true; state.playing = false;
        pauseBtn.textContent = 'Restart';
        beep(100,.2,'square',.08);
        break;
      }
    }

    // powerups
    for (const p of state.powerups) p.y += p.vy * state.speed;
    state.powerups = state.powerups.filter(p => p.y < H+20);
    for (const p of state.powerups) {
      if (rect(p, player)) { applyPowerup(p.kind); p._dead = true; }
    }
    state.powerups = state.powerups.filter(p => !p._dead);

    // particles
    for (const p of state.particles) { p.x += p.vx * state.speed; p.y += p.vy * state.speed; p.life -= state.speed; }
    state.particles = state.particles.filter(p => p.life>0);

    // next wave
    if (!state.gameOver && state.enemies.length===0) {
      state.level += 1; levelEl.textContent = state.level;
      // bonus
      state.score += 100; scoreEl.textContent = state.score;
      spawnShields();
      makeWave(state.level);
      beep(520,.08,'square',.06);
      beep(660,.08,'square',.06);
    }
  }

  function draw() {
    // background stars
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#0b1021';
    ctx.fillRect(0,0,W,H);
    for (let i=0;i<70;i++) {
      const y = ((Date.now()/20 + i*13) % H);
      const x = (i*97)%W;
      ctx.fillStyle = i%10===0 ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.18)';
      ctx.fillRect(x, y, 2, 2);
    }

    // particles
    for (const p of state.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life/30);
      ctx.fillRect(p.x, p.y, 2, 2);
      ctx.globalAlpha = 1;
    }

    // shields
    state.shields.forEach(drawShield);

    // player
    if (player.inv>0 && (player.inv%6)<3) {
      // flicker
    } else {
      drawShip(player.x, player.y);
    }
    if (player.tri>0) {
      ctx.fillStyle = 'rgba(253, 224, 71, .2)';
      ctx.fillRect(player.x-6, player.y-6, player.w+12, player.h+12);
    }

    // enemies
    for (const e of state.enemies) drawEnemy(e);

    // bullets
    for (const b of state.bullets) drawBullet(b);
    for (const b of state.eBullets) drawBullet(b);

    // powerups
    for (const p of state.powerups) drawPowerup(p);

    // overlays
    if (state.gameOver) {
      drawCenterText('GAME OVER', 56, '#fca5a5');
      drawCenterText('Press R / Tap Resume to restart', 20, '#e2e8f0', 60);
    } else if (!state.playing) {
      drawCenterText('PAUSED', 56, '#93c5fd');
      drawCenterText('Press P or tap Resume', 20, '#e2e8f0', 60);
    } else {
      // UI: hi score
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.font = '16px system-ui, -apple-system, Roboto';
      ctx.fillText('Hi: ' + state.hiScore, 12, 24);
    }
  }

  function drawCenterText(txt, size=48, color='#e2e8f0', dy=0) {
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.font = `700 ${size}px system-ui, -apple-system, Roboto`;
    ctx.fillText(txt, W/2, H/2 + dy);
  }

  // Restart hotkey
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r') { resetGame(); state.playing = true; pauseBtn.textContent = 'Pause'; }
  });

})();