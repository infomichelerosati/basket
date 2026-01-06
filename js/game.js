
// GAME CONSTANTS
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let width, height;
// Camera
let cameraY = 0;
let targetCameraY = 0;
let shakeTimer = 0;

// Game State
let gameState = 'MENU'; // MENU, AIMING, FLYING, GAMEOVER, GROUNDED
let gameTime = 0;
let score = 0;
let lives = 3;
let basketStreak = 0;
let isPerfectStreak = 0;

// Objects
let ball = {
    x: 0, y: 0, r: 18,
    vx: 0, vy: 0, rot: 0,
    rimHit: false, stuckTimer: 0,
    trail: []
};
let deadBalls = [];
let hoops = [];
let obstacles = [];
let particles = [];
let windForce = 0;
let lastSafeHoop = null;

let stars = [];

// Drag Input
let drag = { active: false, startX: 0, startY: 0, x: 0, y: 0 };
const uiLayer = document.getElementById('ui-layer');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const gameOverEl = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');

// Feature Flags (Level Progression)
let seenFeatures = {
    wave: false,
    blockers: false,
    small: false
};

// --- PREDICTION ---
function simulateTrajectory(startVx, startVy) {
    // Clone ball state
    let simBall = { x: ball.x, y: ball.y, r: ball.r, vx: startVx, vy: startVy };
    let steps = 90; // Simulate 1.5 seconds approx

    for (let i = 0; i < steps; i++) {
        simBall.vy += 0.45; // Gravity
        simBall.x += simBall.vx;
        simBall.y += simBall.vy;

        // Walls
        if (simBall.x < simBall.r) { simBall.x = simBall.r; simBall.vx *= -0.7; }
        if (simBall.x > width - simBall.r) { simBall.x = width - simBall.r; simBall.vx *= -0.7; }

        // Floor (Fail condition usually, but maybe it bounces into hoop? limit bounces?)
        // Let's assume hitting floor is a fail for "clean" aim line, or simulate it. 
        // For now, let's keep it simple: wall bounces allowed.

        // Check Hoops
        for (let h of hoops) {
            if (h.scored) continue;
            let rimL = h.x - h.w / 2;
            let rimR = h.x + h.w / 2;

            // Simple Box/Circle check for Rim collision? 
            // To be accurate, we'd need resolveCircleCollision logic, but that modifies velocity.
            // We just need to know if it enters the "Success Zone".

            // Success Zone Logic (copied from update)
            if (simBall.vy > 0 &&
                simBall.x > rimL + 5 && simBall.x < rimR - 5 && // Bit tighter for prediction
                simBall.y > h.y && simBall.y < h.y + 20) {
                return true;
            }
        }
    }
    return false;
}

// --- CORE FUNCTIONS ---

const THEME = {
    bg: '#0f0f1a',
    ball: '#ff9500',
    ballFire: '#ff3300',
    hoop: '#aaaaaa',
    net: '#ffffff',
    rim: '#ff4400',
    rimDark: '#a12b00',
    star: '#ffffff',
    obstacle: '#ff0055',
    blocker: '#ffcc00',
    backboard: 'rgba(255, 255, 255, 0.15)', // Glass effect
    backboardBorder: 'rgba(255, 255, 255, 0.5)',
    traj: 'rgba(255, 255, 255, 0.4)'
};

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    if (stars.length === 0) initStars();
}

function initStars() {
    stars = [];
    for (let i = 0; i < 80; i++) {
        stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 2,
            speed: Math.random() * 0.2,
            twinkle: Math.random() * 0.05,
            baseAlpha: 0.3 + Math.random() * 0.7,
            alpha: 1
        });
    }
}

function spawnParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0,
            color: color || '#fff',
            size: Math.random() * 4 + 1
        });
    }
}

function showFloatingText(text, x, y, color) {
    const el = document.createElement('div');
    el.className = 'pop-text';
    el.innerText = text;
    if (color) el.style.color = color;
    // Helper to project world Y to screen Y roughly
    const screenY = y - cameraY;
    let screenX = Math.max(50, Math.min(width - 50, x));
    el.style.left = screenX + 'px';
    el.style.top = screenY + 'px';
    uiLayer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function showWarning(text, color) {
    const el = document.createElement('div');
    el.className = 'warning-alert';
    el.innerText = text;
    if (color) el.style.color = color;
    uiLayer.appendChild(el);
    setTimeout(() => el.remove(), 4000);
    audioManager.playTone(100, 'sawtooth', 0.5, 0.05); // Alarm sound
}

function updateLivesUI() {
    let hearts = '';
    let displayLives = Math.min(lives, 5);
    for (let i = 0; i < displayLives; i++) hearts += '❤';
    if (lives > 5) hearts += '+';
    livesEl.innerText = hearts;
}

function addNextHoop() {
    let lastHoop = hoops[hoops.length - 1];
    let newY = lastHoop.y - (height * 0.4);
    let side = Math.random() > 0.5 ? 1 : -1;

    if (score > 3 && Math.random() > 0.5) {
        obstacles.push(createObstacle(newY));
    }
    setWind();

    hoops.push(createHoop(newY, side));

    // Cleanup old hoops
    if (hoops.length > 5) {
        hoops.shift();
    }
    if (obstacles.length > 5) {
        obstacles.shift();
    }
}

function resetBall(hoop) {
    ball.x = hoop.x;
    ball.y = hoop.y - ball.r - 5;
    ball.vx = 0;
    ball.vy = 0;
    ball.rimHit = false;
    ball.rimHit = false;
    ball.stuckTimer = 0;
    ball.trail = [];
    gameState = 'AIMING';
}

function gameOver() {
    gameState = 'GAMEOVER';
    finalScoreEl.innerText = score;
    gameOverEl.classList.remove('hidden');
    // Save high score
    let hs = localStorage.getItem('dunk_hs') || 0;
    if (score > hs) localStorage.setItem('dunk_hs', score);
    audioManager.playGameOver();
}

function startGame() {
    audioManager.init(); // Initialize audio context on user interaction
    score = 0;
    lives = 3;
    basketStreak = 0;
    isPerfectStreak = 0;
    gameTime = 0;
    scoreEl.innerText = '0';
    updateLivesUI();
    gameOverEl.classList.add('hidden');
    startBtn.parentElement.classList.add('hidden');

    hoops = [];
    obstacles = [];
    deadBalls = [];
    particles = [];
    windForce = 0;
    cameraY = 0;
    targetCameraY = 0;
    seenFeatures = { wave: false, blockers: false, small: false };

    // Initial Hoops
    hoops.push(createHoop(height - 200, 1));
    hoops.push(createHoop(height - 200 - (height * 0.4), -1));
    hoops[0].scored = true; // Start in first hoop

    resetBall(hoops[0]);
    lastSafeHoop = hoops[0];
}

function shakeScreen(amount) {
    shakeTimer = amount;
}

function resetLevel() {
    // Reset to last safe hoop or restart logic?
    // Actually, game rules: if lives > 0, retry from current safe hoop.
    // If lives lost but game continues:
    // The ball is already respawned in update logic.
}

function createHoop(y, side) {
    let xPos = (side === 1) ? width - 80 : 80;
    let hoopWidth = 90;
    let movementType = 'STATIC';
    let moveSpeedX = 0;
    let moveSpeedY = 0;
    let blockers = [];

    // Difficulty scaling
    if (score > 5) {
        if (Math.random() > 0.7) {
            movementType = 'HORIZONTAL';
            moveSpeedX = (Math.random() + 0.5) * (score > 20 ? 3 : 1.5);
        }
    }
    if (score > 15) {
        if (Math.random() > 0.8) {
            movementType = 'WAVE';
            moveSpeedY = 0.05;
            moveSpeedX = 2;
            if (!seenFeatures.wave) {
                seenFeatures.wave = true;
                showFloatingText("WAVY HOOPS!", width / 2, y + 100, '#00ffff');
            }
        }
    }
    // Smaller Hoops
    if (score > 25 && Math.random() > 0.8) {
        hoopWidth = 80;
        if (!seenFeatures.small) {
            seenFeatures.small = true;
            showWarning("TIGHT RIMS", "#ff9500");
        }
    }

    // Lvl 4: Blockers
    if (score > 10 && Math.random() < Math.min(0.8, (score - 10) * 0.05)) {
        let count = (score > 25 && Math.random() > 0.5) ? 2 : 1;
        for (let i = 0; i < count; i++) {
            blockers.push({
                angle: (Math.PI * 2 * i) / count,
                speed: 0.03 + (Math.random() * 0.02),
                dist: 70,
                r: 8
            });
        }
        if (!seenFeatures.blockers) {
            seenFeatures.blockers = true;
            showWarning("DEFENSE DRONES", "#ff0044");
        }
    }

    // Net Physics (Verlet)
    let net = { nodes: [], constraints: [] };
    let netWidth = 60; // Top width of net
    let netHeight = 70;
    let netCols = 5;
    let netRows = 6;

    // Init Nodes
    for (let r = 0; r < netRows; r++) {
        for (let c = 0; c < netCols; c++) {
            let px = xPos - (netWidth / 2) + (c * (netWidth / (netCols - 1)));
            let py = y + (r * (netHeight / (netRows - 1)));
            let pinned = (r === 0);
            net.nodes.push({
                x: px, y: py, oldX: px, oldY: py,
                pinned: pinned
            });
        }
    }
    // Init Constraints (Horizontal & Vertical)
    for (let r = 0; r < netRows; r++) {
        for (let c = 0; c < netCols; c++) {
            let idx = r * netCols + c;
            if (c < netCols - 1) { // Horizontal
                net.constraints.push({ p1: idx, p2: idx + 1, len: netWidth / (netCols - 1) });
            }
            if (r < netRows - 1) { // Vertical
                net.constraints.push({ p1: idx, p2: idx + netCols, len: netHeight / (netRows - 1) });
            }
        }
    }

    return {
        x: xPos,
        y: y,
        w: hoopWidth,
        scored: false,
        side: side,
        startX: xPos,
        startY: y,
        movementType: movementType,
        moveSpeedX: moveSpeedX,
        moveSpeedY: moveSpeedY,
        swish: 0,
        net: net,
        blockers: blockers,
        timeOffset: Math.random() * 100
    };
}

function createObstacle(y) {
    return {
        x: width / 2 - 40,
        y: y - 180,
        w: 80,
        h: 15,
        vx: Math.random() > 0.5 ? 2.5 : -2.5,
        type: 'moving_horiz'
    };
}

function setWind() {
    if (score > 8 && Math.random() > 0.6) {
        windForce = (Math.random() - 0.5) * 0.08;
        let dir = windForce > 0 ? ">>" : "<<";
        showFloatingText("WIND " + dir, width / 2, cameraY + 100, '#aaffaa');
    } else {
        windForce = 0;
    }
}

// --- COLLISION ---
function resolveCircleCollision(targetX, targetY, radiusCheck) {
    let dx = ball.x - targetX;
    let dy = ball.y - targetY;
    let dist = Math.hypot(dx, dy);

    if (dist < ball.r + radiusCheck) {
        let nx = dx / dist;
        let ny = dy / dist;
        let penetration = (ball.r + radiusCheck) - dist;
        ball.x += nx * penetration;
        ball.y += ny * penetration;
        let dot = ball.vx * nx + ball.vy * ny;
        ball.vx = (ball.vx - 2 * dot * nx) * 0.65;
        ball.vy = (ball.vy - 2 * dot * ny) * 0.65;
        return true;
    }
    return false;
}

function resolveRectCollision(obs) {
    let closestX = Math.max(obs.x, Math.min(ball.x, obs.x + obs.w));
    let closestY = Math.max(obs.y, Math.min(ball.y, obs.y + obs.h));
    let dx = ball.x - closestX;
    let dy = ball.y - closestY;
    let dist = Math.hypot(dx, dy);

    if (dist < ball.r) {
        let nx, ny;
        if (dist === 0) { nx = 0; ny = -1; dist = 0.01; }
        else { nx = dx / dist; ny = dy / dist; }
        let penetration = ball.r - dist;
        ball.x += nx * penetration;
        ball.y += ny * penetration;
        let dot = ball.vx * nx + ball.vy * ny;
        ball.vx = (ball.vx - 2 * dot * nx) * 0.8;
        ball.vy = (ball.vy - 2 * dot * ny) * 0.8;
        return true;
    }
    return false;
}

function resolveBallCollision(b1, b2) {
    let dx = b2.x - b1.x;
    let dy = b2.y - b1.y;
    let dist = Math.hypot(dx, dy);

    if (dist < b1.r + b2.r) {
        // Collision!
        let nx = dx / dist;
        let ny = dy / dist;
        let penetration = (b1.r + b2.r) - dist;

        // Separate (Positional Correction)
        let percent = 0.8;
        let slop = 0.01;
        let correction = Math.max(penetration - slop, 0) / (1 + 1) * percent;

        b1.x -= nx * correction;
        b1.y -= ny * correction;
        b2.x += nx * correction;
        b2.y += ny * correction;

        // Velocity Resolution (Impulse)
        let rvx = b2.vx - b1.vx;
        let rvy = b2.vy - b1.vy;
        let velAlongNormal = rvx * nx + rvy * ny;

        // If separating, do nothing
        if (velAlongNormal > 0) return;

        // Restitution (Bounce)
        // If slow, no bounce (stacking)
        let e = 0.7;
        if (velAlongNormal > -1) e = 0;

        let j = -(1 + e) * velAlongNormal;
        j /= 2;

        let impulseX = j * nx;
        let impulseY = j * ny;

        b1.vx -= impulseX;
        b1.vy -= impulseY;
        b2.vx += impulseX;
        b2.vy += impulseY;

        // Friction (Tangent)
        let tx = -ny;
        let ty = nx;
        let dpTan = rvx * tx + rvy * ty;
        let mu = 0.1;

        let ft = -dpTan * mu;
        b1.vx -= tx * ft;
        b1.vy -= ty * ft;
        b2.vx += tx * ft;
        b2.vy += ty * ft;

        // Sound based on impact force
        if (Math.abs(velAlongNormal) > 1) {
            audioManager.playFloorBounce(Math.abs(velAlongNormal));
        }
    }
}

// --- INPUT ---
function onInputStart(x, y) {
    if (gameState !== 'AIMING') return;
    ball.trail = []; // Safety clear
    drag.active = true;
    drag.startX = x;
    drag.startY = y;
    drag.x = x;
    drag.y = y;
}

function onInputMove(x, y) {
    if (!drag.active) return;
    drag.x = x;
    drag.y = y;
}

function onInputEnd() {
    if (!drag.active) return;
    drag.active = false;
    let dx = drag.startX - drag.x;
    let dy = drag.startY - drag.y;
    // Minimum drag
    if (Math.hypot(dx, dy) > 20) {
        ball.vx = dx * 0.14;
        ball.vy = dy * 0.16;
        ball.rimHit = false;
        ball.stuckTimer = 0;
        gameState = 'FLYING';
        audioManager.playJump();
    }
}

// Listeners
window.addEventListener('mousedown', e => onInputStart(e.clientX, e.clientY));
window.addEventListener('mousemove', e => onInputMove(e.clientX, e.clientY));
window.addEventListener('mouseup', onInputEnd);

window.addEventListener('touchstart', e => {
    // Prevent default selectively if needed
    onInputStart(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

window.addEventListener('touchmove', e => {
    e.preventDefault(); // Stop scrolling while aiming
    onInputMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

window.addEventListener('touchend', e => onInputEnd());
window.addEventListener('resize', resize);

// UI Buttons
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);


// --- UPDATE & DRAW ---

function update() {
    gameTime += 1;

    // Shake decay
    if (shakeTimer > 0) shakeTimer--;

    stars.forEach(s => {
        s.y += s.speed;
        if (windForce !== 0) s.x += windForce * 50;
        if (s.x > width) s.x -= width;
        if (s.x < 0) s.x += width;
        s.alpha = s.baseAlpha + Math.sin(Date.now() * s.twinkle) * 0.2;
        if (s.y > height) s.y -= height;
    });

    if (gameState === 'MENU' || gameState === 'GAMEOVER') {
        // Just ambient animation, maybe slowly pan camera or hoops
        return;
    }

    hoops.forEach(h => {
        if (!h.scored) {
            if (h.movementType === 'HORIZONTAL') {
                h.x += h.moveSpeedX;
                if (h.x > width - 50 || h.x < 50) h.moveSpeedX *= -1;
            } else if (h.movementType === 'WAVE') {
                h.x += h.moveSpeedX;
                if (h.x > width - 50 || h.x < 50) h.moveSpeedX *= -1;
                h.y = h.startY + Math.sin((gameTime + h.timeOffset) * h.moveSpeedY) * 30;
            }
        }
        if (h.swish > 0) h.swish -= 0.05;

        // Simulate Net
        let net = h.net;
        let diffX = h.x - h.startX; // For moving hoops, shift pinned nodes
        let diffY = h.y - h.startY;

        // 1. Verlet Integration
        for (let n of net.nodes) {
            if (n.pinned) {
                // Remap pinned nodes to hoop position (careful with indexing)
                // Or easier: shift all nodes by hoop velocity? No, pinned nodes stick effectively
                // Re-calculate pinned pos based on row/col index would be ideal but complex here.
                // Simple hack: Shift pinned nodes by hoop movement
                n.x += h.moveSpeedX;
                n.y += (h.y - h.startY) - (n.oldY - (h.startY + (n.y - h.y))); // Approximation
                n.y = h.y; // Pin top row strictly to Y
                continue;
            }
            let vx = (n.x - n.oldX) * 0.98; // Damping
            let vy = (n.y - n.oldY) * 0.98;
            n.oldX = n.x;
            n.oldY = n.y;
            n.x += vx;
            n.y += vy + 0.3; // Gravity
        }

        // 2. Constraints (Relaxation)
        for (let i = 0; i < 3; i++) {
            for (let c of net.constraints) {
                let n1 = net.nodes[c.p1];
                let n2 = net.nodes[c.p2];
                let dx = n2.x - n1.x;
                let dy = n2.y - n1.y;
                let dist = Math.hypot(dx, dy);
                let diff = (dist - c.len) / dist;
                let offsetX = dx * diff * 0.5;
                let offsetY = dy * diff * 0.5;
                if (!n1.pinned) { n1.x += offsetX; n1.y += offsetY; }
                if (!n2.pinned) { n2.x -= offsetX; n2.y -= offsetY; }
            }
        }

        // 3. Ball Collision with Net
        // Check only if ball is near hoop
        if (gameState === 'FLYING' && Math.abs(ball.y - h.y) < 100 && Math.abs(ball.x - h.x) < 50) {
            for (let n of net.nodes) {
                let dx = ball.x - n.x;
                let dy = ball.y - n.y;
                let dist = Math.hypot(dx, dy);
                if (dist < ball.r + 2) {
                    // Push node away
                    let f = (ball.r + 2 - dist) / dist;
                    n.x -= dx * f * 0.5;
                    n.y -= dy * f * 0.5;
                    // Slow ball slightly (less sticky)
                    ball.vx *= 0.995;
                    ball.vy *= 0.995;
                }
            }
        }
        // Force Refix First Row (Hack for moving hoops to keep net attached correctly)
        // A proper way requires storing relative offsets. For now, assume simple attachment.
        let netW = 60;
        for (let c = 0; c < 5; c++) {
            let n = net.nodes[c];
            n.x = h.x - (netW / 2) + (c * (netW / 4));
            n.y = h.y;
            n.pinned = true;
        }

        h.blockers.forEach(b => {
            b.angle += b.speed;
        });
    });

    obstacles.forEach(obs => {
        obs.x += obs.vx;
        if (obs.x < 0 || obs.x + obs.w > width) obs.vx *= -1;
    });

    if (gameState === 'FLYING') {
        ball.vy += 0.45; // Gravity (Reduced from 0.55)
        ball.vx += windForce;
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.rot += ball.vx * 0.1;

        // Anti-stuck
        if (Math.abs(ball.vx) < 0.2 && Math.abs(ball.vy) < 0.2) {
            ball.stuckTimer++;
            if (ball.stuckTimer > 100) {
                ball.vy = -5; ball.vx = (Math.random() - 0.5) * 4; ball.stuckTimer = 0;
            }
        } else { ball.stuckTimer = 0; }

        // Trail Logic
        if (gameTime % 2 === 0 && (Math.abs(ball.vx) > 1 || Math.abs(ball.vy) > 1)) {
            ball.trail.push({ x: ball.x, y: ball.y, r: ball.r });
            if (ball.trail.length > 8) ball.trail.shift();
        }

        // Walls
        if (ball.x < ball.r) {
            ball.x = ball.r; ball.vx *= -0.7;
            audioManager.playHit();
        }
        if (ball.x > width - ball.r) {
            ball.x = width - ball.r; ball.vx *= -0.7;
            audioManager.playHit();
        }

        // Obstacles
        obstacles.forEach(obs => {
            if (resolveRectCollision(obs)) {
                spawnParticles(ball.x, ball.y, 5, THEME.obstacle);
                audioManager.playHit();
                audioManager.vibrate(10);
            }
        });

        // Hoops
        hoops.forEach(h => {
            if (h.scored) return;

            // Blockers
            h.blockers.forEach(b => {
                let bx = h.x + Math.cos(b.angle) * b.dist;
                let by = h.y + Math.sin(b.angle) * b.dist;
                if (resolveCircleCollision(bx, by, b.r)) {
                    spawnParticles(ball.x, ball.y, 10, THEME.blocker);
                    audioManager.playHit();
                    audioManager.vibrate(30);
                    shakeScreen(5);
                }
            });

            let rimL = h.x - h.w / 2;
            let rimR = h.x + h.w / 2;

            // Rim collision
            if (resolveCircleCollision(rimL, h.y, 5) || resolveCircleCollision(rimR, h.y, 5)) {
                ball.rimHit = true;
                audioManager.playHit();
                audioManager.vibrate(10);
            }

            // Scoring: ball moving down, inside X range, inside Y range
            if (ball.vy > 0 &&
                ball.x > rimL + 10 && ball.x < rimR - 10 &&
                ball.y > h.y && ball.y < h.y + 20) {

                h.scored = true;
                h.swish = 1.0;
                lastSafeHoop = h;
                basketStreak++;

                // Extra life
                if (basketStreak % 3 === 0) {
                    lives++;
                    updateLivesUI();
                    showFloatingText("+1 HEART", width / 2, h.y - 120, '#ff2d75');
                    audioManager.playTone(600, 'sine', 0.3);
                }

                let points = 1;
                let isPerfect = !ball.rimHit;

                if (isPerfect) {
                    points = 2;
                    isPerfectStreak++;
                    showFloatingText((isPerfectStreak > 1 ? "PERFECT x" + isPerfectStreak : "PERFECT!"), width / 2, h.y - 60);
                    shakeScreen(5);
                    audioManager.vibrate([30, 30]);
                } else {
                    isPerfectStreak = 0;
                    audioManager.vibrate(20);
                }

                audioManager.playScore(isPerfect);

                score += points;
                scoreEl.innerText = score;
                if (isPerfectStreak > 2) scoreEl.style.color = '#ff4400';
                else scoreEl.style.color = 'white';

                spawnParticles(h.x, h.y, 25, isPerfect ? '#00f2ff' : '#ffffff');
                resetBall(h);
                ball.trail = []; // Explicit clear
                targetCameraY = h.y - (height * 0.7);
                addNextHoop();
            }
        });

        // --- NEW: Check for returning to lastSafeHoop ---
        if (lastSafeHoop) {
            let lh = lastSafeHoop;
            let lRimL = lh.x - lh.w / 2;
            let lRimR = lh.x + lh.w / 2;

            if (ball.vy > 0 &&
                ball.x > lRimL + 10 && ball.x < lRimR - 10 &&
                ball.y > lh.y && ball.y < lh.y + 20) {

                // Ball fell back into the starting hoop!
                resetBall(lh);
                ball.trail = []; // Explicit clear
                showFloatingText("SAFE!", width / 2, lh.y - 80, '#00ff00');
                audioManager.playTone(300, 'sine', 0.1);
            }
        }

        let floorY = cameraY + height;

        // Update Dead Balls
        for (let i = 0; i < deadBalls.length; i++) {
            let db = deadBalls[i];
            db.vy += 0.45;
            db.x += db.vx;
            db.y += db.vy;
            db.rot += db.vx * 0.1;

            // Floor for DB
            if (db.y + db.r > floorY) {
                db.y = floorY - db.r;
                if (db.vy > 0) db.vy *= -0.6;
                db.vx *= 0.9;

                // Snap to stop to ensure Game Over triggers
                if (Math.abs(db.vx) < 0.2 && Math.abs(db.vy) < 1) {
                    db.vx = 0;
                    db.vy = 0;
                }
            }
            // Walls for DB
            if (db.x < db.r) { db.x = db.r; db.vx *= -0.7; }
            if (db.x > width - db.r) { db.x = width - db.r; db.vx *= -0.7; }

            // Interaction DB vs DB
            for (let j = i + 1; j < deadBalls.length; j++) {
                resolveBallCollision(db, deadBalls[j]);
            }
        }

        // Death Logic - Floor Bounce
        if (ball.y + ball.r > floorY) {
            // Collision with floor
            ball.y = floorY - ball.r;

            // Bounce dampening
            if (ball.vy > 0) {
                ball.vy *= -0.65;
                ball.vx *= 0.9;

                // Play sound if impact was hard enough
                if (Math.abs(ball.vy) > 2) {
                    audioManager.playTone(100, 'square', 0.1, 0.05);
                }
            }

            // Rolling friction (Increase friction to stop faster)
            ball.vx *= 0.90;
            ball.rot += ball.vx * 0.1;

            // Stop condition (Make threshold higher)
            if (Math.abs(ball.vy) < 1 && Math.abs(ball.vx) < 0.3) {
                ball.vx = 0; // Force stop

                // Check if ALL dead balls are also stopped
                let allStopped = true;
                for (let db of deadBalls) {
                    if (Math.abs(db.vx) > 0.1 || Math.abs(db.vy) > 1) {
                        allStopped = false;
                        break;
                    }
                }

                // Ball stopped on ground -> LOSE LIFE but PERSIST BALL
                if (gameState !== 'GROUNDED' && allStopped) {
                    gameState = 'GROUNDED';

                    basketStreak = 0;
                    if (lives > 1) {
                        lives--;
                        updateLivesUI();
                        showFloatingText("OUCH!", width / 2, cameraY + height / 2, '#ff2d75');
                        audioManager.playTone(150, 'sawtooth', 0.3);
                        audioManager.vibrate(200);

                        // Copy to dead balls
                        deadBalls.push({
                            x: ball.x, y: ball.y, r: ball.r,
                            vx: 0, vy: 0, rot: ball.rot
                        });

                        // Respawn active ball
                        setTimeout(() => {
                            if (lastSafeHoop) {
                                resetBall(lastSafeHoop);
                                targetCameraY = lastSafeHoop.y - (height * 0.7);
                            } else {
                                resetLevel();
                            }
                        }, 500);

                    } else {
                        lives = 0;
                        updateLivesUI();
                        gameOver();
                    }
                }
            }
        } else {
            // Not on floor, keep rotating naturally
            ball.rot += ball.vx * 0.1;

            // Check collision with Dead Balls
            deadBalls.forEach(db => {
                resolveBallCollision(ball, db);
            });
        }
    }

    cameraY += (targetCameraY - cameraY) * 0.1;

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.03;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function draw() {
    ctx.clearRect(0, 0, width, height);

    // Apply shake
    let shakeX = 0;
    let shakeY = 0;
    if (shakeTimer > 0) {
        shakeX = (Math.random() - 0.5) * shakeTimer;
        shakeY = (Math.random() - 0.5) * shakeTimer;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Stars
    for (let s of stars) {
        let parallaxY = -cameraY * 0.2;
        let finalY = (s.y + parallaxY) % height;
        if (finalY < 0) finalY += height;
        ctx.fillStyle = THEME.star;
        ctx.globalAlpha = Math.max(0, Math.min(1, s.alpha));
        ctx.beginPath();
        ctx.arc(s.x, finalY, s.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    ctx.save();
    ctx.translate(0, -cameraY);

    // Obstacles
    ctx.shadowBlur = 15;
    ctx.shadowColor = THEME.obstacle;
    ctx.fillStyle = THEME.obstacle;
    obstacles.forEach(obs => {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 5);
        else ctx.rect(obs.x, obs.y, obs.w, obs.h);
        ctx.fill();
    });
    ctx.shadowBlur = 0;

    // Hoops
    hoops.forEach(h => {
        let xl = h.x - h.w / 2;
        let xr = h.x + h.w / 2;
        let bbW = h.w + 30;

        // Backboard
        ctx.save();
        ctx.fillStyle = THEME.backboard;
        ctx.strokeStyle = THEME.backboardBorder;
        ctx.lineWidth = 2;
        let bbH = 80;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(h.x - bbW / 2, h.y - bbH - 10, bbW, bbH, 10);
        else ctx.rect(h.x - bbW / 2, h.y - bbH - 10, bbW, bbH);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.strokeRect(h.x - 30, h.y - bbH + 30, 60, 40);
        ctx.restore();

        // Net Render (Dynamic)
        ctx.strokeStyle = THEME.net;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let net = h.net;
        // Draw Constraints
        for (let c of net.constraints) {
            let n1 = net.nodes[c.p1];
            let n2 = net.nodes[c.p2];
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
        }
        ctx.stroke();

        // Rim
        ctx.strokeStyle = THEME.rimDark;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(xl, h.y); ctx.lineTo(xr, h.y); ctx.stroke();

        ctx.shadowBlur = 10;
        ctx.shadowColor = THEME.rim;
        ctx.strokeStyle = THEME.rim;
        ctx.beginPath(); ctx.moveTo(xl, h.y); ctx.lineTo(xr, h.y); ctx.stroke();
        ctx.fillStyle = THEME.rim;
        ctx.beginPath(); ctx.arc(xl, h.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(xr, h.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;

        // Blockers
        h.blockers.forEach(b => {
            let bx = h.x + Math.cos(b.angle) * b.dist;
            let by = h.y + Math.sin(b.angle) * b.dist;
            ctx.fillStyle = THEME.blocker;
            ctx.shadowBlur = 10;
            ctx.shadowColor = THEME.blocker;
            ctx.beginPath();
            ctx.arc(bx, by, b.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    });

    // Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Trajectory Guide (AIMING)
    if (gameState === 'AIMING' && drag.active) {
        let dx = drag.startX - drag.x;
        let dy = drag.startY - drag.y;
        let simX = ball.x;
        let simY = ball.y;
        let simVx = dx * 0.14 + windForce;
        let simVy = dy * 0.16;

        // Prediction
        let willScore = simulateTrajectory(simVx, simVy);
        ctx.fillStyle = willScore ? '#39ff14' : THEME.traj; // Neon Green if valid

        // Visual Trajectory (only draw first few steps)
        let drawX = ball.x;
        let drawY = ball.y;
        let drawVx = simVx;
        let drawVy = simVy;

        for (let i = 0; i < 20; i++) { // Draw longer line
            drawVy += 0.55; drawX += drawVx; drawY += drawVy;
            // Wall bounce visual for line? Complex. Just draw arc.
            ctx.beginPath(); ctx.arc(drawX, drawY, 4 - (i * 0.15), 0, Math.PI * 2); ctx.fill();
        }
    }

    // Dead balls
    deadBalls.forEach(db => {
        ctx.save();
        ctx.translate(db.x, db.y);
        ctx.rotate(db.rot);
        ctx.fillStyle = "#885500"; // Darker/Dimmed color
        ctx.beginPath(); ctx.arc(0, 0, db.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-db.r, 0); ctx.lineTo(db.r, 0);
        ctx.moveTo(0, -db.r); ctx.lineTo(0, db.r); ctx.stroke();
        ctx.restore();
    });

    // Active Ball
    // Trail Render
    if (gameState === 'FLYING') {
        ctx.save();
        // Context is already translated by cameraY, so we draw in World Coords directly
        for (let i = 0; i < ball.trail.length; i++) {
            let t = ball.trail[i];
            let r = t.r * (i / ball.trail.length);
            // Draw individual dot to support per-dot alpha
            ctx.fillStyle = `rgba(255, 149, 0, ${(i / ball.trail.length) * 0.4})`;
            ctx.beginPath();
            ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rot);

    let ballColor = (isPerfectStreak > 2) ? THEME.ballFire : THEME.ball;

    // 3D Effect - Radial Gradient
    // Highlight offset to top-left (-5, -5)
    let grd = ctx.createRadialGradient(-5, -5, 2, 0, 0, ball.r);
    grd.addColorStop(0, "#fff5d6"); // Highlight
    grd.addColorStop(0.3, ballColor);
    grd.addColorStop(1, "#9e4800"); // Shadow

    // Ball Glow
    ctx.shadowBlur = isPerfectStreak > 2 ? 30 : 15;
    ctx.shadowColor = ballColor;
    ctx.fillStyle = grd;

    ctx.beginPath(); ctx.arc(0, 0, ball.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Lines (Pseudo 3D rotation)
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-ball.r, 0); ctx.lineTo(ball.r, 0); // Horizontal line
    ctx.moveTo(0, -ball.r); ctx.lineTo(0, ball.r); // Vertical line
    // Curved lines for depth
    ctx.moveTo(ball.r * -0.7, ball.r * -0.7);
    ctx.quadraticCurveTo(0, 0, ball.r * 0.7, ball.r * 0.7);
    ctx.stroke();

    // Shine (extra specular if needed, but gradient handles it)
    // ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    // ctx.beginPath(); ctx.arc(-6, -6, 4, 0, Math.PI * 2); ctx.fill();

    ctx.restore(); // Restore camera shift
    ctx.restore(); // Restore shake
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Init
resize();
requestAnimationFrame(loop);
