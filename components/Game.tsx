import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  CharacterType, GameState, PlayerState, Vector2, TankMode, Projectile, GroundEffect, Obstacle, FloatingText, Drone
} from '../types';
import { 
  MAP_SIZE, PHYSICS, CHAR_STATS, VIEWPORT_PADDING 
} from '../constants';
import * as Utils from '../utils';
import { Sound } from '../sound';
import { CHARACTER_IMAGES } from '../images';

interface GameProps {
  playerType: CharacterType;
  enemyType?: CharacterType | 'RANDOM';
  onExit: () => void;
}

// Explicit UI State Interface to prevent type inference issues (specifically missing CharacterType.CAT)
interface UIState {
    pArtAmmo: number;
    pMaxArtAmmo: number;
    pLmgAmmo: number;
    pMaxLmgAmmo: number;
    pIsReloadingLmg: boolean;
    pTankMode: TankMode;
    pDroneState: PlayerState['droneState'];
    pDroneTimer: number;
    pDroneMaxTimer: number;
    pActiveDroneStats: { hp: number, maxHp: number, life: number, maxLife: number } | null;
    pType: CharacterType;
    pSkillCD: number;
    pSkillMaxCD: number;
    pSecondarySkillCD: number;
    pSecondarySkillMaxCD: number;
    pIsOverheated: boolean;
    pWukongCharge: number;
    pWukongMaxCharge: number;
    pWukongThrustTimer: number;
    pCatLives: number;
    pCatCharge: number;
    eCatLives: number;
    eType: CharacterType;
    gameStatus: string;
}

const Game: React.FC<GameProps> = ({ playerType, enemyType, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // Direct DOM Refs for High-Frequency UI Updates
  const playerHpBarRef = useRef<HTMLDivElement>(null);
  const playerHpTextRef = useRef<HTMLSpanElement>(null);
  const enemyHpBarRef = useRef<HTMLDivElement>(null);
  const enemyHpTextRef = useRef<HTMLSpanElement>(null);
  const heatBarRef = useRef<HTMLDivElement>(null);
  const heatTextRef = useRef<HTMLSpanElement>(null);
  const skillCdOverlayRef = useRef<HTMLDivElement>(null);
  
  // Tank Radar Ref
  const radarPivotRef = useRef<HTMLDivElement>(null);
  
  // Sound Throttle Refs
  const lastPyroSoundTimeRef = useRef<number>(0);
  const lastDroneSoundTimeRef = useRef<number>(0);

  const isMechanical = (entity: any): boolean => {
      return entity.isSummon === true && entity.projectileType !== 'MAGMA_POOL'; 
  };  

  const isSummon = (entity: any): boolean => {
      return entity.isSummon === true || entity.type === 'MAGMA_POOL';
  };

  const calculatePyroShape = (distToTarget: number) => {
      const baseRange = CHAR_STATS[CharacterType.PYRO].flamethrowerRange;
      const baseAngle = CHAR_STATS[CharacterType.PYRO].flamethrowerAngle;
      
      // 面积常数 K
      const areaConstant = baseRange * baseRange * baseAngle;      
      const clampedDist = Utils.clamp(distToTarget, 70, 280);
      const newAngle = areaConstant / (clampedDist * clampedDist);
      
      return { range: clampedDist, angle: newAngle };
  };

  // Map Generator
  const generateObstacles = (): Obstacle[] => {
    const obs: Obstacle[] = [];
    
    // 1. Generate 1 Large Water Body (Fixed requirement)
    // Size between 500x500 and 800x800
    const largeWaterW = 500 + Math.random() * 300;
    const largeWaterH = 500 + Math.random() * 300;
    obs.push({
        id: 'water-large',
        x: Math.random() * (MAP_SIZE.width - largeWaterW),
        y: Math.random() * (MAP_SIZE.height - largeWaterH),
        width: largeWaterW,
        height: largeWaterH,
        type: 'WATER'
    });

    // 2. Generate 2-3 Large Solid Obstacles (Fixed requirement)
    const numLargeWalls = 2 + Math.floor(Math.random() * 2); 
    for(let i=0; i<numLargeWalls; i++) {
        // Large blocks, could be thick walls or squares
        const w = 200 + Math.random() * 300;
        const h = 200 + Math.random() * 300;
        obs.push({
            id: `wall-large-${i}`,
            x: Math.random() * (MAP_SIZE.width - w),
            y: Math.random() * (MAP_SIZE.height - h),
            width: w,
            height: h,
            type: 'WALL'
        });
    }

    // 3. Random Scatter (Reduced count slightly to accommodate large ones)
    const numRandomWalls = 3 + Math.floor(Math.random() * 3); 
    const numRandomWater = 1 + Math.floor(Math.random() * 2);

    const isValid = (rect: {x: number, y: number, width: number, height: number}) => {
       // Check spawn safety zones
       if (rect.x < 300 || rect.x > MAP_SIZE.width - 300) return true;
       if (rect.y < 300 || rect.y > MAP_SIZE.height - 300) return true;
       
       // Simple check to prevent total overlap with existing large obstacles
       for (const existing of obs) {
           const overlap = !(rect.x + rect.width < existing.x || 
                             rect.x > existing.x + existing.width || 
                             rect.y + rect.height < existing.y || 
                             rect.y > existing.y + existing.height);
           if (overlap) return false;
       }
       return true;
    };

    for(let i=0; i<numRandomWalls + numRandomWater; i++) {
       let attempts = 0;
       while(attempts < 50) {
          // Thinner walls possible now (40 - 240 width range)
          const w = 40 + Math.random() * 200;
          const h = 40 + Math.random() * 200;
          const x = Math.random() * (MAP_SIZE.width - w);
          const y = Math.random() * (MAP_SIZE.height - h);
          const type: 'WALL' | 'WATER' = i < numRandomWalls ? 'WALL' : 'WATER';
          const newObs: Obstacle = { id: `obs-random-${i}`, x, y, width: w, height: h, type };

          if (isValid(newObs)) {
              obs.push(newObs);
              break;
          }
          attempts++;
       }
    }
    return obs;
  };

  const getRandomEdgePos = () => {
    const edge = Math.floor(Math.random() * 4);
    const padding = 200;
    const w = MAP_SIZE.width;
    const h = MAP_SIZE.height;
    // 0: Top, 1: Bottom, 2: Left, 3: Right
    switch(edge) {
        case 0: return { x: Math.random() * (w - 2*padding) + padding, y: padding }; 
        case 1: return { x: Math.random() * (w - 2*padding) + padding, y: h - padding }; 
        case 2: return { x: padding, y: Math.random() * (h - 2*padding) + padding }; 
        default: return { x: w - padding, y: Math.random() * (h - 2*padding) + padding }; 
    }
  };

  const spawnPlayer = getRandomEdgePos();
  // Ensure enemy spawns reasonably far away
  let spawnEnemy = getRandomEdgePos();
  if (enemyType === CharacterType.COACH) {
      spawnEnemy = { x: MAP_SIZE.width / 2, y: MAP_SIZE.height / 2 }; // 强制中心
  } else {
      let attempts = 0;
      while(Utils.dist(spawnPlayer, spawnEnemy) < 800 && attempts < 10) {
          spawnEnemy = getRandomEdgePos();
          attempts++;
      }
  }

  // Game State Ref
  const stateRef = useRef<GameState>({
    player: createPlayer(playerType, spawnPlayer, 'player'),
    enemy: createPlayer(
      (() => {
        if (enemyType && enemyType !== 'RANDOM') {
            return enemyType;
        }
        // PURE RANDOM SELECTION (INCLUDING MIRROR MATCHES)
        const types = [CharacterType.PYRO, CharacterType.TANK, CharacterType.WUKONG, CharacterType.CAT];
        return types[Math.floor(Math.random() * types.length)];
      })(), 
      spawnEnemy, 
      'enemy'
    ),
    projectiles: [],
    particles: [],
    groundEffects: [],
    drones: [],
    obstacles: generateObstacles(),
    floatingTexts: [],
    camera: { x: 0, y: 0 },
    gameStatus: 'PLAYING',
  });

  const keysRef = useRef<{ [key: string]: boolean }>({});
  const mouseRef = useRef<Vector2>({ x: 0, y: 0 });
  const mouseBtnsRef = useRef<{ [key: string]: boolean }>({});
  
  // UI State (Only for low-frequency updates now)
  // Explicitly typed to avoid inference issues with Enums (especially 'CAT')
  const [uiState, setUiState] = useState<UIState>({
    pArtAmmo: 0, pMaxArtAmmo: 5, // Tank Artillery
    pLmgAmmo: 0, pMaxLmgAmmo: 200, pIsReloadingLmg: false, // Tank LMG
    pTankMode: TankMode.ARTILLERY,
    pDroneState: 'READY', pDroneTimer: 0, pDroneMaxTimer: 10, // Tank Drone
    pActiveDroneStats: null,
    pType: CharacterType.PYRO,
    pSkillCD: 0, pSkillMaxCD: 1,
    pSecondarySkillCD: 0, // General secondary skill CD
    pSecondarySkillMaxCD: 1,
    pIsOverheated: false, // Kept for styling classes
    pWukongCharge: 0, pWukongMaxCharge: 1, // Wukong Charge
    pWukongThrustTimer: 0, // Wukong Thrust Cooldown
    
    // Cat UI
    pCatLives: 0,
    pCatCharge: 0,
    eCatLives: 0,
    
    eType: stateRef.current.enemy.type,
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
      maxHeat: stats.maxHeat || 100,
      isOverheated: false,

      // Tank
      artilleryAmmo: stats.maxArtilleryAmmo || 5,
      maxArtilleryAmmo: stats.maxArtilleryAmmo || 5,
      artilleryReloadTimer: 0,
      
      lmgAmmo: stats.maxLmgAmmo || 200,
      maxLmgAmmo: stats.maxLmgAmmo || 200,
      isReloadingLmg: false,
      lmgReloadTimer: 0,

      // Tank Drone
      droneState: 'READY',
      droneTimer: 0,
      droneMaxTimer: 10,

      // Wukong
      wukongComboStep: 0,
      wukongComboTimer: 0,
      wukongChargeState: 'NONE',
      wukongChargeTime: 0,
      wukongMaxCharge: 1.0, // Default 1.0s normalization
      wukongChargeHoldTimer: 0, // New: Limit holding time
      wukongVaultTimer: 0,
      wukongThrustTimer: 0,
      isVaulting: false,
      wukongLastAttackTime: 0,
      wukongLastAttackType: 'NONE',
      wukongLastChargePct: 0,
      
      // Cat
      lives: stats.maxLives || 1, // 9 lives for cat
      maxLives: stats.maxLives || 1,
      invincibleTimer: 0,
      catChargeStartTime: 0,
      catIsCharging: false,
      idleTimer: 0,
      pounceCooldown: 0,
      isPouncing: false,
      pounceTimer: 0,
      hasPounceHit: false,

      angle: 0,
      aimAngle: 0,
      tankMode: TankMode.ARTILLERY,
      siegeSwitchTimer: 0,
      isFiringFlamethrower: false,
      currentWeaponRange: stats.flamethrowerRange, 
      currentWeaponAngle: stats.flamethrowerAngle,
      skillCooldown: 0,
      skillMaxCooldown: stats.skillCooldown / 1000,
      secondarySkillCooldown: 0,
      secondarySkillMaxCooldown: (stats.secondarySkillCooldown || 5000) / 1000,
      attackCooldown: 0,
      
      // Status
      slowTimer: 0,
      burnTimer: 0,
      flameExposure: 0,
      isWet: false,
      disarmTimer: 0,
      silenceTimer: 0,
      fearTimer: 0,
      paralysisTimer: 0,
      bufferedInput: 'NONE',

      // AI defaults
      lastPos: pos,
      stuckTimer: 0,
      unstuckTimer: 0,
      unstuckDir: {x:0, y:0},
      burstTimer: 0
    };
  }

  // --- Input ---

  const handleKeyDown = useCallback((e: KeyboardEvent) => { 
      keysRef.current[e.code] = true;
      const p = stateRef.current.player;
      if (p.isDead) return;
      if (p.type === CharacterType.WUKONG && e.code === 'Space' && p.skillCooldown <= 0) {
          if (p.wukongChargeState === 'NONE' && p.silenceTimer <= 0) {
            p.wukongChargeState = 'SMASH';
            p.wukongChargeTime = 0;
            p.wukongChargeHoldTimer = 0;
            p.wukongMaxCharge = CHAR_STATS[CharacterType.WUKONG].smashChargeTime;
            Sound.playSkill('CHARGE_START');
          }
      } else if (p.type === CharacterType.CAT && e.code === 'Space' && p.skillCooldown <= 0) {
          // CAT SCOOPER SMASH
          if (p.silenceTimer <= 0) {
              handleCatScooper(p);
          }
      }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => { 
      keysRef.current[e.code] = false; 
      const p = stateRef.current.player;
      if (p.isDead) return;
      if (p.type === CharacterType.WUKONG && e.code === 'Space' && p.wukongChargeState === 'SMASH') {
          releaseWukongSmash(p);
      }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => { 
      const btn = e.button === 0 ? 'Left' : (e.button === 2 ? 'Right' : 'Mid');
      mouseBtnsRef.current[btn] = true;
      keysRef.current[`Mouse${btn}`] = true;
      
      const p = stateRef.current.player;
      if (p.isDead) return;
      if (p.type === CharacterType.WUKONG) {
          if (btn === 'Left') {
              handleWukongCombo(p);
          } else if (btn === 'Right') {
              if (p.wukongThrustTimer <= 0 && p.wukongChargeState === 'NONE') {
                  p.wukongChargeState = 'THRUST';
                  p.wukongChargeTime = 0;
                  p.wukongMaxCharge = CHAR_STATS[CharacterType.WUKONG].thrustChargeTime;
                  Sound.playSkill('CHARGE_START');
              }
          }
      } else if (p.type === CharacterType.PYRO) {
          if (btn === 'Right') {
              const hasPools = stateRef.current.groundEffects.some(g => g.type === 'MAGMA_POOL');
              if (hasPools) detonateMagmaPools(p);
          }
      } else if (p.type === CharacterType.TANK) {
          if (btn === 'Right' && p.droneState === 'READY') {
              deployDrone(p);
          }
      } else if (p.type === CharacterType.CAT) {
          if (btn === 'Left') {
              // Start charge
              p.catIsCharging = true;
              p.catChargeStartTime = performance.now();
          } else if (btn === 'Right') {
              if (p.isPouncing) {
                  p.bufferedInput = 'HISS';
              } else {
                  handleCatHiss(p);
              }
          }
      }
  }, []);

  const handleMouseUp = useCallback((e: MouseEvent) => { 
      const btn = e.button === 0 ? 'Left' : (e.button === 2 ? 'Right' : 'Mid');
      mouseBtnsRef.current[btn] = false;
      keysRef.current[`Mouse${btn}`] = false; 

      const p = stateRef.current.player;
      if (p.isDead) return;
      if (p.type === CharacterType.WUKONG && btn === 'Right' && p.wukongChargeState === 'THRUST') {
          releaseWukongThrust(p);
      } else if (p.type === CharacterType.CAT && btn === 'Left') {
          if (p.catIsCharging) {
              p.catIsCharging = false;
              const chargeTime = (performance.now() - (p.catChargeStartTime || 0)) / 1000;
              if (chargeTime < 0.3) {
                  // Short click -> Scratch
                  handleCatScratch(p);
              } else {
                  // Long press -> Pounce
                  handleCatPounce(p, chargeTime);
              }
          }
      }
  }, []);

  // --- COMBAT LOGIC ---

  const handleCatHiss = (p: PlayerState) => {
      if (p.silenceTimer > 0) return; 
      if (p.secondarySkillCooldown > 0) return;
      const stats = CHAR_STATS[CharacterType.CAT];
      p.secondarySkillCooldown = stats.hissCooldown / 1000;
      
      Sound.playSkill('SWITCH'); 

      const isLastLife = (p.lives || 0) <= 1;
      const range = stats.hissRadius; // 250 (Constants)
      const force = stats.hissKnockback;

      // --- Visuals ---
      if (isLastLife) {
          // 绝境模式：威慑特效 (深紫色/黑色波纹) 
          stateRef.current.particles.push({
              id: Math.random().toString(), pos: p.pos, vel: {x:0, y:0},
              life: 0.6, maxLife: 0.6, color: '#a855f7', size: range, drag: 0.9 // Purple-500 Ring
          });
          stateRef.current.particles.push({ // Second Ring
              id: Math.random().toString(), pos: p.pos, vel: {x:0, y:0},
              life: 0.4, maxLife: 0.4, color: '#c084fc', size: range * 0.7, drag: 0.9 
          });
          // 恐惧骷髅头粒子
          for(let i=0; i<8; i++) {
              const a = (i/8) * Math.PI * 2;
              stateRef.current.particles.push({
                  id: Math.random().toString(), pos: p.pos,
                  vel: {x: Math.cos(a)*12, y: Math.sin(a)*12}, // Faster particles
                  life: 0.8, maxLife: 0.8, color: '#1f2937', size: 6 
              });
          }
      } else {
          // 卖萌模式：可爱特效 (粉色/爱心波纹) 
          stateRef.current.particles.push({
              id: Math.random().toString(), pos: p.pos, vel: {x:0, y:0},
              life: 0.5, maxLife: 0.5, color: '#f472b6', size: range, drag: 0.9 // Pink-400 Ring
          });
           stateRef.current.particles.push({ // Inner Ring
              id: Math.random().toString(), pos: p.pos, vel: {x:0, y:0},
              life: 0.3, maxLife: 0.3, color: '#fbcfe8', size: range * 0.6, drag: 0.9 
          });
          // 爱心粒子 (模拟)
          for(let i=0; i<12; i++) {
               const a = (i/12) * Math.PI * 2;
               stateRef.current.particles.push({
                   id: Math.random().toString(), pos: p.pos,
                   vel: {x: Math.cos(a)*8, y: Math.sin(a)*8},
                   life: 0.6, maxLife: 0.6, color: '#ec4899', size: 5
               });
          }
      }

      // --- Logic ---
      const enemies = p.id === 'player' ? [stateRef.current.enemy] : [stateRef.current.player];
      stateRef.current.drones.forEach(d => {
          if (d.ownerId !== p.id && d.hp > 0 && !d.isDocked) enemies.push(d as any);
      });

      enemies.forEach(e => {
          const dist = Utils.dist(p.pos, e.pos);
          if (dist < range + e.radius) {
              if (isMechanical(e)) {
                  return;
              }

              const dir = Utils.normalize(Utils.sub(e.pos, p.pos));
              applyKnockback(e, dir, force);
              
              if (isLastLife) {
                  e.fearTimer = 2.5; 
                  stateRef.current.floatingTexts.push({
                       id: Math.random().toString(), pos: {x: e.pos.x, y: e.pos.y-40},
                       text: "恐惧!", color: '#d8b4fe', life: 1.0, maxLife: 1.0, velY: -1 
                  });
              } else {
                  e.disarmTimer = 2.5;
                  e.silenceTimer = 2.5;
                  stateRef.current.floatingTexts.push({
                       id: Math.random().toString(), pos: {x: e.pos.x, y: e.pos.y-40},
                       text: "被萌翻!", color: '#f9a8d4', life: 1.0, maxLife: 1.0, velY: -1 
                  });
              }
              
              if (e.type === CharacterType.WUKONG) {
                  e.wukongChargeState = 'NONE';
                  e.wukongChargeTime = 0;
                  e.wukongChargeHoldTimer = 0;
                  e.wukongLastAttackType = 'NONE';
              }
          }
      });
      
      // Deflect Projectiles (Common)
      stateRef.current.projectiles.forEach(proj => {
          if (proj.ownerId !== p.id && Utils.dist(p.pos, proj.pos) < range) {
               const dir = Utils.normalize(Utils.sub(proj.pos, p.pos));
               proj.vel = Utils.mult(dir, Utils.mag(proj.vel) * 1.5);
               proj.ownerId = p.id;
          }
      });
  };

  const handleCatPounce = (p: PlayerState, chargeTime: number) => {
      const stats = CHAR_STATS[CharacterType.CAT];

      if (p.pounceCooldown > 0) {
          return;
      }

      const chargePct = Math.min(1, chargeTime / stats.pounceMaxCharge);
      
      const speed = stats.pounceSpeed * (0.5 + 0.5 * chargePct);
      const dir = {x: Math.cos(p.aimAngle), y: Math.sin(p.aimAngle)};
      
      // Launch
      p.vel = Utils.add(p.vel, Utils.mult(dir, speed * 60 * 0.9)); // Impulse

      p.isPouncing = true;
      p.pounceTimer = 0.6;
      p.hasPounceHit = false; // 重置攻击判定
      p.pounceCooldown = stats.pounceCooldown / 1500;
      
      Sound.playSkill('CHARGE_START');
      spawnParticles(p.pos, 10, '#fef3c7', 5);
      
  };

  const handleCatScooper = (p: PlayerState) => {
    if (p.silenceTimer > 0) return;
      const stats = CHAR_STATS[CharacterType.CAT];
      p.skillCooldown = stats.skillCooldown / 1000;
      
      const enemy = p.id === 'player' ? stateRef.current.enemy : stateRef.current.player;
      let target: any = enemy;
      
      // 1. 获取最近的敌方无人机
      let closestDrone: any = null;
      let minDroneDist = Infinity;
      stateRef.current.drones.forEach(d => {
          if (d.ownerId !== p.id && d.hp > 0 && !d.isDocked) {
              const dDist = Utils.dist(p.pos, d.pos);
              if (dDist < minDroneDist) {
                  minDroneDist = dDist;
                  closestDrone = d;
              }
          }
      });

      // 2. 判断敌人是否在屏幕内 (Camera View)
      const cam = stateRef.current.camera;
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const isEnemyOnScreen = !enemy.isDead && 
          enemy.pos.x >= cam.x && enemy.pos.x <= cam.x + viewW &&
          enemy.pos.y >= cam.y && enemy.pos.y <= cam.y + viewH;

      const distToEnemy = Utils.dist(p.pos, enemy.pos);

      // 3. 索敌逻辑：
      // 优先级 A: 敌人已死 -> 找无人机
      // 优先级 B: 无人机比敌人更近 且 敌人不在屏幕内 -> 找无人机
      // 否则 -> 找敌人
      if (enemy.isDead) {
          if (closestDrone) target = closestDrone;
      } else {
          if (closestDrone && minDroneDist < distToEnemy && !isEnemyOnScreen) {
              target = closestDrone;
          }
      }

      // [距离限制逻辑]
      let spawnPos = { ...target.pos };
      const dist = Utils.dist(p.pos, target.pos);
      const maxRange = stats.scoopMaxRange || 600; 

      if (dist > maxRange) {
          const dir = Utils.normalize(Utils.sub(target.pos, p.pos));
          spawnPos = Utils.add(p.pos, Utils.mult(dir, maxRange));
      }

      stateRef.current.groundEffects.push({
        id: Math.random().toString(),
        pos: spawnPos, 
        radius: stats.scoopRadius,
        life: 1.0, 
        maxLife: 1.0,
        type: 'SCOOPER_WARNING',
        ownerId: p.id,
        targetId: target.id 
      });

      Sound.playSkill('CHARGE_START');
  };

 const handleCatScratch = (p: PlayerState) => {
    if (p.disarmTimer > 0) return;
      if (p.attackCooldown > 0) return;
      if (p.isPouncing) return;
      if (p.isPouncing) return;
      const stats = CHAR_STATS[CharacterType.CAT];
      p.attackCooldown = stats.scratchCooldown / 1000;
      
      Sound.playShot('SCRATCH');

      // 设置AI猫猫球普攻额外冷却时间
      const cdMultiplier = p.id === 'player' ? 1.0 : 1.3;
      p.attackCooldown = (stats.scratchCooldown / 1000) * cdMultiplier;
      
      // Visuals: Claw Swipes (Covering the WHOLE cone)
      const triggerVisual = (side: number) => {
           // side: 1 (Right Claw -> Swipes CW), -1 (Left Claw -> Swipes CCW)
           const centerAngle = p.aimAngle; 
           const baseDist = p.radius + stats.scratchRange * 0.5;
           
           // Generate 3 "Claw Marks"
           for(let k = -1; k <= 1; k++) {
               const clawDist = baseDist + k * 8; 
               
               const arcLen = 1.4; 
               const particlesCount = 12; 
               
               for(let i=0; i < particlesCount; i++) {
                   const progress = i / particlesCount;
                   // Direction Logic: CW vs CCW swipe
                   const angleOffset = (progress - 0.5) * arcLen * side; 
                   
                   const a = centerAngle + angleOffset;
                   
                   const pos = Utils.add(p.pos, {
                       x: Math.cos(a) * clawDist,
                       y: Math.sin(a) * clawDist
                   });

                   stateRef.current.particles.push({
                       id: Math.random().toString(),
                       pos: pos,
                       vel: { 
                           x: Math.cos(a + Math.PI/2 * side) * 3, 
                           y: Math.sin(a + Math.PI/2 * side) * 3 
                       },
                       life: 0.15, maxLife: 0.15, 
                       color: '#f472b6', 
                       size: 0.8 + Math.random() * 2 
                   });
               }
           }
      };

      // Sequence: Right Swipe -> Left Swipe
      triggerVisual(1); 
      setTimeout(() => triggerVisual(-1), 200);

      // Hit Logic (Kept exactly as before)
      const enemyPlayer = p.id === 'player' ? stateRef.current.enemy : stateRef.current.player;
      const potentialTargets: any[] = [];
      if (!enemyPlayer.isDead) potentialTargets.push(enemyPlayer);
      stateRef.current.drones.forEach(d => {
          if (d.ownerId !== p.id && d.hp > 0 && !d.isDocked) potentialTargets.push(d);
      });

      potentialTargets.forEach(target => {
          const toTarget = Utils.sub(target.pos, p.pos);
          const dist = Utils.mag(toTarget);
          
          if (dist < stats.scratchRange + target.radius) {
              const angleToTarget = Math.atan2(toTarget.y, toTarget.x);
              let angleDiff = Math.abs(angleToTarget - p.aimAngle);
              angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
              
              if (Math.abs(angleDiff) < 0.8) { 
                  if ('isSummon' in target) {
                       target.hp -= stats.scratchDamage;
                       spawnParticles(target.pos, 5, '#6ee7b7', 4);
                       if (target.hp <= 0) {
                            createExplosion(stateRef.current, target.pos, 40, 0, p.id);
                            const owner = target.ownerId === stateRef.current.player.id ? stateRef.current.player : stateRef.current.enemy;
                            owner.droneState = 'RECONSTRUCTING';
                            owner.droneTimer = 0;
                            owner.droneMaxTimer = CHAR_STATS[CharacterType.TANK].droneReconstructTime / 1000;
                       }
                  } else {
                       // Hitstun
                       target.vel = { x: 0, y: 0 };
                       target.slowTimer = 0.2;
                       takeDamage(target, stats.scratchDamage);
                       spawnParticles(target.pos, 8, '#f0abfc', 4);
                  }
                  Sound.playHit();
              }
          }
      });
  };

  const deployDrone = (p: PlayerState) => {
    if (p.silenceTimer > 0) return;
      const stats = CHAR_STATS[CharacterType.TANK];
      // Generate in front of tank
      const dronePos = Utils.add(p.pos, {x: Math.cos(p.angle)*50, y: Math.sin(p.angle)*50}); 
      
      const drone: Drone = {
          id: Math.random().toString(),
          ownerId: p.id,
          pos: dronePos,
          vel: {x:0, y:0},
          hp: stats.droneHp,
          maxHp: stats.droneHp,
          life: stats.droneLife,
          maxLife: stats.droneLife,
          radius: stats.droneRadius,
          mass: 50,
          color: '#34d399',
          state: 'PATROL', // Initial state
          attackCooldown: 0,
          patrolAngle: 0,
          isSummon: true,
          isDocked: false
      };

      stateRef.current.drones.push(drone);
      p.droneState = 'DEPLOYED'; // Status updated
      p.activeDroneId = drone.id;
      Sound.playSkill('SWITCH'); 
  };

  const updateDrones = (state: GameState, dt: number) => {
      // Clean up drones that are destroyed or docked
      // Note: We use !d.isDocked to keep them until they dock, and d.hp > 0 to keep them alive
      state.drones = state.drones.filter(d => d.hp > 0 && !d.isDocked);

      state.drones.forEach(d => {
          const owner = state.player.id === d.ownerId ? state.player : state.enemy;
          const enemyPlayer = state.player.id === d.ownerId ? state.enemy : state.player;

          // 1. Life/Battery drain
          d.life -= dt * 1000;
          if (d.life <= 0) {
              d.state = 'RETURN'; // Out of battery, return
          }
          
          // 2. Return Logic
          if (d.state === 'RETURN') {
              const toOwner = Utils.sub(owner.pos, d.pos);
              const dist = Utils.mag(toOwner);
              if (dist < owner.radius + d.radius) {
                  // Docked
                  d.isDocked = true; // Mark for removal
                  owner.droneState = 'CHARGING'; 
                  owner.droneTimer = 0;
                  owner.droneMaxTimer = CHAR_STATS[CharacterType.TANK].droneRechargeTime / 1000;
              } else {
                  // Move to owner
                  const moveDir = Utils.normalize(toOwner);
                  const speed = CHAR_STATS[CharacterType.TANK].droneSpeed * 1.5; // Return faster
                  d.pos = Utils.add(d.pos, Utils.mult(moveDir, speed * 60 * dt));
              }
          } else {
              // 3. Combat & Patrol
              const stats = CHAR_STATS[CharacterType.TANK];
              
              // Target Selection: Hostile Player > Hostile Drone
              let target: {pos: Vector2, isDead: boolean, radius: number} | null = null;
              
              // Aggro Range check (Super Horizon)
              // If enemy is within Aggro Range but outside Attack Range, track them.
              const distToEnemy = Utils.dist(d.pos, enemyPlayer.pos);
              const aggroRange = stats.droneAggroRange || 1500;
              
              if (!enemyPlayer.isDead && distToEnemy < aggroRange) {
                  target = enemyPlayer;
              } else {
                  // Check enemy drones
                  let closestEnemyDrone: Drone | null = null;
                  let minDroneDist = 99999;
                  state.drones.forEach(other => {
                      if (other.ownerId !== d.ownerId && other.hp > 0 && !other.isDocked) {
                          const dst = Utils.dist(d.pos, other.pos);
                          if (dst < minDroneDist && dst < aggroRange) {
                              minDroneDist = dst;
                              closestEnemyDrone = other;
                          }
                      }
                  });
                  if (closestEnemyDrone) {
                      target = { 
                          pos: (closestEnemyDrone as Drone).pos, 
                          isDead: false, 
                          radius: (closestEnemyDrone as Drone).radius 
                      };
                  }
              }

              const distToTarget = target ? Utils.dist(d.pos, target.pos) : 9999;
              
              // Attack Phase if within Aggro
              if (target && !target.isDead && distToTarget < aggroRange) {
                  d.state = 'ATTACK';
                  const toTarget = Utils.sub(target.pos, d.pos);
                  const dir = Utils.normalize(toTarget);
                  
                  // Movement Logic:
                  // 1. If far > Attack Range: Chase
                  // 2. If close < Attack Range * 0.3: Retreat
                  // 3. If in optimal range: Strafe
                  if (distToTarget > stats.droneAttackRange) {
                      // Chase phase
                      d.pos = Utils.add(d.pos, Utils.mult(dir, stats.droneSpeed * 60 * dt));
                  } else if (distToTarget < stats.droneAttackRange * 0.3) {
                      // Retreat phase
                      d.pos = Utils.sub(d.pos, Utils.mult(dir, stats.droneSpeed * 60 * dt));
                  } else {
                      // Combat Strafe
                      const perp = {x: -dir.y, y: dir.x};
                      d.pos = Utils.add(d.pos, Utils.mult(perp, stats.droneSpeed * 0.5 * 60 * dt));
                  }
                  
                  // Fire check (Only if within attack range)
                  d.attackCooldown -= dt;
                  if (d.attackCooldown <= 0 && distToTarget <= stats.droneAttackRange) {
                      fireDroneShot(d, target.pos);
                      d.attackCooldown = 0.2; 
                  }

              } else {
                  // --- PATROL MODE ---
                  d.state = 'PATROL';
                  // Orbit owner
                  d.patrolAngle += dt * 2;
                  const offsetX = Math.cos(d.patrolAngle) * stats.dronePatrolRadius;
                  const offsetY = Math.sin(d.patrolAngle) * stats.dronePatrolRadius;
                  const targetPos = Utils.add(owner.pos, {x: offsetX, y: offsetY});
                  
                  // Move smoothly to patrol point
                  const toPoint = Utils.sub(targetPos, d.pos);
                  const dist = Utils.mag(toPoint);
                  if (dist > 10) {
                      const moveDir = Utils.normalize(toPoint);
                      d.pos = Utils.add(d.pos, Utils.mult(moveDir, stats.droneSpeed * 60 * dt));
                  }
              }
          }
          
          // Clamp to map
          d.pos.x = Utils.clamp(d.pos.x, 20, MAP_SIZE.width - 20);
          d.pos.y = Utils.clamp(d.pos.y, 20, MAP_SIZE.height - 20);
      });
  };

  const fireDroneShot = (drone: Drone, targetPos: Vector2) => {
      const dir = Utils.normalize(Utils.sub(targetPos, drone.pos));
      // Light spread
      const angle = Math.atan2(dir.y, dir.x) + (Math.random()-0.5)*0.1;
      const vel = {x: Math.cos(angle)*15, y: Math.sin(angle)*15};
      
      stateRef.current.projectiles.push({
          id: Math.random().toString(),
          ownerId: drone.ownerId,
          pos: drone.pos,
          vel: vel,
          radius: 3,
          mass: 1,
          color: '#6ee7b7',
          damage: CHAR_STATS[CharacterType.TANK].droneDamage,
          projectileType: 'DRONE_SHOT', // Special type
          life: 1.0, maxLife: 1.0
      });

      // Throttled sound
      if (performance.now() - lastDroneSoundTimeRef.current > 200) {
         Sound.playShot('LMG'); 
         lastDroneSoundTimeRef.current = performance.now();
      }
  };

  const detonateMagmaPools = (p: PlayerState) => {
      const state = stateRef.current;
      let exploded = false;
      const newEffects: GroundEffect[] = [];

      state.groundEffects.forEach(g => {
          if (g.type === 'MAGMA_POOL') {
              exploded = true;
              
              // Visuals
              spawnParticles(g.pos, 25, '#f97316', 8, 0.6);
              state.particles.push({
                 id: Math.random().toString(),
                 pos: g.pos,
                 vel: {x:0, y:0},
                 life: 0.2, maxLife: 0.2,
                 color: 'rgba(255, 100, 0, 0.4)',
                 size: 200
              });

              // Mechanics: Players
              [state.player, state.enemy].forEach(t => {
                  if (t.isDead) return;
                  const dist = Utils.dist(g.pos, t.pos);
                  if (dist < 200 + t.radius) { // Explosion Radius
                       // Damage
                       if (t.id !== g.ownerId) {
                           takeDamage(t, 150, CharacterType.PYRO); // Burst damage
                       }
                       
                       // Knockback (All units)
                       const dir = Utils.normalize(Utils.sub(t.pos, g.pos));
                       applyKnockback(t, dir, 800);

                       // Burn (Non-Pyro)
                       if (t.type !== CharacterType.PYRO) {
                           t.burnTimer = 5.0;
                           t.flameExposure = 100;
                           state.floatingTexts.push({
                               id: Math.random().toString(),
                               pos: { x: t.pos.x, y: t.pos.y - t.radius - 50 },
                               text: "爆燃！",
                               color: '#ef4444',
                               life: 1.0, maxLife: 1.0, velY: -3
                           });
                       }
                  }
              });

              // Mechanics: Drones (Explosions hit air units)
              state.drones.forEach(d => {
                  if (d.hp > 0 && !d.isDocked) {
                      const dist = Utils.dist(g.pos, d.pos);
                      if (dist < 200 + d.radius) {
                          d.hp -= 250; // Massive damage to light drones
                          // Drone Knockback
                          const dir = Utils.normalize(Utils.sub(d.pos, g.pos));
                          d.pos = Utils.add(d.pos, Utils.mult(dir, 100)); // Push away
                          
                          spawnParticles(d.pos, 10, '#f97316', 5);

                          if (d.hp <= 0) {
                               createExplosion(state, d.pos, 40, 0, p.id);
                               const owner = d.ownerId === state.player.id ? state.player : state.enemy;
                               owner.droneState = 'RECONSTRUCTING';
                               owner.droneTimer = 0;
                               owner.droneMaxTimer = CHAR_STATS[CharacterType.TANK].droneReconstructTime / 1000;
                          }
                      }
                  }
              });

          } else {
              newEffects.push(g);
          }
      });
      
      state.groundEffects = newEffects;

      if (exploded) {
          Sound.playExplosion();
          
          // Screen Shake
          state.camera.y += 5;
          state.camera.x += (Math.random()-0.5)*10;
      }
  };

  const handleWukongCombo = (p: PlayerState) => {
    if (p.disarmTimer > 0) return;
      if (p.attackCooldown > 0 || p.wukongChargeState !== 'NONE') return;

      const stats = CHAR_STATS[CharacterType.WUKONG];
      
      // Visuals & Logic
      p.wukongLastAttackTime = performance.now();
      
      if (p.wukongComboStep === 0) p.wukongLastAttackType = 'COMBO_1';
      else if (p.wukongComboStep === 1) p.wukongLastAttackType = 'COMBO_2';
      else p.wukongLastAttackType = 'COMBO_SMASH'; // Distinct from SKILL_SMASH

      const damage = stats.comboDamage[p.wukongComboStep];
      const knockback = stats.comboKnockback[p.wukongComboStep];
      
      let hitRange = 100; // Increased base range
      let hitArc = Math.PI / 1.5; 
      let knockbackDir = {x: Math.cos(p.aimAngle), y: Math.sin(p.aimAngle)};
      
      if (p.wukongComboStep === 2) {
          // Smash (3rd hit)
          hitRange = 180;
          hitArc = Math.PI / 3; 
          Sound.playSkill('SMASH_HIT');
          spawnParticles(Utils.add(p.pos, Utils.mult(knockbackDir, 100)), 20, '#fbbf24', 8, 0.4);
      } else {
          Sound.playShot('SWING');
      }

      // Hit Detection: Players AND Drones
      const enemyPlayer = p.id === 'player' ? stateRef.current.enemy : stateRef.current.player;
      const potentialTargets: any[] = [];
      if (!enemyPlayer.isDead) potentialTargets.push(enemyPlayer);
      stateRef.current.drones.forEach(d => {
          if (d.ownerId !== p.id && d.hp > 0 && !d.isDocked) potentialTargets.push(d);
      });

      potentialTargets.forEach(target => {
          const toTarget = Utils.sub(target.pos, p.pos);
          const dist = Utils.mag(toTarget);
          if (dist < hitRange + target.radius) {
              const angleToTarget = Math.atan2(toTarget.y, toTarget.x);
              let angleDiff = Math.abs(angleToTarget - p.aimAngle);
              angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
              
              if (Math.abs(angleDiff) < hitArc / 2) {
                  // HIT
                  if ('isSummon' in target) {
                      // Damage Drone
                      target.hp -= damage;
                      spawnParticles(target.pos, 5, '#6ee7b7', 4);
                      // Drones are too light for big knockback, destroy or push
                      const pushDir = Utils.normalize(toTarget);
                      target.pos = Utils.add(target.pos, Utils.mult(pushDir, knockback * 0.1));

                      // [Fix] Kill Logic for Drones
                      if (target.hp <= 0) {
                           createExplosion(stateRef.current, target.pos, 40, 0, p.id);
                           const owner = target.ownerId === stateRef.current.player.id ? stateRef.current.player : stateRef.current.enemy;
                           owner.droneState = 'RECONSTRUCTING';
                           owner.droneTimer = 0;
                           owner.droneMaxTimer = CHAR_STATS[CharacterType.TANK].droneReconstructTime / 1000;
                       }
                  } else {
                      // Damage Player
                      takeDamage(target, damage, CharacterType.WUKONG);
                      applyKnockback(target, knockbackDir, knockback);
                      spawnParticles(target.pos, 5, '#fef08a', 4);
                  }
                  Sound.playHit();
              }
          }
      });

      // Advance Combo
      p.wukongComboStep = (p.wukongComboStep + 1) % 3;
      p.wukongComboTimer = stats.comboWindow; 
      p.attackCooldown = p.wukongComboStep === 0 ? 0.6 : 0.4; 
  };

  const releaseWukongThrust = (p: PlayerState) => {
      const chargePct = Math.min(1, p.wukongChargeTime / p.wukongMaxCharge);
      const stats = CHAR_STATS[CharacterType.WUKONG];
      const damage = stats.thrustMinDmg + (stats.thrustMaxDmg - stats.thrustMinDmg) * chargePct;
      const range = 100 + (stats.thrustMaxRange - 100) * chargePct;
      
      p.wukongChargeState = 'NONE';
      p.wukongChargeTime = 0;
      p.attackCooldown = 0.5;
      p.wukongThrustTimer = 4.0; // Cooldown 4s
      
      p.wukongLastAttackTime = performance.now();
      p.wukongLastAttackType = 'THRUST';
      p.wukongLastChargePct = chargePct; // Store for render

      Sound.playSkill('THRUST');
      
      const dir = { x: Math.cos(p.aimAngle), y: Math.sin(p.aimAngle) };

      // Hit Detection
      const enemyPlayer = p.id === 'player' ? stateRef.current.enemy : stateRef.current.player;
      const potentialTargets: any[] = [];
      if (!enemyPlayer.isDead) potentialTargets.push(enemyPlayer);
      stateRef.current.drones.forEach(d => {
          if (d.ownerId !== p.id && d.hp > 0 && !d.isDocked) potentialTargets.push(d);
      });

      potentialTargets.forEach(target => {
          const toTarget = Utils.sub(target.pos, p.pos);
          const dot = toTarget.x * dir.x + toTarget.y * dir.y;
          const clampedDot = Utils.clamp(dot, 0, range);
          const closestPoint = Utils.add(p.pos, Utils.mult(dir, clampedDot));
          const distToLine = Utils.dist(target.pos, closestPoint);
          
          if (distToLine < target.radius + 20) { 
              if ('isSummon' in target) {
                 target.hp -= damage;
                 spawnParticles(target.pos, 5, '#6ee7b7', 4);
                 
                 // [Fix] Kill Logic for Drones
                 if (target.hp <= 0) {
                      createExplosion(stateRef.current, target.pos, 40, 0, p.id);
                      const owner = target.ownerId === stateRef.current.player.id ? stateRef.current.player : stateRef.current.enemy;
                      owner.droneState = 'RECONSTRUCTING';
                      owner.droneTimer = 0;
                      owner.droneMaxTimer = CHAR_STATS[CharacterType.TANK].droneReconstructTime / 1000;
                 }
              } else {
                 takeDamage(target, damage, CharacterType.WUKONG);
                 applyKnockback(target, dir, 800 * (1+chargePct)); 
                 spawnParticles(target.pos, 12, '#fef08a', 8);
              }
              Sound.playHit();
          }
      });
  };

  const releaseWukongSmash = (p: PlayerState) => {
      // 1. Calculate stats based on charge
      const chargePct = Math.min(1, p.wukongChargeTime / p.wukongMaxCharge);
      const stats = CHAR_STATS[CharacterType.WUKONG];
      
      const damage = stats.smashMinDmg + (stats.smashMaxDmg - stats.smashMinDmg) * chargePct;
      const range = stats.smashMinRange + (stats.smashMaxRange - stats.smashMinRange) * chargePct;
      const width = stats.smashWidthMin + (stats.smashWidthMax - stats.smashWidthMin) * chargePct;

      // 2. Reset State
      p.wukongChargeState = 'NONE';
      p.wukongChargeTime = 0;
      p.wukongChargeHoldTimer = 0;
      p.skillCooldown = stats.skillCooldown / 1000;
      
      // 3. Render State
      p.wukongLastAttackTime = performance.now();
      p.wukongLastAttackType = 'SKILL_SMASH'; // Distinct type for Skill
      p.wukongLastChargePct = chargePct;

      Sound.playSkill('SMASH_HIT');
      
      const aimDir = { x: Math.cos(p.aimAngle), y: Math.sin(p.aimAngle) };
      const startPos = p.pos;
      const endPos = Utils.add(startPos, Utils.mult(aimDir, range));

      // 4. Terrain Destruction
      stateRef.current.obstacles = stateRef.current.obstacles.filter(obs => {
        if (obs.type === 'WATER') return true;
        const dist = Utils.distToSegment({x: obs.x + obs.width/2, y: obs.y + obs.height/2}, startPos, endPos);
        const collisionDist = width/2 + Math.max(obs.width, obs.height)/2; // Approximate collision
        if (dist < collisionDist) {
            spawnParticles({x: obs.x + obs.width/2, y: obs.y + obs.height/2}, 30, '#475569', 12, 1.2);
            return false; // Destroy wall
        }
        return true;
      });

      // 5. Ground Crack Visual
      stateRef.current.groundEffects.push({
          id: Math.random().toString(),
          pos: Utils.add(startPos, Utils.mult(aimDir, range/2)),
          radius: 0, // Unused for crack
          width: width,
          length: range,
          rotation: p.aimAngle,
          life: 2.0,
          maxLife: 2.0,
          type: 'CRACK',
          ownerId: p.id
      });
      
      // 6. Hit Detection
      const enemyPlayer = p.id === 'player' ? stateRef.current.enemy : stateRef.current.player;
      const potentialTargets: any[] = [];
      if (!enemyPlayer.isDead) potentialTargets.push(enemyPlayer);
      stateRef.current.drones.forEach(d => {
          if (d.ownerId !== p.id && d.hp > 0 && !d.isDocked) potentialTargets.push(d);
      });

      potentialTargets.forEach(target => {
          const distToSmash = Utils.distToSegment(target.pos, startPos, endPos);
          if (distToSmash < width/2 + target.radius) {
              if ('isSummon' in target) {
                  target.hp -= damage;
                  spawnParticles(target.pos, 10, '#6ee7b7', 8);

                  // [Fix] Kill Logic for Drones
                  if (target.hp <= 0) {
                       createExplosion(stateRef.current, target.pos, 40, 0, p.id);
                       const owner = target.ownerId === stateRef.current.player.id ? stateRef.current.player : stateRef.current.enemy;
                       owner.droneState = 'RECONSTRUCTING';
                       owner.droneTimer = 0;
                       owner.droneMaxTimer = CHAR_STATS[CharacterType.TANK].droneReconstructTime / 1000;
                  }
              } else {
                  takeDamage(target, damage, CharacterType.WUKONG);
                  applyKnockback(target, aimDir, 900 + 300 * chargePct);
                  target.slowTimer = 1.5;
                  spawnParticles(target.pos, 15, '#ef4444', 10);
              }
              Sound.playHit();
          }
      });

      // 7. Screen Shake
      if (chargePct > 0.5) {
         stateRef.current.camera.y += 5 * chargePct;
      }
  };

  const applyKnockback = (target: PlayerState, dir: Vector2, force: number) => {
      // Unified Super Armor for ANY Wukong charge state
      if (target.type === CharacterType.WUKONG && target.wukongChargeState !== 'NONE') {
          force *= 0.2; // 80% Resistance
      }
      const impulse = force * 2;
      const dv = Utils.mult(dir, impulse / target.mass);
      target.vel = Utils.add(target.vel, dv);
  };

  // --- Main Loop ---

  const update = (deltaTime: number) => {
    const state = stateRef.current;
    if (state.gameStatus !== 'PLAYING') return;

    // Capture previous status for floating text detection
    const prevStatus = new Map<string, {wet: boolean, burn: boolean, slow: boolean, overheat: boolean}>();
    [state.player, state.enemy].forEach(p => {
        prevStatus.set(p.id, {
            wet: p.isWet,
            burn: p.burnTimer > 0,
            slow: p.slowTimer > 0,
            overheat: p.isOverheated
        });
    });

    // Death Checks
    const checkDeath = (entity: PlayerState) => {
       if (entity.hp <= 0 && !entity.isDead) {
          // 教练球特殊复活机制
          if (entity.type === CharacterType.COACH) {
              // 1. 播放爆炸特效
              createExplosion(state, entity.pos, 80, 0, 'system', true);
              Sound.playUI('START'); // 播放一个重置音效

              // 2. 浮动文字提示
              state.floatingTexts.push({
                   id: Math.random().toString(),
                   pos: {x: entity.pos.x, y: entity.pos.y - 50},
                   text: "复活!",
                   color: '#ffffff',
                   life: 2.0, maxLife: 2.0, velY: -2
              });

              // 3. 瞬间满血并传送回中心
              entity.hp = entity.maxHp;
              entity.pos = { x: MAP_SIZE.width / 2, y: MAP_SIZE.height / 2 };
              entity.vel = { x: 0, y: 0 };
              
              // 4. 清除身上的负面状态
              entity.burnTimer = 0;
              entity.slowTimer = 0;
              entity.flameExposure = 0;
              entity.disarmTimer = 0;
              entity.silenceTimer = 0;
              entity.fearTimer = 0;
              entity.paralysisTimer = 0;

              return;
          }

          // CAT NINE LIVES MECHANIC
          if (entity.type === CharacterType.CAT && (entity.lives || 0) > 1) {
              entity.lives = (entity.lives || 1) - 1;
              entity.hp = entity.maxHp; // Full Heal
              entity.invincibleTimer = 1.5; // I-Frames
              
              // Teleport to safe location (Far from enemy)
              const enemyPos = entity.id === 'player' ? state.enemy.pos : state.player.pos;
              let safePos = entity.pos;
              let bestDist = 0;
              for(let i=0; i<5; i++) {
                   const p = getRandomEdgePos();
                   const d = Utils.dist(p, enemyPos);
                   if (d > bestDist) {
                       bestDist = d;
                       safePos = p;
                   }
              }
              entity.pos = safePos;
              
              // Effects
              Sound.playSkill('SWITCH'); // Smoke sound
              spawnParticles(entity.pos, 30, '#d1d5db', 8, 1.5); // Smoke
              state.floatingTexts.push({
                   id: Math.random().toString(),
                   pos: {x: entity.pos.x, y: entity.pos.y - 50},
                   text: `剩余命数: ${entity.lives}`,
                   color: '#fbbf24',
                   life: 2.0, maxLife: 2.0, velY: -2
              });
              return;
          }

          // NORMAL DEATH
          entity.isDead = true;
          if (entity.type === CharacterType.CAT) {
              entity.lives = 0;
          }
          Sound.playExplosion();
          if (entity.type === CharacterType.PYRO) {
             spawnParticles(entity.pos, 120, '#EEEEEE', 15, 2.5, 0.85);
          } else if (entity.type === CharacterType.CAT) {
             // Cat turns into smoke
             spawnParticles(entity.pos, 50, '#fef3c7', 5, 2);
          } else {
             createExplosion(state, entity.pos, 80, 0, 'system', true);
             spawnParticles(entity.pos, 50, entity.color, 10, 2);
          }
       }
    };
    
    checkDeath(state.player);
    checkDeath(state.enemy);

    if (state.player.isDead) {
        state.player.matchEndTimer += deltaTime;
        if (state.player.matchEndTimer > 2.0) {
            state.gameStatus = 'DEFEAT';
            Sound.playUI('DEFEAT');
        }
    } else {
        handlePlayerInput(state.player, deltaTime);
    }

    if (state.enemy.isDead) {
        state.enemy.matchEndTimer += deltaTime;
        if (state.enemy.matchEndTimer > 2.0) {
            state.gameStatus = 'VICTORY';
            Sound.playUI('VICTORY');
        }
    } else {
        handleAI(state.enemy, state.player, deltaTime);
    }

    // 3. Physics & Collisions
    [state.player, state.enemy].forEach(entity => {
      if (entity.isDead) return;

      entity.pos = Utils.add(entity.pos, Utils.mult(entity.vel, deltaTime * 60));
      entity.vel = Utils.mult(entity.vel, PHYSICS.FRICTION);
      
      // Walls
      if (entity.pos.x < entity.radius) { entity.pos.x = entity.radius; entity.vel.x *= -0.5; }
      if (entity.pos.y < entity.radius) { entity.pos.y = entity.radius; entity.vel.y *= -0.5; }
      if (entity.pos.x > MAP_SIZE.width - entity.radius) { entity.pos.x = MAP_SIZE.width - entity.radius; entity.vel.x *= -0.5; }
      if (entity.pos.y > MAP_SIZE.height - entity.radius) { entity.pos.y = MAP_SIZE.height - entity.radius; entity.vel.y *= -0.5; }

      // Reset vault flag before checking
      entity.isVaulting = false;

      // Obstacles & Water Logic
      let isInWater = false;
      state.obstacles.forEach(obs => {
        if (entity.type === CharacterType.CAT && entity.isPouncing) return;
        const col = Utils.checkCircleRectCollision(entity.pos, entity.radius, obs);
        
        // Physics Collision
        if (col.collided) {
          if (obs.type === 'WATER') {
              // Strict Water Check: Only wet if CENTER is deeply inside
              const padding = 15; 
              const inRectX = entity.pos.x >= obs.x + padding && entity.pos.x <= obs.x + obs.width - padding;
              const inRectY = entity.pos.y >= obs.y + padding && entity.pos.y <= obs.y + obs.height - padding;
              
              if (inRectX && inRectY) {
                  isInWater = true;
              }

              // Physical: Non-Wukong characters bounce off (treated as wall)
              // Wukong can enter freely.
              if (entity.type !== CharacterType.WUKONG) {
                  entity.pos = Utils.add(entity.pos, Utils.mult(col.normal, col.overlap));
                  const dot = entity.vel.x * col.normal.x + entity.vel.y * col.normal.y;
                  entity.vel = Utils.sub(entity.vel, Utils.mult(col.normal, 2 * dot));
              }
          }
          else if (entity.type === CharacterType.WUKONG && obs.type === 'WALL') {
               // Wukong Smart Vaulting Logic
               // Determine orientation of hit
               const isHorizontalHit = Math.abs(col.normal.x) > Math.abs(col.normal.y);
               
               // If hitting side, we must cross the Width. If hitting top/bottom, we must cross Height.
               const distanceToVault = isHorizontalHit ? obs.width : obs.height;
               
               if (distanceToVault < 130) {
                   // Vault successful
                   // Check if near edge for animation/penalty
                   const distToLeft = entity.pos.x - obs.x;
                   const distToRight = (obs.x + obs.width) - entity.pos.x;
                   const distToTop = entity.pos.y - obs.y;
                   const distToBottom = (obs.y + obs.height) - entity.pos.y;
                   
                   // Distance from center to nearest edge
                   const minDist = Math.min(Math.abs(distToLeft), Math.abs(distToRight), Math.abs(distToTop), Math.abs(distToBottom));
                   
                   // If we are touching the edge (transitioning)
                   if (minDist < entity.radius) {
                       entity.isVaulting = true;
                       entity.vel = Utils.mult(entity.vel, 0.5); // 50% penalty
                   }
                   // Else: Free movement on top of the wall (no drag, no jitter)
               } else {
                   // Wall too thick to vault from this angle -> Block
                   entity.pos = Utils.add(entity.pos, Utils.mult(col.normal, col.overlap));
                   const dot = entity.vel.x * col.normal.x + entity.vel.y * col.normal.y;
                   entity.vel = Utils.sub(entity.vel, Utils.mult(col.normal, 2 * dot));
               }
          } else {
              // Standard Wall Collision
              entity.pos = Utils.add(entity.pos, Utils.mult(col.normal, col.overlap));
              const dot = entity.vel.x * col.normal.x + entity.vel.y * col.normal.y;
              entity.vel = Utils.sub(entity.vel, Utils.mult(col.normal, 2 * dot));
          }
        }
      });
      entity.isWet = isInWater;
      
      if (isInWater && entity.type === CharacterType.WUKONG) {
           // Wukong entering/moving in water visual
           if (Math.random() < 0.05) {
               stateRef.current.particles.push({
                  id: Math.random().toString(),
                  pos: Utils.add(entity.pos, {x: (Math.random()-0.5)*20, y: (Math.random()-0.5)*20}),
                  vel: {x:0, y:0},
                  life: 0.5, maxLife: 0.5,
                  color: '#bae6fd', size: 3
               });
           }
      }
    });

    // Ball vs Ball
    // Ball vs Ball
    if (!state.player.isDead && !state.enemy.isDead) {
        const distVec = Utils.sub(state.player.pos, state.enemy.pos);
        const dist = Utils.mag(distVec);
        const minDist = state.player.radius + state.enemy.radius;

        if (dist < minDist) {
            // 检查是否有猫猫球正在飞扑
            const p1 = state.player;
            const p2 = state.enemy;
            const p1Pouncing = p1.type === CharacterType.CAT && p1.isPouncing;
            const p2Pouncing = p2.type === CharacterType.CAT && p2.isPouncing;

            // 如果有人在飞扑，跳过物理碰撞(穿人)，只做逻辑判定
            if (p1Pouncing || p2Pouncing) {
            } 
            else {
                // 物理碰撞逻辑 (推挤 + 弹射)
                const normal = Utils.normalize(distVec);
                const overlap = minDist - dist;
                const m1 = state.player.mass;
                const m2 = state.enemy.mass;
                const totalMass = m1 + m2;
                
                state.player.pos = Utils.add(state.player.pos, Utils.mult(normal, overlap * (m2 / totalMass)));
                state.enemy.pos = Utils.sub(state.enemy.pos, Utils.mult(normal, overlap * (m1 / totalMass)));

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
    }

    updateProjectiles(state, deltaTime);
    updateGroundEffects(state, deltaTime);
    updateDrones(state, deltaTime);
    updateParticles(state, deltaTime);
    updateFloatingTexts(state, deltaTime);
    
    // 猫猫球飞扑互动逻辑
    const handlePounceInteraction = (cat: PlayerState, target: PlayerState) => {
        if (cat.type === CharacterType.CAT && cat.isPouncing && !cat.hasPounceHit && !target.isDead) {
            const dist = Utils.dist(cat.pos, target.pos);
            if (dist < cat.radius + target.radius) {
                target.slowTimer = 2.5; 
                target.disarmTimer = 2.5; 
                if (!isMechanical(target)) {
                    target.silenceTimer = 2.5; // 沉默只对生物有效
                }
                
                if (target.type === CharacterType.WUKONG) {
                    target.wukongChargeState = 'NONE'; 
                    target.wukongChargeTime = 0;       
                    target.wukongChargeHoldTimer = 0;
                    target.wukongLastAttackType = 'NONE';
                    target.attackCooldown = 0.5;
                }

                takeDamage(target, CHAR_STATS[CharacterType.CAT].pounceDamage, CharacterType.CAT);
                spawnParticles(target.pos, 15, '#f0abfc', 6); 
                Sound.playShot('SCRATCH');
                
                // 标记已命中，防止单次飞扑多次伤害
                cat.hasPounceHit = true;
                
                state.floatingTexts.push({
                     id: Math.random().toString(), pos: {x: target.pos.x, y: target.pos.y - 60},
                     text: "减速", color: '#94a3b8', life: 1.0, maxLife: 1.0, velY: -1
                });
                state.floatingTexts.push({
                     id: Math.random().toString(), pos: {x: target.pos.x, y: target.pos.y - 40},
                     text: "缴械", color: '#f87171', life: 1.0, maxLife: 1.0, velY: -1
                });
                if (!isMechanical(target)) {
                    state.floatingTexts.push({
                         id: Math.random().toString(), pos: {x: target.pos.x, y: target.pos.y - 20},
                         text: "沉默", color: '#c084fc', life: 1.0, maxLife: 1.0, velY: -1
                    });
                }
            }
        }
    };

    handlePounceInteraction(state.player, state.enemy);
    handlePounceInteraction(state.enemy, state.player);

    updateStatus(state.player, deltaTime);
    updateStatus(state.enemy, deltaTime);

    // EMP 攻击接口
    const applyEmp = (target: any) => {
        if (isMechanical(target)) {
            target.paralysisTimer = 5.0; 
            target.disarmTimer = 5.0;
            target.silenceTimer = 5.0;
            
            target.hp -= 300; 
            
            state.floatingTexts.push({
                id: Math.random().toString(), pos: {x: target.pos.x, y: target.pos.y-50},
                text: "⚡瘫痪⚡", color: '#0ea5e9', life: 1.5, maxLife: 1.5, velY: -1
            });
        }
    };

    // Check status changes and spawn floating text
    [state.player, state.enemy].forEach(p => {
        const prev = prevStatus.get(p.id);
        if (!prev) return;
        
        const spawnText = (text: string, color: string) => {
             state.floatingTexts.push({
                id: Math.random().toString(),
                pos: { x: p.pos.x, y: p.pos.y - p.radius - 30 },
                text: text,
                color: color,
                life: 1.0, maxLife: 1.0, velY: -2 // Slow float up
             });
        }
        
        if (!prev.wet && p.isWet) spawnText("湿身", '#38bdf8');
        if (!prev.burn && p.burnTimer > 0) spawnText("灼烧", '#f97316');
        if (!prev.slow && p.slowTimer > 0) spawnText("减速", '#94a3b8');
        if (!prev.overheat && p.isOverheated) spawnText("过热", '#ef4444');
    });

    updateCamera(state);
  };

  const handlePlayerInput = (p: PlayerState, dt: number) => {
    if (p.paralysisTimer > 0) {
        p.vel = Utils.mult(p.vel, 0.8); // 快速急停
        return;
    }

    let speedMult = 1.0;
    
    // Tank LMG Speed Boost
    if (p.type === CharacterType.TANK && p.tankMode === TankMode.LMG) {
        speedMult = 1.6; 
    }

    if (p.slowTimer > 0) {
        speedMult *= 0.4;
    }

    // Wukong Charging Slow / Stop
    if (p.type === CharacterType.WUKONG && p.wukongChargeState !== 'NONE') {
        if (p.wukongChargeState === 'SMASH') {
            speedMult = 0; // Rooted when charging Smash
        } else {
            speedMult *= 0.3; // Very slow while charging Thrust
        }
    }
    
    // Cat Charging Slow
    if (p.type === CharacterType.CAT && p.catIsCharging) {
        // [修改] 只有蓄力超过 0.3 秒才开始减速
        const chargeDuration = (performance.now() - (p.catChargeStartTime || 0)) / 1000;
        if (chargeDuration > 0.3) {
             speedMult *= 0.2; 
        }
    }

    if (p.type === CharacterType.CAT && p.isPouncing) {
        // 飞扑时只处理旋转（允许空中调整朝向），但不处理位移
        const worldMouse = Utils.add(mouseRef.current, stateRef.current.camera);
        const aimDir = Utils.sub(worldMouse, p.pos);
        const targetAimAngle = Math.atan2(aimDir.y, aimDir.x);
        p.aimAngle = targetAimAngle;
        
        // 还可以加一点空气阻力让它停得更自然
        p.vel = Utils.mult(p.vel, 0.98); 
        return; 
    }

    // 恐惧状态：强制反向移动 (远离敌人)
    if (p.fearTimer > 0) {
        const enemy = stateRef.current.enemy;
        const runDir = Utils.normalize(Utils.sub(p.pos, enemy.pos));
        const fearSpeed = CHAR_STATS[p.type].speed * 0.6; 
        p.vel = Utils.add(p.vel, Utils.mult(runDir, PHYSICS.ACCELERATION_SPEED * fearSpeed * dt * 60));
        p.angle = Math.atan2(runDir.y, runDir.x);
        return;
    }

    let accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[p.type].speed * speedMult; 
    
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
      
      if (p.type === CharacterType.TANK && p.tankMode === TankMode.LMG && Math.random() < 0.8) {
          stateRef.current.particles.push({
             id: Math.random().toString(),
             pos: Utils.add(p.pos, {x: (Math.random()-0.5)*20, y: (Math.random()-0.5)*20}),
             vel: Utils.mult(p.vel, -0.5),
             life: 0.8,
             maxLife: 0.8,
             color: '#6ee7b7', 
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

    // --- CHARACTER SPECIFIC INPUT UPDATES ---
    
    if (p.type === CharacterType.WUKONG) {
        // Charge Logic
        if (p.wukongChargeState !== 'NONE') {
            p.wukongChargeTime += dt;
            if (p.wukongChargeTime >= p.wukongMaxCharge) {
                p.wukongChargeTime = p.wukongMaxCharge;
                if (p.wukongChargeState === 'THRUST') {
                    releaseWukongThrust(p);
                } else if (p.wukongChargeState === 'SMASH') {
                    // Start holding timer
                    p.wukongChargeHoldTimer += dt;
                    if (p.wukongChargeHoldTimer >= 1.0) {
                        releaseWukongSmash(p);
                    }
                }
            }
        }
    }
    else if (p.type === CharacterType.PYRO) {
      const distToMouse = Utils.dist(p.pos, worldMouse);
      const { range, angle } = calculatePyroShape(distToMouse);
      p.currentWeaponRange = range;
      p.currentWeaponAngle = angle;

      if (keysRef.current['MouseLeft']) {
        if (!p.isOverheated) {
          p.isFiringFlamethrower = true;
          p.heat += CHAR_STATS[CharacterType.PYRO].heatGen * dt;
          if (p.heat >= p.maxHeat) {
            p.heat = p.maxHeat;
            p.isOverheated = true;
            Sound.playOverheat();
            spawnParticles(p.pos, 15, '#ffffff', 5, 0.5);
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
        p.attackCooldown = 1.5;
        Sound.playSkill('SWITCH');
        spawnParticles(p.pos, 5, '#ffffff');
        
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
    if (ai.paralysisTimer > 0) {
        ai.vel = Utils.mult(ai.vel, 0.8); // 快速急停
        return;
    }

    // 恐惧状态：强制远离目标，跳过决策
    if (ai.fearTimer > 0) {
        const runDir = Utils.normalize(Utils.sub(ai.pos, target.pos));
        const fearSpeed = CHAR_STATS[ai.type].speed * 0.6;
        ai.vel = Utils.add(ai.vel, Utils.mult(runDir, PHYSICS.ACCELERATION_SPEED * fearSpeed * dt * 60));
        ai.angle = Math.atan2(runDir.y, runDir.x);
        return; 
    }

    // 教练球 AI
    if (ai.type === CharacterType.COACH) {
        if (Math.random() < 0.02) { // 约每秒一次改变方向
            const randAngle = Math.random() * Math.PI * 2;
            ai.aimAngle = randAngle;
            ai.angle = randAngle;
        }

        const moveDir = { x: Math.cos(ai.angle), y: Math.sin(ai.angle) };
        const accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[CharacterType.COACH].speed;
        
        const distToCenter = Utils.dist(ai.pos, {x: MAP_SIZE.width/2, y: MAP_SIZE.height/2});
        if (distToCenter > 500) {
             const toCenter = Utils.normalize(Utils.sub({x: MAP_SIZE.width/2, y: MAP_SIZE.height/2}, ai.pos));
             ai.vel = Utils.add(ai.vel, Utils.mult(toCenter, accel * dt * 60));
             ai.angle = Math.atan2(toCenter.y, toCenter.x);
        } else {
             ai.vel = Utils.add(ai.vel, Utils.mult(moveDir, accel * dt * 60));
        }
        
        return;
    }

    if (ai.type === CharacterType.CAT) {
        // Cat AI Strategy
        const distToTarget = Utils.dist(ai.pos, target.pos);
        const moveDir = Utils.normalize(Utils.sub(target.pos, ai.pos));
        
        ai.aimAngle = Math.atan2(moveDir.y, moveDir.x);
        ai.angle = ai.aimAngle;
        
        let speedMult = 1.0;
        if (ai.slowTimer > 0) speedMult *= 0.4;
        
        const canPounce = ai.pounceCooldown <= 0 && !ai.catIsCharging && !ai.isPouncing && ai.disarmTimer <= 0 && ai.silenceTimer <= 0;
        
        if (canPounce) {
            let wantToPounce = false;
            
            // 策略 A: 远距离突袭 (Gap Close)
            if (distToTarget > 350) {
                if (Math.random() < 0.03) wantToPounce = true; // 每帧 ~3% 概率 (约 0.5秒判定一次)
            }
            // 策略 B: 中距离博弈 (Combat Mix-up)
            else if (distToTarget > 150) {
                if (Math.random() < 0.01) wantToPounce = true; // 每帧 ~1% 概率 (约 1.5秒判定一次)
            }
            // 策略 C: 贴脸不飞扑，直接挠 (Scratch priority)
            
            if (wantToPounce) {
                ai.catIsCharging = true;
                ai.catChargeStartTime = performance.now();
            }
        }

        // 处理蓄力与释放
        if (ai.catIsCharging) {
            speedMult *= 0.2; // 蓄力减速
            const chargeTime = (performance.now() - (ai.catChargeStartTime || 0)) / 1000;
            
            const desiredChargeTime = distToTarget > 300 ? 0.8 + Math.random() * 0.2 : 0.4 + Math.random() * 0.2;
            
            if (chargeTime > desiredChargeTime) {
                ai.catIsCharging = false;
                handleCatPounce(ai, chargeTime);
            }
        } 
        else {
            if (ai.pounceCooldown > 0.5 && distToTarget < 100) {
                 const perp = { x: -moveDir.y, y: moveDir.x };
                 const retreatDir = Utils.sub(Utils.mult(perp, Math.sin(Date.now()/500)), moveDir); // 螺旋后退
                 ai.vel = Utils.add(ai.vel, Utils.mult(Utils.normalize(retreatDir), PHYSICS.ACCELERATION_SPEED * CHAR_STATS[CharacterType.CAT].speed * 0.8 * dt * 60));
            } else {
                 const accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[CharacterType.CAT].speed * speedMult;
                 ai.vel = Utils.add(ai.vel, Utils.mult(moveDir, accel * dt * 60));
            }

            if (distToTarget < CHAR_STATS[CharacterType.CAT].scratchRange + 20) {
                handleCatScratch(ai);
            }
            if (ai.secondarySkillCooldown <= 0 && Math.random() < 0.02) handleCatHiss(ai);
            if (ai.skillCooldown <= 0 && Math.random() < 0.01) handleCatScooper(ai);
        }
    }
    else if (ai.type === CharacterType.WUKONG) {
        // --- AI Target Selection Strategy ---
        // 1. Is enemy player dead? Target Drones.
        // 2. Is enemy player very far (> 700)? Check if Drones are close.
        let actualTarget = target;
        let targetingSummon = false;

        if (target.isDead) {
             // Find nearest drone
             let minDist = 9999;
             stateRef.current.drones.forEach(d => {
                 if (d.ownerId !== ai.id && d.hp > 0 && !d.isDocked) {
                     const dist = Utils.dist(ai.pos, d.pos);
                     if (dist < minDist) {
                         minDist = dist;
                         actualTarget = d as any; // Temporary cast to match PlayerState interface for pos/radius
                         targetingSummon = true;
                     }
                 }
             });
        } else {
             const distToPlayer = Utils.dist(ai.pos, target.pos);
             if (distToPlayer > 700) {
                 // Player far away, check for closer juicy targets
                 let minDist = 9999;
                 let bestDrone = null;
                 stateRef.current.drones.forEach(d => {
                     if (d.ownerId !== ai.id && d.hp > 0 && !d.isDocked) {
                         const dist = Utils.dist(ai.pos, d.pos);
                         if (dist < 500 && dist < minDist) { // Prioritize drones closer than 500
                             minDist = dist;
                             bestDrone = d;
                         }
                     }
                 });
                 if (bestDrone) {
                     actualTarget = bestDrone as any;
                     targetingSummon = true;
                 }
             }
        }
        
        const distToTarget = Utils.dist(ai.pos, actualTarget.pos);
        const moveDir = Utils.normalize(Utils.sub(actualTarget.pos, ai.pos));
        
        // --- MOVEMENT LOGIC FIX ---
        // AI must respect Charge State (Root/Slow) and Slow Status
        let speedMult = 1.0;
        if (ai.slowTimer > 0) speedMult *= 0.4;
        
        if (ai.wukongChargeState === 'SMASH') speedMult = 0; // Rooted
        else if (ai.wukongChargeState === 'THRUST') speedMult *= 0.3; // Slowed

        if (speedMult > 0) {
            let accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[CharacterType.WUKONG].speed * speedMult;
            ai.vel = Utils.add(ai.vel, Utils.mult(moveDir, accel * dt * 60));
        }

        const aimDir = Utils.sub(actualTarget.pos, ai.pos);
        ai.aimAngle = Math.atan2(aimDir.y, aimDir.x);
        ai.angle = ai.aimAngle;
        
        // Attack Logic
        if (distToTarget < 150 && ai.attackCooldown <= 0) {
            handleWukongCombo(ai);
        }
        
        // Use Smash Skill
        if (ai.skillCooldown <= 0 && ai.wukongChargeState === 'NONE') {
            let wantSmash = false;
            let chargeTime = 1.5;

            if (distToTarget < 500) { 
                const obstacles = stateRef.current.obstacles;
                const hasWall = obstacles.some(obs => {
                    if (obs.type !== 'WALL') return false;
                    const center = {x: obs.x + obs.width/2, y: obs.y + obs.height/2};
                    const d = Utils.distToSegment(center, ai.pos, actualTarget.pos);
                    const size = Math.max(obs.width, obs.height) / 2;
                    return d < size + 20;
                });
                
                if (hasWall) {
                    wantSmash = true;
                    chargeTime = 1.5; // 满蓄力以确保最大破坏和距离
                }
            }

            if (!wantSmash && distToTarget > 200 && distToTarget < 450) {
                if (Math.random() < 0.02) { 
                    wantSmash = true;
                    chargeTime = 1.0 + Math.random() * 0.5;
                }
            }

            if (wantSmash) {
                ai.wukongChargeState = 'SMASH';
                ai.wukongMaxCharge = chargeTime;
                ai.wukongChargeTime = 0;
                ai.wukongChargeHoldTimer = 0;
            }
        }

        // Use Thrust if cooldown available and range appropriate (simple AI logic)
        if (distToTarget > 150 && distToTarget < 300 && ai.wukongThrustTimer <= 0 && ai.wukongChargeState === 'NONE' && ai.skillCooldown > 0) {
             ai.wukongChargeState = 'THRUST';
             ai.wukongMaxCharge = 0.8;
             ai.wukongChargeTime = 0;
        }
        
        if (ai.wukongChargeState !== 'NONE') {
            ai.wukongChargeTime += dt;
            if (ai.wukongChargeTime >= ai.wukongMaxCharge) {
                ai.wukongChargeTime = ai.wukongMaxCharge;
                if (ai.wukongChargeState === 'SMASH') {
                    // AI also respects hold limit
                    ai.wukongChargeHoldTimer += dt;
                    if (ai.wukongChargeHoldTimer >= 1.0) releaseWukongSmash(ai);
                } else {
                    releaseWukongThrust(ai);
                }
            }
        }
    }
    else if (ai.type === CharacterType.PYRO) {
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

        const { range: aiRange, angle: aiAngle } = calculatePyroShape(distToTarget);
        ai.currentWeaponRange = aiRange;
        ai.currentWeaponAngle = aiAngle;

        const aimDir = Utils.sub(target.pos, ai.pos);
        const targetAimAngle = Math.atan2(aimDir.y, aimDir.x);
        
        ai.aimAngle = targetAimAngle; 
        
        let moveVec = { x: 0, y: 0 };
        const range = CHAR_STATS[CharacterType.PYRO].flamethrowerRange;
        const idealRange = range * 0.9;
        
        if (distToTarget > idealRange) {
            moveVec = Utils.normalize(aimDir);
        } else {
            const perp = { x: -aimDir.y, y: aimDir.x };
            const strafeDir = Utils.normalize(perp);
            const strafeFactor = Math.sin(Date.now() / 800);
            moveVec = Utils.add(Utils.mult(Utils.normalize(aimDir), 0.1), Utils.mult(strafeDir, strafeFactor));
        }
        
        if (ai.burstTimer === undefined) ai.burstTimer = 0;
        if (ai.burstTimer > 0) ai.burstTimer -= dt;

        const inRange = distToTarget < range + 20;

        if (inRange && ai.burstTimer <= 0 && !ai.isOverheated) {
            ai.burstTimer = 1.0 + Math.random() * 0.5;
        }
        
        const shouldFire = (inRange || ai.burstTimer > 0) && !ai.isOverheated;

        if (shouldFire) {
            ai.isFiringFlamethrower = true;
            ai.heat += CHAR_STATS[CharacterType.PYRO].heatGen * dt;
            if (ai.heat >= ai.maxHeat) {
                ai.heat = ai.maxHeat;
                ai.isOverheated = true;
                ai.burstTimer = 0; 
                Sound.playOverheat();
                spawnParticles(ai.pos, 15, '#ffffff', 5, 0.5); 
            }
            fireFlamethrower(ai, dt);
        } else {
            ai.isFiringFlamethrower = false;
        }
        
        // Skill usage
        if (ai.skillCooldown <= 0 && distToTarget < 300) {
            Sound.playSkill('MAGMA');
            castMagmaPool(ai, target.pos);
        }
        
        // AI Detonate Logic: Strategic decision
        const pools = stateRef.current.groundEffects.filter(g => g.type === 'MAGMA_POOL');
        if (pools.length > 0) {
            let score = 0;
            // Blast radius is 200 + target radius.
            // But we use a conservative check for AI planning.
            const blastRadius = 200 + target.radius; 
            const poolRadius = 95; // From constants

            for(const pool of pools) {
                 const distToEnemy = Utils.dist(pool.pos, target.pos);
                 const distToSelf = Utils.dist(pool.pos, ai.pos);
                 
                 const enemyInBlast = distToEnemy < blastRadius;
                 const enemyInPool = distToEnemy < poolRadius;
                 const selfInPool = distToSelf < poolRadius;
                 
                 // Positive: Hit Enemy
                 if (enemyInBlast) {
                     score += 2; // Base Hit value
                     if (target.hp < 250) score += 8; // Execution value (Burst is ~150 + Burn)
                     
                     if (enemyInPool) {
                         // Negative: Enemy already suffering DOT
                         score -= 4;
                         
                         // Exception: Enemy Leaving
                         // If distance > 70% of radius, they are likely leaving
                         if (distToEnemy > poolRadius * 0.7) {
                             score += 6; // Catch them before they leave
                         }
                     }
                 }
                 
                 // Negative: Self Harm / Opportunity Cost
                 if (selfInPool) {
                     // If AI is hurt, prioritize healing
                     if (ai.hp < ai.maxHp * 0.8) score -= 6;
                 }
            }
            
            // Probabilistic Execution
            let probability = 0;
            if (score >= 6) probability = 0.4;       // Very High priority
            else if (score >= 2) probability = 0.05; // Beneficial
            else if (score > 0) probability = 0.01;  // Whim
            
            if (Math.random() < probability) {
                detonateMagmaPools(ai);
            }
        }

        if (moveVec.x !== 0 || moveVec.y !== 0) {
            moveVec = Utils.normalize(moveVec);
            // Apply Slow Logic
            let speedMult = 1.0;
            if (ai.slowTimer > 0) speedMult *= 0.4;
            
            const accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[ai.type].speed * speedMult;
            ai.vel = Utils.add(ai.vel, Utils.mult(moveVec, accel * dt * 60));
            ai.angle = Math.atan2(moveVec.y, moveVec.x);
        }
    } else if (ai.type === CharacterType.TANK) {
        // TANK AI
        const distToTarget = Utils.dist(ai.pos, target.pos);
        const aimDir = Utils.sub(target.pos, ai.pos);
        const targetAimAngle = Math.atan2(aimDir.y, aimDir.x);
        
        const diff = targetAimAngle - ai.aimAngle;
        const d = Math.atan2(Math.sin(diff), Math.cos(diff));
        const rotSpeed = CHAR_STATS[CharacterType.TANK].turretSpeed;
        const change = Utils.clamp(d, -rotSpeed * dt * 60, rotSpeed * dt * 60);
        ai.aimAngle += change;

        const optimalRange = ai.tankMode === TankMode.ARTILLERY ? 500 : 300;
        let moveVec = {x:0, y:0};
        if (distToTarget < optimalRange - 50) {
            moveVec = Utils.mult(Utils.normalize(aimDir), -1); 
        } else if (distToTarget > optimalRange + 50) {
            moveVec = Utils.normalize(aimDir); 
        } else {
            const perp = { x: -aimDir.y, y: aimDir.x };
            moveVec = Utils.mult(Utils.normalize(perp), Math.sin(Date.now() / 2000) * 0.5);
        }

        if (distToTarget < 250 && ai.tankMode === TankMode.ARTILLERY && ai.skillCooldown <= 0) {
            ai.tankMode = TankMode.LMG;
            ai.skillCooldown = 1;
            ai.attackCooldown = 1.5; 
            Sound.playSkill('SWITCH');
        } else if (distToTarget > 450 && ai.tankMode === TankMode.LMG && ai.skillCooldown <= 0) {
            ai.tankMode = TankMode.ARTILLERY;
            ai.skillCooldown = 1;
            ai.attackCooldown = 1.5; 
            Sound.playSkill('SWITCH');
        }

        if (ai.attackCooldown <= 0) {
            let isAligned = true;
            const diff = targetAimAngle - ai.aimAngle;
            const angleDist = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)));
            if (angleDist > 0.2) isAligned = false; 

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

        // TANK Drone AI logic
        if (ai.droneState === 'READY' && distToTarget < 600 && !target.isDead) {
            deployDrone(ai);
        }
        
        if (moveVec.x !== 0 || moveVec.y !== 0) {
            moveVec = Utils.normalize(moveVec);
            let speedMult = 1.0;
            // Tank specific speeds
            if (ai.tankMode === TankMode.LMG) speedMult = 1.6;
            if (ai.slowTimer > 0) speedMult *= 0.4;

            let accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[ai.type].speed * speedMult;
            if (ai.type === CharacterType.TANK) accel *= 0.8;
            ai.vel = Utils.add(ai.vel, Utils.mult(moveVec, accel * dt * 60));
            ai.angle = Math.atan2(moveVec.y, moveVec.x);
        }
    }
  };

  // --- Combat ---

  const fireFlamethrower = (p: PlayerState, dt: number) => {
    if (p.disarmTimer > 0) return;
    const now = performance.now();
    if (now - lastPyroSoundTimeRef.current > 120) {
        Sound.playShot('PYRO');
        lastPyroSoundTimeRef.current = now;
    }

    const range = p.currentWeaponRange || CHAR_STATS[CharacterType.PYRO].flamethrowerRange;
    const cone = p.currentWeaponAngle || CHAR_STATS[CharacterType.PYRO].flamethrowerAngle;

    const tip = Utils.add(p.pos, Utils.mult({ x: Math.cos(p.aimAngle), y: Math.sin(p.aimAngle) }, p.radius + 5));
    
    // 1. 核心喷射流 (Core): 极快、亮白/亮黄、小体积
    for(let i=0; i<2; i++) {
        const angleOffset = (Math.random() - 0.5) * cone * 0.5; // 核心更聚拢
        const finalAngle = p.aimAngle + angleOffset;
        const speed = 16 + Math.random() * 4; // 极快 (16~20)
        const baseLife = (range / (speed * 60)) * 0.8; // 寿命稍短
        
        stateRef.current.particles.push({
           id: Math.random().toString(),
           pos: { ...tip },
           vel: { x: Math.cos(finalAngle) * speed, y: Math.sin(finalAngle) * speed },
           life: baseLife, 
           maxLife: baseLife, 
           color: '#fef3c7', // 亮白/米色
           size: 2 + Math.random() * 1.5 
        });
    }
    // 2. 主体烈焰 (Body): 正常速度、橙红、中体积
    for (let i=0; i<4; i++) {
        const angleOffset = (Math.random() - 0.5) * 2 * cone; 
        const finalAngle = p.aimAngle + angleOffset;
        const speed = 12 + Math.random() * 4; // 正常快 (12~16)
        const baseLife = range / (speed * 60);
        
        stateRef.current.particles.push({
           id: Math.random().toString(),
           pos: { ...tip },
           vel: { x: Math.cos(finalAngle) * speed, y: Math.sin(finalAngle) * speed },
           life: baseLife * (0.9 + Math.random() * 0.3), 
           maxLife: baseLife, 
           color: Math.random() > 0.3 ? '#f59e0b' : '#ef4444', // 橙/红
           size: 2.5 + Math.random() * 2.5
        });
    }
    // 3. 边缘烟雾/余烬 (Smoke): 稍慢、深红/灰、大体积
    for(let i=0; i<2; i++) {
        const angleOffset = (Math.random() - 0.5) * 2.2 * cone; // 扩散更大
        const finalAngle = p.aimAngle + angleOffset;
        const speed = 8 + Math.random() * 4; // 稍慢
        const baseLife = range / (speed * 60);
        
        stateRef.current.particles.push({
           id: Math.random().toString(),
           pos: { ...tip },
           vel: { x: Math.cos(finalAngle) * speed, y: Math.sin(finalAngle) * speed },
           life: baseLife,
           maxLife: baseLife, 
           color: 'rgba(185, 28, 28, 0.4)', // 半透明深红
           size: 4 + Math.random() * 3,
           drag: 0.95 // 带一点阻力，产生拖尾感
        });
    }

    const enemies = p.id === 'player' ? [stateRef.current.enemy] : [stateRef.current.player];
    // Add Drones to enemies list
    stateRef.current.drones.forEach(d => {
        if (d.ownerId !== p.id && d.hp > 0 && !d.isDocked) enemies.push(d as any);
    });

    // Hit Logic
    enemies.forEach(e => {
       const toEnemy = Utils.sub(e.pos, p.pos);
       const distE = Utils.mag(toEnemy);
       if (distE < range) { 
         const angleToEnemy = Math.atan2(toEnemy.y, toEnemy.x);
         const angleDiff = Math.abs(angleToEnemy - p.aimAngle);
         const normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
         
         if (Math.abs(normalizedDiff) < cone) {
              if ('isSummon' in e) {
                  e.hp -= 350 * dt;
                  if (Math.random() < 0.2) spawnParticles(e.pos, 1, '#ef4444', 2, 0.5);
              } else {
                  e.flameExposure = Math.min(100, e.flameExposure + 2); 
                  e.burnTimer = 3.0;
                  const baseDmg = 95;
                  const rampMult = 1 + (e.flameExposure / 35); 
                  takeDamage(e, baseDmg * rampMult * dt, CharacterType.PYRO); 
              }
              if (Math.random() < 0.15) spawnParticles(e.pos, 1, '#ff4400', 1, 0.5);
         }
       }
    });
  };

  const castMagmaPool = (p: PlayerState, target: Vector2) => {
    if (p.silenceTimer > 0) return;
    p.skillCooldown = CHAR_STATS[CharacterType.PYRO].skillCooldown / 1000;
    const dist = Utils.dist(p.pos, target);
    const speed = CHAR_STATS[CharacterType.PYRO].magmaProjSpeed; 
    const duration = dist / (speed * 60); 

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
    if (p.disarmTimer > 0) return;
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
       hitTargets: [],
       targetPos: target
     });
  };

  const fireLMG = (p: PlayerState) => {
    if (p.disarmTimer > 0) return;
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
       
       if (p.projectileType === 'MAGMA_PROJ') {
           if (Math.random() < 0.6) {
              state.particles.push({
                 id: Math.random().toString(),
                 pos: { ...p.pos },
                 vel: Utils.mult(Utils.normalize(p.vel), -2), 
                 life: 0.3 + Math.random() * 0.2,
                 maxLife: 0.5,
                 color: Math.random() > 0.5 ? '#f97316' : '#ef4444', 
                 size: p.radius * (0.5 + Math.random() * 0.3)
              });
           }
       } else if (p.projectileType === 'BOMB') {
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
              createExplosion(state, p.pos, 50, 0, p.ownerId, true); 
          }
       } 
       else if (p.projectileType === 'BOMB') {
          const players = [state.player, state.enemy];
          
          // Check Drones for Bomb hit (direct)
          state.drones.forEach(d => {
              if (d.ownerId !== p.ownerId && d.hp > 0 && !d.isDocked && (!p.hitTargets || !p.hitTargets.includes(d.id))) {
                   if (Utils.dist(p.pos, d.pos) < d.radius + p.radius) {
                       d.hp -= p.damage;
                       Sound.playHit();
                       if (!p.hitTargets) p.hitTargets = [];
                       p.hitTargets.push(d.id);
                       spawnParticles(p.pos, 5, '#f59e0b', 4);
                       if (p.isEmp) d.hp = 0;
                       
                       if (d.hp <= 0) {
                           // Drone Destroyed
                           createExplosion(state, d.pos, 40, 0, p.ownerId);
                           const owner = d.ownerId === state.player.id ? state.player : state.enemy;
                           owner.droneState = 'RECONSTRUCTING';
                           owner.droneTimer = 0;
                           owner.droneMaxTimer = CHAR_STATS[CharacterType.TANK].droneReconstructTime / 1000;
                       }
                   }
              }
          });

          // Check Players
          players.forEach(target => {
              if (target.id !== p.ownerId && !target.isDead && (!p.hitTargets || !p.hitTargets.includes(target.id))) {
                  if (Utils.dist(p.pos, target.pos) < target.radius + p.radius) {
                      let damageMultiplier = 0.7; 
                      if (p.targetPos) {
                          const blastRadius = p.aoeRadius || 120;
                          const distToBlastCenter = Utils.dist(target.pos, p.targetPos);
                          const isInsideBlastZone = distToBlastCenter < (blastRadius + target.radius);
                          if (isInsideBlastZone) {
                              damageMultiplier = 0.1;
                          }
                      }

                      const penDamage = p.damage * damageMultiplier;
                      takeDamage(target, penDamage);
                      Sound.playHit();
                      
                      if (!p.hitTargets) p.hitTargets = [];
                      p.hitTargets.push(target.id);

                      spawnParticles(p.pos, 10, '#f59e0b', 5, 0.5);
                  }
              }
          });

          if (p.life <= 0) {
             createExplosion(state, p.pos, p.aoeRadius || 120, p.damage, p.ownerId, false);
          }
       } else {
          let hitWall = false;
          // Drone shots penetrate walls
          if (p.projectileType !== 'DRONE_SHOT') {
              for (const obs of state.obstacles) {
                 if (obs.type === 'WATER') continue;
                 if (Utils.checkCircleRectCollision(p.pos, p.radius, obs).collided) {
                    hitWall = true; 
                    break;
                 }
              }
          }

          const targetPlayer = p.ownerId === 'player' ? state.enemy : state.player;
          
          let hitEntity: any = null;
          
          // Check if it hit player
          if (!targetPlayer.isDead && Utils.dist(p.pos, targetPlayer.pos) < targetPlayer.radius + p.radius) {
              // Wukong Aerial Immunity check
              let immune = false;
              if (targetPlayer.type === CharacterType.WUKONG && targetPlayer.wukongChargeState === 'SMASH') immune = true;
              
              if (!immune) hitEntity = targetPlayer;
          }

          // Check if it hit enemy drone
          if (!hitEntity) {
              for (const d of state.drones) {
                  if (d.ownerId !== p.ownerId && d.hp > 0 && !d.isDocked) {
                      if (Utils.dist(p.pos, d.pos) < d.radius + p.radius) {
                          hitEntity = d;
                          break;
                      }
                  }
              }
          }

          if (hitWall) {
             p.life = 0;
             spawnParticles(p.pos, 3, '#cccccc');
          } else if (hitEntity) {
             p.life = 0;
             
             if ('isSummon' in hitEntity) {
                 // Hit Drone
                 let dmg = p.damage;
                 if (p.isEmp) dmg = 9999;
                 hitEntity.hp -= dmg;
                 spawnParticles(p.pos, 5, '#6ee7b7');
                 
                 // Knockback small for drone
                 hitEntity.pos = Utils.add(hitEntity.pos, Utils.mult(Utils.normalize(p.vel), 10));

                 if (hitEntity.hp <= 0) {
                      createExplosion(state, hitEntity.pos, 40, 0, p.ownerId);
                      const owner = hitEntity.ownerId === state.player.id ? state.player : state.enemy;
                      owner.droneState = 'RECONSTRUCTING';
                      owner.droneTimer = 0;
                      owner.droneMaxTimer = CHAR_STATS[CharacterType.TANK].droneReconstructTime / 1000;
                 }

             } else {
                 // Hit Player
                 takeDamage(hitEntity, p.damage);
                 Sound.playHit();
                 
                 const pushDir = Utils.normalize(p.vel);
                 let knockbackForce = 160; 

                 if (p.projectileType === 'DRONE_SHOT') {
                    knockbackForce = 300; // Buffed knockback for drone
                 }
                 
                 applyKnockback(hitEntity, pushDir, knockbackForce);
                 spawnParticles(p.pos, 5, p.color);
             }
          }
       }
    });
  };

  const createExplosion = (state: GameState, pos: Vector2, radius: number, damage: number, ownerId: string, selfImmune: boolean = false) => {
      spawnParticles(pos, 30, '#f59e0b', 8, 1);
      Sound.playExplosion();
      
      state.particles.push({
         id: Math.random().toString(),
         pos: pos,
         vel: {x:0, y:0},
         life: 0.2,
         maxLife: 0.2,
         color: 'rgba(255, 100, 0, 0.3)',
         size: radius 
      });

      // Explosion hits Players AND Drones
      const targets: any[] = [state.player, state.enemy];
      state.drones.forEach(d => { if(d.hp > 0 && !d.isDocked) targets.push(d); });

      targets.forEach(target => {
         if (selfImmune && (target.id === ownerId || target.ownerId === ownerId)) return;
         if ('isDead' in target && target.isDead) return;

         const d = Utils.dist(pos, target.pos);
         if (d < radius + target.radius) {
            const damageFactor = 1 - (d / (radius + target.radius));
            const finalDamage = damage * Math.max(0, damageFactor);
            
            if ('isSummon' in target) {
                target.hp -= finalDamage;
                if (target.hp <= 0) {
                     // Chain reaction? Or just silent removal next frame logic
                     // Set owner reconstruct logic if not already set
                     const owner = target.ownerId === state.player.id ? state.player : state.enemy;
                     owner.droneState = 'RECONSTRUCTING';
                     owner.droneTimer = 0;
                     owner.droneMaxTimer = CHAR_STATS[CharacterType.TANK].droneReconstructTime / 1000;
                }
            } else {
                takeDamage(target, finalDamage);
                const pushDir = Utils.normalize(Utils.sub(target.pos, pos));
                const baseForce = 10400; 
                const force = baseForce * damageFactor; 
                
                target.slowTimer = 2.4; 
                applyKnockback(target, pushDir, force);
            }
         }
      });
  };

  const takeDamage = (p: PlayerState, amount: number, sourceType?: CharacterType) => {
    // Cat Invincibility
    if (p.type === CharacterType.CAT && (p.invincibleTimer || 0) > 0) return;

    let finalDmg = amount;

    if (p.type === CharacterType.CAT && sourceType === CharacterType.CAT) {
        finalDmg *= 0.3; // 猫猫球内战只受到 30% 伤害
    }

    if (p.type === CharacterType.CAT && p.isPouncing) {
        finalDmg *= 0.1;
    }
    
    // Water Resistance vs Fire
    if (p.isWet && sourceType === CharacterType.PYRO) {
        finalDmg *= 0.5;
    }

    // Pyro Resistance for Pyro
    if (p.type === CharacterType.PYRO && sourceType === CharacterType.PYRO) {
       finalDmg *= 0.25;
    }
    // Wukong Fire Resistance (30% reduction)
    if (p.type === CharacterType.WUKONG && sourceType === CharacterType.PYRO) {
        finalDmg *= 0.7;
    }

    p.hp -= finalDmg;
    if (p.hp < 0) p.hp = 0;
  };

  const updateStatus = (p: PlayerState, dt: number) => {
     if (p.skillCooldown > 0) p.skillCooldown -= dt;
     if (p.secondarySkillCooldown > 0) p.secondarySkillCooldown -= dt;
     if (p.attackCooldown > 0) p.attackCooldown -= dt;
     if (p.slowTimer > 0) p.slowTimer -= dt;
     if (p.wukongThrustTimer > 0) p.wukongThrustTimer -= dt;
     if (p.pounceCooldown > 0) p.pounceCooldown -= dt;
     if (p.disarmTimer > 0) p.disarmTimer -= dt;
     if (p.silenceTimer > 0) p.silenceTimer -= dt;
     if (p.fearTimer > 0) p.fearTimer -= dt;
     if (p.paralysisTimer > 0) p.paralysisTimer -= dt;

     if (p.silenceTimer > 0 || p.paralysisTimer > 0) {
         // 打断悟空球蓄力
         if (p.wukongChargeState !== 'NONE') {
             p.wukongChargeState = 'NONE';
             p.wukongChargeTime = 0;
             p.wukongChargeHoldTimer = 0;
         }
         
         // 打断猫猫球蓄力
         if (p.catIsCharging) {
             p.catIsCharging = false;
             p.catChargeStartTime = 0;
         }
     }

     if (p.type === CharacterType.CAT && p.isPouncing) {
        p.pounceTimer -= dt;
        
         if (Utils.mag(p.vel) < 8.0 || p.pounceTimer <= 0) {
             p.isPouncing = false;

             p.attackCooldown = 0.5;

             if (p.bufferedInput === 'HISS') {
                 handleCatHiss(p);
                 p.bufferedInput = 'NONE';
             }
         }
     }

     if (p.invincibleTimer && p.invincibleTimer > 0) p.invincibleTimer -= dt;
     
     // Idle Animation Logic for Cat
     if (p.type === CharacterType.CAT) {
        // Only run idle logic if no movement keys are pressed and velocity is very low
        const isMoving = Utils.mag(p.vel) > 1.0 || keysRef.current['KeyW'] || keysRef.current['KeyS'] || keysRef.current['KeyA'] || keysRef.current['KeyD'];
        
        if (!isMoving) {
            p.idleTimer = (p.idleTimer || 0) + dt;
            // After 3 seconds of idle, occasionally show zZz
            if (p.idleTimer > 3.0 && Math.random() < 0.01) { // ~1% chance per frame (~60% per second)
                 stateRef.current.floatingTexts.push({
                     id: Math.random().toString(),
                     pos: {x: p.pos.x + (Math.random()-0.5)*20, y: p.pos.y - 30},
                     text: "zZz",
                     color: '#fff',
                     life: 1.5, maxLife: 1.5, velY: -1
                 });
            }
        } else {
            p.idleTimer = 0;
        }
     }

     // Combo Timer Reset Logic (Must be outside water check to work globally)
     if (p.type === CharacterType.WUKONG && p.wukongComboStep > 0) {
        p.wukongComboTimer -= dt;
        if (p.wukongComboTimer <= 0) p.wukongComboStep = 0;
     }

     // If wet and moving slow/stopped, take drowning damage
     if (p.isWet) {
         if (p.type === CharacterType.PYRO) {
             takeDamage(p, 200 * dt); // 快速持续伤害 (约为普通溺水的4倍)
             // 蒸汽特效 (Steam)
             if (Math.random() < 0.3) {
                 stateRef.current.particles.push({
                    id: Math.random().toString(),
                    pos: Utils.add(p.pos, {x: (Math.random()-0.5)*20, y: (Math.random()-0.5)*20}),
                    vel: {x: (Math.random()-0.5), y: -2 - Math.random()}, // 向上飘
                    life: 0.5 + Math.random() * 0.3, 
                    maxLife: 0.8,
                    color: 'rgba(226, 232, 240, 0.6)', // 半透明白蒸汽
                    size: 5 + Math.random() * 4,
                    drag: 0.9
                 });
             }
         } 
         // 其他角色：只有在水中静止/缓慢移动时才会溺水
         else if (Utils.mag(p.vel) < 0.8) {
             // Sinking / Drowning
             takeDamage(p, 50 * dt);
             if (Math.random() < 0.2) {
                 stateRef.current.particles.push({
                    id: Math.random().toString(),
                    pos: Utils.add(p.pos, {x: (Math.random()-0.5)*20, y: (Math.random()-0.5)*20}),
                    vel: {x:0, y:-1},
                    life: 0.5, maxLife: 0.5,
                    color: '#bae6fd', size: 3
                 });
             }
         }
     }

     if (p.burnTimer > 0) {
         p.burnTimer -= dt;
         const flatBurn = 25;
         const percentBurn = p.maxHp * 0.015;
         takeDamage(p, (flatBurn + percentBurn) * dt, CharacterType.PYRO); 

         if (Math.random() < 0.2) {
             spawnParticles(p.pos, 1, '#f97316', 1, 0.6);
         }
     }

     if (p.flameExposure > 0) {
         p.flameExposure -= 10 * dt; 
         if (p.flameExposure < 0) p.flameExposure = 0;
     }
     
     if (p.type === CharacterType.PYRO) {
        if (p.isOverheated) {
            p.heat -= CHAR_STATS[CharacterType.PYRO].overheatCooling * dt;
            if (p.heat <= 0) {
                p.heat = 0;
                p.isOverheated = false;
            }
        } else if (!p.isFiringFlamethrower && p.heat > 0) {
             p.heat -= CHAR_STATS[CharacterType.PYRO].heatDissipation * dt;
             if (p.heat < 0) p.heat = 0;
        }
     } else if (p.type === CharacterType.TANK) {
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

        // Drone State Logic (Recharging / Reconstructing)
        // If state is CHARGING or RECONSTRUCTING, tick timer
        if (p.droneState === 'CHARGING' || p.droneState === 'RECONSTRUCTING') {
            p.droneTimer += dt;
            if (p.droneTimer >= p.droneMaxTimer) {
                p.droneState = 'READY'; // Ready
                p.droneTimer = 0;
                if (p.id === 'player') Sound.playUI('START');
            }
        }
     }
  };

  const updateGroundEffects = (state: GameState, dt: number) => {
      state.groundEffects = state.groundEffects.filter(g => g.life > 0);
      state.groundEffects.forEach(g => {
          g.life -= dt;

          // 铲屎官之怒：预警阶段
          if (g.type === 'SCOOPER_WARNING') {
              // 1. 追踪逻辑
              if (g.targetId) {
                  let target: any = state.player.id === g.targetId ? state.player : state.enemy;
                  // 如果不是玩家，在无人机里找
                  if (!target || target.id !== g.targetId) {
                      target = state.drones.find(d => d.id === g.targetId);
                  }

                  if (target && !target.isDead && (target.hp > 0 || target.hp === undefined)) {
                      // 缓慢移动向目标 (例如每帧移动 2-3 像素)
                      const speed = 2.5; 
                      const vec = Utils.sub(target.pos, g.pos);
                      const dist = Utils.mag(vec);
                      if (dist > speed) {
                          const move = Utils.mult(Utils.normalize(vec), speed);
                          g.pos = Utils.add(g.pos, move);
                      }
                  }
              }

              // 2. 倒计时结束：降临
              if (g.life <= 0) {
                  // 触发伤害
                  triggerScooperSmash(state, g.pos, g.ownerId, g.radius);
                  
                  // 生成视觉特效 (原本的 SCOOPER_SMASH)
                  state.groundEffects.push({
                      id: Math.random().toString(),
                      pos: g.pos,
                      radius: g.radius,
                      life: 0.5, // 动画持续时间
                      maxLife: 0.5,
                      type: 'SCOOPER_SMASH',
                      ownerId: g.ownerId
                  });
              }
              return; // 预警圈本身没有碰撞伤害
          }

          if (g.type === 'WUKONG_SMASH' || g.type === 'CRACK') {
              if (Math.random() < 0.2) {
                 const offset = Utils.mult({x: Math.random()-0.5, y: Math.random()-0.5}, g.radius*2 || 40);
                 spawnParticles(Utils.add(g.pos, offset), 1, '#fef08a', 0.5, 0.5);
              }
              return; 
          }
          if (g.type === 'SCOOPER_SMASH') {
              // Just visual placeholder, logic handled in timeout
              return;
          }

          [state.player, state.enemy].forEach(p => {
             if (Utils.dist(p.pos, g.pos) < g.radius + p.radius) {
                 if (g.type === 'MAGMA_POOL') {
                     if (p.id === g.ownerId) {
                         if (p.hp < p.maxHp) p.hp += 50 * dt; 
                     } else {
                         takeDamage(p, 50 * dt, CharacterType.PYRO);
                         p.burnTimer = 3.0; 
                         p.vel = Utils.mult(p.vel, 0.90);
                     }
                 }
             }
          });
          
          if (g.type === 'MAGMA_POOL' && Math.random() < 0.4) {
             const offset = Utils.mult({x: Math.random()-0.5, y: Math.random()-0.5}, g.radius*2);
             spawnParticles(Utils.add(g.pos, offset), 1, '#ef4444', 0.5, 0.5);
          }
      });
  };

const triggerScooperSmash = (state: GameState, center: Vector2, ownerId: string, radius: number) => {
      Sound.playSkill('SMASH_HIT');
      state.camera.y += 20; // 剧烈震动

      for(let i=0; i<3; i++) {
          state.groundEffects.push({
              id: Math.random().toString(),
              pos: { ...center },
              radius: 0, 
              width: 30 + Math.random() * 20, // 裂缝宽度
              length: radius * (1.8 + Math.random() * 0.5), // 裂缝长度
              rotation: Math.random() * Math.PI * 2, // 随机角度
              life: 4.0, // 持续时间
              maxLife: 4.0,
              type: 'CRACK',
              ownerId: ownerId
          });
      }

      state.obstacles = state.obstacles.filter(obs => {
          if (obs.type === 'WATER') return true; // 水域不可破坏          
          const col = Utils.checkCircleRectCollision(center, radius, obs);
          if (col.collided) {
              // 墙体破碎特效
              const wallCenter = {x: obs.x + obs.width/2, y: obs.y + obs.height/2};
              spawnParticles(wallCenter, 30, '#475569', 12, 1.2); // 灰色碎石
              return false; // 移除该障碍物
          }
          return true; // 保留未命中的障碍物
      });

      const targets: any[] = [state.player, state.enemy, ...state.drones.filter(d => d.hp > 0 && !d.isDocked)];
      const damage = CHAR_STATS[CharacterType.CAT].scoopDamage;

      targets.forEach(t => {
          if (t.type === CharacterType.CAT) return;
          if (t.isDead) return;

          const dist = Utils.dist(center, t.pos); // 获取距离
          if (dist < radius + t.radius) {
              
              const distanceFactor = 1 - (dist / (radius + t.radius)); 
              const finalDmgMultiplier = 0.2 + (0.8 * Math.max(0, distanceFactor));
              const finalDamage = damage * finalDmgMultiplier;

              // 造成伤害
              if ('isSummon' in t) {
                  t.hp -= finalDamage; // 无人机受到衰减后的伤害
                  if (t.hp <= 0) {
                       createExplosion(state, t.pos, 40, 0, ownerId);
                       if (t.ownerId) {
                           const owner = t.ownerId === state.player.id ? state.player : state.enemy;
                           owner.droneState = 'RECONSTRUCTING';
                           owner.droneTimer = 0;
                           owner.droneMaxTimer = 30;
                       }
                  }
              } else {
                  takeDamage(t, finalDamage); // 玩家受到衰减后的伤害
                  t.paralysisTimer = 2.0;                    
                  state.floatingTexts.push({
                      id: Math.random().toString(), pos: {x: t.pos.x, y: t.pos.y-60},
                      text: "拍扁!", color: '#ef4444', life: 1.5, maxLife: 1.5, velY: -1
                  });
              }
              spawnParticles(t.pos, 20, '#b91c1c', 8);
          }
      });
  };

  const updateParticles = (state: GameState, dt: number) => {
     state.particles = state.particles.filter(p => p.life > 0);
     state.particles.forEach(p => {
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

    let targetX = state.player.pos.x - cx;
    let targetY = state.player.pos.y - cy;

    const mouseX = mouseRef.current.x;
    const mouseY = mouseRef.current.y;
    
    const offsetX = (mouseX - cx) * 1.6;
    const offsetY = (mouseY - cy) * 1.6;

    targetX += offsetX;
    targetY += offsetY;

    targetX = Utils.clamp(targetX, -500, MAP_SIZE.width + 500 - innerWidth); 
    targetY = Utils.clamp(targetY, -500, MAP_SIZE.height + 500 - innerHeight);

    state.camera.x += (targetX - state.camera.x) * 0.04;
    state.camera.y += (targetY - state.camera.y) * 0.04;
  };

  // --- Rendering ---

  const draw = (ctx: CanvasRenderingContext2D) => {
    const state = stateRef.current;
    const { width, height } = ctx.canvas;
    
    // Memoize images to avoid re-creating HTMLImageElements every frame
    if (!stateRef.current['imageCache']) stateRef.current['imageCache'] = {};
    const getCachedImage = (src: string) => {
        if (!src) return null;
        if (stateRef.current['imageCache'][src]) return stateRef.current['imageCache'][src];
        const img = new Image();
        img.src = src;
        stateRef.current['imageCache'][src] = img;
        return img;
    };


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
            ctx.fillStyle = 'rgba(185, 28, 28, 0.8)';
            ctx.beginPath();
            ctx.arc(g.pos.x, g.pos.y, g.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();
        } else if (g.type === 'CRACK') {
            // Fading Crack
            const alpha = g.life / g.maxLife;
            ctx.save();
            ctx.translate(g.pos.x, g.pos.y);
            ctx.rotate(g.rotation || 0);
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.8})`; // Dark crack
            const l = g.length || 100;
            const w = g.width || 40;
            
            // Draw jagged fissure
            ctx.beginPath();
            ctx.moveTo(-l/2, 0);
            ctx.lineTo(-l/4, -w/3);
            ctx.lineTo(0, 0);
            ctx.lineTo(l/4, w/3);
            ctx.lineTo(l/2, 0);
            ctx.lineTo(l/4, -w/4);
            ctx.lineTo(0, -w/6);
            ctx.lineTo(-l/4, w/4);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        } else if (g.type === 'SCOOPER_WARNING') {
            // 绘制预警阴影 (红色/危险感)
            ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'; // 淡淡的红
            ctx.beginPath();
            ctx.ellipse(g.pos.x, g.pos.y, g.radius, g.radius * 0.8, 0, 0, Math.PI*2);
            ctx.fill();
            
            // 绘制倒计时圈 (收缩)
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();

            const ratio = Math.max(0, g.life / g.maxLife); 
            const currentRadius = g.radius * ratio;
            
            if (currentRadius > 0) {
                ctx.ellipse(g.pos.x, g.pos.y, currentRadius, currentRadius * 0.8, 0, 0, Math.PI*2);
                ctx.stroke();
            }

            // 绘制 "危" 字
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 48px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚠', g.pos.x, g.pos.y);
        } else if (g.type === 'SCOOPER_SMASH') {
            // Shadow
            const alpha = g.life / g.maxLife;
            ctx.fillStyle = `rgba(0,0,0,${alpha * 0.5})`;
            ctx.beginPath();
            ctx.ellipse(g.pos.x, g.pos.y, g.radius, g.radius * 0.8, 0, 0, Math.PI*2);
            ctx.fill();
            
            // Giant Scooper
            ctx.save();
            ctx.translate(g.pos.x, g.pos.y - 100 * alpha); // Fall down effect
            ctx.rotate(Math.PI/4);
            // Draw Shovel
            ctx.fillStyle = '#b91c1c'; // Red handle
            ctx.fillRect(-10, -200, 20, 150);
            ctx.fillStyle = '#ef4444'; // Red scoop
            ctx.beginPath();
            ctx.moveTo(-60, -50);
            ctx.lineTo(60, -50);
            ctx.lineTo(50, 50);
            ctx.lineTo(-50, 50);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#b91c1c';
            ctx.lineWidth = 5;
            ctx.stroke();
            
            // Holes
            ctx.fillStyle = '#7f1d1d';
            ctx.fillRect(-20, -30, 10, 60);
            ctx.fillRect(10, -30, 10, 60);
            
            ctx.restore();
        }
    });

    // Obstacles
    state.obstacles.forEach(obs => {
      if (obs.type === 'WATER') {
          ctx.fillStyle = 'rgba(6, 182, 212, 0.3)'; 
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
          ctx.lineWidth = 2;
          ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      } else {
          ctx.fillStyle = '#475569';
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      }
    });

    // Drones
    state.drones.forEach(d => {
        if (d.hp <= 0 || d.isDocked) return; // Don't draw if dead or docked

        ctx.save();
        ctx.translate(d.pos.x, d.pos.y);
        // Hover animation
        ctx.translate(0, Math.sin(Date.now()/100) * 3);

        if (d.ownerId !== state.player.id) {
            ctx.shadowColor = '#ef4444'; // 红色光晕
            ctx.shadowBlur = 15;         // 发光强度
        }

        // 1. Draw Body
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0);
        ctx.closePath();
        ctx.fill();

        // 2. Draw Rotors
        const rAngle = Date.now() / 50;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        [45, 135, 225, 315].forEach(deg => {
            const rad = deg * Math.PI / 180;
            const armX = Math.cos(rad) * 10;
            const armY = Math.sin(rad) * 10;
            // Arm
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(armX, armY); ctx.stroke();
            // Blade
            ctx.beginPath();
            ctx.ellipse(armX, armY, 6, 1, rAngle + rad, 0, Math.PI*2);
            ctx.stroke();
        });

        // 3. Mini HP Bar
        const hpPct = d.hp / d.maxHp;
        if (hpPct < 1) {
            ctx.fillStyle = 'red';
            ctx.fillRect(-10, -15, 20, 3);
            ctx.fillStyle = '#34d399';
            ctx.fillRect(-10, -15, 20 * hpPct, 3);
        }
        ctx.restore();
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
       if (p.isDead) return; 

       // Shadow (Dynamic for Wukong Jump)
       let shadowScale = 1;
       let shadowAlpha = 0.5;
       if (p.type === CharacterType.WUKONG && p.wukongChargeState === 'SMASH') {
           const liftPct = p.wukongChargeTime / p.wukongMaxCharge;
           shadowScale = 1 - liftPct * 0.7; // Smaller shadow
           shadowAlpha = 0.5 - liftPct * 0.3; // Lighter shadow
       }

       ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
       ctx.beginPath();
       ctx.arc(p.pos.x + 5, p.pos.y + 5, p.radius * shadowScale, 0, Math.PI * 2);
       ctx.fill();
       
       // Drowning/Wet visual
       if (p.isWet) {
           ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
           ctx.beginPath();
           ctx.arc(p.pos.x, p.pos.y, p.radius + 8, 0, Math.PI * 2);
           ctx.fill();
       }
       
       // Wukong Charge Range Indicator (Under player)
       if (p.type === CharacterType.WUKONG && p.wukongChargeState === 'SMASH') {
           const chargePct = Math.min(1, p.wukongChargeTime / p.wukongMaxCharge);
           const stats = CHAR_STATS[CharacterType.WUKONG];
           const currentRange = stats.smashMinRange + (stats.smashMaxRange - stats.smashMinRange) * chargePct;

           ctx.save();
           ctx.translate(p.pos.x, p.pos.y);
           ctx.strokeStyle = 'rgba(250, 204, 21, 0.3)';
           ctx.lineWidth = 2;
           ctx.setLineDash([5, 5]);
           ctx.beginPath();
           ctx.arc(0, 0, currentRange, 0, Math.PI*2);
           ctx.stroke();
           ctx.restore();
       }

       ctx.save();
       ctx.translate(p.pos.x, p.pos.y);

       if (p.id !== state.player.id) {
           ctx.shadowColor = '#ef4444'; // 红色光晕
           ctx.shadowBlur = 20;         // 发光强度 (比无人机更强)
       }

       // 视觉形变逻辑
       if (p.type === CharacterType.CAT) {
           // 1. 蓄力 - 整体缩小 (Shrink) 而不是压扁
           if (p.catIsCharging) {
               const chargeTime = (performance.now() - (p.catChargeStartTime || 0)) / 1000;
               const chargePct = Math.min(1, chargeTime / CHAR_STATS[CharacterType.CAT].pounceMaxCharge);
               // 随蓄力时间从 1.0 缩小到 0.7
               const s = 1 - chargePct * 0.3; 
               ctx.scale(s, s);
           }
           // 2. 飞扑 - 滞空放大 (Jump/Lift)
           else if (p.isPouncing) {
               // 模拟升空：根据当前速度决定大小，速度越快(跳得越高)越大
               const speed = Utils.mag(p.vel);
               // 基础放大 + 速度加成，落地(速度为0)时自然恢复
               const scale = 1 + (speed / 30) * 0.5; 
               ctx.scale(scale, scale);
               
               // 残影特效 (让飞扑更有速度感)
               if (Math.random() < 0.5) { 
                   state.particles.push({
                       id: Math.random().toString(),
                       pos: { ...p.pos },
                       vel: { x: 0, y: 0 },
                       life: 0.15, maxLife: 0.15,
                       color: 'rgba(254, 243, 199, 0.4)', 
                       size: p.radius
                   });
               }
           }
       }
       
       // Vaulting Animation Jitter & Scale
       if (p.isVaulting) {
            const jitterX = (Math.random() - 0.5) * 4;
            const jitterY = (Math.random() - 0.5) * 4;
            ctx.translate(jitterX, jitterY);
            const hopScale = 1.0 + Math.sin(Date.now() / 50) * 0.1;
            ctx.scale(hopScale, hopScale);
       }

       // Invincibility Flash
       if (p.invincibleTimer && p.invincibleTimer > 0) {
           if (Math.floor(Date.now() / 100) % 2 === 0) ctx.globalAlpha = 0.5;
       }

       // Fallback Colors if Image fails
       if (p.slowTimer > 0) {
           ctx.fillStyle = '#64748b'; 
       } else if (p.burnTimer > 0) {
           ctx.fillStyle = '#f97316'; 
       } else {
           ctx.fillStyle = p.color;
       }

       if (p.type === CharacterType.TANK) {
          ctx.save();
          ctx.rotate(p.aimAngle);
          ctx.fillStyle = p.slowTimer > 0 ? '#475569' : (p.burnTimer > 0 ? '#ea580c' : '#374151'); 
          ctx.fillRect(0, -8, p.radius + 20, 16); 
          ctx.restore();
          
          if (p.tankMode === TankMode.LMG) {
             ctx.save();
             ctx.rotate(p.angle);
             ctx.fillStyle = '#10b981'; 
             ctx.shadowColor = '#34d399';
             ctx.shadowBlur = 15;
             ctx.beginPath();
             ctx.arc(-p.radius + 5, -12, 6, 0, Math.PI*2);
             ctx.arc(-p.radius + 5, 12, 6, 0, Math.PI*2);
             ctx.fill();
             ctx.restore();
          }
       }
       else if (p.type === CharacterType.WUKONG) {
          // Wukong Staff Rendering
          ctx.save();
          // Visual Rise in Z-Axis (Scaling)
          if (p.wukongChargeState === 'SMASH') {
              const liftPct = p.wukongChargeTime / p.wukongMaxCharge;
              const scale = 1 + liftPct * 0.5; // Scale up to 1.5x
              ctx.scale(scale, scale);
              // Shift Y up to simulate jump (negative Y is up in 2D top-down perspective simulation)
              ctx.translate(0, -liftPct * 30); 
              
              // Shake when holding max charge
              if (p.wukongChargeHoldTimer > 0) {
                  ctx.translate((Math.random()-0.5)*3, (Math.random()-0.5)*3);
              }
          }
          
          // Draw Active Attack Visuals (Swipe/Smash/Thrust)
          const animTime = performance.now() - p.wukongLastAttackTime;
          const animDuration = 250; 

          if (animTime < animDuration && p.wukongLastAttackType !== 'NONE') {
              ctx.rotate(p.aimAngle);
              const progress = animTime / animDuration;
              
              if (p.wukongLastAttackType === 'COMBO_1' || p.wukongLastAttackType === 'COMBO_2') {
                   // Dynamic Swing Animation
                   const swingArc = Math.PI / 1.5; // 120 degrees
                   // Combo 1: -60 to +60. Combo 2: +60 to -60.
                   const startAngle = p.wukongLastAttackType === 'COMBO_1' ? -swingArc/2 : swingArc/2;
                   const endAngle = -startAngle;
                   
                   // Easing function for visual pop
                   const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
                   const currentRot = startAngle + (endAngle - startAngle) * easeOut(progress);

                   // Draw Trail (Ghosting)
                   for (let i = 1; i <= 3; i++) {
                       const trailLag = i * 0.05;
                       if (progress > trailLag) {
                           const trailRot = startAngle + (endAngle - startAngle) * easeOut(progress - trailLag);
                           ctx.save();
                           ctx.rotate(trailRot);
                           ctx.fillStyle = `rgba(250, 204, 21, ${0.3 / i})`;
                           ctx.fillRect(0, -4, 110, 8);
                           ctx.restore();
                       }
                   }

                   // Draw Main Staff
                   ctx.save();
                   ctx.rotate(currentRot);
                   ctx.fillStyle = '#a16207'; // Stick color
                   ctx.fillRect(0, -5, 110, 10);
                   ctx.fillStyle = '#facc15'; // Gold Tip
                   ctx.fillRect(90, -7, 20, 14);
                   // Swipe Streak
                   ctx.fillStyle = `rgba(254, 240, 138, ${0.5 * (1-progress)})`; 
                   ctx.beginPath();
                   ctx.rect(20, -20, 90, 40); // Simple streak, or could use arc
                   ctx.fill();
                   ctx.restore();

              } else if (p.wukongLastAttackType === 'SKILL_SMASH') {
                   // ENHANCED SMASH ANIMATION (For Skill only)
                   const smashProg = animTime / animDuration;
                   const stats = CHAR_STATS[CharacterType.WUKONG];
                   // Retrieve stored charge pct for correct visual length
                   const range = stats.smashMinRange + (stats.smashMaxRange - stats.smashMinRange) * p.wukongLastChargePct;
                   const width = stats.smashWidthMin + (stats.smashWidthMax - stats.smashWidthMin) * p.wukongLastChargePct;

                   // 1. Smear Effect (Ghosting Trail)
                   if (smashProg < 0.6) {
                      ctx.save();
                      const fade = 1 - (smashProg / 0.6);
                      ctx.fillStyle = `rgba(254, 240, 138, ${fade * 0.4})`;
                      ctx.fillRect(0, -width/2, range, width);
                      ctx.restore();
                   }
                   
                   // 2. Impact Flash (White Highlight) at the start
                   if (smashProg < 0.2) {
                       ctx.save();
                       ctx.shadowBlur = 30;
                       ctx.shadowColor = 'white';
                       ctx.fillStyle = '#ffffff';
                       ctx.fillRect(10, -width/4, range, width/2);
                       ctx.restore();
                   } else {
                       // 3. Main Staff (Extended)
                       const stickWidth = 20; 
                       
                       ctx.shadowColor = '#fef08a';
                       ctx.shadowBlur = 20;
                       
                       // Main Body
                       ctx.fillStyle = '#b45309'; // Darker gold/bronze
                       ctx.fillRect(10, -stickWidth/2, range, stickWidth);
                       
                       // Tip (Gold Cap)
                       ctx.fillStyle = '#fef08a';
                       ctx.fillRect(range, -(stickWidth/2 + 4), 30, stickWidth + 8);
                   }
                   
              } else if (p.wukongLastAttackType === 'COMBO_SMASH') {
                   // NORMAL SMASH ANIMATION (For Combo 3rd hit - Fixed size, no huge scaling)
                   const smashProg = animTime / animDuration;
                   const range = 180; // Fixed range for combo finisher
                   const width = 40;  // Fixed width

                   // 1. Smear Effect
                   if (smashProg < 0.6) {
                      ctx.save();
                      const fade = 1 - (smashProg / 0.6);
                      ctx.fillStyle = `rgba(250, 204, 21, ${fade * 0.3})`;
                      ctx.fillRect(0, -width/2, range, width);
                      ctx.restore();
                   }
                   
                   // 2. Staff Animation (Slamming down visual)
                   const stickWidth = 14; 
                   ctx.fillStyle = '#a16207'; 
                   ctx.fillRect(10, -stickWidth/2, range, stickWidth);
                   ctx.fillStyle = '#facc15';
                   ctx.fillRect(range, -(stickWidth/2 + 2), 20, stickWidth + 4);

              } else if (p.wukongLastAttackType === 'THRUST') {
                   // ENHANCED THRUST ANIMATION
                   const stats = CHAR_STATS[CharacterType.WUKONG];
                   // Recalculate range based on saved state
                   const range = 100 + (stats.thrustMaxRange - 100) * p.wukongLastChargePct;
                   const thrustProg = animTime / animDuration;

                   // 1. Smear Effect (Speed lines / Conical thrust trail)
                   if (thrustProg < 0.5) {
                       const fade = 1 - (thrustProg / 0.5);
                       ctx.save();
                       
                       // Airflow lines (Side streaks)
                       ctx.lineWidth = 2;
                       ctx.strokeStyle = `rgba(255, 255, 255, ${fade * 0.6})`;
                       
                       ctx.beginPath();
                       ctx.moveTo(30, -12);
                       ctx.lineTo(range * 0.9, -8);
                       ctx.stroke();

                       ctx.beginPath();
                       ctx.moveTo(30, 12);
                       ctx.lineTo(range * 0.9, 8);
                       ctx.stroke();

                       // Central Blur
                       ctx.fillStyle = `rgba(254, 240, 138, ${fade * 0.3})`;
                       ctx.beginPath();
                       ctx.moveTo(10, -10);
                       ctx.lineTo(range + 30, -5);
                       ctx.lineTo(range + 30, 5);
                       ctx.lineTo(10, 10);
                       ctx.fill();
                       ctx.restore();
                   }

                   // 2. Flash at the start (Explosion from handle)
                   if (thrustProg < 0.15) {
                       ctx.save();
                       ctx.shadowBlur = 25;
                       ctx.shadowColor = 'white';
                       ctx.fillStyle = '#ffffff';
                       // Flash covers full length now
                       ctx.fillRect(10, -10, range + 20, 20); 
                       ctx.restore();
                   }
                   
                   // 3. Main Stick Body
                   ctx.fillStyle = '#a16207';
                   ctx.fillRect(20, -6, range, 12); 
                   
                   // 4. Gold Tip (Highlight)
                   ctx.shadowColor = '#fef08a';
                   ctx.shadowBlur = 10;
                   ctx.fillStyle = '#facc15';
                   ctx.fillRect(range + 20, -8, 20, 16); // Tip
              }
              ctx.rotate(-p.aimAngle); // Reset rotation for normal staff drawing
          }

          // Draw Idle/Charge Staff (Jingu Bang)
          if (animTime >= animDuration) {
              ctx.rotate(p.aimAngle);
              let staffOffset = 15;
              
              // Staff charging animation
              if (p.wukongChargeState === 'THRUST') {
                   const charge = Math.min(1, p.wukongChargeTime / p.wukongMaxCharge);
                   staffOffset -= charge * 10; // Pull back
                   if (charge > 0.8) staffOffset += (Math.random()-0.5) * 5;
              }
              
              // New: Visual effect when Skill is ready
              if (p.skillCooldown <= 0) {
                   ctx.shadowColor = '#facc15';
                   ctx.shadowBlur = 15 + Math.sin(Date.now() / 150) * 8; // Pulsing glow
              } else {
                   ctx.shadowBlur = 0;
              }
              
              ctx.fillStyle = '#a16207'; // Bronze/Gold dark
              ctx.fillRect(staffOffset, -4, 50, 8); // Handle
              ctx.fillStyle = '#facc15'; // Gold tip
              ctx.fillRect(staffOffset + 50, -6, 15, 12); 
              ctx.fillRect(staffOffset - 5, -6, 5, 12); 
          }

          ctx.restore();
       } else if (p.type === CharacterType.CAT) {
           // --- RENDER CAT ---
           // Draw Body (Cream)
           ctx.rotate(p.angle);
           ctx.fillStyle = '#fef3c7'; // amber-100
           ctx.beginPath();
           ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
           ctx.fill();

           // Draw Calico Spots
           ctx.fillStyle = '#d97706'; // amber-600
           ctx.beginPath();
           ctx.arc(-8, -10, 8, 0, Math.PI*2);
           ctx.fill();
           ctx.fillStyle = '#1f2937'; // gray-800
           ctx.beginPath();
           ctx.arc(8, 12, 6, 0, Math.PI*2);
           ctx.fill();

           // Draw Tail (Wagging)
           const tailWag = Math.sin(Date.now()/200) * 0.5;
           ctx.strokeStyle = '#fef3c7'; // Cream tail
           ctx.lineWidth = 8;
           ctx.lineCap = 'round';
           ctx.beginPath();
           ctx.moveTo(-p.radius, 0);
           ctx.quadraticCurveTo(-p.radius - 20, 0, -p.radius - 25, tailWag * 20);
           ctx.stroke();

           // Rotate to Aim Direction for Ears & Face
           ctx.rotate(-p.angle); // Reset body rotation
           ctx.rotate(p.aimAngle); // Rotate to aim

           // Ears
           ctx.fillStyle = '#fef3c7';
           ctx.beginPath(); ctx.moveTo(5, -p.radius+5); ctx.lineTo(15, -p.radius-10); ctx.lineTo(25, -p.radius+10); ctx.fill(); // Right Ear
           ctx.beginPath(); ctx.moveTo(5, p.radius-5); ctx.lineTo(15, p.radius+10); ctx.lineTo(25, p.radius-10); ctx.fill(); // Left Ear
           
           // Inner Ears (Pink)
           ctx.fillStyle = '#f9a8d4';
           ctx.beginPath(); ctx.moveTo(8, -p.radius+6); ctx.lineTo(15, -p.radius-6); ctx.lineTo(22, -p.radius+9); ctx.fill();
           ctx.beginPath(); ctx.moveTo(8, p.radius-6); ctx.lineTo(15, p.radius+6); ctx.lineTo(22, p.radius-9); ctx.fill();

           // Whiskers
           ctx.strokeStyle = '#4b5563';
           ctx.lineWidth = 1;
           ctx.beginPath(); ctx.moveTo(p.radius, -5); ctx.lineTo(p.radius+15, -10); ctx.stroke();
           ctx.beginPath(); ctx.moveTo(p.radius, 5); ctx.lineTo(p.radius+15, 10); ctx.stroke();

           ctx.restore();
           // Skip default ball render for cat
           return;
       }

       // DEFAULT BALL RENDER (For Pyro, Tank, Wukong body)
       ctx.rotate(p.angle); 
       
       if (p.slowTimer > 0) ctx.fillStyle = '#64748b';
       else if (p.burnTimer > 0) ctx.fillStyle = '#f97316';
       else ctx.fillStyle = p.color;

       ctx.beginPath();
       ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
       ctx.fill();
       
       // Wukong Headband (only if not image)
       if (p.type === CharacterType.WUKONG) {
           ctx.strokeStyle = '#facc15';
           ctx.lineWidth = 3;
           ctx.beginPath();
           ctx.arc(0, 0, p.radius - 2, 0, Math.PI * 2);
           ctx.stroke();
       }

       ctx.fillStyle = 'rgba(255,255,255,0.2)';
       ctx.beginPath();
       ctx.arc(-p.radius/3, -p.radius/3, p.radius/3, 0, Math.PI * 2);
       ctx.fill();

       ctx.restore();
       if (p.invincibleTimer && p.invincibleTimer > 0) ctx.globalAlpha = 1;

       // Status Overlays
       if (p.type === CharacterType.PYRO && p.skillCooldown <= 0) {
           const time = Date.now() / 200; 
           const orbitR = p.radius + 15;
           for(let i = 5; i >= 1; i--) { 
               const lag = i * 0.15;
               const trailTime = time - lag;
               const tx = Math.cos(trailTime) * orbitR;
               const ty = Math.sin(trailTime) * orbitR;
               const scale = 1 - (i / 6);
               const alpha = (1 - (i / 6)) * 0.5;
               ctx.save();
               ctx.translate(p.pos.x + tx, p.pos.y + ty);
               ctx.fillStyle = `rgba(249, 115, 22, ${alpha})`; 
               ctx.beginPath();
               ctx.arc(0, 0, 5 * scale, 0, Math.PI*2); 
               ctx.fill();
               ctx.restore();
           }
           const ox = Math.cos(time) * orbitR;
           const oy = Math.sin(time) * orbitR;
           ctx.save();
           ctx.translate(p.pos.x + ox, p.pos.y + oy);
           ctx.fillStyle = '#f97316';
           ctx.beginPath();
           ctx.arc(0,0, 6, 0, Math.PI*2);
           ctx.fill();
           ctx.shadowColor = '#ef4444';
           ctx.shadowBlur = 10;
           ctx.strokeStyle = '#fca5a5';
           ctx.lineWidth = 1;
           ctx.stroke();
           ctx.restore();
       }
    });

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
            const range = p.currentWeaponRange || CHAR_STATS[CharacterType.PYRO].flamethrowerRange;
            const angle = p.currentWeaponAngle || CHAR_STATS[CharacterType.PYRO].flamethrowerAngle;

            ctx.save();
            ctx.translate(p.pos.x, p.pos.y);
            ctx.rotate(p.aimAngle);
            
            if (p.isOverheated) {
                // Grey indicator for overheat
                ctx.fillStyle = 'rgba(148, 163, 184, 0.3)'; 
                ctx.beginPath();
                ctx.moveTo(0,0);
                ctx.arc(0, 0, range, -angle, angle); 
                ctx.fill();
                
                // Warning Icon - Inside the cone range
                ctx.translate(range * 0.6, 0);
                ctx.rotate(-p.aimAngle); // Make upright
                
                ctx.fillStyle = '#f59e0b'; // Amber
                ctx.beginPath();
                ctx.moveTo(0, -10);
                ctx.lineTo(11, 8);
                ctx.lineTo(-11, 8);
                ctx.closePath();
                ctx.fill();
                
                ctx.fillStyle = 'black';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('!', 0, 2);
            } else {
                ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
                ctx.beginPath();
                ctx.moveTo(0,0);
                ctx.arc(0, 0, range, -angle, angle); 
                ctx.fill();
            }
            ctx.restore();
        } else if (p.type === CharacterType.TANK && p.tankMode === TankMode.ARTILLERY) {
            const aimX = mouseRef.current.x + state.camera.x;
            const aimY = mouseRef.current.y + state.camera.y;
            const distToTarget = Utils.dist(p.pos, {x: aimX, y: aimY});
            const minRange = CHAR_STATS[CharacterType.TANK].artilleryMinRange;
            const isValid = distToTarget > minRange;

            ctx.strokeStyle = isValid ? '#10b981' : '#ef4444'; 
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(aimX, aimY, CHAR_STATS[CharacterType.TANK].artilleryRadius, 0, Math.PI*2); 
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.beginPath();
            ctx.moveTo(aimX - 10, aimY); ctx.lineTo(aimX + 10, aimY);
            ctx.moveTo(aimX, aimY - 10); ctx.lineTo(aimX, aimY + 10);
            ctx.stroke();

            if (!isValid) {
                ctx.fillStyle = '#ef4444';
                ctx.font = 'bold 14px sans-serif';
                ctx.fillText('距离过近', aimX - 35, aimY + 80);
            }
        } else if (p.type === CharacterType.WUKONG) {
            // Wukong Aim Guide
            if (p.wukongChargeState === 'THRUST') {
                const chargePct = Math.min(1, p.wukongChargeTime / p.wukongMaxCharge);
                const stats = CHAR_STATS[CharacterType.WUKONG];
                const range = 100 + (stats.thrustMaxRange - 100) * chargePct;
                
                ctx.save();
                ctx.translate(p.pos.x, p.pos.y);
                ctx.rotate(p.aimAngle);
                ctx.fillStyle = 'rgba(250, 204, 21, 0.3)';
                ctx.fillRect(0, -5, range, 10);
                ctx.restore();
            } else if (p.wukongChargeState === 'SMASH') {
                // Aim circle at cursor removed - using Charge indicator on player and Aim direction arrow
                const aimX = mouseRef.current.x + state.camera.x;
                const aimY = mouseRef.current.y + state.camera.y;
                // Draw a simple line to mouse to show direction
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.moveTo(p.pos.x, p.pos.y);
                ctx.lineTo(aimX, aimY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        } else if (p.type === CharacterType.CAT) {
            // Cat Aim Guide (Arrow)
            const aimX = mouseRef.current.x + state.camera.x;
            const aimY = mouseRef.current.y + state.camera.y;
            
            ctx.save();
            ctx.translate(p.pos.x, p.pos.y);
            ctx.rotate(p.aimAngle);
            
            // Pounce Arrow
            if (p.catIsCharging) {
                 const chargeTime = (performance.now() - (p.catChargeStartTime || 0)) / 1000;
                 const chargePct = Math.min(1, chargeTime / CHAR_STATS[CharacterType.CAT].pounceMaxCharge);
                 const maxDist = 280; 
                 const length = 50 + maxDist * chargePct; // 50 base + charge
                 
                 ctx.strokeStyle = `rgba(251, 191, 36, ${0.4 + chargePct*0.6})`;
                 ctx.lineWidth = 3 + chargePct * 3;
                 ctx.beginPath();
                 ctx.moveTo(0,0);
                 ctx.lineTo(length, 0);
                 ctx.stroke();
            } else {
                 // Scratch Cone
                 const range = CHAR_STATS[CharacterType.CAT].scratchRange;
                 ctx.fillStyle = 'rgba(217, 70, 239, 0.2)';
                 ctx.beginPath();
                 ctx.moveTo(0,0);
                 ctx.arc(0, 0, range, -0.8, 0.8);
                 ctx.fill();
            }
            ctx.restore();
        }
    }

    ctx.restore();

    // Health Bars
    [state.player, state.enemy].forEach(p => {
       if (p.isDead) return;

       const barW = 60;
       const barH = 6;
       const barX = Math.round(p.pos.x - state.camera.x - barW / 2);
       const barY = Math.round(p.pos.y - state.camera.y - p.radius - 15);

       ctx.fillStyle = 'red';
       ctx.fillRect(barX, barY, barW, barH); 
       
       const hpPct = p.hp / p.maxHp;
       if (hpPct > 0) {
         ctx.fillStyle = '#10b981';
         ctx.fillRect(barX, barY, Math.round(barW * hpPct), barH);
       }
       
       // Wukong Charge Bar
       if (p.type === CharacterType.WUKONG) {
           if (p.wukongChargeState !== 'NONE') {
               const chargePct = Math.min(1, p.wukongChargeTime / p.wukongMaxCharge);
               
               // Visual warning when holding max charge
               if (p.wukongChargeHoldTimer > 0) {
                   ctx.fillStyle = p.wukongChargeHoldTimer > 0.7 ? '#ef4444' : '#fb923c';
               } else {
                   ctx.fillStyle = '#fef08a';
               }
               ctx.fillRect(barX, barY - 8, Math.round(barW * chargePct), 4);
           } else if (p.wukongThrustTimer > 0) {
               // Show cooldown bar (greyed out charge bar)
               const cdPct = p.wukongThrustTimer / 4.0; // Assuming 4.0 is max CD
               ctx.fillStyle = '#64748b';
               ctx.fillRect(barX, barY - 6, Math.round(barW * cdPct), 2);
           }
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
      
      if (playerHpBarRef.current && playerHpTextRef.current) {
          const hpPct = (st.player.hp / st.player.maxHp) * 100;
          playerHpBarRef.current.style.width = `${Math.max(0, hpPct)}%`;
          playerHpTextRef.current.textContent = `${st.player.hp.toFixed(0)} HP`;
      }
      
      if (heatBarRef.current && heatTextRef.current && st.player.type === CharacterType.PYRO) {
          const heatPct = (st.player.heat / st.player.maxHeat) * 100;
          heatBarRef.current.style.width = `${Math.min(100, Math.max(0, heatPct))}%`;
          heatTextRef.current.textContent = `${st.player.heat.toFixed(0)}%`;
      }
      
      if (enemyHpBarRef.current && enemyHpTextRef.current) {
          const ehpPct = (st.enemy.hp / st.enemy.maxHp) * 100;
          enemyHpBarRef.current.style.width = `${Math.max(0, ehpPct)}%`;
          enemyHpTextRef.current.textContent = `${st.enemy.hp.toFixed(0)} / ${st.enemy.maxHp}`;
      }

      if (radarPivotRef.current && st.player.type === CharacterType.TANK && !st.enemy.isDead) {
          const dx = st.enemy.pos.x - st.player.pos.x;
          const dy = st.enemy.pos.y - st.player.pos.y;
          const angle = Math.atan2(dy, dx);
          radarPivotRef.current.style.transform = `rotate(${angle}rad)`;
      }

      if (skillCdOverlayRef.current) {
          if (st.player.skillCooldown > 0) {
              const pct = (st.player.skillCooldown / st.player.skillMaxCooldown) * 100;
              skillCdOverlayRef.current.style.height = `${pct}%`;
              skillCdOverlayRef.current.style.opacity = '1';
          } else {
              skillCdOverlayRef.current.style.height = '0%';
              skillCdOverlayRef.current.style.opacity = '0';
          }
      }

      // Find active drone if any
      let activeDroneStats = null;
      if (st.player.droneState === 'DEPLOYED' && st.player.activeDroneId) {
          const d = st.drones.find(drone => drone.id === st.player.activeDroneId && !drone.isDocked && drone.hp > 0);
          if (d) {
              activeDroneStats = { hp: d.hp, maxHp: d.maxHp, life: d.life, maxLife: d.maxLife };
          }
      }

      setUiState({
        pArtAmmo: st.player.artilleryAmmo, pMaxArtAmmo: st.player.maxArtilleryAmmo,
        pLmgAmmo: st.player.lmgAmmo, pMaxLmgAmmo: st.player.maxLmgAmmo,
        pIsReloadingLmg: st.player.isReloadingLmg,
        pDroneState: st.player.droneState,
        pDroneTimer: st.player.droneTimer, pDroneMaxTimer: st.player.droneMaxTimer,
        pActiveDroneStats: activeDroneStats,
        pTankMode: st.player.tankMode,
        pType: st.player.type,
        pSkillCD: st.player.skillCooldown, pSkillMaxCD: st.player.skillMaxCooldown,
        pSecondarySkillCD: st.player.secondarySkillCooldown, 
        pSecondarySkillMaxCD: st.player.secondarySkillMaxCooldown, // Added for Cat
        pIsOverheated: st.player.isOverheated,
        pWukongCharge: st.player.wukongChargeTime, pWukongMaxCharge: st.player.wukongMaxCharge,
        pWukongThrustTimer: st.player.wukongThrustTimer,
        
        // Cat UI Update
        pCatLives: st.player.lives || 0,
        pCatCharge: st.player.catIsCharging ? (performance.now() - (st.player.catChargeStartTime || 0)) / 1000 : 0,
        
        eCatLives: st.enemy.lives || 0,

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
    Sound.init();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', e => e.preventDefault()); // Disable context menu for right click
    
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
      window.removeEventListener('contextmenu', e => e.preventDefault());
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const getRoleName = (type: CharacterType) => {
    const names: Record<CharacterType, string> = {
      [CharacterType.PYRO]: '火焰球',
      [CharacterType.WUKONG]: '悟空球',
      [CharacterType.CAT]: '猫猫球',
      [CharacterType.TANK]: '坦克球',
      [CharacterType.COACH]: '教练球',
    };
    return names[type] || '未知球体';
  };
  const getModeName = (mode: TankMode) => mode === TankMode.ARTILLERY ? '重炮模式' : '机枪模式';
  const getSkillName = (type: CharacterType) => {
      switch(type) {
          case CharacterType.PYRO: return '岩浆池';
          case CharacterType.WUKONG: return '如意金箍棒';
          case CharacterType.CAT: return '铲屎官之怒';
          default: return '切换形态';
      }
  };
  const getDefeatText = (type: CharacterType) => type === CharacterType.PYRO ? '火焰熄灭' : (type === CharacterType.WUKONG ? '修行不足' : (type === CharacterType.CAT ? '猫猫去睡觉了！' : '机体严重损毁'));

  // Load and check asset availability
  const getAsset = (key: string) => {
      const assets = window.localStorage.getItem('GAME_ASSETS');
      if (assets) {
          const parsed = JSON.parse(assets);
          return parsed[key];
      }
      return null;
  };

  // UI rendering helper for skill icon
  const getSkillIcon = (type: CharacterType) => {
       const skillSrc = CHARACTER_IMAGES[type]?.skill;
       if (skillSrc) {
           return <img src={skillSrc} alt={type} className="w-full h-full object-cover" />;
       }
       // Fix: Cast to CharacterType to bypass TS narrowing from early return
       switch (type as CharacterType) {
           case CharacterType.PYRO: return <span className="text-2xl z-10">☄️</span>;
           case CharacterType.WUKONG: return <span className="text-2xl z-10">🏔️</span>;
           case CharacterType.CAT: return <span className="text-2xl z-10">🐱</span>;
           default: return <span className="text-2xl z-10">🔄</span>;
       }
  }

  const heatBarStyle = uiState.pIsOverheated 
     ? 'bg-white animate-pulse' 
     : (uiState.pType === CharacterType.PYRO ? 'bg-orange-500' : 'bg-slate-500');

  const cursorClass = uiState.gameStatus !== 'PLAYING' 
      ? 'cursor-default' 
      : (uiState.pType === CharacterType.TANK && uiState.pTankMode === TankMode.ARTILLERY 
          ? 'cursor-none' 
          : 'cursor-crosshair');

  return (
    <div className={`relative w-full h-screen overflow-hidden ${cursorClass} font-mono`}>
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

           {/* CAT UI: NINE LIVES */}
           {uiState.pType === CharacterType.CAT && (
               <div className="mb-2">
                   <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-slate-300 font-bold uppercase">九命猫猫</span>
                        <span className="text-xs text-amber-400 font-mono">{uiState.pCatLives} / 9</span>
                   </div>
                   <div className="flex gap-1">
                       {Array.from({length: 9}).map((_, i) => (
                           <div key={i} className={`w-3 h-3 rounded-full border border-amber-900/50 ${i < uiState.pCatLives ? 'bg-amber-400 shadow-[0_0_5px_#fbbf24]' : 'bg-slate-800'}`}></div>
                       ))}
                   </div>
                   {/* Pounce charge bar removed as requested */}
               </div>
           )}

           {/* SKILLS & STATUS */}
           <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-700/50">
              <div className="flex items-center gap-3">
                 {/* ENHANCED SKILL ICON */}
                 <div className={`w-14 h-14 rounded-lg border-2 overflow-hidden relative flex items-center justify-center transition-colors ${uiState.pSkillCD <= 0 ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]' : 'border-slate-600 bg-slate-800'}`}>
                    {getSkillIcon(uiState.pType)}
                    
                    <div 
                       ref={skillCdOverlayRef}
                       className="absolute bottom-0 left-0 w-full bg-black/80 z-20 pointer-events-none transition-all duration-75 ease-linear"
                       style={{ height: '0%' }}
                    ></div>
                    
                    {uiState.pSkillCD <= 0 && (
                        <div className="absolute inset-0 bg-yellow-400/20 animate-pulse z-0"></div>
                    )}
                 </div>

                 <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">技能 (Space)</span>
                    <span className={`text-sm font-bold ${uiState.pSkillCD <= 0 ? 'text-yellow-400' : 'text-slate-500'}`}>
                        {uiState.pSkillCD > 0 ? (uiState.pType === CharacterType.CAT ? `${uiState.pSkillCD.toFixed(1)}s` : "冷却中...") : getSkillName(uiState.pType)}
                    </span>
                 </div>
              </div>

              {uiState.pType === CharacterType.TANK && (
                <div className="flex flex-col items-end gap-1">
                    <div className="px-2 py-1 bg-slate-800/80 rounded border border-slate-600 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    {getModeName(uiState.pTankMode)}
                    </div>
                </div>
              )}

              {/* WUKONG THRUST CD INDICATOR */}
              {uiState.pType === CharacterType.WUKONG && (
                   <div className="flex flex-col items-end">
                       <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">呔！ (右键)</span>
                       <span className={`text-xs font-bold ${uiState.pWukongThrustTimer <= 0 ? 'text-yellow-400' : 'text-slate-500'}`}>
                           {uiState.pWukongThrustTimer > 0 ? `${uiState.pWukongThrustTimer.toFixed(1)}s` : "就绪"}
                       </span>
                   </div>
              )}
              
              {/* CAT HISS CD INDICATOR */}
              {uiState.pType === CharacterType.CAT && (
                   <div className="flex flex-col items-end w-24">
                       <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">哈气 (右键)</span>
                       {uiState.pSecondarySkillCD > 0 ? (
                           <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
                               <div 
                                   className="h-full bg-amber-600" 
                                   style={{width: `${(1 - uiState.pSecondarySkillCD / uiState.pSecondarySkillMaxCD) * 100}%`}}
                               ></div> 
                           </div>
                       ) : (
                           <span className="text-xs font-bold text-amber-400">就绪</span>
                       )}
                   </div>
              )}
           </div>

           {/* TANK RADAR UI & Drone Status */}
           {uiState.pType === CharacterType.TANK && (
              <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                 {/* Radar + Status */}
                 <div className="flex items-center">
                    <div className="flex flex-col items-end mr-3">
                         <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">雷达系统</span>
                         <span className="text-xs font-bold text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]">运转中</span>
                    </div>

                    <div className="relative w-12 h-12 rounded-full bg-slate-900 border-2 border-slate-600 shadow-inner flex items-center justify-center overflow-hidden">
                        <div className="absolute inset-0 border border-slate-800 rounded-full scale-50"></div>
                        <div className="absolute w-full h-[1px] bg-slate-800"></div>
                        <div className="absolute h-full w-[1px] bg-slate-800"></div>
                        <div className="w-1 h-1 bg-emerald-500 rounded-full z-10 shadow-[0_0_5px_#10b981]"></div>
                        <div ref={radarPivotRef} className="absolute inset-0 w-full h-full">
                           <div className="absolute top-1/2 right-1 -translate-y-1/2 w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444] animate-pulse"></div>
                        </div>
                    </div>
                 </div>

                 {/* Drone Status */}
                 <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">无人机 (右键)</span>
                    {uiState.pDroneState === 'READY' ? (
                        <span className="text-xs font-bold text-emerald-400">就绪</span>
                    ) : (uiState.pDroneState === 'DEPLOYED' ? (
                        uiState.pActiveDroneStats ? (
                            <div className="flex flex-col w-24">
                                <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
                                     <span>结构</span>
                                     <span>{Math.ceil(uiState.pActiveDroneStats.hp)}</span>
                                </div>
                                <div className="w-full h-1 bg-slate-800 rounded-full mb-1">
                                     <div className="h-full bg-green-500" style={{width: `${(uiState.pActiveDroneStats.hp/uiState.pActiveDroneStats.maxHp)*100}%`}}></div>
                                </div>
                                <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
                                     <span>电池</span>
                                     <span>{Math.ceil(uiState.pActiveDroneStats.life/1000)}s</span>
                                </div>
                                <div className="w-full h-1 bg-slate-800 rounded-full">
                                     <div className="h-full bg-blue-400" style={{width: `${(uiState.pActiveDroneStats.life/uiState.pActiveDroneStats.maxLife)*100}%`}}></div>
                                </div>
                            </div>
                        ) : (
                            <span className="text-xs font-bold text-blue-400 animate-pulse">工作中...</span>
                        )
                    ) : (
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] text-slate-500 mb-0.5">{uiState.pDroneState === 'RECONSTRUCTING' ? '重建中' : '充电中'}</span>
                            <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full ${uiState.pDroneState === 'RECONSTRUCTING' ? 'bg-yellow-600' : 'bg-blue-500'}`} 
                                    style={{width: `${(uiState.pDroneTimer / uiState.pDroneMaxTimer)*100}%`}}
                                ></div>
                            </div>
                        </div>
                    ))}
                 </div>
              </div>
           )}
        </div>
      </div>

      {/* Enemy Boss Bar Top-Right */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2 pointer-events-auto select-none">
        
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
            {/* 敌方猫猫命数显示 (位于血条上方) */}
            {uiState.eType === CharacterType.CAT && (
                <div className="flex justify-end gap-1 mb-1.5">
                    {Array.from({length: 9}).map((_, i) => (
                        <div 
                           key={i} 
                           className={`w-2.5 h-2.5 rounded-full border border-red-900/50 ${i >= 9 - uiState.eCatLives ? 'bg-amber-400 shadow-[0_0_5px_#fbbf24]' : 'bg-slate-800'}`}
                        ></div>
                    ))}
                </div>
            )}
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