

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  CharacterType, GameState, PlayerState, Vector2, TankMode, Projectile, GroundEffect, Obstacle, FloatingText
} from '../types';
import { 
  MAP_SIZE, PHYSICS, CHAR_STATS, VIEWPORT_PADDING 
} from '../constants';
import * as Utils from '../utils';
import { Sound } from '../sound';

interface GameProps {
  playerType: CharacterType;
  onExit: () => void;
}

const Game: React.FC<GameProps> = ({ playerType, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // Direct DOM Refs for High-Frequency UI Updates
  const playerHpBarRef = useRef<HTMLDivElement>(null);
  const playerHpTextRef = useRef<HTMLSpanElement>(null);
  const enemyHpBarRef = useRef<HTMLDivElement>(null);
  const enemyHpTextRef = useRef<HTMLSpanElement>(null);
  const heatBarRef = useRef<HTMLDivElement>(null);
  const heatTextRef = useRef<HTMLSpanElement>(null);
  
  // Tank Radar Ref
  const radarPivotRef = useRef<HTMLDivElement>(null);
  
  // Sound Throttle Refs
  const lastPyroSoundTimeRef = useRef<number>(0);

  // Map Generator
  const generateObstacles = (): Obstacle[] => {
    const obs: Obstacle[] = [];
    // Reduced obstacle count
    const numWalls = 3 + Math.floor(Math.random() * 3); // 3-5 Walls
    const numWater = 2 + Math.floor(Math.random() * 2); // 2-3 Water pools

    const isValid = (rect: {x: number, y: number, width: number, height: number}) => {
       // Check spawn safety zones (radius 400 around spawns)
       const p1 = {x: 200, y: 200};
       const p2 = {x: MAP_SIZE.width - 200, y: MAP_SIZE.height - 200};
       
       const cx = rect.x + rect.width/2;
       const cy = rect.y + rect.height/2;
       
       if (Utils.dist({x:cx, y:cy}, p1) < 400) return false;
       if (Utils.dist({x:cx, y:cy}, p2) < 400) return false;
       return true;
    };

    for(let i=0; i<numWalls + numWater; i++) {
       let attempts = 0;
       while(attempts < 50) {
          const w = 150 + Math.random() * 250;
          const h = 150 + Math.random() * 250;
          const x = Math.random() * (MAP_SIZE.width - w);
          const y = Math.random() * (MAP_SIZE.height - h);
          const type: 'WALL' | 'WATER' = i < numWalls ? 'WALL' : 'WATER';
          const newObs: Obstacle = { id: `obs-${i}`, x, y, width: w, height: h, type };

          if (isValid(newObs)) {
              obs.push(newObs);
              break;
          }
          attempts++;
       }
    }
    return obs;
  };

  // Game State Ref
  const stateRef = useRef<GameState>({
    player: createPlayer(playerType, { x: 200, y: 200 }, 'player'),
    enemy: createPlayer(
      playerType === CharacterType.PYRO ? CharacterType.TANK : CharacterType.PYRO, 
      { x: MAP_SIZE.width - 200, y: MAP_SIZE.height - 200 }, 
      'enemy'
    ),
    projectiles: [],
    particles: [],
    groundEffects: [],
    obstacles: generateObstacles(),
    floatingTexts: [],
    camera: { x: 0, y: 0 },
    gameStatus: 'PLAYING',
  });

  const keysRef = useRef<{ [key: string]: boolean }>({});
  const mouseRef = useRef<Vector2>({ x: 0, y: 0 });
  
  // UI State (Only for low-frequency updates now)
  const [uiState, setUiState] = useState({
    pArtAmmo: 0, pMaxArtAmmo: 5, // Tank Artillery
    pLmgAmmo: 0, pMaxLmgAmmo: 200, pIsReloadingLmg: false, // Tank LMG
    pTankMode: TankMode.ARTILLERY,
    pType: CharacterType.PYRO,
    pSkillCD: 0, pSkillMaxCD: 1,
    pIsOverheated: false, // Kept for styling classes
    
    eType: CharacterType.TANK,
    gameStatus: 'PLAYING'
  });

  // --- Initialization ---

  function createPlayer(type: CharacterType, pos: Vector2, id: string): PlayerState {
    const stats: any = CHAR_STATS[type];
    
    return {
      id,
      type,
      pos,
      vel: { x: 0, y: 0 },
      radius: stats.radius,
      mass: stats.mass,
      color: stats.color,
      hp: stats.hp,
      maxHp: stats.hp,
      
      isDead: false,
      matchEndTimer: 0,

      // Pyro Heat
      heat: 0,
      maxHeat: stats.maxHeat,
      isOverheated: false,

      // Tank
      artilleryAmmo: stats.maxArtilleryAmmo || 5,
      maxArtilleryAmmo: stats.maxArtilleryAmmo || 5,
      artilleryReloadTimer: 0,
      
      lmgAmmo: stats.maxLmgAmmo || 200,
      maxLmgAmmo: stats.maxLmgAmmo || 200,
      isReloadingLmg: false,
      lmgReloadTimer: 0,

      angle: 0,
      aimAngle: 0,
      tankMode: TankMode.ARTILLERY,
      siegeSwitchTimer: 0,
      isFiringFlamethrower: false,
      skillCooldown: 0,
      skillMaxCooldown: stats.skillCooldown / 1000,
      attackCooldown: 0,
      
      // Status
      slowTimer: 0,
      burnTimer: 0,
      flameExposure: 0,

      // AI defaults
      lastPos: pos,
      stuckTimer: 0,
      unstuckTimer: 0,
      unstuckDir: {x:0, y:0},
      burstTimer: 0
    };
  }

  // --- Input ---

  const handleKeyDown = useCallback((e: KeyboardEvent) => { keysRef.current[e.code] = true; }, []);
  const handleKeyUp = useCallback((e: KeyboardEvent) => { keysRef.current[e.code] = false; }, []);
  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const handleMouseDown = useCallback(() => { keysRef.current['MouseLeft'] = true; }, []);
  const handleMouseUp = useCallback(() => { keysRef.current['MouseLeft'] = false; }, []);

  // --- Main Loop ---

  const update = (deltaTime: number) => {
    const state = stateRef.current;
    if (state.gameStatus !== 'PLAYING') return;

    // Death Checks
    if (state.player.hp <= 0 && !state.player.isDead) {
        state.player.isDead = true;
        Sound.playExplosion();
        if (state.player.type === CharacterType.PYRO) {
           // Steam Extinguish Effect
           spawnParticles(state.player.pos, 120, '#EEEEEE', 15, 2.5, 0.85);
        } else {
           createExplosion(state, state.player.pos, 80, 0, 'system', true);
           spawnParticles(state.player.pos, 50, state.player.color, 10, 2);
        }
    }
    if (state.enemy.hp <= 0 && !state.enemy.isDead) {
        state.enemy.isDead = true;
        Sound.playExplosion();
        if (state.enemy.type === CharacterType.PYRO) {
            // Steam Extinguish Effect for AI
            spawnParticles(state.enemy.pos, 120, '#EEEEEE', 15, 2.5, 0.85);
        } else {
            createExplosion(state, state.enemy.pos, 80, 0, 'system', true);
            spawnParticles(state.enemy.pos, 50, state.enemy.color, 10, 2);
        }
    }

    // Handle Match End Timer
    if (state.player.isDead) {
        state.player.matchEndTimer += deltaTime;
        if (state.player.matchEndTimer > 2.0) {
            state.gameStatus = 'DEFEAT';
            Sound.playUI('DEFEAT');
        }
    } else {
        // Only process input if alive
        handlePlayerInput(state.player, deltaTime);
    }

    if (state.enemy.isDead) {
        state.enemy.matchEndTimer += deltaTime;
        if (state.enemy.matchEndTimer > 2.0) {
            state.gameStatus = 'VICTORY';
            Sound.playUI('VICTORY');
        }
    } else {
        // Only process AI if alive
        handleAI(state.enemy, state.player, deltaTime);
    }

    // 3. Physics & Collisions
    [state.player, state.enemy].forEach(entity => {
      // Skip movement physics if dead
      if (entity.isDead) return;

      entity.pos = Utils.add(entity.pos, Utils.mult(entity.vel, deltaTime * 60));
      entity.vel = Utils.mult(entity.vel, PHYSICS.FRICTION);
      
      // Walls
      if (entity.pos.x < entity.radius) { entity.pos.x = entity.radius; entity.vel.x *= -0.5; }
      if (entity.pos.y < entity.radius) { entity.pos.y = entity.radius; entity.vel.y *= -0.5; }
      if (entity.pos.x > MAP_SIZE.width - entity.radius) { entity.pos.x = MAP_SIZE.width - entity.radius; entity.vel.x *= -0.5; }
      if (entity.pos.y > MAP_SIZE.height - entity.radius) { entity.pos.y = MAP_SIZE.height - entity.radius; entity.vel.y *= -0.5; }

      // Obstacles
      state.obstacles.forEach(obs => {
        const col = Utils.checkCircleRectCollision(entity.pos, entity.radius, obs);
        if (col.collided) {
          entity.pos = Utils.add(entity.pos, Utils.mult(col.normal, col.overlap));
          const dot = entity.vel.x * col.normal.x + entity.vel.y * col.normal.y;
          // Simple bounce
          entity.vel = Utils.sub(entity.vel, Utils.mult(col.normal, 2 * dot));
        }
      });
    });

    // Ball vs Ball
    if (!state.player.isDead && !state.enemy.isDead) {
        const distVec = Utils.sub(state.player.pos, state.enemy.pos);
        const dist = Utils.mag(distVec);
        const minDist = state.player.radius + state.enemy.radius;

        if (dist < minDist) {
        const normal = Utils.normalize(distVec);
        const overlap = minDist - dist;
        const m1 = state.player.mass;
        const m2 = state.enemy.mass;
        const totalMass = m1 + m2;
        
        // Position Correction based on mass
        state.player.pos = Utils.add(state.player.pos, Utils.mult(normal, overlap * (m2 / totalMass)));
        state.enemy.pos = Utils.sub(state.enemy.pos, Utils.mult(normal, overlap * (m1 / totalMass)));

        // Velocity Resolution (Elastic Collision)
        const v1 = state.player.vel;
        const v2 = state.enemy.vel;
        const e = PHYSICS.COLLISION_ELASTICITY;
        const v1n = v1.x * normal.x + v1.y * normal.y;
        const v2n = v2.x * normal.x + v2.y * normal.y;
        
        const v1nFinal = ((m1 - e * m2) * v1n + (1 + e) * m2 * v2n) / totalMass;
        const v2nFinal = ((m2 - e * m1) * v2n + (1 + e) * m1 * v1n) / totalMass;
        
        const v1Tan = { x: v1.x - v1n * normal.x, y: v1.y - v1n * normal.y };
        const v2Tan = { x: v2.x - v2n * normal.x, y: v2.y - v2n * normal.y };
        
        state.player.vel = { x: v1Tan.x + normal.x * v1nFinal, y: v1Tan.y + normal.y * v1nFinal };
        state.enemy.vel = { x: v2Tan.x + normal.x * v2nFinal, y: v2Tan.y + normal.y * v2nFinal };

        // Impact Damage logic
        const relativeVel = Math.abs(v1n - v2n);
        if (relativeVel > 8) {
            const baseDmg = Math.floor(relativeVel * 2);
            takeDamage(state.player, baseDmg); 
            takeDamage(state.enemy, baseDmg);
            Sound.playHit();
            spawnParticles(Utils.add(state.player.pos, Utils.mult(normal, -state.player.radius)), 10, '#ffffff');
        }
        }
    }

    updateProjectiles(state, deltaTime);
    updateGroundEffects(state, deltaTime);
    updateParticles(state, deltaTime);
    updateFloatingTexts(state, deltaTime);
    updateStatus(state.player, deltaTime);
    updateStatus(state.enemy, deltaTime);
    updateCamera(state);
  };

  const handlePlayerInput = (p: PlayerState, dt: number) => {
    let speedMult = 1.0;
    
    // Tank LMG Speed Boost
    if (p.type === CharacterType.TANK && p.tankMode === TankMode.LMG) {
        speedMult = 1.6; // 60% Speed Boost (Visible increase)
    }

    // Slow Effect
    if (p.slowTimer > 0) {
        speedMult *= 0.4; // 60% Slow
    }

    let accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[p.type].speed * speedMult; 
    
    // Tank is slow to start
    if (p.type === CharacterType.TANK) {
       accel *= 0.5; 
    }

    const moveDir = { x: 0, y: 0 };
    if (keysRef.current['KeyW']) moveDir.y -= 1;
    if (keysRef.current['KeyS']) moveDir.y += 1;
    if (keysRef.current['KeyA']) moveDir.x -= 1;
    if (keysRef.current['KeyD']) moveDir.x += 1;

    if (moveDir.x !== 0 || moveDir.y !== 0) {
      const norm = Utils.normalize(moveDir);
      p.vel = Utils.add(p.vel, Utils.mult(norm, accel * dt * 60));
      p.angle = Math.atan2(moveDir.y, moveDir.x);

      // Speed Trail for LMG Tank
      if (p.type === CharacterType.TANK && p.tankMode === TankMode.LMG && Math.random() < 0.8) {
          stateRef.current.particles.push({
             id: Math.random().toString(),
             pos: Utils.add(p.pos, {x: (Math.random()-0.5)*20, y: (Math.random()-0.5)*20}),
             vel: Utils.mult(p.vel, -0.5), // Trail behind
             life: 0.8, // Increased for longer trail
             maxLife: 0.8,
             color: '#6ee7b7', // Emerald/Cyan exhaust
             size: 5
          });
      }
    }

    const worldMouse = Utils.add(mouseRef.current, stateRef.current.camera);
    const aimDir = Utils.sub(worldMouse, p.pos);
    let targetAimAngle = Math.atan2(aimDir.y, aimDir.x);
    
    if (p.type === CharacterType.TANK) {
       const diff = targetAimAngle - p.aimAngle;
       const d = Math.atan2(Math.sin(diff), Math.cos(diff));
       const rotSpeed = CHAR_STATS[CharacterType.TANK].turretSpeed;
       const change = Utils.clamp(d, -rotSpeed * dt * 60, rotSpeed * dt * 60);
       p.aimAngle += change;
    } else {
       p.aimAngle = targetAimAngle;
    }

    if (p.type === CharacterType.PYRO) {
      // PYRO CONTROLS
      if (keysRef.current['MouseLeft']) {
        if (!p.isOverheated) {
          p.isFiringFlamethrower = true;
          // Accumulate Heat
          p.heat += CHAR_STATS[CharacterType.PYRO].heatGen * dt;
          if (p.heat >= p.maxHeat) {
            p.heat = p.maxHeat;
            p.isOverheated = true; // Trigger Overheat
            Sound.playOverheat();
            spawnParticles(p.pos, 15, '#ffffff', 5, 0.5); // Steam vent effect
          }
          fireFlamethrower(p, dt);
        } else {
           p.isFiringFlamethrower = false;
        }
      } else {
        p.isFiringFlamethrower = false;
      }
      
      if (keysRef.current['Space'] && p.skillCooldown <= 0) {
        Sound.playSkill('MAGMA');
        castMagmaPool(p, worldMouse);
      }
    } 
    else if (p.type === CharacterType.TANK) {
      // TANK CONTROLS
      if (keysRef.current['MouseLeft'] && p.attackCooldown <= 0) {
        if (p.tankMode === TankMode.ARTILLERY) {
           if (p.artilleryAmmo >= 1) {
             const distToTarget = Utils.dist(p.pos, worldMouse);
             const minRange = CHAR_STATS[CharacterType.TANK].artilleryMinRange;
             if (distToTarget > minRange) { 
                fireArtillery(p, worldMouse);
                p.artilleryAmmo -= 1; 
                p.attackCooldown = 2.5; 
             }
           }
        } else {
           // LMG MODE
           if (!p.isReloadingLmg && p.lmgAmmo >= 1) {
             fireLMG(p);
             p.lmgAmmo -= 1;
             p.attackCooldown = 0.08; 
             
             if (p.lmgAmmo <= 0) {
                 p.lmgAmmo = 0;
                 p.isReloadingLmg = true;
                 p.lmgReloadTimer = 0;
             }
           }
        }
      }

      if (keysRef.current['Space'] && p.skillCooldown <= 0) {
        p.tankMode = p.tankMode === TankMode.ARTILLERY ? TankMode.LMG : TankMode.ARTILLERY;
        p.skillCooldown = 1; 
        p.attackCooldown = 1.5; // Increased attack delay on mode switch
        Sound.playSkill('SWITCH');
        spawnParticles(p.pos, 5, '#ffffff');
        
        // Visual feedback for mode switch
        stateRef.current.floatingTexts.push({
           id: Math.random().toString(),
           pos: Utils.add(p.pos, {x:0, y:-40}),
           text: p.tankMode === TankMode.LMG ? "加速!" : "重炮模式",
           color: p.tankMode === TankMode.LMG ? "#34d399" : "#fbbf24",
           life: 1, maxLife: 1, velY: -1
        });
      }
    }
  };

  const handleAI = (ai: PlayerState, target: PlayerState, dt: number) => {
    // Stuck Detection
    if (!ai.lastPos) ai.lastPos = ai.pos;
    const distMoved = Utils.dist(ai.pos, ai.lastPos);
    ai.lastPos = ai.pos;
    if (distMoved < 0.5) ai.stuckTimer = (ai.stuckTimer || 0) + dt;
    else ai.stuckTimer = Math.max(0, (ai.stuckTimer || 0) - dt);

    if ((ai.stuckTimer || 0) > 1.5 && (ai.unstuckTimer || 0) <= 0) {
       ai.unstuckTimer = 1.0;
       const randAngle = Math.random() * Math.PI * 2;
       ai.unstuckDir = { x: Math.cos(randAngle), y: Math.sin(randAngle) };
       ai.stuckTimer = 0;
    }
    if ((ai.unstuckTimer || 0) > 0) {
       ai.unstuckTimer! -= dt;
       const accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[ai.type].speed;
       ai.vel = Utils.add(ai.vel, Utils.mult(ai.unstuckDir!, accel * dt * 60));
       return; 
    }

    const distToTarget = Utils.dist(ai.pos, target.pos);
    const aimDir = Utils.sub(target.pos, ai.pos);
    const targetAimAngle = Math.atan2(aimDir.y, aimDir.x);
    
    // Turret Smoothing logic for AI (Prevent instant snapping)
    if (ai.type === CharacterType.TANK) {
       const diff = targetAimAngle - ai.aimAngle;
       const d = Math.atan2(Math.sin(diff), Math.cos(diff));
       const rotSpeed = CHAR_STATS[CharacterType.TANK].turretSpeed;
       const change = Utils.clamp(d, -rotSpeed * dt * 60, rotSpeed * dt * 60);
       ai.aimAngle += change;
    } else {
       ai.aimAngle = targetAimAngle; // Pyro aims instantly
    }
    
    let moveVec = { x: 0, y: 0 };
    
    if (ai.type === CharacterType.PYRO) {
      const range = CHAR_STATS[CharacterType.PYRO].flamethrowerRange;
      const idealRange = range * 0.7; // Get very close
      
      if (distToTarget > idealRange) {
         moveVec = Utils.normalize(aimDir);
      } else {
         const perp = { x: -aimDir.y, y: aimDir.x };
         const strafeDir = Utils.normalize(perp);
         const strafeFactor = Math.sin(Date.now() / 800);
         moveVec = Utils.add(Utils.mult(Utils.normalize(aimDir), 0.1), Utils.mult(strafeDir, strafeFactor));
      }
      
      // Update Burst Timer
      if (ai.burstTimer === undefined) ai.burstTimer = 0;
      if (ai.burstTimer > 0) ai.burstTimer -= dt;

      // Attack Logic with Heat & Burst
      const inRange = distToTarget < range + 20;

      // Trigger burst if in range and ready
      if (inRange && ai.burstTimer <= 0 && !ai.isOverheated) {
          // Burst duration: 1.0s to 1.5s
          ai.burstTimer = 1.0 + Math.random() * 0.5;
      }
      
      const shouldFire = (inRange || ai.burstTimer > 0) && !ai.isOverheated;

      if (shouldFire) {
        ai.isFiringFlamethrower = true;
        ai.heat += CHAR_STATS[CharacterType.PYRO].heatGen * dt;
        if (ai.heat >= ai.maxHeat) {
            ai.heat = ai.maxHeat;
            ai.isOverheated = true;
            ai.burstTimer = 0; // Force stop burst
            Sound.playOverheat();
            spawnParticles(ai.pos, 15, '#ffffff', 5, 0.5); 
        }
        fireFlamethrower(ai, dt);
      } else {
        ai.isFiringFlamethrower = false;
      }
      
      if (ai.skillCooldown <= 0 && distToTarget < 300) {
        Sound.playSkill('MAGMA');
        castMagmaPool(ai, target.pos);
      }

    } else {
      // Tank AI: Maintain Medium Distance
      const optimalRange = ai.tankMode === TankMode.ARTILLERY ? 500 : 300;
      
      if (distToTarget < optimalRange - 50) {
         moveVec = Utils.mult(Utils.normalize(aimDir), -1); 
      } else if (distToTarget > optimalRange + 50) {
         moveVec = Utils.normalize(aimDir); 
      } else {
         const perp = { x: -aimDir.y, y: aimDir.x };
         moveVec = Utils.mult(Utils.normalize(perp), Math.sin(Date.now() / 2000) * 0.5);
      }

      // Mode Switch
      if (distToTarget < 250 && ai.tankMode === TankMode.ARTILLERY && ai.skillCooldown <= 0) {
        ai.tankMode = TankMode.LMG;
        ai.skillCooldown = 1;
        ai.attackCooldown = 1.5; // Delay attack on switch
        Sound.playSkill('SWITCH');
      } else if (distToTarget > 450 && ai.tankMode === TankMode.LMG && ai.skillCooldown <= 0) {
        ai.tankMode = TankMode.ARTILLERY;
        ai.skillCooldown = 1;
        ai.attackCooldown = 1.5; // Delay attack on switch
        Sound.playSkill('SWITCH');
      }

      // Attack
      if (ai.attackCooldown <= 0) {
         // Prevent shooting if turret not aligned (Anti-cheat)
         let isAligned = true;
         if (ai.type === CharacterType.TANK) {
             const diff = targetAimAngle - ai.aimAngle;
             const angleDist = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)));
             // Allow firing if angle is within ~12 degrees (0.2 rad)
             if (angleDist > 0.2) isAligned = false; 
         }

         if (isAligned) {
            if (ai.tankMode === TankMode.ARTILLERY && ai.artilleryAmmo >= 1 && distToTarget > CHAR_STATS[CharacterType.TANK].artilleryMinRange) {
                fireArtillery(ai, target.pos);
                ai.artilleryAmmo -= 1;
                ai.attackCooldown = 3.5; 
            } else if (ai.tankMode === TankMode.LMG) {
                if (!ai.isReloadingLmg && ai.lmgAmmo >= 1) {
                    fireLMG(ai);
                    ai.lmgAmmo -= 1;
                    ai.attackCooldown = 0.1;
                    if (ai.lmgAmmo <= 0) {
                        ai.lmgAmmo = 0;
                        ai.isReloadingLmg = true;
                        ai.lmgReloadTimer = 0;
                    }
                }
            }
         }
      }
    }

    // Obstacle Avoidance
    if (moveVec.x !== 0 || moveVec.y !== 0) {
        moveVec = Utils.normalize(moveVec);
        const lookAhead = Utils.add(ai.pos, Utils.mult(moveVec, 100));
        
        let avoid = { x: 0, y: 0 };
        stateRef.current.obstacles.forEach(obs => {
             // AI treats Water as Wall (cannot pass)
             if (Utils.checkCircleRectCollision(lookAhead, ai.radius + 30, obs).collided) {
                 const center = { x: obs.x + obs.width/2, y: obs.y + obs.height/2 };
                 const away = Utils.sub(ai.pos, center);
                 avoid = Utils.add(avoid, Utils.mult(Utils.normalize(away), 4));
             }
        });
        
        if (avoid.x !== 0 || avoid.y !== 0) {
            moveVec = Utils.normalize(Utils.add(moveVec, avoid));
        }

        let speedMult = 1.0;
        if (ai.type === CharacterType.TANK && ai.tankMode === TankMode.LMG) speedMult = 1.6; // Matches Player
        if (ai.slowTimer > 0) speedMult *= 0.4; // AI Slow

        let accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[ai.type].speed * speedMult;
        if (ai.type === CharacterType.TANK) accel *= 0.8;

        ai.vel = Utils.add(ai.vel, Utils.mult(moveVec, accel * dt * 60));
        ai.angle = Math.atan2(moveVec.y, moveVec.x);
        
        // AI Trail
        if (ai.type === CharacterType.TANK && ai.tankMode === TankMode.LMG && Math.random() < 0.8) {
           stateRef.current.particles.push({
             id: Math.random().toString(),
             pos: Utils.add(ai.pos, {x: (Math.random()-0.5)*20, y: (Math.random()-0.5)*20}),
             vel: Utils.mult(ai.vel, -0.5),
             life: 0.8, // Increased lifetime
             maxLife: 0.8,
             color: '#6ee7b7',
             size: 5
          });
        }
    }
  };

  // --- Combat ---

  const fireFlamethrower = (p: PlayerState, dt: number) => {
    // Throttle sound to prevent noise clutter (every ~100ms)
    const now = performance.now();
    if (now - lastPyroSoundTimeRef.current > 120) {
        Sound.playShot('PYRO');
        lastPyroSoundTimeRef.current = now;
    }

    const tip = Utils.add(p.pos, Utils.mult({ x: Math.cos(p.aimAngle), y: Math.sin(p.aimAngle) }, p.radius + 5));
    const cone = CHAR_STATS[CharacterType.PYRO].flamethrowerAngle;
    
    // Increased particle density
    for (let i=0; i<3; i++) {
        const angleOffset = (Math.random() - 0.5) * 2 * cone; 
        const finalAngle = p.aimAngle + angleOffset;
        const speed = 5 + Math.random() * 3;
        const vel = { x: Math.cos(finalAngle) * speed, y: Math.sin(finalAngle) * speed };
        
        stateRef.current.particles.push({
           id: Math.random().toString(),
           pos: { ...tip },
           vel: vel,
           life: 0.3 + Math.random() * 0.2,
           maxLife: 0.5,
           color: Math.random() > 0.4 ? '#fcd34d' : '#ef4444', 
           size: 3 + Math.random() * 5 
        });
    }

    const enemies = p.id === 'player' ? [stateRef.current.enemy] : [stateRef.current.player];
    const range = CHAR_STATS[CharacterType.PYRO].flamethrowerRange;

    enemies.forEach(e => {
       const toEnemy = Utils.sub(e.pos, p.pos);
       const distE = Utils.mag(toEnemy);
       if (distE < range) { 
         const angleToEnemy = Math.atan2(toEnemy.y, toEnemy.x);
         const angleDiff = Math.abs(angleToEnemy - p.aimAngle);
         const normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
         
         if (Math.abs(normalizedDiff) < cone) {
              // Hit!
              // Increase Exposure (Ramp Up)
              e.flameExposure = Math.min(100, e.flameExposure + 2); // Goes up to 100 max
              // Apply Burn Status
              e.burnTimer = 3.0;

              // Calculate Ramping Damage (1x to 3x)
              const baseDmg = 85;
              const rampMult = 1 + (e.flameExposure / 50); 
              takeDamage(e, baseDmg * rampMult * dt, CharacterType.PYRO); 
              
              if (Math.random() < 0.15) spawnParticles(e.pos, 1, '#ff4400', 1, 0.5);
         }
       }
    });
  };

  const castMagmaPool = (p: PlayerState, target: Vector2) => {
    p.skillCooldown = CHAR_STATS[CharacterType.PYRO].skillCooldown / 1000;
    const dist = Utils.dist(p.pos, target);
    const speed = CHAR_STATS[CharacterType.PYRO].magmaProjSpeed; 
    const duration = dist / (speed * 60); // Frames to Seconds

    stateRef.current.projectiles.push({
      id: Math.random().toString(),
      ownerId: p.id,
      pos: p.pos,
      vel: Utils.mult(Utils.normalize(Utils.sub(target, p.pos)), speed), 
      radius: 12,
      mass: 5,
      color: '#f97316',
      damage: 0, 
      projectileType: 'MAGMA_PROJ',
      maxLife: duration, 
      life: duration,
      targetPos: target, 
      isAoe: true,
      aoeRadius: CHAR_STATS[CharacterType.PYRO].magmaPoolRadius
    });
  };

  const fireArtillery = (p: PlayerState, target: Vector2) => {
     Sound.playShot('ARTILLERY');
     const dir = Utils.normalize(Utils.sub(target, p.pos));
     const dist = Utils.dist(p.pos, target);
     const speed = 12;
     const timeToTarget = dist / (speed * 60);
     
     stateRef.current.projectiles.push({
       id: Math.random().toString(),
       ownerId: p.id,
       pos: Utils.add(p.pos, Utils.mult(dir, p.radius + 10)),
       vel: Utils.mult(dir, speed),
       radius: 14,
       mass: 100,
       color: '#1f2937',
       damage: CHAR_STATS[CharacterType.TANK].artilleryDamage,
       projectileType: 'BOMB',
       life: timeToTarget, 
       maxLife: timeToTarget, 
       isAoe: true,
       aoeRadius: CHAR_STATS[CharacterType.TANK].artilleryRadius,
       hitTargets: [], // Initialize hit targets for penetration tracking
       targetPos: target // Save destination for damage calculation
     });
  };

  const fireLMG = (p: PlayerState) => {
    Sound.playShot('LMG');
    const dir = { x: Math.cos(p.aimAngle), y: Math.sin(p.aimAngle) };
    const spread = (Math.random() - 0.5) * 0.2;
    const finalDir = { 
       x: dir.x * Math.cos(spread) - dir.y * Math.sin(spread),
       y: dir.x * Math.sin(spread) + dir.y * Math.cos(spread)
    };
    
    stateRef.current.projectiles.push({
      id: Math.random().toString(),
      ownerId: p.id,
      pos: Utils.add(p.pos, Utils.mult(dir, p.radius + 15)),
      vel: Utils.mult(finalDir, 22),
      radius: 3,
      mass: CHAR_STATS[CharacterType.TANK].lmgBulletMass, 
      color: '#fbbf24',
      damage: CHAR_STATS[CharacterType.TANK].lmgDamage,
      projectileType: 'BULLET',
      life: 0.8,
      maxLife: 0.8,
    });
  };

  const updateProjectiles = (state: GameState, dt: number) => {
    state.projectiles = state.projectiles.filter(p => p.life > 0);
    
    state.projectiles.forEach(p => {
       p.pos = Utils.add(p.pos, Utils.mult(p.vel, dt * 60));
       p.life -= dt;
       
       // --- Projectile Trails ---
       if (p.projectileType === 'MAGMA_PROJ') {
           // Magma Trail
           if (Math.random() < 0.6) {
              state.particles.push({
                 id: Math.random().toString(),
                 pos: { ...p.pos },
                 vel: Utils.mult(Utils.normalize(p.vel), -2), // Slight backward flow
                 life: 0.3 + Math.random() * 0.2,
                 maxLife: 0.5,
                 color: Math.random() > 0.5 ? '#f97316' : '#ef4444', 
                 size: p.radius * (0.5 + Math.random() * 0.3)
              });
           }
       } else if (p.projectileType === 'BOMB') {
           // Artillery Smoke Trail
           if (Math.random() < 0.7) {
              state.particles.push({
                 id: Math.random().toString(),
                 pos: { ...p.pos },
                 vel: {x: (Math.random()-0.5), y: (Math.random()-0.5)}, 
                 life: 0.5 + Math.random() * 0.3,
                 maxLife: 0.8,
                 color: Math.random() > 0.5 ? '#9ca3af' : '#4b5563', 
                 size: p.radius * (0.6 + Math.random() * 0.4)
              });
           }
       }
       // ------------------------

       if (p.projectileType === 'MAGMA_PROJ') {
          if (p.life <= 0) {
              state.groundEffects.push({
                  id: Math.random().toString(),
                  pos: p.pos,
                  radius: p.aoeRadius || 80,
                  life: 5,
                  maxLife: 5,
                  type: 'MAGMA_POOL',
                  ownerId: p.ownerId
              });
              // Self immune to visual explosion/knockback of magma landing
              createExplosion(state, p.pos, 50, 0, p.ownerId, true); 
          }
       } 
       else if (p.projectileType === 'BOMB') {
          // Check for Penetration Hits (Fly-by damage)
          const target = p.ownerId === 'player' ? state.enemy : state.player;
          // Check collision if target is alive and hasn't been hit by this projectile yet
          if (!target.isDead && (!p.hitTargets || !p.hitTargets.includes(target.id))) {
              if (Utils.dist(p.pos, target.pos) < target.radius + p.radius) {
                  // Penetration Hit Logic
                  let damageMultiplier = 0.7; // Default graze damage
                  
                  // Check if target will be inside the eventual explosion zone
                  if (p.targetPos) {
                      const blastRadius = p.aoeRadius || 120;
                      const distToBlastCenter = Utils.dist(target.pos, p.targetPos);
                      const isInsideBlastZone = distToBlastCenter < (blastRadius + target.radius);
                      
                      if (isInsideBlastZone) {
                          // If inside future explosion, reduce penetration damage to 10%
                          // to avoid double dipping (Penetration + Explosion)
                          damageMultiplier = 0.1;
                      }
                  }

                  const penDamage = p.damage * damageMultiplier;
                  takeDamage(target, penDamage);
                  Sound.playHit();
                  
                  // Record hit
                  if (!p.hitTargets) p.hitTargets = [];
                  p.hitTargets.push(target.id);

                  // Visual Feedback
                  spawnParticles(p.pos, 10, '#f59e0b', 5, 0.5);
                  state.floatingTexts.push({
                      id: Math.random().toString(),
                      pos: { ...target.pos },
                      text: `-${Math.floor(penDamage)}`,
                      color: '#fbbf24',
                      life: 0.8,
                      maxLife: 0.8,
                      velY: -20
                  });
              }
          }

          // Main Explosion logic (at destination)
          if (p.life <= 0) {
             createExplosion(state, p.pos, p.aoeRadius || 120, p.damage, p.ownerId, false);
          }
       } else {
          // Bullet Collision
          let hitWall = false;
          for (const obs of state.obstacles) {
             // Projectiles fly over water
             if (obs.type === 'WATER') continue;

             if (Utils.checkCircleRectCollision(p.pos, p.radius, obs).collided) {
                hitWall = true; 
                break;
             }
          }
          const target = p.ownerId === 'player' ? state.enemy : state.player;
          // Don't hit dead targets
          if (target.isDead) return;

          const hitTarget = Utils.dist(p.pos, target.pos) < target.radius + p.radius;

          if (hitWall) {
             p.life = 0;
             spawnParticles(p.pos, 3, '#cccccc');
          } else if (hitTarget) {
             p.life = 0;
             takeDamage(target, p.damage);
             Sound.playHit();
             
             // Knockback Logic
             const pushDir = Utils.normalize(p.vel);
             
             // Base knockback power
             let knockbackForce = 400; 

             // Apply Specific Scalings
             if (p.projectileType === 'BULLET') {
                // LMG: Increased knockback from 80 -> 160 (Doubled)
                knockbackForce = 160; 
             }
             
             const impulse = knockbackForce * Math.sqrt(p.mass);
             const dv = Utils.mult(pushDir, impulse / target.mass);

             // Hard Clamp max velocity change to prevent physics explosions
             const maxKnockbackSpeed = 10;
             if (Utils.mag(dv) < maxKnockbackSpeed) {
                target.vel = Utils.add(target.vel, dv); 
             } else {
                target.vel = Utils.add(target.vel, Utils.mult(Utils.normalize(dv), maxKnockbackSpeed));
             }
             
             spawnParticles(p.pos, 5, p.color);
          }
       }
    });
  };

  const createExplosion = (state: GameState, pos: Vector2, radius: number, damage: number, ownerId: string, selfImmune: boolean = false) => {
      spawnParticles(pos, 30, '#f59e0b', 8, 1);
      Sound.playExplosion();
      
      // Explosion Visual Ring
      state.particles.push({
         id: Math.random().toString(),
         pos: pos,
         vel: {x:0, y:0},
         life: 0.2,
         maxLife: 0.2,
         color: 'rgba(255, 100, 0, 0.3)',
         size: radius 
      });

      [state.player, state.enemy].forEach(target => {
         // Skip if self-immune logic applies (e.g. Magma Pool landing)
         if (selfImmune && target.id === ownerId) return;
         if (target.isDead) return;

         const d = Utils.dist(pos, target.pos);
         if (d < radius + target.radius) {
            // Quadratic Falloff
            const damageFactor = 1 - (d / (radius + target.radius));
            const finalDamage = damage * Math.max(0, damageFactor);
            takeDamage(target, finalDamage);
            
            // Explosion Knockback
            const pushDir = Utils.normalize(Utils.sub(target.pos, pos));
            
            // 30% Increased Force (8000 * 1.3)
            const baseForce = 10400; 
            const force = baseForce * damageFactor; 
            
            // Massive Slow (Concussion) Effect
            // Apply a persistend slow status
            target.slowTimer = 2.4; 

            // Apply Knockback to velocity
            const velocityChange = Utils.mult(pushDir, force / target.mass);
            
            // Dampen excessive knockback
            const maxExplosionKnockback = 20;
            if (Utils.mag(velocityChange) > maxExplosionKnockback) {
                target.vel = Utils.add(target.vel, Utils.mult(Utils.normalize(velocityChange), maxExplosionKnockback));
            } else {
                target.vel = Utils.add(target.vel, velocityChange);
            }
         }
      });
  };

  const takeDamage = (p: PlayerState, amount: number, sourceType?: CharacterType) => {
    let finalDmg = amount;
    if (p.type === CharacterType.PYRO && sourceType === CharacterType.PYRO) {
       finalDmg *= 0.25;
    }
    p.hp -= finalDmg;
    // CRITICAL FIX: Clamp HP to 0 so it doesn't show negative
    if (p.hp < 0) p.hp = 0;
  };

  const updateStatus = (p: PlayerState, dt: number) => {
     if (p.skillCooldown > 0) p.skillCooldown -= dt;
     if (p.attackCooldown > 0) p.attackCooldown -= dt;
     if (p.slowTimer > 0) p.slowTimer -= dt;
     
     // Burn Effect Logic (DoT)
     if (p.burnTimer > 0) {
         p.burnTimer -= dt;
         takeDamage(p, 15 * dt, CharacterType.PYRO); // 15 Damage per second
         // Emit smoke/fire
         if (Math.random() < 0.2) {
             spawnParticles(p.pos, 1, '#f97316', 1, 0.6);
         }
     }

     // Flame Exposure Decay (if high)
     if (p.flameExposure > 0) {
         p.flameExposure -= 10 * dt; // Decay over time
         if (p.flameExposure < 0) p.flameExposure = 0;
     }
     
     if (p.type === CharacterType.PYRO) {
        // Pyro Heat Logic
        if (p.isOverheated) {
            // Rapid cooling when overheated (Emergency Venting)
            p.heat -= CHAR_STATS[CharacterType.PYRO].overheatCooling * dt;
            if (p.heat <= 0) {
                p.heat = 0;
                p.isOverheated = false;
            }
        } else if (!p.isFiringFlamethrower && p.heat > 0) {
             // Passive cooling
             p.heat -= CHAR_STATS[CharacterType.PYRO].heatDissipation * dt;
             if (p.heat < 0) p.heat = 0;
        }
     } else {
        // TANK LOGIC
        if (p.artilleryAmmo < p.maxArtilleryAmmo) {
            p.artilleryReloadTimer += dt * 1000;
            if (p.artilleryReloadTimer >= CHAR_STATS[CharacterType.TANK].artilleryRegenTime) {
                p.artilleryAmmo += 1;
                p.artilleryReloadTimer = 0;
                if (p.type === CharacterType.TANK && p.id === 'player') Sound.playSkill('RELOAD');
            }
        }

        if (p.isReloadingLmg) {
            p.lmgReloadTimer += dt * 1000;
            const duration = CHAR_STATS[CharacterType.TANK].lmgReloadDuration;
            p.lmgAmmo = (p.lmgReloadTimer / duration) * p.maxLmgAmmo;
            
            if (p.lmgReloadTimer >= duration) {
                p.lmgAmmo = p.maxLmgAmmo;
                p.isReloadingLmg = false;
                p.lmgReloadTimer = 0;
                if (p.type === CharacterType.TANK && p.id === 'player') Sound.playSkill('RELOAD');
            }
        }
     }
  };

  const updateGroundEffects = (state: GameState, dt: number) => {
      state.groundEffects = state.groundEffects.filter(g => g.life > 0);
      state.groundEffects.forEach(g => {
          g.life -= dt;
          [state.player, state.enemy].forEach(p => {
             if (Utils.dist(p.pos, g.pos) < g.radius + p.radius) {
                 if (g.type === 'MAGMA_POOL') {
                     if (p.id === g.ownerId) {
                         if (p.hp < p.maxHp) p.hp += 15 * dt; // Continuous Healing
                         // Magma Pool cools down the owner rapidly
                         if (p.heat > 0) p.heat -= 80 * dt; 
                     } else {
                         takeDamage(p, 40 * dt, CharacterType.PYRO);
                         // Apply Burn Effect
                         p.burnTimer = 3.0; 
                         p.vel = Utils.mult(p.vel, 0.90);
                     }
                 }
             }
          });
          if (Math.random() < 0.4) {
             const offset = Utils.mult({x: Math.random()-0.5, y: Math.random()-0.5}, g.radius*2);
             spawnParticles(Utils.add(g.pos, offset), 1, '#ef4444', 0.5, 0.5);
          }
      });
  };

  const updateParticles = (state: GameState, dt: number) => {
     state.particles = state.particles.filter(p => p.life > 0);
     state.particles.forEach(p => {
        // Apply Drag if exists
        if (p.drag) p.vel = Utils.mult(p.vel, p.drag);
        
        p.pos = Utils.add(p.pos, Utils.mult(p.vel, dt * 60));
        p.life -= dt;
     });
  };

  const updateFloatingTexts = (state: GameState, dt: number) => {
      state.floatingTexts = state.floatingTexts.filter(t => t.life > 0);
      state.floatingTexts.forEach(t => {
          t.pos.y += t.velY * dt * 60;
          t.life -= dt;
      });
  };

  const spawnParticles = (pos: Vector2, count: number, color: string, speed = 2, life = 0.5, drag = 1.0) => {
     for (let i=0; i<count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const vel = { x: Math.cos(angle) * Math.random() * speed, y: Math.sin(angle) * Math.random() * speed };
        stateRef.current.particles.push({
           id: Math.random().toString(),
           pos: { ...pos },
           vel,
           life: life * (0.5 + Math.random() * 0.5),
           maxLife: life,
           color,
           size: Math.random() * 4 + 2,
           drag
        });
     }
  };

  const updateCamera = (state: GameState) => {
    const { innerWidth, innerHeight } = window;
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;

    // Base target: Center on player
    let targetX = state.player.pos.x - cx;
    let targetY = state.player.pos.y - cy;

    // Smooth Lookahead based on mouse distance from center
    // Instead of fixed peek, we look towards the mouse
    const mouseX = mouseRef.current.x;
    const mouseY = mouseRef.current.y;
    
    // Lookahead factor increased from 0.8 to 1.6
    const offsetX = (mouseX - cx) * 1.6;
    const offsetY = (mouseY - cy) * 1.6;

    targetX += offsetX;
    targetY += offsetY;

    // Clamp camera to map bounds
    targetX = Utils.clamp(targetX, -500, MAP_SIZE.width + 500 - innerWidth); 
    targetY = Utils.clamp(targetY, -500, MAP_SIZE.height + 500 - innerHeight);

    // Smooth lerp (0.04 provides a smoother, weightier feel)
    state.camera.x += (targetX - state.camera.x) * 0.04;
    state.camera.y += (targetY - state.camera.y) * 0.04;
  };

  // --- Rendering ---

  const draw = (ctx: CanvasRenderingContext2D) => {
    const state = stateRef.current;
    const { width, height } = ctx.canvas;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(-state.camera.x, -state.camera.y);

    // Map Grid
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, MAP_SIZE.width, MAP_SIZE.height);
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#1e293b';
    for (let x=0; x<=MAP_SIZE.width; x+=100) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP_SIZE.height); }
    for (let y=0; y<=MAP_SIZE.height; y+=100) { ctx.moveTo(0, y); ctx.lineTo(MAP_SIZE.width, y); }
    ctx.stroke();

    // Ground Effects
    state.groundEffects.forEach(g => {
        if (g.type === 'MAGMA_POOL') {
            ctx.fillStyle = 'rgba(127, 29, 29, 0.5)'; 
            ctx.beginPath();
            ctx.arc(g.pos.x, g.pos.y, g.radius, 0, Math.PI * 2);
            ctx.fill();
            // Inner Core
            ctx.fillStyle = 'rgba(185, 28, 28, 0.8)';
            ctx.beginPath();
            ctx.arc(g.pos.x, g.pos.y, g.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Obstacles
    state.obstacles.forEach(obs => {
      if (obs.type === 'WATER') {
          // Water pool styling
          ctx.fillStyle = 'rgba(6, 182, 212, 0.3)'; // Cyan transparent
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
          ctx.lineWidth = 2;
          ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      } else {
          // Wall styling
          ctx.fillStyle = '#475569';
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      }
    });

    // Particles
    state.particles.forEach(p => {
       ctx.globalAlpha = p.life / p.maxLife;
       ctx.fillStyle = p.color;
       ctx.beginPath();
       ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
       ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Projectiles
    state.projectiles.forEach(p => {
       ctx.fillStyle = p.color;
       ctx.beginPath();
       ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
       ctx.fill();
    });

    // Players
    [state.player, state.enemy].forEach(p => {
       if (p.isDead) return; // Do not draw dead players

       // Shadow
       ctx.fillStyle = 'rgba(0,0,0,0.5)';
       ctx.beginPath();
       ctx.arc(p.pos.x + 5, p.pos.y + 5, p.radius, 0, Math.PI * 2);
       ctx.fill();

       ctx.save();
       ctx.translate(p.pos.x, p.pos.y);
       
       // Visual feedback for Status Effects
       if (p.slowTimer > 0) {
           ctx.fillStyle = '#64748b'; // Gray for Slowed/Stunned
       } else if (p.burnTimer > 0) {
           ctx.fillStyle = '#f97316'; // Orange for Burning
       } else {
           ctx.fillStyle = p.color;
       }

       if (p.type === CharacterType.TANK) {
          ctx.save();
          ctx.rotate(p.aimAngle);
          ctx.fillStyle = p.slowTimer > 0 ? '#475569' : (p.burnTimer > 0 ? '#ea580c' : '#374151'); 
          ctx.fillRect(0, -8, p.radius + 20, 16); 
          ctx.restore();
          
          // LMG Thruster Glow
          if (p.tankMode === TankMode.LMG) {
             ctx.save();
             ctx.rotate(p.angle);
             ctx.fillStyle = '#10b981'; // Emerald glow
             ctx.shadowColor = '#34d399';
             ctx.shadowBlur = 15;
             ctx.beginPath();
             // Draw thrusters on back (left side when facing right)
             // Tank body faces p.angle. Back is at -p.radius
             ctx.arc(-p.radius + 5, -12, 6, 0, Math.PI*2);
             ctx.arc(-p.radius + 5, 12, 6, 0, Math.PI*2);
             ctx.fill();
             ctx.restore();
          }
       }

       ctx.rotate(p.angle); 
       
       // Re-apply fillStyle for main body
       if (p.slowTimer > 0) {
           ctx.fillStyle = '#64748b';
       } else if (p.burnTimer > 0) {
           ctx.fillStyle = '#f97316';
       } else {
           ctx.fillStyle = p.color;
       }

       ctx.beginPath();
       ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
       ctx.fill();
       
       // Shine
       ctx.fillStyle = 'rgba(255,255,255,0.2)';
       ctx.beginPath();
       ctx.arc(-p.radius/3, -p.radius/3, p.radius/3, 0, Math.PI * 2);
       ctx.fill();

       ctx.restore();
       // Health bar is drawn AFTER restore, in Screen Space
    });

    // Floating Texts
    state.floatingTexts.forEach(t => {
        ctx.fillStyle = t.color;
        ctx.globalAlpha = t.life / t.maxLife;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(t.text, t.pos.x - 20, t.pos.y);
        ctx.globalAlpha = 1;
    });
    
    // Draw Aim Guides
    const p = state.player;
    if (!p.isDead) {
        if (p.type === CharacterType.PYRO) {
        const range = CHAR_STATS[CharacterType.PYRO].flamethrowerRange;
        const angle = CHAR_STATS[CharacterType.PYRO].flamethrowerAngle;
        ctx.save();
        ctx.translate(p.pos.x, p.pos.y);
        ctx.rotate(p.aimAngle);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.arc(0, 0, range, -angle, angle); 
        ctx.fill();
        ctx.restore();
        } else if (p.type === CharacterType.TANK && p.tankMode === TankMode.ARTILLERY) {
        const aimX = mouseRef.current.x + state.camera.x;
        const aimY = mouseRef.current.y + state.camera.y;
        
        // Range Color Check
        const distToTarget = Utils.dist(p.pos, {x: aimX, y: aimY});
        const minRange = CHAR_STATS[CharacterType.TANK].artilleryMinRange;
        const isValid = distToTarget > minRange;

        ctx.strokeStyle = isValid ? '#10b981' : '#ef4444'; 
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(aimX, aimY, CHAR_STATS[CharacterType.TANK].artilleryRadius, 0, Math.PI*2); // Use actual splash radius
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Inner Crosshair
        ctx.beginPath();
        ctx.moveTo(aimX - 10, aimY); ctx.lineTo(aimX + 10, aimY);
        ctx.moveTo(aimX, aimY - 10); ctx.lineTo(aimX, aimY + 10);
        ctx.stroke();

        if (!isValid) {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText('距离过近', aimX - 35, aimY + 80);
        }
        }
    }

    ctx.restore();

    // ----------------------------------------------------
    // Draw Health Bars in PURE SCREEN SPACE
    // ----------------------------------------------------
    [state.player, state.enemy].forEach(p => {
       if (p.isDead) return;

       // Formula: Round(SpriteWorld - Camera - (BarWidth/2))
       // This uses the sprite center as reference
       const barW = 60;
       const barH = 6;
       const barX = Math.round(p.pos.x - state.camera.x - barW / 2);
       const barY = Math.round(p.pos.y - state.camera.y - p.radius - 15);

       // Draw background
       ctx.fillStyle = 'red';
       ctx.fillRect(barX, barY, barW, barH); 
       
       // Draw foreground
       const hpPct = p.hp / p.maxHp;
       if (hpPct > 0) {
         ctx.fillStyle = '#10b981';
         ctx.fillRect(barX, barY, Math.round(barW * hpPct), barH);
       }
    });
  };

  const gameLoop = (time: number) => {
    let lastTime = time;
    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1); 
      lastTime = now;
      
      update(dt);
      
      const st = stateRef.current;
      
      // --- CRITICAL: DIRECT DOM UPDATES (NO REACT BATCHING) ---
      // 1. Player HP
      if (playerHpBarRef.current && playerHpTextRef.current) {
          const hpPct = (st.player.hp / st.player.maxHp) * 100;
          playerHpBarRef.current.style.width = `${Math.max(0, hpPct)}%`;
          playerHpTextRef.current.textContent = `${st.player.hp.toFixed(0)} HP`;
      }
      
      // 2. Pyro Heat
      if (heatBarRef.current && heatTextRef.current && st.player.type === CharacterType.PYRO) {
          const heatPct = (st.player.heat / st.player.maxHeat) * 100;
          heatBarRef.current.style.width = `${Math.min(100, Math.max(0, heatPct))}%`;
          heatTextRef.current.textContent = `${st.player.heat.toFixed(0)}%`;
          
          // Toggle classes if needed, though this might cause repaint
          // To keep it simple, we just update width mostly. Color changes via state below are fine as they are infrequent.
      }
      
      // 3. Enemy HP
      if (enemyHpBarRef.current && enemyHpTextRef.current) {
          const ehpPct = (st.enemy.hp / st.enemy.maxHp) * 100;
          enemyHpBarRef.current.style.width = `${Math.max(0, ehpPct)}%`;
          enemyHpTextRef.current.textContent = `${st.enemy.hp.toFixed(0)} / ${st.enemy.maxHp}`;
      }

      // 4. Tank Radar Update
      if (radarPivotRef.current && st.player.type === CharacterType.TANK && !st.enemy.isDead) {
          const dx = st.enemy.pos.x - st.player.pos.x;
          const dy = st.enemy.pos.y - st.player.pos.y;
          const angle = Math.atan2(dy, dx);
          // Rotate the container so the dot (fixed at right edge) points towards enemy
          radarPivotRef.current.style.transform = `rotate(${angle}rad)`;
      }

      // ---------------------------------------------------------

      // Low frequency UI updates via React State
      // We only strictly need to update things that change layout or are discreet (Ammo counts, Mode)
      // Heat/HP bars are handled above, but we keep state for initial render and color classes.
      setUiState({
        pArtAmmo: st.player.artilleryAmmo, pMaxArtAmmo: st.player.maxArtilleryAmmo,
        pLmgAmmo: st.player.lmgAmmo, pMaxLmgAmmo: st.player.maxLmgAmmo,
        pIsReloadingLmg: st.player.isReloadingLmg,
        pTankMode: st.player.tankMode,
        pType: st.player.type,
        pSkillCD: st.player.skillCooldown, pSkillMaxCD: st.player.skillMaxCooldown,
        pIsOverheated: st.player.isOverheated, // Color changes need this
        eType: st.enemy.type,
        gameStatus: st.gameStatus
      });

      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) draw(ctx);
      }

      if (st.gameStatus === 'PLAYING') {
        requestRef.current = requestAnimationFrame(loop);
      }
    };
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    // Resume Audio Context on mount/interaction (though MainMenu likely handled it)
    Sound.init();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    
    if (canvasRef.current) {
       canvasRef.current.width = window.innerWidth;
       canvasRef.current.height = window.innerHeight;
    }

    requestRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const getRoleName = (type: CharacterType) => type === CharacterType.PYRO ? '火焰球' : '坦克球';
  const getModeName = (mode: TankMode) => mode === TankMode.ARTILLERY ? '重炮模式' : '机枪模式';
  const getSkillName = (type: CharacterType) => type === CharacterType.PYRO ? '岩浆池' : '切换形态';
  const getDefeatText = (type: CharacterType) => type === CharacterType.PYRO ? '火焰熄灭' : '机体严重损毁';

  // Pyro Heat Color Logic
  const getHeatColor = () => {
      if (uiState.pIsOverheated) return 'bg-white';
      // Note: We use the ref width for animation, but this color change depends on state loop which is fine
      // because colors don't change 60 times a second.
      // However, we can approximate color in the render if needed, but CSS transition handles it well.
      return 'bg-gradient-to-r from-yellow-500 via-orange-500 to-red-600'; 
  };
  
  // Specific style logic for heat bar
  const heatBarStyle = uiState.pIsOverheated 
     ? 'bg-white animate-pulse' 
     : (uiState.pType === CharacterType.PYRO ? 'bg-orange-500' : 'bg-slate-500');

  return (
    <div className="relative w-full h-screen overflow-hidden cursor-crosshair font-mono">
      <canvas ref={canvasRef} className="block" />
      
      {/* Player HUD Top-Left */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 select-none">
        <div className="bg-slate-900/90 p-4 rounded-lg border border-slate-700 min-w-[300px] shadow-lg backdrop-blur-sm">
           {/* HP */}
           <div className="flex justify-between items-center mb-1">
             <span className="font-bold text-white text-lg">{getRoleName(uiState.pType)}</span>
             <span ref={playerHpTextRef} className="text-sm text-slate-400 font-mono">100 HP</span>
           </div>
           <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden mb-4 border border-slate-600">
             <div 
               ref={playerHpBarRef}
               className="h-full bg-gradient-to-r from-green-600 to-green-400" 
               style={{ width: '100%'}} 
             />
           </div>
           
           {/* RESOURCE BARS SEPARATED BY TYPE */}
           {uiState.pType === CharacterType.PYRO && (
             <>
               <div className="flex justify-between items-center mb-1">
                 <span className="text-xs text-slate-300 font-bold uppercase">热能水平 {uiState.pIsOverheated && <span className="text-red-500 ml-2 animate-pulse font-black">过热警报</span>}</span>
                 <span ref={heatTextRef} className={`text-xs font-mono ${uiState.pIsOverheated ? 'text-red-500' : 'text-orange-400'}`}>0%</span>
               </div>
               <div className={`relative w-full h-5 rounded overflow-hidden border ${uiState.pIsOverheated ? 'border-red-500 bg-red-900/50' : 'border-slate-600 bg-slate-800'}`}>
                 <div 
                   ref={heatBarRef}
                   className={`h-full transition-colors duration-200 ${heatBarStyle}`} 
                   style={{ width: '0%' }} 
                 />
               </div>
               {uiState.pIsOverheated && <div className="text-[10px] text-red-400 mt-1">系统冷却中... 无法攻击</div>}
             </>
           )}

           {uiState.pType === CharacterType.TANK && uiState.pTankMode === TankMode.ARTILLERY && (
              <>
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-300 font-bold uppercase">155mm 炮弹</span>
                    <span className="text-xs text-yellow-500 font-mono">{uiState.pArtAmmo} / 5</span>
                 </div>
                 <div className="flex gap-2 h-5">
                    {Array.from({length: uiState.pMaxArtAmmo}).map((_, i) => (
                       <div key={i} className={`flex-1 rounded-sm border border-slate-600 transition-colors duration-300 ${i < uiState.pArtAmmo ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-slate-800'}`}></div>
                    ))}
                 </div>
              </>
           )}

           {uiState.pType === CharacterType.TANK && uiState.pTankMode === TankMode.LMG && (
              <>
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-300 font-bold uppercase">机枪弹药链</span>
                    <span className={`text-xs font-mono flex items-center gap-1 ${uiState.pIsReloadingLmg ? 'text-red-500 blink' : 'text-amber-400'}`}>
                        {uiState.pIsReloadingLmg ? '装填中...' : <><span className="text-lg leading-none">▮</span> {Math.floor(uiState.pLmgAmmo)}</>}
                    </span>
                 </div>
                 {/* LMG AMMO BELT UI */}
                 <div className="flex w-full h-5 gap-[1px]">
                    {Array.from({ length: 20 }).map((_, i) => {
                         const totalSegments = 20;
                         const ammoPerSegment = uiState.pMaxLmgAmmo / totalSegments;
                         const currentSegmentThreshold = (i + 1) * ammoPerSegment;
                         const isFilled = uiState.pLmgAmmo >= (currentSegmentThreshold - ammoPerSegment/2);
                         
                         return (
                            <div 
                                key={i} 
                                className={`flex-1 -skew-x-12 transition-colors duration-75 ${
                                    uiState.pIsReloadingLmg 
                                        ? 'bg-red-500/50 animate-pulse' 
                                        : (isFilled ? 'bg-amber-500' : 'bg-slate-700/50')
                                }`} 
                            />
                         );
                    })}
                 </div>
              </>
           )}

           {/* SKILLS & STATUS */}
           <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-700/50">
              <div className="flex items-center gap-3">
                 <div className={`w-10 h-10 rounded border-2 ${uiState.pSkillCD <= 0 ? 'border-yellow-400 bg-yellow-400/20' : 'border-slate-600 bg-slate-800'} flex items-center justify-center relative`}>
                    <span className="text-base">{uiState.pType === CharacterType.PYRO ? '☄️' : '🔄'}</span>
                    {uiState.pSkillCD > 0 && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white font-bold">
                            {uiState.pSkillCD.toFixed(0)}
                        </div>
                    )}
                 </div>
                 <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">技能 (Space)</span>
                    <span className="text-xs font-bold text-white">{getSkillName(uiState.pType)}</span>
                 </div>
              </div>

              {uiState.pType === CharacterType.TANK && (
                <div className="px-2 py-1 bg-slate-800/80 rounded border border-slate-600 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  {getModeName(uiState.pTankMode)}
                </div>
              )}
           </div>

           {/* TANK RADAR UI */}
           {uiState.pType === CharacterType.TANK && (
              <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-center">
                 <div className="relative w-16 h-16 rounded-full bg-slate-900 border-2 border-slate-600 shadow-inner flex items-center justify-center overflow-hidden">
                    {/* Decorative Grid */}
                    <div className="absolute inset-0 border border-slate-800 rounded-full scale-50"></div>
                    <div className="absolute w-full h-[1px] bg-slate-800"></div>
                    <div className="absolute h-full w-[1px] bg-slate-800"></div>
                    
                    {/* Center Dot (Player) */}
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full z-10 shadow-[0_0_5px_#10b981]"></div>
                    
                    {/* Rotating Container */}
                    <div ref={radarPivotRef} className="absolute inset-0 w-full h-full">
                       {/* Enemy Blip (Fixed at right edge, container rotates) */}
                       <div className="absolute top-1/2 right-1 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444] animate-pulse"></div>
                    </div>
                    
                    <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-transparent to-slate-900/20 pointer-events-none"></div>
                 </div>
                 <div className="ml-3 flex flex-col justify-center">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">雷达系统</span>
                    <span className="text-[9px] text-emerald-500 font-mono">运行中</span>
                 </div>
              </div>
           )}
        </div>
      </div>

      {/* Enemy Boss Bar Top-Right */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2 pointer-events-auto select-none">
        
        {/* Exit Button */}
        <button 
           onClick={() => {
               Sound.playUI('CLICK');
               onExit();
           }}
           className="px-4 py-1 bg-red-900/80 hover:bg-red-700 border border-red-500 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors mb-2"
        >
           结束战斗
        </button>

        <div className="w-[320px] bg-slate-900/90 p-3 rounded-lg border border-slate-700 shadow-lg pointer-events-none">
            <div className="flex justify-between text-xs text-white drop-shadow mb-1">
            <span className="font-bold text-red-400 uppercase tracking-widest">
              敌对单位: {getRoleName(uiState.eType)}
            </span>
            <span ref={enemyHpTextRef} className="font-mono">100 / 100</span>
            </div>
            <div className="w-full h-3 bg-slate-900 border border-slate-600 rounded-sm overflow-hidden relative">
              <div 
                  ref={enemyHpBarRef}
                  className="h-full bg-red-600"
                  style={{ width: '100%' }} 
              />
            </div>
        </div>
      </div>
      
      {/* End Screen */}
      {uiState.gameStatus !== 'PLAYING' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
           <h2 className={`text-8xl font-black mb-4 ${uiState.gameStatus === 'VICTORY' ? 'text-yellow-400 drop-shadow-[0_0_25px_rgba(250,204,21,0.5)]' : 'text-red-600 drop-shadow-[0_0_25px_rgba(220,38,38,0.5)]'}`}>
             {uiState.gameStatus === 'VICTORY' ? '胜利' : '失败'}
           </h2>
           <div className="text-2xl text-white mb-8 font-light tracking-widest uppercase">
              {uiState.gameStatus === 'VICTORY' ? '目标已摧毁' : getDefeatText(playerType)}
           </div>
           <button 
             onClick={() => {
                Sound.playUI('CLICK');
                onExit();
             }}
             className="px-8 py-4 bg-white text-black font-bold text-xl rounded hover:bg-slate-200 hover:scale-105 transition-all shadow-xl"
           >
             返回主菜单
           </button>
        </div>
      )}
    </div>
  );
};

export default Game;
