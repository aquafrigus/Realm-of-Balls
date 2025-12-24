import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
    CharacterType, GameState, PlayerState, Vector2, TankMode, GroundEffect, Obstacle, Drone, DamageType, DangerZone
} from '../types';
import {
    MAP_SIZE, PHYSICS, CHAR_STATS, STATUS_CONFIG, MAGIC_SPELL_LINES, TERRAIN_CONFIG, HAZARD_AFFINITY, DEFAULT_HAZARD_AFFINITY
} from '../constants';

import * as Utils from '../utils';
import { Sound } from '../sound';
import { CHARACTER_IMAGES } from '../images';
import type { GameConfig } from './CustomGameSetup';

interface GameProps {
    playerType: CharacterType;
    enemyType?: CharacterType | 'RANDOM';
    customConfig?: GameConfig | null;
    onExit: () => void;
}

// Explicit UI State Interface to prevent type inference issues (specifically missing CharacterType.CAT)
interface UIState {
    pArtAmmo: number; pMaxArtAmmo: number;
    pLmgAmmo: number; pMaxLmgAmmo: number;
    pIsReloadingLmg: boolean;
    pDroneState: 'READY' | 'DEPLOYED' | 'RECONSTRUCTING' | 'CHARGING';
    pDroneTimer: number; pDroneMaxTimer: number;
    pActiveDroneStats: { hp: number, maxHp: number, life: number, maxLife: number } | null;
    pTankMode: TankMode;
    pType: CharacterType;
    pUiThemeColor: string; // Player's dynamic UI theme color
    pSkillCD: number; pSkillMaxCD: number;
    pSecondarySkillCD: number; pSecondarySkillMaxCD: number;
    pIsBurnedOut: boolean;
    pWukongCharge: number; pWukongMaxCharge: number;
    pWukongThrustTimer: number;
    pCatLives: number;
    pCatCharge: number;
    pMp: number; pMaxMp: number; // Magic Ball MP
    pMagicForm?: 'WHITE' | 'BLACK'; // Magic Ball Form
    pMagicShieldHp: number; // Magic Ball Shield HP
    pMagicShieldMaxHp: number; // Magic Ball Max Shield HP
    eCatLives: number;
    eType: CharacterType;
    eDisplayName: string; // 最近敌人显示名称（用于无人机等）
    gameStatus: 'PLAYING' | 'VICTORY' | 'DEFEAT' | 'PAUSED';
    isSpectating: boolean; // Added for correct UI rendering
}

const Game: React.FC<GameProps> = ({ playerType, enemyType, customConfig, onExit }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);

    // Direct DOM Refs for High-Frequency UI Updates
    const playerHpBarRef = useRef<HTMLDivElement>(null);
    const playerHpTextRef = useRef<HTMLSpanElement>(null);
    const enemyHpBarRef = useRef<HTMLDivElement>(null);
    const enemyHpTextRef = useRef<HTMLSpanElement>(null);
    const lastEnemyRef = useRef<any>(null); // [New] Cache last known enemy for UI persistence
    const heatBarRef = useRef<HTMLDivElement>(null);
    const heatTextRef = useRef<HTMLSpanElement>(null);
    const skillCdOverlayRef = useRef<HTMLDivElement>(null);

    // Tank Radar Ref
    const radarCanvasRef = useRef<HTMLCanvasElement>(null);

    // Sound Throttle Refs
    const lastPyroSoundTimeRef = useRef<number>(0);
    const lastDroneSoundTimeRef = useRef<number>(0);

    // Spectator Target Ref
    const spectatorTargetIdRef = useRef<string | null>(null);

    // 相机预热计时器：游戏开始后逐渐增加鼠标对相机的影响力，避免突然跳动
    const cameraWarmupRef = useRef<number>(0);


    const textCooldownsRef = useRef<Map<string, Record<string, number>>>(new Map());

    // Helper: Resolve highest priority status color & label
    // Helper: Resolve status color & label based on LATEST applied valid status
    const getStatusInfo = (p: PlayerState) => {
        // Ensure history exists
        if (!p.statusHistory) p.statusHistory = [];

        // Iterate backwards to find the latest valid status
        for (let i = p.statusHistory.length - 1; i >= 0; i--) {
            const type = p.statusHistory[i];
            const config = STATUS_CONFIG[type];
            if (!config) continue;

            // Check validity
            let isActive = false;
            if (type === 'wet') isActive = p.isWet;
            else if (type === 'stealth') isActive = p.stealth;
            else {
                const timerProp = `${type}Timer`;
                isActive = (p as any)[timerProp] > 0;
            }

            if (isActive) {
                return config;
            }
        }
        return null;
    };


    const isMechanical = (entity: any): boolean => {
        return !!entity.isMechanical;
    };

    // 硬控状态计时器的属性名（对应 isControlled 中的六种状态）
    const CONTROL_TIMER_KEYS = [
        'stunTimer', 'sleepTimer', 'petrifyTimer',
        'charmTimer', 'tauntTimer', 'fearTimer'
    ] as const;

    // 状态类型到属性名的映射（集中管理，避免重复定义）
    const STATUS_PROPERTY_MAP: Record<string, string> = {
        'fear': 'fearTimer',
        'stun': 'stunTimer',
        'slow': 'slowTimer',
        'root': 'rootTimer',
        'silence': 'silenceTimer',
        'disarm': 'disarmTimer',
        'blind': 'blindTimer',
        'sleep': 'sleepTimer',
        'petrify': 'petrifyTimer',
        'burn': 'burnTimer',
        'taunt': 'tauntTimer',
        'charm': 'charmTimer',
        'stealth': 'stealthTimer',
        'haste': 'hasteTimer',
        'invincible': 'invincibleTimer',
        'burst': 'burstFlag',
        'wet': 'isWet',
        'heal': 'hp',
        'revive': 'isDead'
    };

    // Helper: 任何形式的控制状态（用于隐藏指示器、禁止自主瞄准等）
    const isControlled = (p: PlayerState): boolean => {
        return CONTROL_TIMER_KEYS.some(key => (p[key as keyof PlayerState] as number || 0) > 0);
    };

    // Helper: 清除所有硬控效果
    const clearControlEffects = (p: PlayerState) => {
        CONTROL_TIMER_KEYS.forEach(key => {
            (p as any)[key] = 0;
        });
    };

    // Helper: 清空所有状态效果（用于复活时）
    const clearAllStatusEffects = (p: PlayerState) => {
        // 自动遍历所有状态并清空（排除 heal 和 revive，它们不是状态效果）
        Object.entries(STATUS_PROPERTY_MAP).forEach(([statusType, propName]) => {
            // 跳过特殊类型
            if (statusType === 'heal' || statusType === 'revive') return;

            const currentValue = (p as any)[propName];

            // 根据属性类型重置
            if (typeof currentValue === 'boolean') {
                (p as any)[propName] = false;
            } else if (typeof currentValue === 'number') {
                (p as any)[propName] = 0;
            }
        });

        // 清空状态历史
        p.statusHistory = [];

        // 清空来源ID
        p.tauntSourceId = undefined;
        p.burnSourceId = undefined;
    };

    // Helper: 能否使用右键技能（防御/特殊技能）
    // 排除：isControlled (六种硬控) + 沉默
    const canUseSecondarySkill = (p: PlayerState): boolean => {
        return !isControlled(p) && p.silenceTimer <= 0;
    };

    // Helper: 能否使用空格大招（与右键相同逻辑，独立函数便于未来扩展）
    const canUseUltimate = (p: PlayerState): boolean => {
        return canUseSecondarySkill(p); // 当前逻辑相同
    };

    const calculatePyroShape = (distToTarget: number) => {
        const baseRange = CHAR_STATS[CharacterType.PYRO].flamethrowerRange;
        const baseAngle = CHAR_STATS[CharacterType.PYRO].flamethrowerAngle;

        // 面积常数 K
        const areaConstant = baseRange * baseRange * baseAngle;
        const clampedDist = Utils.clamp(distToTarget, 70, baseRange); // [修复] 使用实际射程 (320) 而非硬编码 280
        const newAngle = areaConstant / (clampedDist * clampedDist);

        // 限制最大角度为80度（约1.4弧度），防止变成环形
        const maxAngle = Math.PI * 80 / 180; // 80度 ≈ 1.396 弧度
        const finalAngle = Math.min(newAngle, maxAngle);

        return { range: clampedDist, angle: finalAngle };
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
            type: 'WATER',
            priority: 0 // Will be reassigned later based on index
        });

        // 2. Generate 2-3 Large Solid Obstacles (Fixed requirement)
        const numLargeWalls = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < numLargeWalls; i++) {
            // Large blocks, could be thick walls or squares
            const w = 200 + Math.random() * 300;
            const h = 200 + Math.random() * 300;
            obs.push({
                id: `wall-large-${i}`,
                x: Math.random() * (MAP_SIZE.width - w),
                y: Math.random() * (MAP_SIZE.height - h),
                width: w,
                height: h,
                type: 'WALL',
                priority: 0 // Will be reassigned later based on index
            });
        }

        // [Modified] Generate 1 Medium & 1 Small Lava Pool
        const medLavaW = 250 + Math.random() * 150;
        const medLavaH = 250 + Math.random() * 150;
        obs.push({
            id: 'lava-medium',
            x: Math.random() * (MAP_SIZE.width - medLavaW),
            y: Math.random() * (MAP_SIZE.height - medLavaH),
            width: medLavaW,
            height: medLavaH,
            type: 'LAVA',
            priority: 0
        });

        const smLavaW = 120 + Math.random() * 80;
        const smLavaH = 120 + Math.random() * 80;
        obs.push({
            id: 'lava-small',
            x: Math.random() * (MAP_SIZE.width - smLavaW),
            y: Math.random() * (MAP_SIZE.height - smLavaH),
            width: smLavaW,
            height: smLavaH,
            type: 'LAVA',
            priority: 0
        });

        // 3. Random Scatter (Reduced count slightly to accommodate large ones)
        const numRandomWalls = 3 + Math.floor(Math.random() * 3);
        const numRandomWater = 1 + Math.floor(Math.random() * 2);

        const isValid = (rect: { x: number, y: number, width: number, height: number }) => {
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

        for (let i = 0; i < numRandomWalls + numRandomWater; i++) {
            let attempts = 0;
            while (attempts < 50) {
                const w = 40 + Math.random() * 200;
                const h = 40 + Math.random() * 200;
                const x = Math.random() * (MAP_SIZE.width - w);
                const y = Math.random() * (MAP_SIZE.height - h);
                const type: 'WALL' | 'WATER' = i < numRandomWalls ? 'WALL' : 'WATER';
                const newObs: Obstacle = { id: `obs-random-${i}`, x, y, width: w, height: h, type, priority: 0 };

                if (isValid(newObs)) {
                    obs.push(newObs);
                    break;
                }
                attempts++;
            }
        }

        // [新增] 按渲染顺序分配唯一优先级 (索引越大，优先级越高，渲染在越上层)
        // [修改] 明确优先级层次：WATER(0+) < LAVA(100+) < WALL(200+)
        obs.forEach((o, idx) => {
            let typeWeight = 0;
            if (o.type === 'LAVA') typeWeight = 100;
            else if (o.type === 'WALL') typeWeight = 200;
            o.priority = typeWeight + idx;
        });

        return obs;
    };

    // 1. 计算出生点（支持多人）
    const getSpawnPoints = (count: number) => {
        const points: Vector2[] = [];
        const padding = 300;
        const w = MAP_SIZE.width;
        const h = MAP_SIZE.height;

        // 2人对战：左上、右下
        if (count === 2) {
            points.push({ x: padding, y: padding });
            points.push({ x: w - padding, y: h - padding });
        }
        // 4人对战：四角
        else if (count === 4) {
            points.push({ x: padding, y: padding });
            points.push({ x: w - padding, y: h - padding });
            points.push({ x: w - padding, y: padding });
            points.push({ x: padding, y: h - padding });
        }
        // 其他人数：圆形分布
        else {
            const cx = w / 2;
            const cy = h / 2;
            const r = Math.min(w, h) / 2 - padding;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count;
                points.push({
                    x: cx + Math.cos(angle) * r,
                    y: cy + Math.sin(angle) * r
                });
            }
        }
        return points;
    };

    // 2. 初始化玩家列表
    const initPlayers = (): PlayerState[] => {
        if (customConfig) {
            // 使用自定义配置
            const spawns = getSpawnPoints(customConfig.players.length);
            return customConfig.players.map((cfg, i) =>
                createPlayer(cfg.type, spawns[i], cfg.isPlayer ? 'player' : `bot_${i}`, cfg.teamId, cfg.isBot)
            );
        } else {
            // 传统的快速开始 (1v1)
            const spawns = getSpawnPoints(2);
            // 玩家永远是 team 0
            const p1 = createPlayer(playerType, spawns[0], 'player', 0, false);

            let eType = enemyType as CharacterType;
            if (enemyType === 'RANDOM' || !enemyType) {
                const types = [CharacterType.PYRO, CharacterType.TANK, CharacterType.WUKONG, CharacterType.CAT];
                eType = types[Math.floor(Math.random() * types.length)];
            }

            // 敌人永远是 team 1
            let enemySpawnPos = spawns[1];
            if (eType === CharacterType.COACH) {
                enemySpawnPos = { x: MAP_SIZE.width / 2, y: MAP_SIZE.height / 2 };
            }
            const p2 = createPlayer(eType, enemySpawnPos, 'enemy', 1, true);
            return [p1, p2];
        }
    };

    const getRandomEdgePos = () => {
        const edge = Math.floor(Math.random() * 4);
        const padding = 200;
        const w = MAP_SIZE.width;
        const h = MAP_SIZE.height;
        // 0: Top, 1: Bottom, 2: Left, 3: Right
        switch (edge) {
            case 0: return { x: Math.random() * (w - 2 * padding) + padding, y: padding };
            case 1: return { x: Math.random() * (w - 2 * padding) + padding, y: h - padding };
            case 2: return { x: padding, y: Math.random() * (h - 2 * padding) + padding };
            default: return { x: w - padding, y: Math.random() * (h - 2 * padding) + padding };
        }
    };

    const spawnPlayer = getRandomEdgePos();
    // Ensure enemy spawns reasonably far away
    let spawnEnemy = getRandomEdgePos();
    let attempts = 0;
    while (Utils.dist(spawnPlayer, spawnEnemy) < 800 && attempts < 10) {
        spawnEnemy = getRandomEdgePos();
        attempts++;
    }

    // Game State Ref
    const stateRef = useRef<GameState>({
        players: initPlayers(),
        projectiles: [],
        particles: [],
        groundEffects: [],
        drones: [],
        obstacles: generateObstacles(),
        floatingTexts: [],
        camera: { x: 0, y: 0 },
        gameStatus: 'PLAYING'
    });

    // 获取本地玩家（用于输入控制、UI显示）
    const getHumanPlayer = () => {
        return stateRef.current.players.find(p => p.id === 'player') || stateRef.current.players[0];
    };

    // 获取某人的所有敌人（用于攻击判定、AI索敌）
    const getEnemies = (p: PlayerState) => {
        // 找出所有 阵营不同 且 没死 的玩家/机器人
        const enemies: any[] = stateRef.current.players.filter(other => {
            if (other.id === p.id || other.teamId === p.teamId || other.isDead) return false;

            // Stealth Logic: Only visible if very close
            if ((other.stealthTimer || 0) > 0) {
                if (Utils.dist(p.pos, other.pos) > 200) return false;
            }
            return true;
        });

        // 同时也把敌对阵营的无人机算作敌人
        stateRef.current.drones.forEach(d => {
            const owner = stateRef.current.players.find(pl => pl.id === d.ownerId);
            // 如果无人机的主人存在，且是敌对阵营，且无人机活着
            if (owner && owner.teamId !== p.teamId && d.hp > 0 && !d.isDocked) {
                enemies.push(d);
            }
        });
        return enemies;
    };

    const getDangerZones = (entity: PlayerState, state: GameState): DangerZone[] => {
        const dangerZones: DangerZone[] = [];
        const affinity = { ...DEFAULT_HAZARD_AFFINITY, ...(HAZARD_AFFINITY[entity.type] || {}) };

        // 1. Skill Hazards (Ground Effects)
        const skillWeight = affinity.SKILL ?? 1.0;
        if (skillWeight !== 0) {
            state.groundEffects.forEach(eff => {
                if (eff.ownerId === entity.id) return;

                if (eff.type === 'SCOOPER_WARNING') {
                    dangerZones.push({
                        type: 'CIRCLE',
                        hazardType: 'SKILL',
                        center: eff.pos,
                        radius: eff.radius,
                        timeLeft: eff.life,
                        weight: skillWeight
                    });
                }
            });
        }

        // 2. Enemy Charging Skills
        if (skillWeight !== 0) {
            const allEnemies = getEnemies(entity);
            allEnemies.forEach(enemy => {
                if (enemy.isDead) return;

                if (enemy.type === CharacterType.WUKONG && enemy.wukongChargeState === 'THRUST') {
                    const aimDir = { x: Math.cos(enemy.aimAngle), y: Math.sin(enemy.aimAngle) };
                    const range = CHAR_STATS.WUKONG.thrustMaxRange;
                    const timeLeft = Math.max(0, enemy.wukongMaxCharge - enemy.wukongChargeTime);

                    dangerZones.push({
                        type: 'RECT',
                        hazardType: 'SKILL',
                        p1: enemy.pos,
                        p2: Utils.add(enemy.pos, Utils.mult(aimDir, range)),
                        width: 50,
                        timeLeft: timeLeft,
                        weight: skillWeight
                    });
                }

                if (enemy.type === CharacterType.WUKONG && enemy.wukongChargeState === 'SMASH') {
                    const range = CHAR_STATS.WUKONG.smashMaxRange;
                    let timeLeft = 0;
                    if (enemy.wukongChargeTime < enemy.wukongMaxCharge) {
                        timeLeft = (enemy.wukongMaxCharge - enemy.wukongChargeTime) + 1.0;
                    } else {
                        timeLeft = Math.max(0, 1.0 - enemy.wukongChargeHoldTimer);
                    }

                    dangerZones.push({
                        type: 'CIRCLE',
                        hazardType: 'SKILL',
                        center: enemy.pos,
                        radius: range + 10,
                        timeLeft: timeLeft,
                        weight: skillWeight
                    });
                }
            });
        }

        // 3. Water Hazards
        const waterWeight = affinity.WATER ?? 1.0;
        if (waterWeight !== 0) {
            state.obstacles.filter(obs => obs.type === 'WATER').forEach(water => {
                dangerZones.push({
                    type: 'RECT',
                    hazardType: 'WATER',
                    p1: { x: water.x, y: water.y + water.height / 2 },
                    p2: { x: water.x + water.width, y: water.y + water.height / 2 },
                    width: water.height,
                    timeLeft: 99, // [Fix] Permanent terrain has near-infinite escape time
                    weight: waterWeight
                });
            });
        }

        // 4. Magma Hazards (Lava Terrain & Magma Pools)
        const magmaWeight = affinity.MAGMA ?? 0;
        if (magmaWeight !== 0) {
            // A. Environmental Lava (LAVA Obstacles)
            state.obstacles.filter(obs => obs.type === 'LAVA').forEach(lava => {
                dangerZones.push({
                    type: 'RECT',
                    hazardType: 'MAGMA',
                    p1: { x: lava.x, y: lava.y + lava.height / 2 },
                    p2: { x: lava.x + lava.width, y: lava.y + lava.height / 2 },
                    width: lava.height,
                    timeLeft: 99, // Permanent terrain
                    weight: magmaWeight
                });
            });

            // B. Skill Magma Pools
            state.groundEffects.filter(eff => eff.type === 'MAGMA_POOL').forEach(pool => {
                dangerZones.push({
                    type: 'CIRCLE',
                    hazardType: 'MAGMA',
                    center: pool.pos,
                    radius: pool.radius,
                    timeLeft: pool.life,
                    weight: magmaWeight
                });
            });
        }

        // 5. Walls (Obstacles)
        const wallWeight = affinity.WALL ?? 0;
        if (wallWeight !== 0) {
            state.obstacles.filter(obs => obs.type !== 'WATER').forEach(wall => {
                dangerZones.push({
                    type: 'RECT',
                    hazardType: 'WALL',
                    p1: { x: wall.x, y: wall.y + wall.height / 2 },
                    p2: { x: wall.x + wall.width, y: wall.y + wall.height / 2 },
                    width: wall.height,
                    timeLeft: 99,
                    weight: wallWeight
                });
            });
        }

        return dangerZones;
    };

    const getPointDangerInfo = (pt: Vector2, zone: DangerZone): { inside: boolean, escapeVec: Vector2, distToEdge: number } => {
        let inside = false;
        let escapeVec: Vector2 = { x: 0, y: 0 };
        let distToEdge = 0;

        if (zone.type === 'CIRCLE') {
            const d = Utils.dist(pt, zone.center!);
            if (d < zone.radius!) {
                inside = true;
                const dirToPt = Utils.sub(pt, zone.center!);
                const normDir = Utils.mag(dirToPt) === 0 ? { x: 1, y: 0 } : Utils.normalize(dirToPt);
                distToEdge = zone.radius! - d + 5; // +5 padding
                escapeVec = normDir;
            }
        } else if (zone.type === 'RECT') {
            // Point Line Distance
            const l2 = Utils.dist(zone.p1!, zone.p2!) ** 2;
            let t = 0;
            if (l2 !== 0) {
                t = ((pt.x - zone.p1!.x) * (zone.p2!.x - zone.p1!.x) + (pt.y - zone.p1!.y) * (zone.p2!.y - zone.p1!.y)) / l2;
                t = Math.max(0, Math.min(1, t));
            }
            const projection = Utils.add(zone.p1!, Utils.mult(Utils.sub(zone.p2!, zone.p1!), t));
            const d = Utils.dist(pt, projection);

            const halfWidth = zone.width! / 2;
            if (d < halfWidth) {
                inside = true;
                const dirAway = Utils.sub(pt, projection);
                const normDir = Utils.mag(dirAway) === 0
                    ? { x: -(zone.p2!.y - zone.p1!.y), y: (zone.p2!.x - zone.p1!.x) } // arbitrary perp
                    : Utils.normalize(dirAway);

                distToEdge = halfWidth - d + 20; // +20 padding
                escapeVec = Utils.normalize(normDir);
            }
        }

        return { inside, escapeVec, distToEdge };
    };



    // [新增] 获取所有可攻击目标（实现友军伤害）- 返回所有存活的玩家和无人机，除了自己
    const getAllAttackTargets = (p: PlayerState) => {
        const targets: any[] = stateRef.current.players.filter(other =>
            other.id !== p.id && !other.isDead
        );

        // 包括所有无人机（除了自己的）
        stateRef.current.drones.forEach(d => {
            if (d.ownerId !== p.id && d.hp > 0 && !d.isDocked) {
                targets.push(d);
            }
        });
        return targets;
    };

    // 获取最近的敌人（用于AI）
    const getNearestEnemy = (p: PlayerState) => {
        let nearest: any = null;
        let minDst = Infinity;
        const enemies = getEnemies(p);
        enemies.forEach(e => {
            const d = Utils.dist(p.pos, e.pos);
            if (d < minDst) {
                minDst = d;
                nearest = e;
            }
        });
        return nearest;
    };

    const keysRef = useRef<{ [key: string]: boolean }>({});
    const mouseRef = useRef<Vector2>({ x: 0, y: 0 });
    const mouseBtnsRef = useRef<{ [key: string]: boolean }>({});

    const [showExitDialog, setShowExitDialog] = useState(false);
    const showExitDialogRef = useRef(false);

    // Sync Ref with State for Event Handlers
    useEffect(() => {
        showExitDialogRef.current = showExitDialog;
    }, [showExitDialog]);

    const [uiState, setUiState] = useState<UIState>({
        pArtAmmo: 0, pMaxArtAmmo: 5, // Tank Artillery
        pLmgAmmo: 0, pMaxLmgAmmo: 200, pIsReloadingLmg: false, // Tank LMG
        pTankMode: TankMode.ARTILLERY,
        pDroneState: 'READY', pDroneTimer: 0, pDroneMaxTimer: 10, // Tank Drone
        pActiveDroneStats: null,
        pType: CharacterType.PYRO,
        pUiThemeColor: CHAR_STATS[CharacterType.PYRO].uiThemeColor,
        pSkillCD: 0, pSkillMaxCD: 1,
        pSecondarySkillCD: 0, // General secondary skill CD
        pSecondarySkillMaxCD: 1,
        pIsBurnedOut: false, // Kept for styling classes
        pWukongCharge: 0, pWukongMaxCharge: 1, // Wukong Charge
        pWukongThrustTimer: 0, // Wukong Thrust Cooldown

        // Cat UI
        pCatLives: 0,
        pCatCharge: 0,

        // Magic UI
        pMp: 0, pMaxMp: 200,
        pMagicForm: 'WHITE',
        pMagicShieldHp: 0,
        pMagicShieldMaxHp: CHAR_STATS[CharacterType.MAGIC].armorShieldHp,

        eCatLives: 0,

        eType: (stateRef.current.players.find(p => p.id !== 'player') || stateRef.current.players[0]).type,
        eDisplayName: '未知敌人',
        gameStatus: 'PLAYING',
        isSpectating: false
    });

    // --- Initialization ---

    useEffect(() => {
        // 重置相机预热计时器，让相机在游戏开始后平滑过渡到鼠标控制
        cameraWarmupRef.current = 0;

        if (customConfig) {
            Sound.playUI('START');
        }

        // Start Beacon Animation
        // Create beacon for ALL players
        stateRef.current.players.forEach(p => {
            // [Modified] Only render spawn animation for player's own ball
            if (p.id !== 'player') return;

            // We use a custom 'START_BEACON' for a friendly indicator
            stateRef.current.groundEffects.push({
                id: `start_beacon_${p.id}`,
                pos: { ...p.pos },
                radius: 120, // Slightly larger
                life: 1.6,   // Lasts 2.2 seconds (slightly faster)
                maxLife: 1.6,
                type: 'START_BEACON',
                ownerId: p.id
            });
            // Also some themed particles
            spawnParticles(p.pos, 30, p.color, 6, 2.0);

            // [New] Entrance Line for Black Magic Ball
            if (p.type === CharacterType.MAGIC && p.magicForm === 'BLACK') {
                p.statusLabel = "为了更伟大的利益。";
                p.statusLabelColor = "#22c55e";
            }
        });
    }, []);

    function createPlayer(type: CharacterType, pos: Vector2, id: string, teamId: number, isBot: boolean): PlayerState {
        const stats: any = CHAR_STATS[type];

        // 1. 先确定形态（如果是魔法球）
        const magicForm = type === CharacterType.MAGIC
            ? (Math.random() < 0.00000000001 ? 'BLACK' : 'WHITE') // 暂时先将黑化概率设置为超小概率，后续需要调试黑魔法球时再调整
            : undefined;
        // 2. 根据形态选择颜色和主题色
        let color = stats.color;
        let uiThemeColor = stats.uiThemeColor;
        if (type === CharacterType.MAGIC) {
            if (magicForm === 'WHITE') {
                color = stats.color;
                uiThemeColor = stats.uiThemeColor;
            } else {
                color = stats.darkWizardColor;
                uiThemeColor = stats.darkWizardUiThemeColor;
            }
        }

        return {
            id,
            type,
            teamId,
            isBot,
            pos,
            vel: { x: 0, y: 0 },
            radius: stats.radius,
            isMechanical: type === CharacterType.TANK, // Tank is mechanical
            mass: stats.mass,
            color: color,
            uiThemeColor: uiThemeColor,

            hp: stats.hp,
            maxHp: stats.hp,

            isDead: false,
            matchEndTimer: 0,

            // Pyro Fuel (replaces Heat)
            fuel: stats.maxFuel || 200,
            maxFuel: stats.maxFuel || 200,
            isBurnedOut: false,

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
            prevAimAngle: 0,
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
            stunTimer: 0,
            blindTimer: 0,
            tauntTimer: 0,
            rootTimer: 0,
            sleepTimer: 0,
            petrifyTimer: 0,
            charmTimer: 0,
            stealth: false,

            // Magic Ball
            mp: stats.maxMp || 0,
            maxMp: stats.maxMp || 0,
            magicForm: magicForm,
            magicShieldHp: 0,
            magicShieldTimer: 0,
            lightSpiritTimer: 0,
            magicUltCharging: false,
            magicUltChargeTime: 0,
            magicChargeTimer: 0,
            ccImmuneTimer: 0,

            // AI defaults
            lastPos: pos,
            stuckTimer: 0,
            unstuckTimer: 0,
            unstuckDir: { x: 0, y: 0 },
            burstTimer: 0,
            bufferedInput: 'NONE',
            statusHistory: [], // [New]

            // AI Variance
            aiSeed: Math.random(),
            aiPreferredDistOffset: (Math.random() - 0.5) * 100,
            aiStrafeDir: Math.random() < 0.5 ? 1 : -1,
            aiStrafeTimer: 0,
            aiChangeDistTimer: 0,
            forcedMoveTimer: 0,
        };
    }

    // --- Input ---

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // [New] ESC Control Logic
        if (e.code === 'Escape') {
            // Only allow toggling if game is still playing
            if (stateRef.current.gameStatus === 'PLAYING') {
                setShowExitDialog(prev => !prev);
                if (!showExitDialogRef.current) Sound.playUI('HOVER'); // Play sound on open
            }
            return;
        }

        // Block other inputs if dialog is open
        if (showExitDialogRef.current) return;

        keysRef.current[e.code] = true;
        const p = getHumanPlayer();
        if (p.isDead || p.isBot) return;
        if (p.type === CharacterType.WUKONG && e.code === 'Space' && p.skillCooldown <= 0) {
            if (p.wukongChargeState === 'NONE' && canUseUltimate(p)) {
                p.wukongChargeState = 'SMASH';
                p.wukongChargeTime = 0;
                p.wukongChargeHoldTimer = 0;
                p.wukongMaxCharge = CHAR_STATS[CharacterType.WUKONG].smashChargeTime;
                Sound.playSkill('CHARGE_START');
            }
        } else if (p.type === CharacterType.CAT && e.code === 'Space' && p.skillCooldown <= 0) {
            // CAT SCOOPER SMASH
            if (canUseUltimate(p)) {
                handleCatScooper(p);
            }
        }
    }, []);

    const handleKeyUp = useCallback((e: KeyboardEvent) => {
        keysRef.current[e.code] = false;
        const p = getHumanPlayer();
        if (p.isDead || p.isBot) return;
        if (p.type === CharacterType.WUKONG && e.code === 'Space' && p.wukongChargeState === 'SMASH') {
            releaseWukongSmash(p);
        }
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        mouseRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleMouseDown = useCallback((e: MouseEvent) => {
        // 关键修复：如果点击的不是画布（而是 UI 按钮），则不触发游戏逻辑
        if (e.target !== canvasRef.current) return;

        const btn = e.button === 0 ? 'Left' : (e.button === 2 ? 'Right' : 'Mid');
        mouseBtnsRef.current[btn] = true;
        keysRef.current[`Mouse${btn}`] = true;

        const p = getHumanPlayer();
        if (p.isDead || p.isBot) return;

        // [修复] 硬控状态下禁止攻击输入
        if (isControlled(p)) {
            return;
        }

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
            if (btn === 'Right' && p.secondarySkillCooldown <= 0) {
                const hasPools = stateRef.current.groundEffects.some(g => g.type === 'MAGMA_POOL');
                if (hasPools) {
                    detonateMagmaPools(p);
                    p.secondarySkillCooldown = 3.0; // Cooldown for detonation
                } else {
                    // 没有岩浆池时播放错误音
                    Sound.playUI('ERROR');
                }
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

        const p = getHumanPlayer();
        if (p.isDead || p.isBot) return;
        if (p.type === CharacterType.WUKONG && btn === 'Right' && p.wukongChargeState === 'THRUST') {
            releaseWukongThrust(p);
        } else if (p.type === CharacterType.CAT && btn === 'Left') {
            if (p.catIsCharging) {
                p.catIsCharging = false;
                const chargeTime = (performance.now() - (p.catChargeStartTime || 0)) / 1000;
                if (chargeTime < CHAR_STATS[CharacterType.CAT].pounceChargeThreshold) {
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

    // Helper: Interrupts any channeling/charging actions (Wukong, Cat, etc.)
    const interruptAction = (target: PlayerState) => {
        if (target.type === CharacterType.WUKONG) {
            target.wukongChargeState = 'NONE';
            target.wukongChargeTime = 0;
            target.wukongChargeHoldTimer = 0;
        }
        if (target.type === CharacterType.CAT) {
            target.catIsCharging = false;
            target.isPouncing = false;
        }
        // Future characters can be added here
    };

    // [New] Centralized Magma Interaction Helper
    // Handles both Magma Pools (Skill) and Environmental Lava (Terrain), collectively "Magma"
    const handleMagmaInteraction = (p: PlayerState, dt: number, sourceId?: string) => {
        // [New] Stacking Protection: Only process once per frame per player
        if ((p as any).hasProcessedMagma) return;
        (p as any).hasProcessedMagma = true;

        // 1. Pyro Affinity Logic (Beneficial)
        if (p.type === CharacterType.PYRO) {
            // Heal
            const healRate = CHAR_STATS[CharacterType.PYRO].magmaHealRate;
            if (p.hp < p.maxHp) p.hp += healRate * dt;

            // Refuel 增加岩浆带来的额外燃料回复 (与其基础回复叠加)
            const bonusFuel = CHAR_STATS[CharacterType.PYRO].fuelRegenMagma * dt;
            p.fuel = Math.min(p.maxFuel, p.fuel + bonusFuel);


            // Immunity is handled implicitly by NOT applying negative effects below
            return;
        }

        // 2. Non-Pyro Logic (Harmful)
        // A. Constant Damage
        takeDamage(p, 10 * dt, CharacterType.ENVIRONMENT, DamageType.FIRE);

        // B. Apply Statuses
        // Refreshed every frame while inside Magma
        applyStatus(p, 'burn', 1.0, sourceId || 'LAVA');
        applyStatus(p, 'slow', 1.0, sourceId || 'LAVA');

        // Burst (Ignition effect) is only applied for Environmental Lava (Terrain)
        // or during Magma Pool Detonation (handled in detonateMagmaPools)
        if (!sourceId || sourceId === 'LAVA') {
            applyStatus(p, 'burst', 0.1, 'LAVA');
        }
    };

    const applyStatus = (target: PlayerState | Drone | any, type: string, duration: number, sourceId?: string, pos?: Vector2) => {
        // Mechanical Immunities
        if (isMechanical(target)) {
            // Immutable list of statuses that machines are immune to
            const immuneStatuses = ['charm', 'fear', 'sleep', 'silence', 'taunt'];
            if (immuneStatuses.includes(type)) {
                return;
            }
        }

        // Fire Immunities (Pyro or Wet targets)
        if (target.type === CharacterType.PYRO || target.isWet) {
            const fireStatuses = ['burn', 'burst'];
            if (fireStatuses.includes(type)) {
                return;
            }
        }

        // [New] Magic Shield Immunity Logic
        // While shield is active, immune to all CC (Hard & Soft)
        if ((target.magicShieldHp || 0) > 0) {
            const ccTypes = [
                'stun', 'root', 'silence', 'fear', 'charm', 'sleep',
                'petrify', 'taunt', 'slow', 'disarm', 'blind'
            ];
            if (ccTypes.includes(type)) {
                // Determine block color based on form
                const blockColor = target.magicForm === 'WHITE' ? '#fef08a' : '#22c55e';
                spawnParticles(target.pos, 3, blockColor, 2, 0.3);
                return; // IMMUNE
            }
        }

        // [New] Update Status History for Color Logic (Latest Applied)
        // Ensure array exists
        if (!target.statusHistory) target.statusHistory = [];

        // Remove if already exists (to move it to end)
        const idx = target.statusHistory.indexOf(type);
        if (idx !== -1) {
            target.statusHistory.splice(idx, 1);
        }
        // Push to end (Latest)
        target.statusHistory.push(type);

        // Limit history size to prevent memory leak (though unlikely with finite statuses)
        if (target.statusHistory.length > 20) {
            target.statusHistory.shift();
        }

        const propKey = STATUS_PROPERTY_MAP[type];

        // [Special] Revive: Clear all status effects first
        if (type === 'revive' && 'type' in target) {
            clearAllStatusEffects(target as PlayerState);
        }

        // Apply
        if (propKey) {
            if (typeof (target as any)[propKey] === 'boolean') {
                // Special handling for revive: isDead should be set to false, not true
                (target as any)[propKey] = (type === 'revive') ? false : true;
            } else {
                (target as any)[propKey] = Math.max((target as any)[propKey] || 0, duration);
            }

            // [New] Use statusQueue instead of single statusLabel
            if (STATUS_CONFIG[type]) {
                const label = STATUS_CONFIG[type].label.split('|')[0];
                const item = {
                    text: label + '!',
                    color: STATUS_CONFIG[type].color,
                    pos: pos
                };

                // [New] Categorize statuses: Behavior inducing ones should be immediate
                const immediateStatuses = ['fear', 'charm', 'taunt'];
                const isImmediateStatus = immediateStatuses.includes(type);

                // [New] If in forced movement AND not an immediate status, buffer it
                if ((target.forcedMoveTimer || 0) > 0 && !isImmediateStatus) {
                    if (!target.pendingStatusQueue) target.pendingStatusQueue = [];
                    target.pendingStatusQueue.push(item);
                } else {
                    if (!target.statusQueue) target.statusQueue = [];
                    target.statusQueue.push(item);
                }
            }
        }
        if (type === 'taunt' && sourceId) {
            target.tauntSourceId = sourceId;
        }
        if (type === 'burn' && sourceId) {
            target.burnSourceId = sourceId;
        }

        // [New] Burst Status Logic
        if (type === 'burst') {
            target.flameExposure = 100;
            target.burstFlag = true;
        }

        // [New] Wet Status Logic (Cleansing)
        if (type === 'wet') {
            const hasFire = (target.burnTimer > 0) || ((target.flameExposure || 0) > 0) || target.type === CharacterType.PYRO;

            // 1. Extinguish Burn
            if (target.burnTimer > 0) {
                target.burnTimer = 0;
            }
            // 2. Wake up from Sleep
            if (target.sleepTimer > 0) {
                target.sleepTimer = 0;
                target.statusLabel = "惊醒!";
            }
            // 3. Wash off Flame Exposure
            if (target.flameExposure > 0) {
                target.flameExposure = 0;
            }

            // [New] Elegant Steam Sizzle Visual & Sound
            if (hasFire) {
                const count = 20;
                for (let i = 0; i < count; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * target.radius;
                    stateRef.current.particles.push({
                        id: Math.random().toString(),
                        pos: {
                            x: target.pos.x + Math.cos(angle) * dist,
                            y: target.pos.y + Math.sin(angle) * dist
                        },
                        vel: {
                            x: (Math.random() - 0.5) * 4,
                            y: -3 - Math.random() * 5 // Strong upward burst
                        },
                        life: 0.6 + Math.random() * 0.6,
                        maxLife: 1.2,
                        color: 'rgba(241, 245, 249, 0.75)', // Elegant steam white
                        size: 6 + Math.random() * 12, // Large soft particles
                        drag: 0.91 // High air resistance for "soft" dissipation
                    });
                }
                Sound.playSkill('MAGMA_LAND'); // Sizzle/Splash sound
            }
        }


        // Generic Interrupt Logic: Hard CC, Silence, Fear, Sleep, etc. break charging/channeling
        const interruptTypes = ['stun', 'fear', 'sleep', 'petrify', 'silence', 'charm', 'taunt'];
        if (interruptTypes.includes(type)) {
            interruptAction(target);
        }
    };

    const handleCatHiss = (p: PlayerState) => {
        if (!canUseSecondarySkill(p)) return;
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
                id: Math.random().toString(), pos: p.pos, vel: { x: 0, y: 0 },
                life: 0.6, maxLife: 0.6, color: '#a855f7', size: range, drag: 0.9 // Purple-500 Ring
            });
            stateRef.current.particles.push({ // Second Ring
                id: Math.random().toString(), pos: p.pos, vel: { x: 0, y: 0 },
                life: 0.4, maxLife: 0.4, color: '#c084fc', size: range * 0.7, drag: 0.9
            });
            // 恐惧骷髅头粒子
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                stateRef.current.particles.push({
                    id: Math.random().toString(), pos: p.pos,
                    vel: { x: Math.cos(a) * 12, y: Math.sin(a) * 12 }, // Faster particles
                    life: 0.8, maxLife: 0.8, color: '#1f2937', size: 6
                });
            }
        } else {
            // 卖萌模式：可爱特效 (粉色/爱心波纹) 
            stateRef.current.particles.push({
                id: Math.random().toString(), pos: p.pos, vel: { x: 0, y: 0 },
                life: 0.5, maxLife: 0.5, color: '#f472b6', size: range, drag: 0.9 // Pink-400 Ring
            });
            stateRef.current.particles.push({ // Inner Ring
                id: Math.random().toString(), pos: p.pos, vel: { x: 0, y: 0 },
                life: 0.3, maxLife: 0.3, color: '#fbcfe8', size: range * 0.6, drag: 0.9
            });
            // 爱心粒子 (模拟)
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                stateRef.current.particles.push({
                    id: Math.random().toString(), pos: p.pos,
                    vel: { x: Math.cos(a) * 8, y: Math.sin(a) * 8 },
                    life: 0.6, maxLife: 0.6, color: '#ec4899', size: 5
                });
            }
        }

        // --- Logic ---
        const enemies = getEnemies(p);

        enemies.forEach(e => {
            const dist = Utils.dist(p.pos, e.pos);
            if (dist < range + e.radius) {
                // Hiss Logic refactored to use applyStatus
                const dir = Utils.normalize(Utils.sub(e.pos, p.pos));
                applyKnockback(e, dir, force);

                // 哈气效果 - applyStatus 内部会自动调用 interruptAction 打断蓄力
                if (isLastLife) {
                    applyStatus(e, 'fear', 2.5);
                } else {
                    applyStatus(e, 'charm', 1.5);
                    if (!isMechanical(e) && (e.magicShieldHp || 0) <= 0) e.statusLabel = "被萌翻!";
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
        // 控制状态下禁止飞扑
        if (isControlled(p)) return;
        if (p.disarmTimer > 0) return; // 缴械禁止普攻类技能
        const stats = CHAR_STATS[CharacterType.CAT];

        if (p.pounceCooldown > 0) {
            return;
        }

        const chargePct = Math.min(1, chargeTime / stats.pounceMaxCharge);

        const speed = stats.pounceSpeed * (0.5 + 0.5 * chargePct);
        const dir = { x: Math.cos(p.aimAngle), y: Math.sin(p.aimAngle) };

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
        if (!canUseUltimate(p)) return;
        const stats = CHAR_STATS[CharacterType.CAT];
        p.skillCooldown = stats.skillCooldown / 1000;

        // 获取所有敌人
        // [Modified] 优先寻找非猫猫球敌人；如果没有，则将猫猫球也纳入目标（只为了播放动画，虽然不造成伤害）
        let enemies = getEnemies(p).filter(e => e.type !== CharacterType.CAT && !e.isDead);
        if (enemies.length === 0) {
            enemies = getEnemies(p).filter(e => !e.isDead);
        }

        let enemy: any = null;
        let minDist = Infinity;
        enemies.forEach(e => {
            const d = Utils.dist(p.pos, e.pos);
            if (d < minDist) {
                minDist = d;
                enemy = e;
            }
        });

        // 查找最近的敌方无人机 (即使没有找到敌方玩家，也尝试找无人机)
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

        // 如果既没有敌人也没有无人机，才直接返回
        if (!enemy && !closestDrone) return;

        let target: any = enemy;

        // 如果没有找到敌方玩家但找到了无人机，直接锁定无人机
        if (!enemy && closestDrone) {
            target = closestDrone;
        }

        if (enemy) {
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
            life: stats.scoopDelay / 1000,
            maxLife: stats.scoopDelay / 1000,
            type: 'SCOOPER_WARNING',
            ownerId: p.id,
            targetId: target.id
        });

        Sound.playSkill('SCOOPER_WARNING');
    };

    const handleCatScratch = (p: PlayerState) => {
        // 控制状态下禁止抓挠
        if (isControlled(p)) return;
        if (p.disarmTimer > 0) return;
        if (p.attackCooldown > 0) return;
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
            for (let k = -1; k <= 1; k++) {
                const clawDist = baseDist + k * 8;

                const arcLen = 1.4;
                const particlesCount = 12;

                for (let i = 0; i < particlesCount; i++) {
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
                            x: Math.cos(a + Math.PI / 2 * side) * 3,
                            y: Math.sin(a + Math.PI / 2 * side) * 3
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

        // Hit Logic - [友军伤害] 攻击所有目标，包括友军
        const potentialTargets = getAllAttackTargets(p);

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
                        if (target.hp <= 0) killEntity(target, p.id);
                    } else {
                        // Hitstun
                        target.vel = { x: 0, y: 0 };
                        applyStatus(target, 'slow', 0.2, p.id);
                        takeDamage(target, stats.scratchDamage, CharacterType.CAT, DamageType.PHYSICAL);
                        spawnParticles(target.pos, 8, '#f0abfc', 4);
                    }
                    Sound.playHit();
                }
            }
        });
    };

    // --- MAGIC BALL COMBAT LOGIC ---

    // 左键普攻 - 发射随机诅咒
    const handleMagicCurse = (p: PlayerState, targetPos: Vector2) => {
        if (p.disarmTimer > 0) return;
        if (p.attackCooldown > 0) return;

        const stats = CHAR_STATS[CharacterType.MAGIC];

        // Dynamic Mana Cost Calculation
        const rampFactor = Math.min(1, (p.magicChargeTimer || 0) / stats.curseRampUpTime);
        const currentCost = stats.curseManaCost + (stats.curseManaMaxCost - stats.curseManaCost) * rampFactor;

        if ((p.mp || 0) < currentCost) return;

        p.mp! -= currentCost;
        p.attackCooldown = stats.curseCooldown / 1000;


        // 发射咒语飞弹
        const wandLength = 32; // Sync with render logic
        const dir = Utils.normalize(Utils.sub(targetPos, p.pos));
        const isWhite = p.magicForm === 'WHITE';

        // Origin at wand tip
        const spawnPos = Utils.add(p.pos, Utils.mult(dir, p.radius + wandLength));

        // [Modified] Pick Status Effect at CAST time
        const allDebuffs = Object.keys(STATUS_CONFIG).filter(k =>
            STATUS_CONFIG[k].nature === 'negative' && k !== 'disarm'
        );
        const statusType = allDebuffs[Math.floor(Math.random() * allDebuffs.length)];

        stateRef.current.projectiles.push({
            id: Math.random().toString(),
            ownerId: p.id,
            pos: spawnPos,
            vel: Utils.mult(dir, stats.curseSpeed),
            radius: 6,
            mass: 1,
            color: isWhite ? '#fef08a' : '#22c55e',
            damage: 0,
            projectileType: 'MAGIC_SPELL',
            life: stats.curseRange / (stats.curseSpeed * 60),
            maxLife: stats.curseRange / (stats.curseSpeed * 60),
            statusType: statusType, // [New] Store status

            // [New] Check if spawning inside a wall AND caster is also inside (to prevent shooting through walls from outside)
            spawnedInsideWall: stateRef.current.obstacles.some(obs =>
                (obs.type === 'WALL' || obs.type === 'WATER') &&
                Utils.checkCircleRectCollision(p.pos, p.radius * 0.5, obs).collided // Caster body (safer 0.5r check)
            ) && stateRef.current.obstacles.some(obs =>
                (obs.type === 'WALL' || obs.type === 'WATER') &&
                Utils.checkCircleRectCollision(spawnPos, 6, obs).collided
            )
        });

        Sound.playShot('MAGIC');

    };

    // 计算最安全位置（用于移形换影）
    const calculateSafestPosition = (p: PlayerState): Vector2 => {
        const enemies = getEnemies(p);

        // Sampling points: Grid based approach for whole map coverage
        const points: Vector2[] = [];
        const step = 200; // Grid resolution
        const margin = 100;

        // 1. Grid Points
        for (let x = margin; x < MAP_SIZE.width - margin; x += step) {
            for (let y = margin; y < MAP_SIZE.height - margin; y += step) {
                points.push({ x, y });
            }
        }

        // 2. Add some random points for variance
        for (let i = 0; i < 20; i++) {
            points.push({
                x: margin + Math.random() * (MAP_SIZE.width - 2 * margin),
                y: margin + Math.random() * (MAP_SIZE.height - 2 * margin)
            });
        }

        let bestPos = p.pos;
        let bestScore = -Infinity;

        // [Unified] Get all danger zones
        const dangerZones = getDangerZones(p, stateRef.current);

        points.forEach(pt => {
            // 1. Check Hard Constraints (Walls, Map Bounds)
            // [Modified] Water is now handled in DangerZones with Weights
            const isInsideWall = stateRef.current.obstacles.some(obs =>
                obs.type === 'WALL' &&
                pt.x > obs.x && pt.x < obs.x + obs.width &&
                pt.y > obs.y && pt.y < obs.y + obs.height
            );

            const wallAffinity = (HAZARD_AFFINITY[p.type] || {}).WALL ?? 0;
            if (isInsideWall && wallAffinity >= 0) return;

            // 2. Check Map Bounds
            if (pt.x < margin || pt.x > MAP_SIZE.width - margin || pt.y < margin || pt.y > MAP_SIZE.height - margin) return;

            // 3. Score Calculation
            let score = 0;

            // Hazard Scoring (Unified)
            dangerZones.forEach(zone => {
                const { inside } = getPointDangerInfo(pt, zone);
                if (inside) {
                    const weight = zone.weight ?? 1.0;
                    if (weight > 0) {
                        score -= 5000 * weight; // Heavy penalty
                    } else if (weight < 0) {
                        score += 500 * Math.abs(weight); // Bonus for "safe" spots
                    }
                }
            });

            // Factor A: Distance from Start (Farther is better for escape, but give it a cap)
            const distFromStart = Utils.dist(p.pos, pt);
            // [Modified] Slightly reduced weight to avoid over-prioritizing distance
            score += Math.min(distFromStart, 600) * 1.0;

            // Factor B: Enemy Safety
            if (enemies.length > 0) {
                let minEnemyDist = Infinity;
                let nearbyEnemyCount = 0;

                enemies.forEach(e => {
                    const d = Utils.dist(pt, e.pos);
                    if (d < minEnemyDist) minEnemyDist = d;
                    if (d < 400) nearbyEnemyCount++; // Danger radius
                });

                // [Modified] Reward being far from the nearest enemy, but CAP it.
                // We want "safe enough", not "mathematically farthest (corners)".
                score += Math.min(minEnemyDist, 1000) * 2.0;

                // Penalize being close to ANY enemy (Safety threshold)
                if (minEnemyDist < 300) {
                    score -= 5000; // Heavy penalty for landing near enemy
                }

                // Penalize density of enemies
                score -= nearbyEnemyCount * 1000;
            } else {
                // If no enemies, just maximize distance from start slightly more
                score += Math.min(distFromStart, 1000) * 2.0;
            }

            // [New] Add Random Noise to avoid deterministic "perfect" spots every time
            score += Math.random() * 300;

            if (score > bestScore) {
                bestScore = score;
                bestPos = pt;
            }
        });

        return bestPos;
    };

    // 右键技能 - 随机保命咒语
    const handleMagicProtection = (p: PlayerState) => {
        if (!canUseSecondarySkill(p)) return;
        if (p.secondarySkillCooldown > 0) return;

        const stats = CHAR_STATS[CharacterType.MAGIC];

        // Roll random spell first (0: Expelliarmus, 1: Armor, 2: Blink)
        let spell = 1;
        // const spell = Math.floor(Math.random() * 3);

        if (spell === 0) {
            // 《除你武器》
            // Cost: 100 MP
            if ((p.mp || 0) < stats.expelliarmusManaCost!) return; // Fizzle if not enough mana

            p.mp! -= stats.expelliarmusManaCost!;

            // 自动瞄准最近敌人
            const nearest = getNearestEnemy(p);
            let targetPos = Utils.add(p.pos, { x: Math.cos(p.aimAngle) * 100, y: Math.sin(p.aimAngle) * 100 });

            if (nearest) {
                // Instant face
                const aimAngle = Math.atan2(nearest.pos.y - p.pos.y, nearest.pos.x - p.pos.x);
                p.aimAngle = aimAngle;
                p.aimLockTimer = 0.3; // Lock aim for 0.3s to show wand turn
                targetPos = nearest.pos;
            }

            // Fire Projectile
            const dir = Utils.normalize(Utils.sub(targetPos, p.pos));
            stateRef.current.projectiles.push({
                id: Math.random().toString(),
                ownerId: p.id,
                pos: Utils.add(p.pos, Utils.mult(dir, p.radius + 15)),
                vel: Utils.mult(dir, stats.curseSpeed), // Use curse speed
                radius: 8,
                mass: 5,
                color: p.magicForm === 'WHITE' ? '#fef08a' : '#22c55e',
                projectileType: 'EXPELLIARMUS',
                life: 1.5,
                maxLife: 1.5,
                damage: 0, // No damage, just disarm
            });

            Sound.playShot('MAGIC');
            p.statusLabel = MAGIC_SPELL_LINES.disarm + '!';
            // 瞬间进入CD
            const expelliarmusCD = stats.expelliarmusCooldown / 1000;
            p.secondarySkillCooldown = expelliarmusCD;
            p.secondarySkillMaxCooldown = expelliarmusCD;
        }
        else if (spell === 1) {
            // 《盔甲护身》- 护盾
            // Cost: 100 MP
            if ((p.mp || 0) < stats.armorManaCost) return;

            // Prevent recasting while shield is active
            if ((p.magicShieldHp || 0) > 0) return;

            p.mp! -= stats.armorManaCost;

            p.magicShieldHp = stats.armorShieldHp;
            p.magicShieldTimer = stats.armorDuration / 1000;
            p.magicShieldDamageLevel = 0; // [New] Reset damage level
            p.statusLabel = MAGIC_SPELL_LINES.armor + '!';

            // Visuals & Sound
            spawnParticles(p.pos, 15, '#c0c0c0', 5, 0.8);
            Sound.playSkill('SHIELD_ACTIVATE');

            // [New] Knockback nearby units on activation
            const shieldR = p.radius + 30;
            getEnemies(p).forEach(enemy => {
                if (enemy.isDead) return;
                const diff = Utils.sub(enemy.pos, p.pos);
                const d = Utils.mag(diff);
                const minDist = shieldR + enemy.radius;
                if (d < minDist) {
                    // [Fix] One-way position resolution: Move enemy only, caster stays static
                    const dir = d > 0 ? Utils.normalize(diff) : { x: 1, y: 0 };
                    enemy.pos = Utils.add(p.pos, Utils.mult(dir, minDist + 1));

                    const knockbackForce = 4; // Use the lower force requested by user
                    applyKnockback(enemy, p.pos, knockbackForce);
                }
            });
        }
        else {
            // 《移形换影》- 解除控制+闪现
            // Cost: 100 MP
            const cost = (stats as any).blinkManaCost || 100;

            if ((p.mp || 0) < cost) return;
            p.mp! -= cost;

            // 解除所有控制 (Cleanse)
            clearControlEffects(p);

            // 生成闪现特效（起点）
            spawnParticles(p.pos, 20, p.magicForm === 'WHITE' ? '#f8fafc' : '#1f2937', 6, 0.5);
            Sound.playSkill('BLINK'); // Create if missing or map to closest

            // 计算最安全位置并闪现
            const safePos = calculateSafestPosition(p);
            p.pos = safePos;
            // Immediate CD
            const blinkCD = (stats as any).blinkCooldown / 1000;
            p.secondarySkillCooldown = blinkCD;
            p.secondarySkillMaxCooldown = blinkCD;

            // 生成闪现特效（终点）
            spawnParticles(p.pos, 25, p.magicForm === 'WHITE' ? '#fef08a' : '#22c55e', 8, 0.8);

            // Add slight invulnerability buffer? (Optional, maybe not requested, so skipping)

            p.statusLabel = MAGIC_SPELL_LINES.blink + '!';
            p.statusLabelColor = p.magicForm === 'WHITE' ? '#fef08a' : '#22c55e';

        }
    };

    // 大招技能
    const handleMagicUltimate = (p: PlayerState) => {
        if (!canUseUltimate(p)) return;
        if (p.skillCooldown > 0) return;

        const stats = CHAR_STATS[CharacterType.MAGIC];

        if (p.magicForm === 'WHITE') {
            // 《呼神护卫》- 白魔法球
            const mpSpent = p.mp || 0;
            if (mpSpent < 50) return; // 至少需要50 MP
            p.mp = 0;
            p.skillCooldown = stats.skillCooldown / 1000;

            // 三道冲击波 + 击退
            for (let wave = 0; wave < 3; wave++) {
                stateRef.current.groundEffects.push({
                    id: Math.random().toString(),
                    pos: { ...p.pos },
                    radius: 50 + wave * 100,
                    life: 0.3 + wave * 0.15,
                    maxLife: 0.3 + wave * 0.15,
                    type: 'PATRONUS_WAVE',
                    ownerId: p.id,
                });
            }

            // 对范围内敌人造成伤害和击退
            getEnemies(p).forEach(enemy => {
                const dist = Utils.dist(p.pos, enemy.pos);
                if (dist < stats.patronusRange) {
                    const dmg = mpSpent * 0.5 * (1 - dist / stats.patronusRange);
                    if ('isSummon' in enemy) {
                        enemy.hp -= dmg;
                        if (enemy.hp <= 0) killEntity(enemy, p.id);
                    } else {
                        takeDamage(enemy, dmg, CharacterType.MAGIC, DamageType.MAGIC);
                    }
                    const dir = Utils.normalize(Utils.sub(enemy.pos, p.pos));
                    applyKnockback(enemy, dir, stats.patronusKnockback);
                    spawnParticles(enemy.pos, 8, '#f8fafc', 5);
                }
            });

            // 召唤光灵球
            p.lightSpiritTimer = stats.lightSpiritDuration / 1000;
            p.ccImmuneTimer = stats.lightSpiritDuration / 1000;
            p.statusLabel = MAGIC_SPELL_LINES.patronus + '!';

            // 屏幕震动
            stateRef.current.screenShakeTimer = 0.5;
            stateRef.current.screenShakeIntensity = 300;

        } else {
            // 《阿瓦达啃大瓜》- 黑魔法球（简化版 - 瞬发）
            const mpSpent = p.mp || 0;
            if (mpSpent < 80) return; // 至少需要80 MP

            const hpRatio = p.hp / p.maxHp;
            // 伤害公式：MP越多、血量越低，伤害越高
            const damage = Math.min(mpSpent * (2.5 - hpRatio) * 1.2, stats.avadaMaxDamage);

            p.mp = 0;
            p.skillCooldown = stats.skillCooldown / 1000;

            // 发射贯穿光束（作为特殊投射物处理）
            const dir = { x: Math.cos(p.aimAngle), y: Math.sin(p.aimAngle) };

            // Origin at wand tip
            const wandLength = 32;
            const startPos = Utils.add(p.pos, Utils.mult(dir, p.radius + wandLength));

            // 射线检测命中第一个敌人
            const enemies = getEnemies(p);
            let closestHit: any = null;
            let closestDist = Infinity;

            enemies.forEach(enemy => {
                // 简化的射线-圆碰撞检测
                const toEnemy = Utils.sub(enemy.pos, startPos);
                const proj = Utils.dot(toEnemy, dir);
                if (proj < 0) return; // 在背后

                const closest = Utils.add(startPos, Utils.mult(dir, proj));
                const distToLine = Utils.dist(enemy.pos, closest);

                if (distToLine < enemy.radius + 15 && proj < closestDist) {
                    closestDist = proj;
                    closestHit = enemy;
                }
            });

            if (closestHit) {
                if ('isSummon' in closestHit) {
                    closestHit.hp -= damage;
                    if (closestHit.hp <= 0) killEntity(closestHit, p.id);
                } else {
                    takeDamage(closestHit, damage, CharacterType.MAGIC, DamageType.MAGIC);
                }
                spawnParticles(closestHit.pos, 25, '#22c55e', 8, 0.6);
                closestHit.statusLabel = `${Math.round(damage)}!`;
            }

            // 光束视觉效果（添加地面效果来渲染）
            stateRef.current.particles.push({
                id: Math.random().toString(),
                pos: startPos,
                vel: Utils.mult(dir, 50),
                life: 0.5,
                maxLife: 0.5,
                color: '#22c55e',
                size: 20,
            });

            p.statusLabel = MAGIC_SPELL_LINES.avada + '!';

            // 屏幕震动
            stateRef.current.screenShakeTimer = 0.6;
            stateRef.current.screenShakeIntensity = 400;
        }
    };

    const deployDrone = (p: PlayerState) => {
        if (!canUseSecondarySkill(p)) return;
        const stats = CHAR_STATS[CharacterType.TANK];
        // Generate in front of tank
        const dronePos = Utils.add(p.pos, { x: Math.cos(p.angle) * 50, y: Math.sin(p.angle) * 50 });

        const drone: Drone = {
            id: Math.random().toString(),
            ownerId: p.id,
            pos: dronePos,
            vel: { x: 0, y: 0 },
            hp: stats.droneHp,
            maxHp: stats.droneHp,
            life: stats.droneLife,
            maxLife: stats.droneLife,
            radius: stats.droneRadius,
            mass: 50,
            color: '#34d399',
            state: 'PATROL',
            attackCooldown: 0,
            patrolAngle: 0,
            isSummon: true,
            isMechanical: true, // Explicitly mark Tank Drone as mechanical
            isDocked: false
        };

        stateRef.current.drones.push(drone);
        p.droneState = 'DEPLOYED';
        p.activeDroneId = drone.id;
        Sound.playSkill('SWITCH');
    };

    const updateDrones = (state: GameState, dt: number) => {
        state.drones = state.drones.filter(d => d.hp > 0 && !d.isDocked);

        state.drones.forEach(d => {
            const owner = state.players.find(p => p.id === d.ownerId);
            if (!owner) return;
            const enemyPlayer = getNearestEnemy(owner);

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
                let target: { pos: Vector2, isDead: boolean, radius: number } | null = null;

                // If enemy is within Aggro Range but outside Attack Range, track them.
                const distToEnemy = enemyPlayer ? Utils.dist(d.pos, enemyPlayer.pos) : 99999;
                const aggroRange = stats.droneAggroRange || 1500;

                if (enemyPlayer && !enemyPlayer.isDead && distToEnemy < aggroRange) {
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
                        const perp = { x: -dir.y, y: dir.x };
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
                    const targetPos = Utils.add(owner.pos, { x: offsetX, y: offsetY });

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
        const angle = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * 0.1;
        const vel = { x: Math.cos(angle) * 15, y: Math.sin(angle) * 15 };

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

    const triggerMagmaPoolExplosion = (g: GroundEffect, owner: PlayerState) => {
        // Visuals
        spawnParticles(g.pos, 25, '#f97316', 8, 0.6);
        stateRef.current.particles.push({
            id: Math.random().toString(),
            pos: g.pos,
            vel: { x: 0, y: 0 },
            life: 0.2, maxLife: 0.2,
            color: 'rgba(255, 100, 0, 0.4)',
            size: 200
        });

        // Damage
        const enemies = getEnemies(owner);

        enemies.forEach(t => {
            const dist = Utils.dist(g.pos, t.pos);
            if (dist < 200 + t.radius) { // Explosion Radius
                // 区分目标类型：无人机 vs 玩家
                if ('isSummon' in t) {
                    // --- 针对无人机的逻辑 ---
                    t.hp -= 250; // 对轻型单位造成巨额伤害

                    // 简单的推开效果 (无人机质量轻，不用物理引擎计算)
                    const dir = Utils.normalize(Utils.sub(t.pos, g.pos));
                    t.pos = Utils.add(t.pos, Utils.mult(dir, 100));

                    spawnParticles(t.pos, 10, '#f97316', 5);

                    if (t.hp <= 0) {
                        killEntity(t, owner.id); // [新增] 使用统一的击杀函数
                    }
                } else {
                    // --- 针对玩家的逻辑 ---
                    takeDamage(t, 150, CharacterType.PYRO, DamageType.FIRE);

                    // 物理击退
                    const dir = Utils.normalize(Utils.sub(t.pos, g.pos));
                    applyKnockback(t, dir, 800);

                    // 使用统一的 applyStatus 处理爆燃 (视觉+机制)
                    applyStatus(t, 'burst', 0, owner.id);

                    // 附加状态 (灼烧 - 仅限非火焰球)
                    if (t.type !== CharacterType.PYRO) {
                        applyStatus(t, 'burn', 5.0, owner.id);
                    }
                }
            }
        });
    };

    const detonateMagmaPools = (p: PlayerState) => {
        if (p.silenceTimer > 0) return;
        const state = stateRef.current;
        let anyMarked = false;

        state.groundEffects.forEach(g => {
            if (g.type === 'MAGMA_POOL' && !g.isPendingDetonation) {
                g.isPendingDetonation = true;
                g.detonationTimer = 0.3;
                anyMarked = true;
            }
        });

        if (anyMarked) {
            // Optional: Ignite sound? For now, the explosion sound is handled in updateGroundEffects
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
        let knockbackDir = { x: Math.cos(p.aimAngle), y: Math.sin(p.aimAngle) };

        if (p.wukongComboStep === 2) {
            // Smash (3rd hit)
            hitRange = 180;
            hitArc = Math.PI / 3;
            Sound.playSkill('SMASH_HIT');
            spawnParticles(Utils.add(p.pos, Utils.mult(knockbackDir, 100)), 20, stats.color, 8, 0.4);
        } else {
            Sound.playShot('SWING');
        }

        // Hit Detection
        const potentialTargets = getEnemies(p);

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

                        if (target.hp <= 0) killEntity(target, p.id);
                    } else {
                        // Damage Player
                        takeDamage(target, damage, CharacterType.WUKONG, DamageType.PHYSICAL);
                        applyKnockback(target, knockbackDir, knockback);
                        spawnParticles(target.pos, 5, stats.color, 4);
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

        // Hit Detection - [友军伤害] 攻击所有目标
        const potentialTargets = getAllAttackTargets(p);

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

                    if (target.hp <= 0) killEntity(target, p.id);
                } else {
                    takeDamage(target, damage, CharacterType.WUKONG, DamageType.PHYSICAL);
                    applyKnockback(target, dir, 800 * (1 + chargePct));
                    spawnParticles(target.pos, 12, stats.color, 8);
                    // 右键命中敌人飘字
                    p.statusLabel = "呔!";
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
            if (obs.type === 'WATER' || obs.type === 'LAVA') return true;
            const dist = Utils.distToSegment({ x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 }, startPos, endPos);
            const collisionDist = width / 2 + Math.max(obs.width, obs.height) / 2; // Approximate collision
            if (dist < collisionDist) {
                spawnParticles({ x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 }, TERRAIN_CONFIG.WALL_SHATTER_PARTICLE_COUNT, TERRAIN_CONFIG.WALL_DEBRIS_COLOR, 12, 1.2);
                return false; // Destroy wall
            }
            return true;
        });

        // 5. Ground Crack Visual
        stateRef.current.groundEffects.push({
            id: Math.random().toString(),
            pos: Utils.add(startPos, Utils.mult(aimDir, range / 2)),
            radius: 0, // Unused for crack
            width: width,
            length: range,
            rotation: p.aimAngle,
            life: 2.0,
            maxLife: 2.0,
            type: 'CRACK',
            ownerId: p.id
        });

        // 5.5 shockwave ground effect
        stateRef.current.groundEffects.push({
            id: Math.random().toString(),
            pos: { ...p.pos },
            radius: range,
            life: 0.8,
            maxLife: 0.8,
            type: 'WUKONG_SMASH',
            ownerId: p.id
        });

        // 6. Hit Detection - 命中所有球 (改为圆形 AOE 以匹配视觉指示器)
        const allTargets = stateRef.current.players.filter(t => t.id !== p.id && !t.isDead);
        const droneTargets = stateRef.current.drones.filter(d => d.ownerId !== p.id && d.hp > 0);

        let hitAnyPlayer = false;

        // 处理玩家目标
        allTargets.forEach(target => {
            const distToPlayer = Utils.dist(target.pos, p.pos);
            // [修复] 范围判定不再额外加上 width/2，确保与圆形指示器一致
            // 使用 dist < range 确保球心在圈内才命中，解决“球在圈外仍受伤”的问题
            if (distToPlayer < range) {
                hitAnyPlayer = true;

                // [友军伤害] 对所有命中的目标造成伤害
                takeDamage(target, damage, CharacterType.WUKONG, DamageType.PHYSICAL);

                // 大幅增加击退效果 (以玩家为中心向外推)
                const pushDir = Utils.normalize(Utils.sub(target.pos, p.pos));
                // Use defined stats for knockback
                const currentKnockback = stats.smashKnockbackMin + (stats.smashKnockbackMax - stats.smashKnockbackMin) * chargePct;
                applyKnockback(target, pushDir, currentKnockback);

                // 眩晕所有命中的球
                applyStatus(target, 'stun', 2.0);
                applyStatus(target, 'slow', 2.5);

                // 打断施法效果 (使用统一的interruptAction)
                interruptAction(target);

                // [New] Set Wukong Ult Knockback state
                target.wukongUltKnockbackCharge = chargePct;
                target.wukongUltSourceDamage = damage;

                spawnParticles(target.pos, 15, stats.color, 10);
                Sound.playHit();
            }
        });

        // 处理无人机目标
        droneTargets.forEach(target => {
            const distToPlayer = Utils.dist(target.pos, p.pos);
            if (distToPlayer < range) {
                target.hp -= damage;
                spawnParticles(target.pos, 10, '#6ee7b7', 8);
                if (target.hp <= 0) killEntity(target, p.id);
                Sound.playHit();
            }
        });

        // 大招命中时随机飘字
        if (hitAnyPlayer) {
            const smashTaunts = [
                "吃俺老孙一棒!",
                "我乃齐天大圣孙悟空!",
                "孩儿们，你孙爷爷来了!"
            ];
            p.statusLabel = smashTaunts[Math.floor(Math.random() * smashTaunts.length)];
        }

        // 7. Screen Shake - Trigger Shake State
        stateRef.current.screenShakeTimer = 0.5; // Shake for 0.5s
        stateRef.current.screenShakeIntensity = 500 * chargePct; // Intensity based on charge (Increased 10x)
    };

    const applyKnockback = (target: PlayerState, dir: Vector2, force: number) => {
        // Unified Super Armor for ANY Wukong charge state
        if (target.type === CharacterType.WUKONG && target.wukongChargeState !== 'NONE') {
            force *= 0.2; // 80% Resistance
        }

        // [New] Magic Shield Immunity (Immovable Object)
        if ((target.magicShieldHp || 0) > 0) {
            return;
        }

        const impulse = force * 2;
        const dv = Utils.mult(dir, impulse / target.mass);
        target.vel = Utils.add(target.vel, dv);

        // [New] Set forced movement timer to allow entering hazards (Water)
        // Increased to 1.0s to better cover long knockbacks (e.g. Wukong Ult)
        target.forcedMoveTimer = 1.0;
    };

    const killEntity = (entity: any, killerId: string) => {
        // 专门处理召唤物（无人机）的销毁逻辑
        if ('isSummon' in entity) {
            createExplosion(stateRef.current, entity.pos, 40, 0, killerId);
            // 找到无人机的主人，设置重建CD
            const owner = stateRef.current.players.find(p => p.id === entity.ownerId);
            if (owner) {
                owner.droneState = 'RECONSTRUCTING';
                owner.droneTimer = 0;
                owner.droneMaxTimer = CHAR_STATS[CharacterType.TANK].droneReconstructTime / 1000;
            }
            entity.hp = 0; // 确保血量归零
        }
    };

    const takeDamage = (p: PlayerState, amount: number, sourceType?: CharacterType, damageType: DamageType = DamageType.PHYSICAL) => {
        // Cat Invincibility
        if (p.type === CharacterType.CAT && (p.invincibleTimer || 0) > 0) return;

        let finalDmg = amount;

        // Wukong Smash Charge Damage Reduction (50%)
        if (p.type === CharacterType.WUKONG && p.wukongChargeState === 'SMASH') {
            finalDmg *= 0.5;
        }

        // Petrify Damage Reduction (80%)
        if ((p.petrifyTimer || 0) > 0) {
            finalDmg *= 0.2;
        }

        // Sleep: Wake on damage
        if ((p.sleepTimer || 0) > 0 && amount > 0) {
            p.sleepTimer = 0;
            p.statusLabel = "惊醒!";
        }

        if (p.type === CharacterType.CAT && sourceType === CharacterType.CAT) {

            finalDmg *= 0.3; // 猫猫球内战只受到 30% 伤害
        }

        if (p.type === CharacterType.CAT && p.isPouncing) {
            finalDmg *= 0.1;
        }

        // [New] Centralized Fire Damage Modifiers
        if (damageType === DamageType.FIRE) {
            // 1. Environmental: Water Resistance
            if (p.isWet) {
                finalDmg *= 0.5;
            }

            // 2. Status: Fire Vulnerability (flameExposure / burst)
            const rampMult = 1 + ((p.flameExposure || 0) / 35);
            finalDmg *= rampMult;

            // 3. Character: Specific Resistances
            if (p.type === CharacterType.PYRO) {
                finalDmg *= 0.5; // Pyro Resistance (50% reduction)
            } else if (p.type === CharacterType.WUKONG) {
                finalDmg *= 0.7; // Wukong Resistance (30% reduction)
            }
        }

        // [New] Water Damage Modifiers
        if (damageType === DamageType.WATER) {
            if (p.type === CharacterType.PYRO) {
                finalDmg *= 1.5; // Pyro Vulnerability to Water (50% extra)
            }
        }


        // --- Magic Shield Absorption ---
        if ((p.magicShieldHp || 0) > 0 && finalDmg > 0) {
            const stats = CHAR_STATS[CharacterType.MAGIC];
            const maxShieldHp = stats.armorShieldHp;
            const absorb = Math.min(finalDmg, p.magicShieldHp!);
            // Shield absorbed damage
            p.magicShieldHp! -= absorb;
            finalDmg -= absorb; // Reduce remaining damage

            // [New] Impact Feedback
            p.magicShieldShakeTimer = 0.2;
            const themeColor = p.magicForm === 'WHITE' ? '#fef08a' : '#22c55e';
            spawnParticles(p.pos, 5, themeColor, 3, 0.4);

            // [New] Progressive Crack Sound (at 80%, 60%, 40%, 20%)
            const ratio = p.magicShieldHp! / maxShieldHp;
            const newLevel = ratio <= 0.2 ? 4 : ratio <= 0.4 ? 3 : ratio <= 0.6 ? 2 : ratio <= 0.8 ? 1 : 0;
            if (newLevel > (p.magicShieldDamageLevel || 0)) {
                p.magicShieldDamageLevel = newLevel;
                Sound.playSkill('SHIELD_CRACK');
            }

            if (p.magicShieldHp! <= 0) {
                p.magicShieldHp = 0;
                p.magicShieldTimer = 0;
                p.secondarySkillCooldown = stats.armorCooldown / 1000;
                p.secondarySkillMaxCooldown = stats.armorCooldown / 1000;

                // [New] Grand Shatter Effect (Glass Shards + Sound)
                spawnShards(p.pos, 60, themeColor);
                Sound.playSkill('SHIELD_SHATTER');

                spawnParticles(p.pos, 10, '#ffffff', 8, 1.2);
            }
        }

        p.hp -= finalDmg;
        if (p.hp < 0) p.hp = 0;
    };

    // --- Main Loop ---

    const update = (deltaTime: number) => {
        const state = stateRef.current;

        if ((state.screenShakeTimer || 0) > 0) {
            state.screenShakeTimer! -= deltaTime;
            if (state.screenShakeTimer! < 0) state.screenShakeTimer = 0;
        }

        // Allow physics/logic to run during VICTORY/DEFEAT for cool endings/spectating
        if (state.gameStatus === 'PAUSED') return;

        // [New] Ambient Lava Bubbling (Boiling effect)
        state.obstacles.filter(obs => obs.type === 'LAVA').forEach(lava => {
            // Calculate bubble rate based on area (roughly)
            const area = lava.width * lava.height;
            const bubbleChance = Math.min(0.2, (area / 100000) * 0.1);
            if (Math.random() < bubbleChance + 0.02) {
                const particlePos = {
                    x: lava.x + Math.random() * lava.width,
                    y: lava.y + Math.random() * lava.height
                };
                spawnParticles(particlePos, 1, '#ef4444', 0.5, 0.5);
            }
        });

        // 1. [新增] 遍历所有玩家进行状态重置与死亡判定
        state.players.forEach(entity => {
            // [New] Reset per-frame flags for unification logic
            (entity as any).hasProcessedMagma = false;

            if (entity.hp <= 0 && !entity.isDead) {
                // 教练球特殊复活
                if (entity.type === CharacterType.COACH) {
                    createExplosion(state, entity.pos, 80, 0, 'system', true);
                    entity.hp = entity.maxHp;
                    entity.pos = { x: MAP_SIZE.width / 2, y: MAP_SIZE.height / 2 };
                    entity.vel = { x: 0, y: 0 };
                    applyStatus(entity, 'revive', 0);
                    entity.statusLabel = "很好!很有精神!";
                    return;
                }
                // 猫猫球九命机制
                if (entity.type === CharacterType.CAT && (entity.lives || 0) > 1) {
                    entity.lives = (entity.lives || 1) - 1;
                    entity.hp = entity.maxHp;
                    clearAllStatusEffects(entity);
                    entity.invincibleTimer = 1.5;
                    entity.pos = { x: Math.random() * (MAP_SIZE.width - 400) + 200, y: Math.random() * (MAP_SIZE.height - 400) + 200 };
                    entity.vel = { x: 0, y: 0 };
                    Sound.playSkill('SWITCH');
                    spawnParticles(entity.pos, 30, '#d1d5db', 8, 1.5);
                    return;
                }

                // 真正死亡
                entity.isDead = true;
                if (entity.type === CharacterType.CAT) entity.lives = 0;
                Sound.playExplosion();
                createExplosion(state, entity.pos, 80, 0, 'system', true);
            }
        });

        // 2. [Modified] Victory/Defeat Logic
        const human = getHumanPlayer();
        const humanTeam = human.teamId;

        // Count Alive Players by Team
        const alivePlayers = state.players.filter(p => !p.isDead);
        const aliveAllies = alivePlayers.filter(p => p.teamId === humanTeam);
        const aliveEnemies = alivePlayers.filter(p => p.teamId !== humanTeam); // For FFA this is everyone else

        // Game Over Conditions
        let isGameOver = false;
        let isVictory = false;

        // Custom Mode Specific Logic
        if (customConfig && customConfig.mode === 'FFA') {
            // FFA: Game Ends when 1 or 0 survivors
            if (alivePlayers.length <= 1) {
                isGameOver = true;
                isVictory = (!human.isDead); // Victory if I am the one survivor
            }
        } else {
            // Team Modes: Game Ends when a team is wiped
            if (aliveAllies.length === 0) {
                isGameOver = true;
                isVictory = false;
            } else if (aliveEnemies.length === 0) {
                isGameOver = true;
                isVictory = true;
            }
        }

        if (isGameOver) {
            // Delay showing the finish screen slightly
            human.matchEndTimer += deltaTime;
            if (human.matchEndTimer > 2.0 && state.gameStatus === 'PLAYING') {
                state.gameStatus = isVictory ? 'VICTORY' : 'DEFEAT';
                Sound.playUI(isVictory ? 'VICTORY' : 'DEFEAT');
            }
        } else {
            // Reset timer if condition cleared (unlikely but safe)
            human.matchEndTimer = 0;
        }

        // 3. [新增] 驱动逻辑 (输入 或 AI)
        state.players.forEach(p => {
            if (p.isDead) return;
            if (p.id === 'player') {
                handlePlayerInput(p, deltaTime);
            } else {
                handleAI(p, deltaTime);
            }
        });

        // 4. [新增] 物理运动循环 (Physics Loop)
        // 替换原有的 [state.player, state.enemy].forEach(...) 和 Ball vs Ball 逻辑
        for (let i = 0; i < state.players.length; i++) {
            const p1 = state.players[i];
            if (p1.isDead) continue;

            // 移动与阻尼
            const moveX = p1.vel.x * deltaTime * 60;
            const moveY = p1.vel.y * deltaTime * 60;
            if (Number.isFinite(moveX) && Number.isFinite(moveY)) {
                p1.pos = Utils.add(p1.pos, { x: moveX, y: moveY });
            }
            p1.vel = Utils.mult(p1.vel, PHYSICS.FRICTION);

            // [New] Cleanup Wukong Knockback State when slow
            if (Utils.mag(p1.vel) < 50 && p1.wukongUltKnockbackCharge) {
                p1.wukongUltKnockbackCharge = undefined;
                p1.wukongUltSourceDamage = undefined;
            }

            // [New] Trigger pending status texts when forced movement ends or unit stops
            if ((p1.pendingStatusQueue?.length || 0) > 0) {
                // End condition: Timer expired OR Velocity low (Stopped)
                const isTimerActive = (p1.forcedMoveTimer || 0) > 0;
                const isMovingFast = Utils.mag(p1.vel) > 10.0;

                if (!isTimerActive || !isMovingFast) {
                    if (!p1.statusQueue) p1.statusQueue = [];
                    if (p1.pendingStatusQueue) {
                        p1.statusQueue.push(...p1.pendingStatusQueue);
                        p1.pendingStatusQueue = [];
                    }
                }
            }

            // [Safety] Ensure pos is finite
            if (!Number.isFinite(p1.pos.x)) p1.pos.x = MAP_SIZE.width / 2;
            if (!Number.isFinite(p1.pos.y)) p1.pos.y = MAP_SIZE.height / 2;

            // 边界限制
            if (p1.pos.x < p1.radius) { p1.pos.x = p1.radius; p1.vel.x *= -0.5; }
            if (p1.pos.y < p1.radius) { p1.pos.y = p1.radius; p1.vel.y *= -0.5; }
            if (p1.pos.x > MAP_SIZE.width - p1.radius) { p1.pos.x = MAP_SIZE.width - p1.radius; p1.vel.x *= -0.5; }
            if (p1.pos.y > MAP_SIZE.height - p1.radius) { p1.pos.y = MAP_SIZE.height - p1.radius; p1.vel.y *= -0.5; }

            // 障碍物碰撞与地形判定 (Obstacles & Terrain Priority)
            p1.isVaulting = false;

            // [Pre-calc] Check if forced movement is active
            const isForced = (p1.forcedMoveTimer || 0) > 0 ||
                (p1.fearTimer || 0) > 0 ||
                (p1.tauntTimer || 0) > 0 ||
                (p1.charmTimer || 0) > 0;

            // [Restored] Determine highest priority terrain currently standing on
            const standingOnZones = state.obstacles.filter(obs => {
                return p1.pos.x >= obs.x && p1.pos.x <= obs.x + obs.width &&
                    p1.pos.y >= obs.y && p1.pos.y <= obs.y + obs.height;
            });
            const currentStandingPriority = standingOnZones.length > 0
                ? Math.max(...standingOnZones.map(o => o.priority ?? 0))
                : -1; // Not on any terrain

            // 1. 物理阻挡 (刚体碰撞)
            const activeCollisions: { obs: Obstacle, col: any, priority: number }[] = [];

            state.obstacles.forEach(obs => {
                // [修改] 地形碰撞逻辑
                // Wukong 特性：两栖 (可以自由进出水域)
                if (obs.type === 'WATER') {
                    if (p1.type === CharacterType.WUKONG) return;

                    // [New] Allow entering water if Forced OR already Wet (Sticky)
                    // Allows smooth entry and prevents being popped out if deeply submerged
                    if (isForced || p1.isWet) return;
                }

                // Lava Logic (Copy of Water)
                if (obs.type === 'LAVA') {
                    // Entry Rules Only - Interactions moved to Terrain Status Phase below
                    if (p1.type === CharacterType.WUKONG || p1.type === CharacterType.PYRO) return;

                    // Allow entering lava if Forced OR already Burning (Sticky)
                    if (isForced || (p1.burnTimer > 0)) return;
                }

                // 默认：只有 WALL, WATER, LAVA 会产生物理碰撞 (其他类型忽略)
                if (obs.type !== 'WALL' && obs.type !== 'WATER' && obs.type !== 'LAVA') return;

                // Cat 特性：飞扑无视地形
                if (p1.type === CharacterType.CAT && p1.isPouncing) return;

                // [Restored] Priority skipping logic needed to allow movement ON walls/islands over water.
                const obsPriority = obs.priority ?? 0;
                if (obsPriority < currentStandingPriority) return;

                const col = Utils.checkCircleRectCollision(p1.pos, p1.radius, obs);
                if (col.collided) {
                    activeCollisions.push({ obs, col, priority: obsPriority });
                }
            });

            // 解决重叠冲突：仅处理最高优先级的碰撞覆盖 (例如：墙壁覆盖水域时，只算撞墙，不算入水)
            if (activeCollisions.length > 0) {
                // 找出最高优先级
                const maxPriority = Math.max(...activeCollisions.map(c => c.priority));

                // 仅处理该优先级的碰撞
                activeCollisions.forEach(({ obs, col, priority }) => {
                    // [Fix] Always process WATER collisions to prevent walking on water
                    // even if touching a higher priority WALL
                    if (priority < maxPriority && obs.type !== 'WATER' && obs.type !== 'LAVA') return;

                    if (p1.type === CharacterType.WUKONG && obs.type === 'WALL') {
                        // 悟空翻墙逻辑
                        const isHorizontalHit = Math.abs(col.normal.x) > Math.abs(col.normal.y);
                        const distanceToVault = isHorizontalHit ? obs.width : obs.height;
                        if (distanceToVault < 130) {
                            const distToLeft = p1.pos.x - obs.x;
                            const distToRight = (obs.x + obs.width) - p1.pos.x;
                            const distToTop = p1.pos.y - obs.y;
                            const distToBottom = (obs.y + obs.height) - p1.pos.y;
                            const minDist = Math.min(Math.abs(distToLeft), Math.abs(distToRight), Math.abs(distToTop), Math.abs(distToBottom));
                            if (minDist < p1.radius) { p1.isVaulting = true; p1.vel = Utils.mult(p1.vel, 0.9); }
                        } else {
                            // 普通墙壁碰撞
                            p1.pos = Utils.add(p1.pos, Utils.mult(col.normal, col.overlap));
                            const dot = p1.vel.x * col.normal.x + p1.vel.y * col.normal.y;
                            p1.vel = Utils.sub(p1.vel, Utils.mult(col.normal, 2 * dot));
                        }
                    } else {
                        // 普通碰撞 (墙壁 or 水域)
                        p1.pos = Utils.add(p1.pos, Utils.mult(col.normal, col.overlap));
                        const dot = p1.vel.x * col.normal.x + p1.vel.y * col.normal.y;
                        p1.vel = Utils.sub(p1.vel, Utils.mult(col.normal, 2 * dot));

                        // [New] Wukong Ult Wall Collision Logic
                        if (obs.type === 'WALL' && (p1.wukongUltKnockbackCharge || 0) >= 0.8) {
                            const bonusDmg = (p1.wukongUltSourceDamage || 0) * 0.2;
                            if (bonusDmg > 0) {
                                takeDamage(p1, bonusDmg, CharacterType.WUKONG, DamageType.PHYSICAL);
                                Sound.playHit(); // Or a heavy impact sound
                                spawnParticles(p1.pos, 20, TERRAIN_CONFIG.WALL_DEBRIS_COLOR, 8, 1);
                            }

                            // Destroy Wall
                            state.obstacles = state.obstacles.filter(o => o.id !== obs.id);
                            spawnParticles({ x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 }, 40, TERRAIN_CONFIG.WALL_DEBRIS_COLOR, 15, 2);

                            // Clear flag after impact to prevent multiple hits
                            p1.wukongUltKnockbackCharge = undefined;
                        }
                    }
                });
            }

            // 2. 环境状态判定 (基于优先级)
            const coveringZones = state.obstacles.filter(obs => {
                const padding = 0;
                return p1.pos.x >= obs.x - padding && p1.pos.x <= obs.x + obs.width + padding &&
                    p1.pos.y >= obs.y - padding && p1.pos.y <= obs.y + obs.height + padding;
            });
            // 按优先级降序排列
            coveringZones.sort((a, b) => (b.priority || 0) - (a.priority || 0));
            const topTerrain = coveringZones[0]; // 取最高优先级的地形

            // [Modified] Improved Wet Logic with Hysteresis ("Sticky Water")
            const isCenterInWater = topTerrain?.type === 'WATER';

            // Check if physically touching any water obstacle (Radius check)
            const isTouchingWater = state.obstacles.some(obs =>
                obs.type === 'WATER' && Utils.checkCircleRectCollision(p1.pos, p1.radius, obs).collided
            );

            const wasWet = p1.isWet;
            // Become/Stay Wet if:
            // 1. Center is inside water (Deep)
            // 2. Already Wet AND Still Touching AND (No other higher priority terrain) (Sticky)
            // 3. Forced AND Touching AND (No other higher priority terrain) (Entry)
            const shouldBeWet = isCenterInWater || ((wasWet || isForced) && isTouchingWater && (!topTerrain || topTerrain.type === 'WATER'));

            p1.isWet = shouldBeWet && !p1.isPouncing;

            if (!wasWet && p1.isWet) {
                // [Modified] Remove fixed position to allow floating text to follow the target during knockback
                applyStatus(p1, 'wet', 0);
            }

            // [New] Lava Terrain Logic
            const isCenterInLava = topTerrain?.type === 'LAVA';
            const isTouchingLava = state.obstacles.some(obs =>
                obs.type === 'LAVA' && Utils.checkCircleRectCollision(p1.pos, p1.radius, obs).collided
            );

            const wasBurning = p1.burnTimer > 0 || (p1.flameExposure || 0) > 0;
            // Sticky logic for Lava:
            // 1. Center in Lava
            // 2. Already Ignited AND Touching AND (No other higher priority terrain) (Sticky)
            // 3. Forced AND Touching AND (No other higher priority terrain) (Entry)
            const shouldBeInLava = isCenterInLava || ((wasBurning || isForced) && isTouchingLava && (!topTerrain || topTerrain.type === 'LAVA'));

            if (shouldBeInLava && !p1.isPouncing) {
                // [Unified] Trigger Magma Interaction (Handles Damage, Burn, Slow, Burst, etc.)
                handleMagmaInteraction(p1, deltaTime);
            }

            // [新增] 火焰球磁力吸引效果 (促进碰撞)
            if (p1.type === CharacterType.PYRO) {
                state.players.forEach(p2 => {
                    if (p2.id === p1.id || p2.isDead || p2.type !== CharacterType.PYRO) return;

                    const dist = Utils.dist(p1.pos, p2.pos);
                    const attractionRange = 300; // 吸引范围

                    if (dist < attractionRange && dist > p1.radius + p2.radius) {
                        // 计算吸引力强度 (距离越近,吸引力越强)
                        const attractionStrength = (1 - dist / attractionRange) * 0.5; // 加速度
                        const direction = Utils.normalize(Utils.sub(p2.pos, p1.pos));

                        // 对双方施加向心加速度
                        p1.vel = Utils.add(p1.vel, Utils.mult(direction, attractionStrength));
                    }
                });
            }

            // 玩家间碰撞 (Player vs Player) - 双重循环
            for (let j = i + 1; j < state.players.length; j++) {
                const p2 = state.players[j];
                if (p2.isDead) continue;

                const distVec = Utils.sub(p1.pos, p2.pos);
                const dist = Utils.mag(distVec);

                // [New] Dynamic collision radius for Magic Shield
                const r1 = (p1.magicShieldHp && p1.magicShieldHp > 0) ? (p1.radius + 30) : p1.radius;
                const r2 = (p2.magicShieldHp && p2.magicShieldHp > 0) ? (p2.radius + 30) : p2.radius;
                const minDist = r1 + r2;

                if (dist < minDist) {
                    // 飞扑时忽略物理碰撞
                    if ((p1.type === CharacterType.CAT && p1.isPouncing) || (p2.type === CharacterType.CAT && p2.isPouncing)) continue;

                    const normal = Utils.normalize(distVec);
                    const overlap = minDist - dist;
                    const totalMass = p1.mass + p2.mass;

                    // 推挤位置
                    p1.pos = Utils.add(p1.pos, Utils.mult(normal, overlap * (p2.mass / totalMass)));
                    p2.pos = Utils.sub(p2.pos, Utils.mult(normal, overlap * (p1.mass / totalMass)));

                    // 动量交换 (弹性碰撞)
                    const v1 = p1.vel;
                    const v2 = p2.vel;
                    const e = PHYSICS.COLLISION_ELASTICITY;
                    const v1n = v1.x * normal.x + v1.y * normal.y;
                    const v2n = v2.x * normal.x + v2.y * normal.y;
                    const v1nFinal = ((p1.mass - e * p2.mass) * v1n + (1 + e) * p2.mass * v2n) / totalMass;
                    const v2nFinal = ((p2.mass - e * p1.mass) * v2n + (1 + e) * p1.mass * v1n) / totalMass;

                    const v1Tan = { x: v1.x - v1n * normal.x, y: v1.y - v1n * normal.y };
                    const v2Tan = { x: v2.x - v2n * normal.x, y: v2.y - v2n * normal.y };

                    p1.vel = { x: v1Tan.x + normal.x * v1nFinal, y: v1Tan.y + normal.y * v1nFinal };
                    p2.vel = { x: v2Tan.x + normal.x * v2nFinal, y: v2Tan.y + normal.y * v2nFinal };

                    // [新增] 火焰球特殊碰撞机制 (不区分敌我,一接触就触发)
                    if (p1.type === CharacterType.PYRO && p2.type === CharacterType.PYRO) {
                        const relativeVel = Math.abs(v1n - v2n);
                        const baseDmg = Math.floor(relativeVel * 2);

                        // 计算优势
                        const v1Speed = Utils.mag(p1.vel);
                        const v2Speed = Utils.mag(p2.vel);
                        const speedAdvantage = v1Speed - v2Speed;

                        const p1FuelRatio = (p1.fuel || 0) / (p1.maxFuel || 100);
                        const p2FuelRatio = (p2.fuel || 0) / (p2.maxFuel || 100);
                        const fuelAdvantage = p1FuelRatio - p2FuelRatio;

                        const totalAdvantage = speedAdvantage + fuelAdvantage * 5;

                        // 差异化伤害 (不区分敌我)
                        const advantageDmg = Math.abs(totalAdvantage) * 10;
                        const disadvantageDmg = Math.abs(totalAdvantage) * 3;

                        if (totalAdvantage > 0) {
                            // p1 优势
                            takeDamage(p2, baseDmg + advantageDmg, p1.type, DamageType.PHYSICAL);
                            takeDamage(p1, baseDmg + disadvantageDmg, p2.type, DamageType.PHYSICAL);
                        } else {
                            // p2 优势
                            takeDamage(p1, baseDmg + advantageDmg, p2.type, DamageType.PHYSICAL);
                            takeDamage(p2, baseDmg + disadvantageDmg, p1.type, DamageType.PHYSICAL);
                        }

                        // 碰撞爆炸效果
                        const collisionPoint = {
                            x: (p1.pos.x + p2.pos.x) / 2,
                            y: (p1.pos.y + p2.pos.y) / 2
                        };
                        createExplosion(state, collisionPoint, 80, 100, 'collision', false, true);

                        // 额外视觉效果
                        spawnParticles(collisionPoint, 20, '#f97316', 10, 1.5);
                        Sound.playHit();
                    }

                    // 撞击伤害 (仅对敌,非火焰球)
                    const relativeVel = Math.abs(v1n - v2n);
                    if (relativeVel > 8 && p1.teamId !== p2.teamId) {
                        // 火焰球已在上面处理,这里只处理其他角色
                        if (!(p1.type === CharacterType.PYRO && p2.type === CharacterType.PYRO)) {
                            const baseDmg = Math.floor(relativeVel * 2);
                            takeDamage(p1, baseDmg, p2.type, DamageType.PHYSICAL);
                            takeDamage(p2, baseDmg, p1.type, DamageType.PHYSICAL);
                            Sound.playHit();
                            spawnParticles(Utils.add(p1.pos, Utils.mult(normal, -p1.radius)), 10, '#ffffff');
                        }
                    }
                }
            }
        }

        updateProjectiles(state, deltaTime);
        updateGroundEffects(state, deltaTime);
        updateDrones(state, deltaTime);
        updateParticles(state, deltaTime);
        updateFloatingTexts(state, deltaTime);

        // 猫猫球飞扑检测 (循环所有猫)
        state.players.forEach(cat => {
            if (cat.type === CharacterType.CAT && cat.isPouncing && !cat.hasPounceHit && !cat.isDead) {
                const enemies = getEnemies(cat);
                enemies.forEach(target => {
                    const dist = Utils.dist(cat.pos, target.pos);
                    if (dist < cat.radius + target.radius) {
                        // 触发飞扑效果
                        applyStatus(target, 'slow', 2.5);
                        applyStatus(target, 'disarm', 2.5);
                        applyStatus(target, 'silence', 2.5);

                        // 蓄力打断由 applyStatus('silence') 自动触发 interruptAction
                        const dmg = CHAR_STATS[CharacterType.CAT].scratchDamage;
                        takeDamage(target, dmg, CharacterType.CAT, DamageType.PHYSICAL);
                        spawnParticles(target.pos, 15, '#f0abfc', 6);
                        Sound.playShot('SCRATCH');
                        cat.hasPounceHit = true;
                        if ((target.magicShieldHp || 0) <= 0) target.statusLabel = "踩!";
                    }
                });
            }
        });

        state.players.forEach(p => updateStatus(p, deltaTime));

        // [集中管理] 全局状态飘字系统
        state.players.forEach(p => {
            // 1. 初始化追踪字段 (用于 UI/飘字)
            if (!p._prevStatus) {
                p._prevStatus = {
                    tankMode: p.tankMode,
                    isReloadingLmg: p.isReloadingLmg,
                    lives: p.lives || 0,
                    isBurnedOut: p.isBurnedOut,
                };
            }
            const prev = p._prevStatus;

            // 辅助：飘字生成
            const spawn = (text: string, color: string, velY = -1.0, size = 16, overridePos?: Vector2) => {
                const now = performance.now();

                // 1. 初始化该玩家的冷却记录
                if (!textCooldownsRef.current.has(p.id)) {
                    textCooldownsRef.current.set(p.id, {});
                }
                const cooldowns = textCooldownsRef.current.get(p.id)!;

                // 2. 冷却检查 (动态读取配置中的 CD，默认为 800ms)
                const lastTime = cooldowns[text] || 0;

                // 查找该文本对应的状态配置以获取 CD
                const matchedKey = Object.keys(STATUS_CONFIG).find(k => {
                    const labels = STATUS_CONFIG[k].label.split('|');
                    return labels.some(l => text.includes(l));
                });
                const cdDuration = (matchedKey ? STATUS_CONFIG[matchedKey].floatingTextCD : undefined) || 800;

                if (now - lastTime < cdDuration) return; // 冷却中，不飘字

                // 3. 更新冷却时间
                cooldowns[text] = now;

                const offsetX = (Math.random() - 0.5) * 60;
                const offsetY = (Math.random() - 0.5) * 30; // [New] Vertical randomness

                state.floatingTexts.push({
                    id: Math.random().toString(),
                    pos: overridePos
                        ? { x: overridePos.x + offsetX * 0.5, y: overridePos.y - 20 + offsetY }
                        : { x: p.pos.x + offsetX, y: p.pos.y - p.radius - 40 + offsetY },
                    text, color, size,
                    life: 2.0,
                    maxLife: 2.0,
                    velY
                });
            };
            //    A. 处理飘字标签 (支持优先级与多标签)
            if (!p.statusQueue) p.statusQueue = [];

            // [新增优先级逻辑] 显式 statusLabel 具有最高优先级，且通常是唯一的。
            if (p.statusLabel) {
                // 如果设置了特定标签，直接清空队列，仅显示该特定标签
                p.statusQueue = [{
                    text: p.statusLabel,
                    color: p.statusLabelColor,
                    pos: p.statusLabelPos
                }];
                p.statusLabel = undefined;
                p.statusLabelColor = undefined;
                p.statusLabelPos = undefined;
            }

            if (p.statusQueue.length > 0) {
                p.statusQueue.forEach((item, index) => {
                    const text = item.text;
                    const matchedKey = Object.keys(STATUS_CONFIG).find(k => {
                        const labels = STATUS_CONFIG[k].label.split('|');
                        return labels.some(l => text.includes(l));
                    });
                    let color = item.color || (matchedKey ? STATUS_CONFIG[matchedKey].color : p.color);

                    // 如果有多个飘字，稍微错开位置，再加上随机偏移，极大减少重叠
                    const verticalOrderOffset = index * 25;
                    const randomOffsetX = (Math.random() - 0.5) * 40;
                    const randomOffsetY = (Math.random() - 0.5) * 20;

                    const spawnPos = item.pos
                        ? { x: item.pos.x + randomOffsetX, y: item.pos.y - verticalOrderOffset + randomOffsetY }
                        : { x: p.pos.x + randomOffsetX, y: p.pos.y - p.radius - 40 - verticalOrderOffset + randomOffsetY };

                    spawn(text, color, -1.5, 16, spawnPos);
                });

                p.statusQueue = []; // 清空队列
            }
            //    B. 状态变化检测
            // 1. 基础物理/元素 (使用 CONFIG 配置)
            if (!prev.isBurnedOut && p.isBurnedOut) spawn("燃尽!", '#ef4444');

            // 2. 控制状态 (大部分已由 applyStatus -> statusQueue 自动处理，此处仅作为非标准状态的扩展位)

            // 3. 核心机制
            // 坦克模式
            if (p.type === CharacterType.TANK && prev.tankMode !== p.tankMode) {
                if (p.tankMode === TankMode.LMG) spawn("加速!", '#34d399');
                else spawn("重炮模式", '#fbbf24');
            }

            // 装填
            if (!prev.isReloadingLmg && p.isReloadingLmg) {
                spawn("装填中...", '#fbbf24');
            }
            // 轻机枪装填完毕
            if (prev.isReloadingLmg && !p.isReloadingLmg) {
                spawn("装填完毕!", '#34d399');
            }

            // 命数变化
            if ((p.lives || 0) < (prev.lives || 0) && (p.lives || 0) > 0) {
                spawn(`剩余命数: ${p.lives}`, '#fbbf24', -2.0);
            }

            // 4. 持续/周期性状态
            if ((p.sleepTimer > 0 || (p.idleTimer || 0) > 5.0) && Math.random() < 0.01) {
                spawn("zZz", '#ffffff', -0.5);
            }

            // --- 更新追踪快照 ---
            p._prevStatus = {
                tankMode: p.tankMode,
                isReloadingLmg: p.isReloadingLmg,
                lives: p.lives || 0,
                isBurnedOut: p.isBurnedOut,
            };
        });

        updateCamera(state);
    };

    const handlePlayerInput = (p: PlayerState, dt: number) => {
        // [Priority System] Fear > Taunt > Charm
        // These forced movements must happen BEFORE the isControlled early return,
        // because they are technically "control" effects themselves but require movement processing.
        if ((p.fearTimer || 0) > 0) {
            const enemy = getNearestEnemy(p);
            if (enemy) {
                const runDir = Utils.normalize(Utils.sub(p.pos, enemy.pos));
                const fearSpeed = CHAR_STATS[p.type].speed * 0.9;
                p.vel = Utils.add(p.vel, Utils.mult(runDir, PHYSICS.ACCELERATION_SPEED * fearSpeed * dt * 60));
                p.angle = Math.atan2(runDir.y, runDir.x);
            }
            return;
        }

        // Taunt / Charm: Forced Movement logic
        let tauntTarget: PlayerState | null = null;
        const isTaunted = (p.tauntTimer || 0) > 0;
        const isCharmed = (p.charmTimer || 0) > 0 && !isTaunted;

        if (isTaunted || isCharmed) {
            if (isTaunted && p.tauntSourceId) {
                tauntTarget = stateRef.current.players.find(pl => pl.id === p.tauntSourceId) || null;
                if (tauntTarget && tauntTarget.isDead) tauntTarget = null;
            }
            if (!tauntTarget) tauntTarget = getNearestEnemy(p);

            if (tauntTarget) {
                const distToTarget = Utils.dist(p.pos, tauntTarget.pos);
                let attackRange = 100;
                if (p.type === CharacterType.PYRO) attackRange = CHAR_STATS.PYRO.flamethrowerRange - 50;
                else if (p.type === CharacterType.WUKONG) attackRange = 120;
                else if (p.type === CharacterType.CAT) attackRange = CHAR_STATS.CAT.scratchRange + 20;
                else if (p.type === CharacterType.MAGIC) attackRange = CHAR_STATS.MAGIC.curseRange - 50;
                else if (p.type === CharacterType.TANK) attackRange = p.tankMode === TankMode.ARTILLERY ? 400 : 300;

                if (isCharmed || distToTarget > attackRange) {
                    const runDir = Utils.normalize(Utils.sub(tauntTarget.pos, p.pos));
                    const speedFactor = isCharmed ? 0.5 : 1.2;
                    const forceSpeed = CHAR_STATS[p.type].speed * speedFactor;
                    p.vel = Utils.add(p.vel, Utils.mult(runDir, PHYSICS.ACCELERATION_SPEED * forceSpeed * dt * 60));
                    p.aimAngle = Math.atan2(runDir.y, runDir.x);
                    p.angle = p.aimAngle;
                } else if (!isCharmed) {
                    p.vel = Utils.mult(p.vel, 0.8);
                    const aimDir = Utils.sub(tauntTarget.pos, p.pos);
                    p.aimAngle = Math.atan2(aimDir.y, aimDir.x);
                    p.angle = p.aimAngle;

                    // Manual Attack Trigger
                    if (p.type === CharacterType.PYRO) {
                        const { range, angle } = calculatePyroShape(distToTarget);
                        p.currentWeaponRange = range;
                        p.currentWeaponAngle = angle;
                        if (p.fuel > 0 && !p.isBurnedOut) {
                            p.isFiringFlamethrower = true;
                            p.fuel -= CHAR_STATS[CharacterType.PYRO].fuelConsumption * dt;
                            if (p.fuel <= 0) {
                                p.fuel = 0;
                                p.isBurnedOut = true;
                                Sound.playBurnout();
                                spawnParticles(p.pos, 15, '#ffffff', 5, 0.5);
                            }
                            fireFlamethrower(p, dt);
                        } else {
                            p.isFiringFlamethrower = false;
                        }
                    } else if (p.type === CharacterType.WUKONG) {
                        handleWukongCombo(p);
                    } else if (p.type === CharacterType.CAT) {
                        handleCatScratch(p);
                    } else if (p.type === CharacterType.MAGIC) {
                        handleMagicCurse(p, tauntTarget.pos);
                    } else if (p.type === CharacterType.TANK) {
                        if (p.attackCooldown <= 0) {
                            if (p.tankMode === TankMode.ARTILLERY) {
                                if (p.artilleryAmmo >= 1 && distToTarget > CHAR_STATS.TANK.artilleryMinRange) {
                                    fireArtillery(p, tauntTarget.pos);
                                    p.artilleryAmmo -= 1;
                                    p.attackCooldown = 2.5;
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
                    }
                }
            }
            return; // Taunt/Charm overrides normal input
        }

        // Hard CC Check (Stun, Sleep, Petrify) - Return early, no input allowed
        if (isControlled(p)) {
            p.vel = Utils.mult(p.vel, 0.8);
            return;
        }


        if (p.rootTimer > 0) {
            // Root: Can aim/shoot, but velocity friction applied and NO movement input allowed
            p.vel = Utils.mult(p.vel, 0.8);
        }

        let speedMult = 1.0;

        // Tank LMG Speed Boost
        if (p.type === CharacterType.TANK && p.tankMode === TankMode.LMG) {
            speedMult = 1.6;
        }

        if (p.slowTimer > 0) {
            speedMult *= 0.4;
        }

        // Haste
        if ((p.hasteTimer || 0) > 0) {
            speedMult *= 1.5;
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

        // [已移至上方] 恐惧状态已在优先级逻辑中处理

        let accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[p.type].speed * speedMult;

        if (p.type === CharacterType.TANK) {
            accel *= 0.5;
        }

        const moveDir = { x: 0, y: 0 };

        // Root prevents movement input, Taunt/Charm also overrides
        if (p.rootTimer <= 0 && p.tauntTimer <= 0 && (p.charmTimer || 0) <= 0) {
            if (keysRef.current['KeyW']) moveDir.y -= 1;
            if (keysRef.current['KeyS']) moveDir.y += 1;
            if (keysRef.current['KeyA']) moveDir.x -= 1;
            if (keysRef.current['KeyD']) moveDir.x += 1;
        }

        if (moveDir.x !== 0 || moveDir.y !== 0) {
            const norm = Utils.normalize(moveDir);
            p.vel = Utils.add(p.vel, Utils.mult(norm, accel * dt * 60));

            // Smooth Rotation for Body Angle
            const targetAngle = Math.atan2(moveDir.y, moveDir.x);
            let diff = targetAngle - p.angle;
            // Normalize diff to [-PI, PI]
            if (Number.isFinite(diff)) {
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
            } else {
                diff = 0;
            }

            // Interpolate (Lerp)
            const rotationSpeed = 15.0; // Adjust for smoothness
            p.angle += diff * Math.min(1, rotationSpeed * dt);

            if (p.type === CharacterType.TANK && p.tankMode === TankMode.LMG && Math.random() < 0.8) {
                stateRef.current.particles.push({
                    id: Math.random().toString(),
                    pos: Utils.add(p.pos, { x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20 }),
                    vel: Utils.mult(p.vel, -0.5),
                    life: 0.8,
                    maxLife: 0.8,
                    color: '#6ee7b7',
                    size: 5
                });
            }
        }

        const worldMouse = Utils.add(mouseRef.current, stateRef.current.camera);
        let aimDir = Utils.sub(worldMouse, p.pos);

        // Blind: Jitter aim
        if ((p.blindTimer || 0) > 0) {
            const jitter = (Math.random() - 0.5) * 1.5; // Large jitter (approx 85 degrees spread)
            const angle = Math.atan2(aimDir.y, aimDir.x) + jitter;
            const mag = Utils.mag(aimDir);
            aimDir = { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag };
        }

        let targetAimAngle = Math.atan2(aimDir.y, aimDir.x);

        if (p.type === CharacterType.TANK) {
            const diff = targetAimAngle - p.aimAngle;
            const d = Math.atan2(Math.sin(diff), Math.cos(diff));
            const rotSpeed = CHAR_STATS[CharacterType.TANK].turretSpeed;
            const change = Utils.clamp(d, -rotSpeed * dt * 60, rotSpeed * dt * 60);

            p.aimAngle += change;
        } else {
            // 非坦克：任何控制状态下禁止自主瞄准
            // [新增] 瞄准锁定状态下禁止鼠标干预 (Expelliarmus)
            if (!isControlled(p) && (p.aimLockTimer || 0) <= 0) {
                p.aimAngle = targetAimAngle;
            }
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
                // [修复] 硬控状态下禁止喷火
                if (isControlled(p)) {
                    p.isFiringFlamethrower = false;
                }
                else if (p.fuel > 0 && !p.isBurnedOut) {
                    p.isFiringFlamethrower = true;
                    p.fuel -= CHAR_STATS[CharacterType.PYRO].fuelConsumption * dt;
                    if (p.fuel <= 0) {
                        p.fuel = 0;
                        p.isBurnedOut = true;
                        Sound.playBurnout();
                        spawnParticles(p.pos, 15, '#ffffff', 5, 0.5);
                    }
                    fireFlamethrower(p, dt);
                } else {
                    p.isFiringFlamethrower = false;
                }
            } else {
                p.isFiringFlamethrower = false;
            }

            if (keysRef.current['Space'] && p.skillCooldown <= 0 && canUseUltimate(p)) {
                castMagmaPool(p, worldMouse);
            }
            if (keysRef.current['MouseRight'] && p.secondarySkillCooldown <= 0 && canUseSecondarySkill(p)) {
                const hasPools = stateRef.current.groundEffects.some(g => g.type === 'MAGMA_POOL');
                if (hasPools) {
                    detonateMagmaPools(p);
                    p.secondarySkillCooldown = 3.0; // Cooldown for detonation
                }
            }
        }
        else if (p.type === CharacterType.TANK) {
            if (keysRef.current['MouseLeft'] && p.attackCooldown <= 0) {
                // [修复] 硬控状态下禁止开火
                if (isControlled(p)) {
                    // Do nothing
                } else if (p.tankMode === TankMode.ARTILLERY) {
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

            if (keysRef.current['Space'] && p.skillCooldown <= 0 && canUseUltimate(p)) {
                p.tankMode = p.tankMode === TankMode.ARTILLERY ? TankMode.LMG : TankMode.ARTILLERY;
                p.skillCooldown = 1;
                p.attackCooldown = 1.5;
                Sound.playSkill('SWITCH');
                spawnParticles(p.pos, 5, '#ffffff');

            }
        }
        else if (p.type === CharacterType.MAGIC) {
            // 魔法球输入处理
            if (keysRef.current['MouseLeft']) {
                // [修复] 添加状态检查
                if (!isControlled(p) && p.silenceTimer <= 0) {
                    p.magicChargeTimer = (p.magicChargeTimer || 0) + dt;
                    handleMagicCurse(p, worldMouse);
                } else {
                    p.magicChargeTimer = Math.max(0, (p.magicChargeTimer || 0) - dt * 2);
                }
            } else {
                // Decay charge when not firing
                p.magicChargeTimer = Math.max(0, (p.magicChargeTimer || 0) - dt * 2);
            }
            if (keysRef.current['MouseRight']) {
                handleMagicProtection(p);
            }
            if (keysRef.current['Space']) {
                handleMagicUltimate(p);
            }
        }
    };

    const handleAI = (ai: PlayerState, dt: number) => {
        // AI Status Checks
        if (ai.stunTimer > 0 || ai.sleepTimer > 0 || (ai.petrifyTimer || 0) > 0) {
            ai.vel = Utils.mult(ai.vel, 0.8);
            return;
        }

        // [优先级系统] 恐惧 > 嘲讽 > 魅惑
        // 恐惧优先：强制远离敌人
        if ((ai.fearTimer || 0) > 0) {
            const enemy = getNearestEnemy(ai);
            if (enemy) {
                const runDir = Utils.normalize(Utils.sub(ai.pos, enemy.pos));
                const fearSpeed = CHAR_STATS[ai.type].speed * 0.9;
                ai.vel = Utils.add(ai.vel, Utils.mult(runDir, PHYSICS.ACCELERATION_SPEED * fearSpeed * dt * 60));
                ai.angle = Math.atan2(runDir.y, runDir.x);
            }
            return;
        }

        // 嘲讽次之，魅惑最后
        const isTaunted = (ai.tauntTimer || 0) > 0;
        const isCharmed = (ai.charmTimer || 0) > 0 && !isTaunted; // 嘲讽时忽略魅惑

        if (isTaunted || isCharmed) {
            // Find target (Taunt source or nearest enemy)
            let tauntTarget = null;
            if (isTaunted && ai.tauntSourceId) {
                tauntTarget = stateRef.current.players.find(p => p.id === ai.tauntSourceId);
                if (tauntTarget && tauntTarget.isDead) tauntTarget = null;
            }
            if (!tauntTarget) tauntTarget = getNearestEnemy(ai);

            if (tauntTarget) {
                const distToTarget = Utils.dist(ai.pos, tauntTarget.pos);
                let attackRange = 100;
                if (ai.type === CharacterType.PYRO) attackRange = CHAR_STATS.PYRO.flamethrowerRange - 50;
                else if (ai.type === CharacterType.WUKONG) attackRange = 120;
                else if (ai.type === CharacterType.CAT) attackRange = CHAR_STATS.CAT.scratchRange + 20;
                else if (ai.type === CharacterType.MAGIC) attackRange = CHAR_STATS.MAGIC.curseRange - 50;
                else if (ai.type === CharacterType.TANK) attackRange = ai.tankMode === TankMode.ARTILLERY ? 400 : 300;

                // Rush only if outside attack range
                if (isCharmed || distToTarget > attackRange) {
                    const runDir = Utils.normalize(Utils.sub(tauntTarget.pos, ai.pos));
                    const speedFactor = isCharmed ? 0.5 : 1.2;
                    const forceSpeed = CHAR_STATS[ai.type].speed * speedFactor;

                    ai.vel = Utils.add(ai.vel, Utils.mult(runDir, PHYSICS.ACCELERATION_SPEED * forceSpeed * dt * 60));
                    ai.aimAngle = Math.atan2(runDir.y, runDir.x);
                    ai.angle = ai.aimAngle;
                } else if (!isCharmed) {
                    // Close enough to taunt target: Stop and Aim
                    ai.vel = Utils.mult(ai.vel, 0.8);
                    const aimDir = Utils.sub(tauntTarget.pos, ai.pos);
                    ai.aimAngle = Math.atan2(aimDir.y, aimDir.x);
                    ai.angle = ai.aimAngle;
                }
            }

            if (isTaunted && tauntTarget) {
                // Fallthrough to character specific blocks but skip skills.
                ai.aiSkipSkills = true;
            } else {
                return;
            }
        } else {
            ai.aiSkipSkills = false;
        }

        // [通用反卡死系统] Universal Unstuck System for All AI
        // 检测AI是否长时间停留在同一位置
        if (!ai.lastPos) ai.lastPos = { ...ai.pos };
        const distMoved = Utils.dist(ai.pos, ai.lastPos);
        ai.lastPos = { ...ai.pos };

        if (distMoved < 0.5) {
            ai.stuckTimer = (ai.stuckTimer || 0) + dt;
        } else {
            ai.stuckTimer = Math.max(0, (ai.stuckTimer || 0) - dt);
        }

        // 触发绕路逻辑
        if ((ai.stuckTimer || 0) > 1.5 && (ai.unstuckTimer || 0) <= 0) {
            ai.unstuckTimer = 1.0 + Math.random() * 0.5; // 1.0-1.5秒绕路时间

            // 多方向探测 (8个方向,45度间隔)
            let bestDir = { x: 0, y: 0 };
            let bestScore = -Infinity;
            const target = getNearestEnemy(ai);

            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const testDir = { x: Math.cos(angle), y: Math.sin(angle) };
                const testPoint = Utils.add(ai.pos, Utils.mult(testDir, 100));

                let score = 0;

                // 1. 避开障碍物 (70%权重)
                let minObstacleDist = Infinity;
                for (const obs of stateRef.current.obstacles) {
                    const centerX = obs.x + obs.width / 2;
                    const centerY = obs.y + obs.height / 2;
                    const d = Utils.dist(testPoint, { x: centerX, y: centerY });
                    minObstacleDist = Math.min(minObstacleDist, d);
                }
                score += minObstacleDist * 0.7;

                // 2. 朝向目标 (30%权重)
                if (target) {
                    const toTarget = Utils.normalize(Utils.sub(target.pos, ai.pos));
                    const dotProduct = testDir.x * toTarget.x + testDir.y * toTarget.y;
                    score += dotProduct * 100 * 0.3;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestDir = testDir;
                }
            }

            ai.unstuckDir = bestDir;
            ai.stuckTimer = 0;
        }

        // 执行绕路
        if ((ai.unstuckTimer || 0) > 0) {
            ai.unstuckTimer! -= dt;
            const accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[ai.type].speed;
            ai.vel = Utils.add(ai.vel, Utils.mult(ai.unstuckDir!, accel * dt * 60));
            return; // 绕路期间跳过正常AI逻辑
        }

        // [新增] AI 移动变数更新 / AI Movement Variance Update
        if (ai.aiStrafeTimer === undefined) ai.aiStrafeTimer = 0;
        if (ai.aiChangeDistTimer === undefined) ai.aiChangeDistTimer = 0;

        ai.aiStrafeTimer -= dt;
        ai.aiChangeDistTimer -= dt;

        if (ai.aiStrafeTimer <= 0) {
            ai.aiStrafeDir = Math.random() < 0.5 ? 1 : -1;
            ai.aiStrafeTimer = 0.5 + Math.random() * 2.5; // Change strafe every 0.5-3s
        }

        if (ai.aiChangeDistTimer <= 0) {
            // New preferred distance offset
            ai.aiPreferredDistOffset = (Math.random() - 0.5) * 120; // +/- 60 variance
            ai.aiChangeDistTimer = 2.0 + Math.random() * 4.0; // Change preference every 2-6s
        }

        // 1. 自动寻找最近的敌人
        let target = getNearestEnemy(ai);

        // [修复] 如果被嘲讽，强制锁定目标为嘲讽源，确保后续攻击逻辑指向该目标
        if (ai.tauntTimer > 0 && ai.tauntSourceId) {
            const tauntSource = stateRef.current.players.find(p => p.id === ai.tauntSourceId);
            if (tauntSource && !tauntSource.isDead) {
                target = tauntSource;
            }
        }

        // -------------------------------------------------------------
        // [新增] 危机回避模块 / Evasion Module
        // -------------------------------------------------------------
        const dangerZones = getDangerZones(ai, stateRef.current);

        // C. 计算最佳逃离向量
        let evasionDir: Vector2 | null = null;
        let isCurrentlyInsideDanger = false;
        let bestEscapeVec: Vector2 | null = null;

        // AI Movement Speed (Pixels/Second approx)
        // MaxSpeed = (Accel / (1-Friction)) * 60
        // Accel = 0.2 * StatSpeed
        // Friction = 0.9 => 1-F = 0.1
        // Vmax = 2.0 * StatSpeed (per frame) => 120 * StatSpeed (per sec)
        // 考虑到起步加速时间，打个折 0.8
        const aiSpeedPPS = 120 * CHAR_STATS[ai.type].speed * 0.8;

        for (const zone of dangerZones) {
            const { inside, escapeVec, distToEdge } = getPointDangerInfo(ai.pos, zone);

            if (inside) {
                // [Unified] Only evade hazards with positive danger weight
                if ((zone.weight ?? 1.0) <= 0) continue;

                // Check Feasibility
                const timeNeeded = distToEdge / aiSpeedPPS;

                // If we can escape in time (plus a small reaction buffer 0.1s), DO IT.
                // If inevitable (TimeNeeded > TimeLeft), ignored as per user request ("continue previous strategy").
                if (timeNeeded < zone.timeLeft + 0.1) {
                    isCurrentlyInsideDanger = true;
                    bestEscapeVec = escapeVec;
                    break; // Flee immediately from the first threat found (Simplification)
                }
            }
        }

        // Hysteresis Logic
        if (isCurrentlyInsideDanger) {
            // ENTER / REFRESH Evasion Mode
            ai.aiIsEscapingHazard = true;
            ai.aiHazardEscapeTimer = 0.6; // Commit to evading for at least 0.6s
            if (bestEscapeVec) ai.aiHazardEscapeDir = bestEscapeVec;
            evasionDir = ai.aiHazardEscapeDir || null;
        } else {
            // D. 持续性逃离逻辑
            if (ai.aiIsEscapingHazard) {
                ai.aiHazardEscapeTimer = (ai.aiHazardEscapeTimer || 0) - dt;
                if (ai.aiHazardEscapeTimer > 0) {
                    // Continue in the same direction
                    evasionDir = ai.aiHazardEscapeDir || null;
                } else {
                    // Clear evasion
                    ai.aiIsEscapingHazard = false;
                }
            }
        }

        // -------------------------------------------------------------

        // 如果没有敌人且没有危险，AI 停止行动或仅做简单待机
        if (!target && !evasionDir) {
            ai.vel = Utils.mult(ai.vel, 0.9); // 缓慢减速
            return;
        }

        if (ai.stunTimer > 0) {
            ai.vel = Utils.mult(ai.vel, 0.8); // 快速急停
            return;
        }

        // [已移至上方] 恐惧状态已在优先级逻辑中处理

        // 教练球 AI
        if (ai.type === CharacterType.COACH) {
            const accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[CharacterType.COACH].speed;

            // [修复] 教练球被禁锢(Root)时无法移动
            if (ai.rootTimer > 0) {
                ai.vel = Utils.mult(ai.vel, 0.8);
                return;
            }

            // 1. 随机游荡 (Wander)
            // 每帧一定概率改变方向 (1.5% chance per frame)
            if (Math.random() < 0.015) {
                ai.aimAngle = Math.random() * Math.PI * 2;
                ai.angle = ai.aimAngle;
            }

            // 2. 边缘检测与中心回归 (Edge Avoidance)
            const edgeThreshold = 300; // 距离边缘多少像素开始回归
            const w = MAP_SIZE.width;
            const h = MAP_SIZE.height;
            const cx = w / 2;
            const cy = h / 2;

            const isNearEdge = ai.pos.x < edgeThreshold ||
                ai.pos.x > w - edgeThreshold ||
                ai.pos.y < edgeThreshold ||
                ai.pos.y > h - edgeThreshold;

            if (isNearEdge) {
                // 强制向中心移动
                const toCenter = Utils.normalize(Utils.sub({ x: cx, y: cy }, ai.pos));
                // 施加向心的速度
                ai.vel = Utils.add(ai.vel, Utils.mult(toCenter, accel * dt * 60));
                // 更新朝向以面对中心
                ai.angle = Math.atan2(toCenter.y, toCenter.x);
                ai.aimAngle = ai.angle;
            } else {
                // 正常游荡移动 (沿当前角度前进)
                ai.vel = Utils.add(ai.vel, Utils.mult({ x: Math.cos(ai.angle), y: Math.sin(ai.angle) }, accel * dt * 60));
            }

            return;
        }

        // --- 通用移动逻辑 ---
        let moveDir = { x: 0, y: 0 };
        let distToTarget = Infinity;

        if (target) {
            distToTarget = Utils.dist(ai.pos, target.pos);
            moveDir = Utils.normalize(Utils.sub(target.pos, ai.pos));

            // Blind Effect: Jitter Aim/Move Direction for AI
            if ((ai.blindTimer || 0) > 0) {
                const angle = Math.atan2(moveDir.y, moveDir.x);
                // Large jitter (approx 85 degrees spread) same as player
                const jitter = (Math.random() - 0.5) * 1.5;
                const newAngle = angle + jitter;
                moveDir = { x: Math.cos(newAngle), y: Math.sin(newAngle) };
            }
        }

        // 默认行为
        let shouldMove = true;
        let finalMoveDir = moveDir;

        // [应用回避覆盖]
        // [New] Forced Evasion from Aborted Actions (High Priority)
        if ((ai.aiTacticalRetreatTimer || 0) > 0) {
            ai.aiTacticalRetreatTimer = (ai.aiTacticalRetreatTimer || 0) - dt;
            if (ai.aiTacticalRetreatDir) {
                finalMoveDir = ai.aiTacticalRetreatDir;
                shouldMove = true;
            }
        } else if (evasionDir) {
            finalMoveDir = evasionDir;
            // Evasion overrides movement direction
        } else if (!target) {
            shouldMove = false;
        }

        // AI 角色特定逻辑
        if (ai.type === CharacterType.CAT) {
            // Evasion/Target orientation
            if (evasionDir) {
                ai.aimAngle = Math.atan2(finalMoveDir.y, finalMoveDir.x);
            } else if (target) {
                ai.aimAngle = Math.atan2(target.pos.y - ai.pos.y, target.pos.x - ai.pos.x);
            }
            ai.angle = ai.aimAngle;

            if (ai.catIsCharging) {
                // 蓄力超过 0.6s 则释放
                if ((performance.now() - (ai.catChargeStartTime || 0)) / 1000 > 0.6) {
                    // [Safety Check] Predict Landing Position
                    const range = Math.min(CHAR_STATS.CAT.pounceSpeed * 60 * 0.6, 250); // Approx jump distance
                    const landingPos = Utils.add(ai.pos, Utils.mult({ x: Math.cos(ai.angle), y: Math.sin(ai.angle) }, range));

                    // Check Hazards at Landing Spot
                    let isDangerous = false;
                    // A. Lava Terrain
                    isDangerous = stateRef.current.obstacles.some(o => (o.type === 'LAVA' || o.type === 'WATER') && Utils.checkCircleRectCollision(landingPos, ai.radius, o).collided);

                    // B. Magma Pools (if not Pyro/immune)
                    if (!isDangerous) {
                        isDangerous = stateRef.current.groundEffects.some(g => g.type === 'MAGMA_POOL' && Utils.dist(landingPos, g.pos) < g.radius + ai.radius);
                    }

                    if (isDangerous) {
                        // Abort Pounce
                        ai.catIsCharging = false;
                        ai.pounceCooldown = 1.0; // Short Penalty
                        // Evasion: Try to move perpendicular/away
                        const evasionAngle = ai.angle + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
                        ai.aiTacticalRetreatDir = { x: Math.cos(evasionAngle), y: Math.sin(evasionAngle) };
                        ai.aiTacticalRetreatTimer = 0.5;
                    } else {
                        // Safe -> Pounce
                        ai.catIsCharging = false;
                        handleCatPounce(ai, 0.6);
                    }
                }
            } else {
                if (target) {
                    // 随机尝试蓄力 (Skill - Skip if taunted)
                    if (!ai.aiSkipSkills && distToTarget > 150 && Math.random() < 0.01 && ai.pounceCooldown <= 0) {
                        ai.catIsCharging = true;
                        ai.catChargeStartTime = performance.now();
                    }
                    // 近身攻击 (Basic - Always try if in range)
                    if (distToTarget < CHAR_STATS.CAT.scratchRange + 20) handleCatScratch(ai);

                    // 技能释放 (Skill - Skip if taunted)
                    if (!ai.aiSkipSkills && ai.secondarySkillCooldown <= 0 && distToTarget < 200) {
                        if (ai.aiHissDelay === undefined) {
                            ai.aiHissDelay = 0.2 + Math.random() * 0.3;
                            ai.aiHissTimer = 0;
                        }

                        ai.aiHissTimer = (ai.aiHissTimer || 0) + dt;

                        if (ai.aiHissTimer >= ai.aiHissDelay) {
                            handleCatHiss(ai);
                            ai.aiHissDelay = undefined;
                            ai.aiHissTimer = 0;
                        }
                    } else {
                        ai.aiHissDelay = undefined;
                        ai.aiHissTimer = 0;
                    }

                    if (!ai.aiSkipSkills && ai.skillCooldown <= 0 && distToTarget < 480 && Math.random() < 0.01) handleCatScooper(ai);
                }
            }
        }
        else if (ai.type === CharacterType.WUKONG) {
            if (evasionDir) {
                ai.aimAngle = Math.atan2(finalMoveDir.y, finalMoveDir.x);
            } else if (target) {
                ai.aimAngle = Math.atan2(target.pos.y - ai.pos.y, target.pos.x - ai.pos.x);
            }
            ai.angle = ai.aimAngle;

            if (target) {
                // Basic Attack (Combo)
                if (distToTarget < 150 && ai.attackCooldown <= 0) handleWukongCombo(ai);

                // Thrust Charge (Skill - Skip if taunted)
                if (!ai.aiSkipSkills && distToTarget > 150 && distToTarget < 300 && ai.wukongChargeState === 'NONE' && ai.wukongThrustTimer <= 0) {
                    ai.wukongChargeState = 'THRUST'; ai.wukongMaxCharge = 0.8; ai.wukongChargeTime = 0;
                }

                // Smash Charge (Skill - Skip if taunted)
                if (!ai.aiSkipSkills && ai.skillCooldown <= 0 && ai.wukongChargeState === 'NONE') {
                    let wantSmash = false;
                    let chargeTime = 1.5;

                    if (distToTarget < 500) {
                        const obstacles = stateRef.current.obstacles;
                        const hasWall = obstacles.some(obs => {
                            if (obs.type !== 'WALL') return false;
                            const center = { x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 };
                            const d = Utils.distToSegment(center, ai.pos, target.pos);
                            const size = Math.max(obs.width, obs.height) / 2;
                            return d < size + 20;
                        });

                        if (hasWall) {
                            wantSmash = true;
                            chargeTime = 1.5;
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
            }

            if (ai.wukongChargeState !== 'NONE') {
                ai.wukongChargeTime += dt;
                if (ai.wukongChargeTime >= ai.wukongMaxCharge) {
                    ai.wukongChargeTime = ai.wukongMaxCharge;
                    if (ai.wukongChargeState === 'THRUST') releaseWukongThrust(ai);
                    else if (ai.wukongChargeState === 'SMASH') {
                        ai.wukongChargeHoldTimer += dt;
                        if (ai.wukongChargeHoldTimer >= 1.0) releaseWukongSmash(ai);
                    }
                }
            }
        }
        else if (ai.type === CharacterType.PYRO) {
            // Aiming
            const { range: aiRange, angle: aiAngle } = calculatePyroShape(distToTarget + 40);
            ai.currentWeaponRange = aiRange;
            ai.currentWeaponAngle = aiAngle;

            if (evasionDir) {
                ai.aimAngle = Math.atan2(finalMoveDir.y, finalMoveDir.x);
            } else if (target) {
                // only if target exists
                ai.aimAngle = Math.atan2(moveDir.y, moveDir.x);
            }

            // Movement adjustment (Strafe/Kiting)
            if (!evasionDir && target) {
                const range = CHAR_STATS[CharacterType.PYRO].flamethrowerRange;
                const idealRange = (range * 0.9) + (ai.aiPreferredDistOffset || 0);

                if (distToTarget > idealRange + 20) {
                    finalMoveDir = Utils.normalize(moveDir);
                } else {
                    const perp = { x: -moveDir.y, y: moveDir.x };
                    // Use stored Strafe Direction
                    let strafe = Utils.mult(Utils.normalize(perp), (ai.aiStrafeDir || 1));

                    // Mix in some forward/backward to avoid perfect orbit
                    const error = (distToTarget - idealRange) / 100; // -1 to 1 approx
                    const approach = Utils.clamp(error, -0.5, 0.5);

                    finalMoveDir = Utils.add(Utils.mult(Utils.normalize(moveDir), approach), Utils.mult(strafe, 0.8));
                    finalMoveDir = Utils.normalize(finalMoveDir);
                }
            }

            // Burst Control
            if (ai.burstTimer === undefined) ai.burstTimer = 0;
            if (ai.burstTimer > 0) ai.burstTimer -= dt;

            const inRange = distToTarget < ai.currentWeaponRange + 20;
            if (inRange && ai.burstTimer <= 0 && !ai.isBurnedOut && ai.fuel > 0 && ai.disarmTimer <= 0) {
                ai.burstTimer = 1.0 + Math.random() * 0.5;
            }

            const shouldFire = (inRange || ai.burstTimer > 0) && !ai.isBurnedOut && ai.fuel > 0 && ai.disarmTimer <= 0;

            if (shouldFire && target) {
                ai.isFiringFlamethrower = true;
                ai.fuel -= CHAR_STATS.PYRO.fuelConsumption * dt;
                if (ai.fuel <= 0) { ai.fuel = 0; ai.isBurnedOut = true; ai.burstTimer = 0; Sound.playBurnout(); spawnParticles(ai.pos, 15, '#ffffff', 5, 0.5); }
                fireFlamethrower(ai, dt);
            } else {
                ai.isFiringFlamethrower = false;
            }

            if (target && !ai.aiSkipSkills && ai.skillCooldown <= 0 && ai.silenceTimer <= 0) {
                const maxRange = 650; // Pyro projectile target range limit
                const hpPercent = ai.hp / CHAR_STATS[CharacterType.PYRO].hp;

                // Strategy 1: Defensive/Recovery (Low HP or in Water)
                if ((hpPercent < 0.4 || ai.isWet) && distToTarget < 400) {
                    // Cast on self to get magma heal/regen and clear wet status
                    castMagmaPool(ai, ai.pos);
                }
                // Strategy 2: Offensive (InRange)
                else if (distToTarget < 350) {
                    castMagmaPool(ai, target.pos);
                }
                // Strategy 3: Long-range Poke/Zoning (Proactive)
                else if (distToTarget < maxRange && Math.random() < 0.05) {
                    castMagmaPool(ai, target.pos);
                }
            }

            // Magma Detonation Logic
            const allPools = stateRef.current.groundEffects.filter(g => g.type === 'MAGMA_POOL');
            if (allPools.length > 0 && ai.secondarySkillCooldown <= 0) {
                const targets = getEnemies(ai);
                let shouldDetonate = false;
                let detonateScore = 0;

                for (const pool of allPools) {
                    for (const enemy of targets) {
                        const distToPool = Utils.dist(pool.pos, enemy.pos);
                        if (distToPool < 200) detonateScore += 2;
                        else if (distToPool < 350) detonateScore += 0.5;
                    }
                }

                if (detonateScore >= 2) shouldDetonate = Math.random() < 0.8;
                else if (detonateScore >= 1) shouldDetonate = Math.random() < 0.4;
                else if (detonateScore >= 0.5) shouldDetonate = Math.random() < 0.1;

                if (shouldDetonate) {
                    detonateMagmaPools(ai);
                    ai.secondarySkillCooldown = 3.0;
                }
            }

            // Combo Logic
            if (target && ai.skillCooldown > 0 && ai.skillCooldown > (CHAR_STATS[CharacterType.PYRO].skillCooldown / 1000 - 0.5)) {
                if (ai.secondarySkillCooldown <= 0 && distToTarget < 350) {
                    if (Math.random() < 0.6) {
                        setTimeout(() => {
                            if (!ai.isDead && ai.secondarySkillCooldown <= 0) {
                                const hasPools = stateRef.current.groundEffects.some(g => g.type === 'MAGMA_POOL');
                                if (hasPools) {
                                    detonateMagmaPools(ai);
                                    ai.secondarySkillCooldown = 3.0;
                                }
                            }
                        }, 300 + Math.random() * 200);
                    }
                }
            }
        }
        else if (ai.type === CharacterType.TANK) {
            const targetAim = target
                ? Math.atan2(target.pos.y - ai.pos.y, target.pos.x - ai.pos.x)
                : ai.angle; // Fallback

            const diff = targetAim - ai.aimAngle;
            const d = Math.atan2(Math.sin(diff), Math.cos(diff));
            ai.aimAngle += Utils.clamp(d, -CHAR_STATS.TANK.turretSpeed * dt * 60, CHAR_STATS.TANK.turretSpeed * dt * 60);

            if (target && !evasionDir) {
                let optimalRange = ai.tankMode === TankMode.ARTILLERY ? 500 : 300;
                optimalRange += (ai.aiPreferredDistOffset || 0);

                if (distToTarget < optimalRange - 50) {
                    finalMoveDir = Utils.mult(Utils.normalize(moveDir), -1);
                } else if (distToTarget > optimalRange + 50) {
                    finalMoveDir = Utils.normalize(moveDir);
                } else {
                    // Strafe
                    const perp = { x: -moveDir.y, y: moveDir.x };
                    const strafe = Utils.mult(Utils.normalize(perp), (ai.aiStrafeDir || 1) * 0.6);
                    // Add slight random noise to vector to prevent locked path
                    finalMoveDir = strafe;
                }
            }

            if (target) {
                if (!ai.aiSkipSkills && distToTarget > 500 && ai.tankMode === TankMode.LMG) { ai.tankMode = TankMode.ARTILLERY; ai.skillCooldown = 1; ai.attackCooldown = 1.5; Sound.playSkill('SWITCH'); }
                if (!ai.aiSkipSkills && distToTarget < 300 && ai.tankMode === TankMode.ARTILLERY) { ai.tankMode = TankMode.LMG; ai.skillCooldown = 1; ai.attackCooldown = 1.5; Sound.playSkill('SWITCH'); }

                if (ai.attackCooldown <= 0 && Math.abs(d) < 0.3) {
                    if (ai.tankMode === TankMode.ARTILLERY) {
                        if (ai.artilleryAmmo > 0 && distToTarget > CHAR_STATS.TANK.artilleryMinRange) {
                            fireArtillery(ai, target.pos); ai.artilleryAmmo--; ai.attackCooldown = 3.5;
                        }
                    } else {
                        if (!ai.isReloadingLmg && ai.lmgAmmo > 0) {
                            fireLMG(ai); ai.lmgAmmo--; ai.attackCooldown = 0.1;
                            if (ai.lmgAmmo <= 0) { ai.lmgAmmo = 0; ai.isReloadingLmg = true; ai.lmgReloadTimer = 0; }
                        } else {
                            ai.lmgAmmo = ai.maxLmgAmmo; ai.attackCooldown = 2.0;
                        }
                    }
                }
                if (!ai.aiSkipSkills && ai.droneState === 'READY' && distToTarget < 600) deployDrone(ai);
            }
        }
        else if (ai.type === CharacterType.MAGIC) {
            // 魔法球 AI 逻辑
            const stats = CHAR_STATS[CharacterType.MAGIC];

            // 瞄准
            if (target && (ai.aimLockTimer || 0) <= 0) {
                ai.aimAngle = Math.atan2(target.pos.y - ai.pos.y, target.pos.x - ai.pos.x);
            }
            ai.angle = ai.aimAngle;

            if (target) {
                // 移动策略：保持中距离
                const optimalRange = 250 + (ai.aiPreferredDistOffset || 0);
                if (!evasionDir) {
                    if (distToTarget < optimalRange - 50) {
                        // too close
                        finalMoveDir = Utils.mult(Utils.normalize(moveDir), -1);
                    } else if (distToTarget > optimalRange + 100) {
                        // too far
                        finalMoveDir = Utils.normalize(moveDir);
                    } else {
                        // Strafe
                        const perp = { x: -moveDir.y, y: moveDir.x };
                        const strafe = Utils.mult(Utils.normalize(perp), (ai.aiStrafeDir || 1) * 0.7);
                        finalMoveDir = strafe;
                    }
                }

                // 普攻：攻击范围内随机发射
                if (ai.attackCooldown <= 0 && distToTarget < stats.curseRange - 50 && (ai.mp || 0) >= stats.curseManaCost) {
                    if (Math.random() < 0.3) { // 30% 概率每帧尝试
                        handleMagicCurse(ai, target.pos);
                    }
                }

                // 右键技能（保命）：低血量或敌人太近时使用
                // 检查是否有足够蓝量使用右键技能（三个技能蓝耗都是100）
                if (ai.secondarySkillCooldown <= 0 && (ai.mp || 0) >= stats.expelliarmusManaCost) {
                    const shouldProtect =
                        (ai.hp < ai.maxHp * 0.4) || // 低血量
                        (distToTarget < 100 && Math.random() < 0.2) || // 敌人太近
                        (ai.stunTimer > 0 || ai.rootTimer > 0 || ai.silenceTimer > 0); // 被控

                    if (shouldProtect) {
                        handleMagicProtection(ai);
                    }
                }

                // 大招：MP充足且敌人在范围内
                if (ai.skillCooldown <= 0 && (ai.mp || 0) > 100) {
                    const shouldUlt =
                        (ai.magicForm === 'WHITE' && distToTarget < stats.patronusRange && Math.random() < 0.02) ||
                        (ai.magicForm === 'BLACK' && distToTarget < 500 && Math.random() < 0.015) ||
                        (ai.hp < ai.maxHp * 0.3 && Math.random() < 0.1); // 残血时更积极

                    if (shouldUlt) {
                        handleMagicUltimate(ai);
                    }
                }
            }
        }

        // --- 应用速度 ---
        if (shouldMove) {
            if (ai.rootTimer > 0) {
                // Rooted: Stop movement but allow rotation/aiming (handled below if we don't return, but here we likely want to stop position update)
                ai.vel = Utils.mult(ai.vel, 0.8);
                return;
            }

            let speedMult = 1.0;
            if (ai.slowTimer > 0) speedMult *= 0.4;
            if ((ai.hasteTimer || 0) > 0) speedMult *= 1.5;

            // 角色特定减速
            if (ai.type === CharacterType.TANK && ai.tankMode === TankMode.LMG) speedMult = 1.6;
            if (ai.type === CharacterType.CAT && ai.catIsCharging) {
                const chargeDuration = (performance.now() - (ai.catChargeStartTime || 0)) / 1000;
                if (chargeDuration > 0.3) speedMult *= 0.2;
            }
            if (ai.type === CharacterType.WUKONG && ai.wukongChargeState === 'SMASH') speedMult = 0;
            else if (ai.type === CharacterType.WUKONG && ai.wukongChargeState === 'THRUST') speedMult *= 0.3;

            const accel = PHYSICS.ACCELERATION_SPEED * CHAR_STATS[ai.type].speed * speedMult;


            // 坦克移动较慢
            let finalAccel = accel;
            if (ai.type === CharacterType.TANK) finalAccel *= 0.8;

            ai.vel = Utils.add(ai.vel, Utils.mult(finalMoveDir, finalAccel * dt * 60));

            // 除了坦克和猫扑，其他角色转身
            if (ai.type !== CharacterType.CAT || !ai.isPouncing) {
                const targetAngle = Math.atan2(finalMoveDir.y, finalMoveDir.x);
                // 平滑旋转 (Smooth Turn)
                // 计算最短旋转角
                let diff = targetAngle - ai.angle;
                // Normalize -PI to PI
                if (Number.isFinite(diff)) {
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                } else {
                    diff = 0;
                }

                const turnSpeed = 15; // rad/s

                // Deadzone to prevent micro-twitching
                if (Math.abs(diff) < 0.05) {
                    ai.angle = targetAngle;
                } else {
                    const change = Math.min(Math.abs(diff), turnSpeed * dt) * Math.sign(diff);
                    ai.angle += change;
                }
            }
        }

        // [Final Blind Jitter] Centralized jitter for AI indicators & skill directions
        // Applying this at the end ensures character-specific "stable" tracking logic 
        // doesn't overwrite the blind effect.
        if ((ai.blindTimer || 0) > 0) {
            const jitter = (Math.random() - 0.5) * 1.5; // Same spread as player (approx 85 deg)
            ai.aimAngle += jitter;
            // Also update body angle if they use it for weapons (like Pyro flamethrower or Tank body-based aim)
            // But usually aimAngle is the primary direction for projectiles/indicators.
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

        // 1. 核心喷射流 (Core): 极快、亮白/亮黄、小体积 - 增强
        for (let i = 0; i < 4; i++) {  // 增加数量
            const angleOffset = (Math.random() - 0.5) * cone * 0.5;
            const finalAngle = p.aimAngle + angleOffset;
            const speed = 16 + Math.random() * 6; // 极快 (16~22)
            const baseLife = (range / (speed * 60)) * 0.8;

            stateRef.current.particles.push({
                id: Math.random().toString(),
                pos: { ...tip },
                vel: { x: Math.cos(finalAngle) * speed, y: Math.sin(finalAngle) * speed },
                life: baseLife,
                maxLife: baseLife,
                color: Math.random() > 0.5 ? '#ffffff' : '#fef3c7', // 白/亮米色
                size: 3 + Math.random() * 2
            });
        }

        // 2. 主体烈焰 (Body): 正常速度、橙红黄渐变、中体积 - 大幅增强
        for (let i = 0; i < 8; i++) {  // 增加数量
            const angleOffset = (Math.random() - 0.5) * 2 * cone;
            const finalAngle = p.aimAngle + angleOffset;
            const speed = 12 + Math.random() * 4;
            const baseLife = range / (speed * 60);

            // 丰富的颜色渐变
            const colors = ['#fef08a', '#fde047', '#facc15', '#f59e0b', '#f97316', '#ef4444'];
            const color = colors[Math.floor(Math.random() * colors.length)];

            stateRef.current.particles.push({
                id: Math.random().toString(),
                pos: { ...tip },
                vel: { x: Math.cos(finalAngle) * speed, y: Math.sin(finalAngle) * speed },
                life: baseLife * (0.9 + Math.random() * 0.3),
                maxLife: baseLife,
                color: color,
                size: 3 + Math.random() * 4
            });
        }

        // 3. 边缘烟雾/余烬 (Smoke): 稍慢、深红/灰、大体积
        for (let i = 0; i < 3; i++) {  // 略增加
            const angleOffset = (Math.random() - 0.5) * 2.2 * cone;
            const finalAngle = p.aimAngle + angleOffset;
            const speed = 8 + Math.random() * 4;
            const baseLife = range / (speed * 60);

            stateRef.current.particles.push({
                id: Math.random().toString(),
                pos: { ...tip },
                vel: { x: Math.cos(finalAngle) * speed, y: Math.sin(finalAngle) * speed },
                life: baseLife,
                maxLife: baseLife,
                color: 'rgba(185, 28, 28, 0.5)',
                size: 5 + Math.random() * 4,
                drag: 0.95
            });
        }

        // 4. [新增] 火星飞溅 (Sparks): 快速、小颗粒、随机散射
        for (let i = 0; i < 3; i++) {
            const angleOffset = (Math.random() - 0.5) * 2.5 * cone;
            const finalAngle = p.aimAngle + angleOffset;
            const speed = 18 + Math.random() * 8;
            const baseLife = (range / (speed * 60)) * 0.6;

            stateRef.current.particles.push({
                id: Math.random().toString(),
                pos: { ...tip },
                vel: { x: Math.cos(finalAngle) * speed, y: Math.sin(finalAngle) * speed },
                life: baseLife,
                maxLife: baseLife,
                color: Math.random() > 0.5 ? '#fbbf24' : '#fde68a',
                size: 1.5 + Math.random() * 1.5
            });
        }

        // 5. [新增] 热浪/辉光 (Glow): 大而透明、扩散慢
        if (Math.random() < 0.3) {  // 30%概率生成
            stateRef.current.particles.push({
                id: Math.random().toString(),
                pos: { ...tip },
                vel: { x: Math.cos(p.aimAngle) * 6, y: Math.sin(p.aimAngle) * 6 },
                life: 0.4,
                maxLife: 0.4,
                color: 'rgba(251, 191, 36, 0.2)',
                size: 8 + Math.random() * 6,
                drag: 0.9
            });
        }

        // [友军伤害] 使用 getAllAttackTargets 获取所有可攻击目标（包括友军）
        const targets = getAllAttackTargets(p);

        // Hit Logic - 攻击所有目标
        targets.forEach(e => {
            const toEnemy = Utils.sub(e.pos, p.pos);
            const distE = Utils.mag(toEnemy);
            if (distE < range) {
                const angleToEnemy = Math.atan2(toEnemy.y, toEnemy.x);
                const angleDiff = Math.abs(angleToEnemy - p.aimAngle);
                const normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

                if (Math.abs(normalizedDiff) < cone) {
                    if ('isSummon' in e) {
                        e.hp -= 350 * dt;
                        if (e.hp <= 0) killEntity(e, p.id); // [新增] 召唤物死亡处理
                        if (Math.random() < 0.2) spawnParticles(e.pos, 1, '#ef4444', 2, 0.5);
                    } else {
                        // Pyro and Wet targets are immune to fire statuses and exposure
                        if (e.type !== CharacterType.PYRO && !e.isWet) {
                            const prevExposure = e.flameExposure || 0;
                            e.flameExposure = Math.min(100, (e.flameExposure || 0) + 0.5);

                            // Trigger Burst (爆燃) text and effect when reaching 100% accumulation
                            if (prevExposure < 100 && e.flameExposure >= 100) {
                                applyStatus(e, 'burst', 0, p.id);
                            }

                            if (e.burnTimer <= 0) {
                                applyStatus(e, 'burn', 3.0, p.id);
                            } else {
                                e.burnTimer = 3.0; // Refresh timer silently
                            }
                        }
                        const baseDmg = 95;
                        takeDamage(e, baseDmg * dt, CharacterType.PYRO, DamageType.FIRE);
                    }
                    if (Math.random() < 0.15) spawnParticles(e.pos, 1, '#ff4400', 1, 0.5);
                }
            }
        });
    };

    const castMagmaPool = (p: PlayerState, target: Vector2) => {
        if (p.silenceTimer > 0) return;
        Sound.playSkill('MAGMA_THROW');
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
            aoeRadius: CHAR_STATS[CharacterType.PYRO].magmaPoolRadius,
            damageType: DamageType.FIRE
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
        if (p.isReloadingLmg) return; // Prevent shooting while reloading
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

            // --- 粒子特效 (保持原样) ---
            if (p.projectileType === 'MAGMA_PROJ') {
                if (Math.random() < 0.6) {
                    state.particles.push({
                        id: Math.random().toString(), pos: { ...p.pos },
                        vel: Utils.mult(Utils.normalize(p.vel), -2),
                        life: 0.3 + Math.random() * 0.2, maxLife: 0.5,
                        color: Math.random() > 0.5 ? '#f97316' : '#ef4444',
                        size: p.radius * (0.5 + Math.random() * 0.3)
                    });
                }
            } else if (p.projectileType === 'BOMB') {
                if (Math.random() < 0.7) {
                    state.particles.push({
                        id: Math.random().toString(), pos: { ...p.pos },
                        vel: { x: (Math.random() - 0.5), y: (Math.random() - 0.5) },
                        life: 0.5 + Math.random() * 0.3, maxLife: 0.8,
                        color: Math.random() > 0.5 ? '#9ca3af' : '#4b5563',
                        size: p.radius * (0.6 + Math.random() * 0.4)
                    });
                }
            }

            // --- 碰撞与逻辑 ---
            if (p.projectileType === 'MAGMA_PROJ') {
                // Modified: Only check for overlaps/detonation when the projectile LANDS
                if (p.life <= 0) {
                    p.life = 0; // Destroy projectile

                    const poolRadius = p.aoeRadius || 80;
                    const hitPools = state.groundEffects.filter(g =>
                        g.type === 'MAGMA_POOL' &&
                        !g.isPendingDetonation && // Don't re-trigger ones already pending
                        Utils.dist(p.pos, g.pos) < g.radius + poolRadius
                    );

                    const hitLava = state.obstacles.some(obs =>
                        obs.type === 'LAVA' &&
                        Utils.checkCircleRectCollision(p.pos, poolRadius, obs).collided
                    );

                    const owner = state.players.find(pl => pl.id === p.ownerId);
                    const shouldDetonate = owner && (hitPools.length > 0 || hitLava);

                    // ALWAYS create the new pool first
                    const newPool: GroundEffect = {
                        id: Math.random().toString(),
                        pos: p.pos,
                        radius: poolRadius,
                        life: 10,
                        maxLife: 10,
                        type: 'MAGMA_POOL',
                        ownerId: p.ownerId,
                        damageType: DamageType.FIRE
                    };

                    if (shouldDetonate) {
                        // Mark for delayed detonation
                        newPool.isPendingDetonation = true;
                        newPool.detonationTimer = 0.3; // Show for ~300ms

                        // Also mark hit pools for simultaneous detonation
                        hitPools.forEach(pool => {
                            pool.isPendingDetonation = true;
                            pool.detonationTimer = 0.3;
                        });
                    }

                    state.groundEffects.push(newPool);

                    if (!shouldDetonate) {
                        // Regular Impact sound/explosion (small visual)
                        Sound.playSkill('MAGMA_LAND');
                        createExplosion(state, p.pos, 50, 0, p.ownerId, true, false);
                    } else {
                        // Optional: Play a "fizzle/ignite" start sound? 
                        // For now we just wait for the big pop.
                    }
                }
            }
            else if (p.projectileType === 'BOMB') {
                // 找到发射者（用于判断阵营）
                const owner = state.players.find(pl => pl.id === p.ownerId);

                // 1. 检查无人机 (直击)
                state.drones.forEach(d => {
                    // 找到无人机的主人
                    const dOwner = state.players.find(pl => pl.id === d.ownerId);
                    // 判定敌对：非自己，且 (无主人 或 主人队伍不同)
                    const isEnemy = d.ownerId !== p.ownerId && (!owner || !dOwner || owner.teamId !== dOwner.teamId);

                    if (isEnemy && d.hp > 0 && !d.isDocked && (!p.hitTargets || !p.hitTargets.includes(d.id))) {
                        if (Utils.dist(p.pos, d.pos) < d.radius + p.radius) {
                            d.hp -= p.damage;
                            Sound.playHit();
                            if (!p.hitTargets) p.hitTargets = [];
                            p.hitTargets.push(d.id);
                            spawnParticles(p.pos, 5, '#f59e0b', 4);
                            if (p.isEmp) d.hp = 0;

                            if (d.hp <= 0) {
                                killEntity(d, p.ownerId); // 使用统一击杀逻辑
                            }
                        }
                    }
                });

                // 2. 检查玩家 (直击) - [友军伤害] 攻击所有目标
                state.players.forEach(target => {
                    // 判定：非自己，未死亡，未被本次击中过
                    if (target.id !== p.ownerId && !target.isDead &&
                        (!p.hitTargets || !p.hitTargets.includes(target.id))) {

                        if (Utils.dist(p.pos, target.pos) < target.radius + p.radius) {
                            let damageMultiplier = 0.7;
                            // 如果目标在最终爆炸范围内，减少直击伤害（避免双倍伤害）
                            if (p.targetPos) {
                                const blastRadius = p.aoeRadius || 120;
                                const distToBlastCenter = Utils.dist(target.pos, p.targetPos);
                                const isInsideBlastZone = distToBlastCenter < (blastRadius + target.radius);
                                if (isInsideBlastZone) {
                                    damageMultiplier = 0.1;
                                }
                            }

                            const penDamage = p.damage * damageMultiplier;
                            takeDamage(target, penDamage, CharacterType.TANK, DamageType.PHYSICAL);
                            Sound.playHit();

                            if (!p.hitTargets) p.hitTargets = [];
                            p.hitTargets.push(target.id);

                            spawnParticles(p.pos, 10, '#f59e0b', 5, 0.5);
                        }
                    }
                });

                // 寿命耗尽 -> 爆炸
                if (p.life <= 0) {
                    createExplosion(state, p.pos, p.aoeRadius || 120, p.damage, p.ownerId, false);
                }
            } else {
                // --- 普通子弹 / 无人机子弹 ---
                let hitWall = false;
                // 无人机子弹穿墙
                if (p.projectileType !== 'DRONE_SHOT') {
                    for (const obs of state.obstacles) {
                        if (obs.type === 'WATER' || obs.type === 'LAVA') continue;
                        if (Utils.checkCircleRectCollision(p.pos, p.radius, obs).collided) {

                            // [New] Magic Spell Wall Penetration
                            if (p.spawnedInsideWall) {
                                continue;
                            }

                            hitWall = true;
                            break;
                        }
                    }

                    // [New] Logic to clear spawnedInsideWall flag
                    if (p.spawnedInsideWall) {
                        const stillInside = state.obstacles.some(obs =>
                            obs.type !== 'WATER' && obs.type !== 'LAVA' &&
                            Utils.checkCircleRectCollision(p.pos, p.radius, obs).collided
                        );
                        if (!stillInside) {
                            p.spawnedInsideWall = false;
                        }
                    }
                }

                let hitEntity: any = null;


                if (!hitWall) {
                    // 1. 检查撞到玩家
                    for (const pl of state.players) {
                        if (pl.id !== p.ownerId && !pl.isDead) {
                            // [New] Dynamic collision radius for Magic Shield
                            const effectiveRadius = (pl.magicShieldHp && pl.magicShieldHp > 0) ? (pl.radius + 30) : pl.radius;
                            if (Utils.dist(p.pos, pl.pos) < effectiveRadius + p.radius) {
                                hitEntity = pl;
                                break;
                            }
                        }
                    }
                }
                // 2. 检查撞到无人机 (如果还没撞到人)
                if (!hitEntity) {
                    for (const d of state.drones) {

                        // 判定：非自己的无人机，且存活 - [友军伤害] 可攻击所有无人机
                        const isValidTarget = d.ownerId !== p.ownerId;

                        if (isValidTarget && d.hp > 0 && !d.isDocked) {
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
                        // 命中无人机
                        let dmg = p.damage;
                        if (p.isEmp) dmg = 9999;
                        hitEntity.hp -= dmg;
                        spawnParticles(p.pos, 5, '#6ee7b7');

                        // 击退
                        hitEntity.pos = Utils.add(hitEntity.pos, Utils.mult(Utils.normalize(p.vel), 10));

                        if (hitEntity.hp <= 0) {
                            killEntity(hitEntity, p.ownerId);
                        }

                    } else {
                        // 命中玩家
                        if (p.projectileType === 'MAGIC_SPELL') {
                            // 1. Determine Status to Apply
                            let statusToApply = p.statusType;

                            if (!statusToApply) {
                                // Fallback: Pick random if not pre-set
                                const allDebuffs = Object.keys(STATUS_CONFIG).filter(k =>
                                    STATUS_CONFIG[k].nature === 'negative' &&
                                    k !== 'disarm'
                                );
                                statusToApply = allDebuffs[Math.floor(Math.random() * allDebuffs.length)];
                            }

                            const initialStatus = statusToApply; // [New] Store for line triggering

                            // 2. Mechanical Immunity Check (Unified)
                            if (isMechanical(hitEntity)) {
                                const immune = ['charm', 'fear', 'sleep', 'silence', 'taunt'];
                                if (initialStatus && immune.includes(initialStatus)) {
                                    statusToApply = undefined; // Immune
                                    hitEntity.statusLabel = "无效!";
                                    spawnParticles(hitEntity.pos, 5, '#9ca3af', 2);
                                }
                            }

                            // 3. Apply Status & Visuals
                            const owner = state.players.find(pl => pl.id === p.ownerId);
                            const finalStatus = statusToApply; // Reference for line triggering

                            if (finalStatus) {
                                const duration = 0.5 + Math.random() * 2.5;
                                applyStatus(hitEntity, finalStatus, duration, p.ownerId);
                            }

                            // [New] Show floating text on Caster whenever a spell identifies a valid line, even if target is immune
                            const lineStatus = p.statusType || initialStatus;
                            if (owner && lineStatus && MAGIC_SPELL_LINES[lineStatus]) {
                                owner.statusLabel = MAGIC_SPELL_LINES[lineStatus] + '!';
                                owner.statusLabelColor = p.color;
                            }
                            spawnParticles(p.pos, 15, p.color, 6);

                            // Magical burst particles
                            stateRef.current.particles.push({
                                id: Math.random().toString(),
                                pos: { ...p.pos },
                                vel: { x: 0, y: 0 },
                                life: 0.2, maxLife: 0.2,
                                color: 'rgba(255, 255, 255, 0.8)',
                                size: 15 // Flash
                            });
                            Sound.playHit('MAGIC');
                        } else if (p.projectileType === 'EXPELLIARMUS') {
                            // Expelliarmus logic
                            const owner = state.players.find(pl => pl.id === p.ownerId);
                            const stats = CHAR_STATS[CharacterType.MAGIC];

                            if (!isMechanical(hitEntity)) {
                                applyStatus(hitEntity, 'disarm', stats.expelliarmusDuration / 1000, p.ownerId);
                                hitEntity.statusLabel = "缴械!";
                            } else {
                                hitEntity.statusLabel = "无效!";
                            }

                            spawnParticles(hitEntity.pos, 15, p.color, 6);

                            // Visuals
                            stateRef.current.particles.push({
                                id: Math.random().toString(),
                                pos: { ...p.pos },
                                vel: { x: 0, y: 0 },
                                life: 0.2, maxLife: 0.2,
                                color: 'rgba(255, 255, 255, 0.8)',
                                size: 15
                            });
                            Sound.playHit('MAGIC'); // Use existing magic hit sound

                            if (owner) {
                                owner.statusLabel = MAGIC_SPELL_LINES.disarm + '!';
                                owner.statusLabelColor = p.color;
                            }
                        } else {
                            // 普通投射物 - 造成伤害
                            takeDamage(hitEntity, p.damage, CharacterType.MAGIC, DamageType.MAGIC);
                            Sound.playHit();

                            const pushDir = Utils.normalize(p.vel);
                            let knockbackForce = 160;

                            if (p.projectileType === 'DRONE_SHOT') {
                                knockbackForce = 300;
                            }

                            applyKnockback(hitEntity, pushDir, knockbackForce);
                            spawnParticles(p.pos, 5, p.color);
                        }
                    }
                }
            }
        });
    };

    const createExplosion = (state: GameState, pos: Vector2, radius: number, damage: number, ownerId: string, selfImmune: boolean = false, playSound: boolean = true) => {
        // 视觉效果 (保持原样)
        spawnParticles(pos, 30, '#f59e0b', 8, 1);
        if (playSound) Sound.playExplosion();

        state.particles.push({
            id: Math.random().toString(),
            pos: pos,
            vel: { x: 0, y: 0 },
            life: 0.2,
            maxLife: 0.2,
            color: 'rgba(255, 100, 0, 0.3)',
            size: radius
        });

        // [修改核心] 获取所有目标：玩家列表 + 活跃无人机
        // 替换原有的 [state.player, state.enemy]
        const targets = [
            ...state.players,
            ...state.drones.filter(d => d.hp > 0 && !d.isDocked)
        ];

        targets.forEach(target => {
            // 基础检查
            if ('isDead' in target && target.isDead) return;
            if (selfImmune && (target.id === ownerId || ('ownerId' in target && target.ownerId === ownerId))) return;



            const d = Utils.dist(pos, target.pos);
            if (d < radius + target.radius) {
                const damageFactor = 1 - (d / (radius + target.radius));
                const finalDamage = damage * Math.max(0, damageFactor);

                if ('isSummon' in target) {
                    // 命中无人机
                    target.hp -= finalDamage;
                    if (target.hp <= 0) {
                        killEntity(target, ownerId); // [修改] 使用统一击杀逻辑
                    }
                } else {
                    // 命中玩家
                    takeDamage(target, finalDamage, CharacterType.TANK, DamageType.PHYSICAL);

                    const pushDir = Utils.normalize(Utils.sub(target.pos, pos));
                    const baseForce = 10400;
                    const force = baseForce * damageFactor;

                    applyKnockback(target, pushDir, force);
                    applyStatus(target, 'slow', 2.4, ownerId);
                }
            }
        });
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
        if (p.stunTimer > 0) p.stunTimer -= dt;
        if (p.blindTimer > 0) p.blindTimer -= dt;
        if (p.tauntTimer > 0) p.tauntTimer -= dt;
        if (p.rootTimer > 0) p.rootTimer -= dt;
        if (p.sleepTimer > 0) p.sleepTimer -= dt;
        if ((p.petrifyTimer || 0) > 0) p.petrifyTimer! -= dt;
        if ((p.charmTimer || 0) > 0) p.charmTimer! -= dt;
        if ((p.stealthTimer || 0) > 0) p.stealthTimer! -= dt;
        if ((p.hasteTimer || 0) > 0) p.hasteTimer! -= dt;
        if ((p.magicShieldTimer || 0) > 0) p.magicShieldTimer! -= dt;
        if ((p.lightSpiritTimer || 0) > 0) p.lightSpiritTimer! -= dt;
        if ((p.ccImmuneTimer || 0) > 0) p.ccImmuneTimer! -= dt;
        if ((p.forcedMoveTimer || 0) > 0) p.forcedMoveTimer! -= dt;
        if ((p.aimLockTimer || 0) > 0) p.aimLockTimer! -= dt;

        // [修复] 嘲讽结束时重置按键状态，防止普攻卡死
        if (p.tauntTimer <= 0 && (p as any)._wasTaunted) {
            keysRef.current['MouseLeft'] = mouseBtnsRef.current['Left'] || false; // Restore actual mouse state
            (p as any)._wasTaunted = false;
        }
        if (p.tauntTimer > 0) {
            (p as any)._wasTaunted = true;
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
            // 检测各种动作状态
            const isMoving = Utils.mag(p.vel) > 1.0 || keysRef.current['KeyW'] || keysRef.current['KeyS'] || keysRef.current['KeyA'] || keysRef.current['KeyD'];
            const isAttacking = p.attackCooldown > 0; // 刚刚进行了攻击
            const isUsingSkill = p.skillCooldown > 0 || p.secondarySkillCooldown > 0; // 刚刚使用了技能

            // 检测转向（面朝方向改变）
            const prevAngle = p.prevAimAngle ?? p.aimAngle;
            let angleDiff = Math.abs(p.aimAngle - prevAngle);
            // 处理角度环绕（-π 到 π）
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
            const isTurning = angleDiff > 0.05; // 转向阈值（约3度）

            // 更新上一次的角度
            p.prevAimAngle = p.aimAngle;

            // 只有在没有任何动作时才累积 idleTimer
            if (!isMoving && !isAttacking && !isUsingSkill && !isTurning) {
                p.idleTimer = (p.idleTimer || 0) + dt;
            } else {
                p.idleTimer = 0;
            }
        }

        // Combo Timer Reset Logic (Must be outside water check to work globally)
        if (p.type === CharacterType.WUKONG && p.wukongComboStep > 0) {
            p.wukongComboTimer -= dt;
            if (p.wukongComboTimer <= 0) p.wukongComboStep = 0;
        }

        // Water Effects & Drowning
        if (p.isWet) {
            // Pyro always steams when wet (regardless of speed)
            if (p.type === CharacterType.PYRO && Math.random() < 0.4) {
                stateRef.current.particles.push({
                    id: Math.random().toString(),
                    pos: Utils.add(p.pos, { x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20 }),
                    vel: { x: (Math.random() - 0.5) * 1, y: -2 - Math.random() * 2 },
                    life: 0.6 + Math.random() * 0.4,
                    maxLife: 1.0,
                    color: 'rgba(226, 232, 240, 0.7)',
                    size: 6 + Math.random() * 6,
                    drag: 0.92
                });
            }

            // Drowning Damage: Pyro drowns whenever wet. Others only when stationary.
            const isStationary = Utils.mag(p.vel) < 0.8;
            if (p.type === CharacterType.PYRO || isStationary) {
                takeDamage(p, 50 * dt, CharacterType.ENVIRONMENT, DamageType.WATER);

                // Bubbles for non-pyro only when drowning (stationary)
                if (p.type !== CharacterType.PYRO && isStationary && Math.random() < 0.2) {
                    stateRef.current.particles.push({
                        id: Math.random().toString(),
                        pos: Utils.add(p.pos, { x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20 }),
                        vel: { x: (Math.random() - 0.5) * 0.5, y: -1.7 }, // Faster upward movement
                        life: 0.8, maxLife: 0.8, // Float higher
                        color: '#bae6fd',
                        size: 2.5 + Math.random() * 2 // Larger bubbles
                    });
                }
            }
        }

        if (p.burnTimer > 0) {
            p.burnTimer -= dt;
            const flatBurn = 25;
            const percentBurn = p.maxHp * 0.015;

            // [New] Resolve burn source
            let burnSourceType = CharacterType.ENVIRONMENT;
            if (p.burnSourceId) {
                const source = stateRef.current.players.find(sp => sp.id === p.burnSourceId);
                if (source) burnSourceType = source.type;
            }

            takeDamage(p, (flatBurn + percentBurn) * dt, burnSourceType, DamageType.FIRE);

            if (Math.random() < 0.2) {
                spawnParticles(p.pos, 1, '#f97316', 1, 0.6);
            }
        }

        if (p.flameExposure > 0) {
            p.flameExposure -= 10 * dt;
            if (p.flameExposure < 0) p.flameExposure = 0;
        }

        if (p.type === CharacterType.PYRO) {
            const stats = CHAR_STATS[CharacterType.PYRO];

            if (p.isBurnedOut) {
                // 燃尽期：慢速恢复
                p.fuel += stats.burnoutRegen * dt;
                if (p.fuel >= p.maxFuel) {
                    p.fuel = p.maxFuel;
                    p.isBurnedOut = false;
                }
            } else if (!p.isFiringFlamethrower) {
                // 正常恢复
                p.fuel += stats.fuelRegen * dt;
                if (p.fuel > p.maxFuel) p.fuel = p.maxFuel;
            }
        } else if (p.type === CharacterType.TANK) {
            if (p.artilleryAmmo < p.maxArtilleryAmmo) {
                p.artilleryReloadTimer += dt * 1000;
                if (p.artilleryReloadTimer >= CHAR_STATS[CharacterType.TANK].artilleryRegenTime) {
                    p.artilleryAmmo += 1;
                    p.artilleryReloadTimer = 0;
                    if (p.type === CharacterType.TANK) Sound.playSkill('RELOAD');
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
                    Sound.playSkill('RELOAD');
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
        } else if (p.type === CharacterType.MAGIC) {
            const stats = CHAR_STATS[CharacterType.MAGIC];

            // MP 恢复
            let mpRegen = stats.mpRegen;
            if (p.lightSpiritTimer && p.lightSpiritTimer > 0) {
                mpRegen *= stats.lightSpiritMpRegenMultiplier; // 光灵球期间双倍回蓝
            }
            p.mp = Math.min((p.mp || 0) + mpRegen * dt, p.maxMp || stats.maxMp);

            // 护盾计时
            if ((p.magicShieldHp || 0) <= 0 && (p.magicShieldTimer || 0) > 0) {
                p.magicShieldTimer = 0;
            }

            // [New] Magic Shield Shake Timer
            if (p.magicShieldShakeTimer && p.magicShieldShakeTimer > 0) {
                p.magicShieldShakeTimer -= dt;
                if (p.magicShieldShakeTimer < 0) p.magicShieldShakeTimer = 0;
            }

            // Expiration (Time runs out)
            if ((p.magicShieldTimer || 0) <= 0 && (p.magicShieldHp || 0) > 0) {
                p.magicShieldHp = 0;
                // CD triggers on expiration
                p.secondarySkillCooldown = CHAR_STATS[CharacterType.MAGIC].armorCooldown / 1000;
                p.secondarySkillMaxCooldown = CHAR_STATS[CharacterType.MAGIC].armorCooldown / 1000;
            }

            // 光灵球效果
            if (p.lightSpiritTimer && p.lightSpiritTimer > 0) {
                p.lightSpiritTimer -= dt;
                // 持续回血ds
                p.hp = Math.min(p.hp + stats.lightSpiritHealRate * dt, p.maxHp);

                // 生成光灵球粒子表示存在
                if (Math.random() < 0.3) {
                    const angle = (performance.now() / 500) % (Math.PI * 2);
                    const orbitDist = 60;
                    stateRef.current.particles.push({
                        id: Math.random().toString(),
                        pos: {
                            x: p.pos.x + Math.cos(angle) * orbitDist,
                            y: p.pos.y + Math.sin(angle) * orbitDist
                        },
                        vel: { x: (Math.random() - 0.5) * 2, y: -1 - Math.random() },
                        life: 0.4,
                        maxLife: 0.4,
                        color: '#f8fafc',
                        size: 6 + Math.random() * 4,
                    });
                }
            }

            // 控制免疫计时
            if (p.ccImmuneTimer && p.ccImmuneTimer > 0) {
                p.ccImmuneTimer -= dt;
                // 清除所有控制效果
                p.stunTimer = 0; p.rootTimer = 0; p.slowTimer = 0;
                p.fearTimer = 0; p.silenceTimer = 0; p.disarmTimer = 0;
                p.sleepTimer = 0; p.petrifyTimer = 0;
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
                    // 修复点：先在 players 数组里找
                    let target: any = state.players.find(p => p.id === g.targetId);

                    // 如果不是玩家，在无人机里找
                    if (!target) {
                        target = state.drones.find(d => d.id === g.targetId);
                    }

                    if (target && !target.isDead && (target.hp > 0 || target.hp === undefined)) {
                        // 缓慢移动向目标 (例如每帧移动 2-3 像素)
                        const speed = 0.5;
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

            // Delayed Magma Detonation
            if (g.type === 'MAGMA_POOL' && g.isPendingDetonation && g.detonationTimer !== undefined) {
                g.detonationTimer -= dt;
                if (g.detonationTimer <= 0) {
                    const owner = state.players.find(p => p.id === g.ownerId);
                    if (owner) {
                        triggerMagmaPoolExplosion(g, owner);
                        Sound.playSkill('MAGMA_EXPLODE');
                        // Screen Shake
                        state.camera.y += 5;
                        state.camera.x += (Math.random() - 0.5) * 10;
                    }
                    g.life = 0; // Terminate effect
                    return;
                }
            }

            if (g.type === 'WUKONG_SMASH' || g.type === 'CRACK') {
                if (Math.random() < 0.2) {
                    const offset = Utils.mult({ x: Math.random() - 0.5, y: Math.random() - 0.5 }, g.radius * 2 || 40);
                    spawnParticles(Utils.add(g.pos, offset), 1, '#fef08a', 0.5, 0.5);
                }
                return;
            }
            if (g.type === 'SCOOPER_SMASH') {
                // Just visual placeholder, logic handled in timeout
                return;
            }

            state.players.forEach(p => {
                if (Utils.dist(p.pos, g.pos) < g.radius + p.radius) {
                    if (g.type === 'MAGMA_POOL') {
                        handleMagmaInteraction(p, dt, g.ownerId);
                    }
                }
            });

            if (g.type === 'MAGMA_POOL' && Math.random() < 0.4) {
                const offset = Utils.mult({ x: Math.random() - 0.5, y: Math.random() - 0.5 }, g.radius * 2);
                spawnParticles(Utils.add(g.pos, offset), 1, '#ef4444', 0.5, 0.5);
            }
        });
    };

    const triggerScooperSmash = (state: GameState, center: Vector2, ownerId: string, radius: number) => {
        Sound.playSkill('SMASH_HIT');
        // Screen Shake
        state.screenShakeTimer = 0.4;
        state.screenShakeIntensity = 500; // Match Wukong's max charge intensity


        for (let i = 0; i < 3; i++) {
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
            if (obs.type === 'WATER' || obs.type === 'LAVA') return true; // 水域/岩浆不可破坏          
            const col = Utils.checkCircleRectCollision(center, radius, obs);
            if (col.collided) {
                // 墙体破碎特效
                const wallCenter = { x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 };
                spawnParticles(wallCenter, 30, '#475569', 12, 1.2); // 灰色碎石
                return false; // 移除该障碍物
            }
            return true; // 保留未命中的障碍物
        });

        const targets: any[] = [...state.players, ...state.drones.filter(d => d.hp > 0 && !d.isDocked)];
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
                    t.hp -= finalDamage;
                    if (t.hp <= 0) {
                        killEntity(t, ownerId);
                    }
                } else {
                    takeDamage(t, finalDamage, CharacterType.CAT, DamageType.PHYSICAL);
                    applyStatus(t, 'stun', 2.0);
                    t.statusLabel = "拍扁!";
                }
                spawnParticles(t.pos, 20, '#b91c1c', 8);
            }
        });
    };

    const updateParticles = (state: GameState, dt: number) => {
        state.particles.forEach(p => {
            if (p.drag) p.vel = Utils.mult(p.vel, p.drag);
            p.pos = Utils.add(p.pos, Utils.mult(p.vel, dt * 60));
            p.life -= dt;
            if (p.spin) p.angle = (p.angle || 0) + p.spin;
        });
        state.particles = state.particles.filter(p => p.life > 0);
    };

    const updateFloatingTexts = (state: GameState, dt: number) => {
        state.floatingTexts = state.floatingTexts.filter(t => t.life > 0);
        state.floatingTexts.forEach(t => {
            t.pos.y += t.velY * dt * 60;
            t.life -= dt;
        });
    };

    const spawnParticles = (pos: Vector2, count: number, color: string, speed = 2, life = 0.5, drag = 1.0) => {
        for (let i = 0; i < count; i++) {
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
                drag,
                type: 'circle'
            });
        }
    };

    const spawnShards = (pos: Vector2, count: number, color: string) => {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 5;
            const size = 2 + Math.random() * 4; // [Refine] Much smaller shards (2-6)

            // Random polygon (Triangle)
            const pts: Vector2[] = [];
            const segments = 3;
            for (let j = 0; j < segments; j++) {
                const a = (j / segments) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
                pts.push({
                    x: Math.cos(a) * size,
                    y: Math.sin(a) * size
                });
            }

            stateRef.current.particles.push({
                id: Math.random().toString(),
                pos: { ...pos },
                vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
                life: 0.8 + Math.random() * 0.4,
                maxLife: 1.2,
                color: Math.random() > 0.3 ? color : '#ffffff',
                size,
                type: 'shard',
                angle: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 0.3,
                points: pts,
                drag: 0.96
            });
        }
    };

    const updateCamera = (state: GameState) => {
        const { innerWidth, innerHeight } = window;
        const cx = innerWidth / 2;
        const cy = innerHeight / 2;

        const human = getHumanPlayer();
        let targetPos = human.pos;

        // Spectator Mode Logic
        if (human.isDead) {

            let currentTarget = spectatorTargetIdRef.current
                ? state.players.find(p => p.id === spectatorTargetIdRef.current)
                : null;

            const isGameOver = state.gameStatus === 'VICTORY' || state.gameStatus === 'DEFEAT';

            const shouldSwitch = !currentTarget || (currentTarget.isDead && !isGameOver);

            if (shouldSwitch) {
                // 1. Try Teammates (Highest HP)
                const teammates = state.players
                    .filter(p => !p.isDead && p.teamId === human.teamId && p.id !== human.id)
                    .sort((a, b) => b.hp - a.hp);

                if (teammates.length > 0) {
                    currentTarget = teammates[0];
                    spectatorTargetIdRef.current = currentTarget.id;
                } else {
                    // 2. Try Enemies (Highest HP) - FFA or Team Wipe
                    const enemies = state.players
                        .filter(p => !p.isDead && p.teamId !== human.teamId)
                        .sort((a, b) => b.hp - a.hp);

                    if (enemies.length > 0) {
                        currentTarget = enemies[0];
                        spectatorTargetIdRef.current = currentTarget.id;
                    }
                    // 3. If everyone dead (Game Over likely just triggered), currentTarget remains as is (or null->human)
                }
            }

            if (currentTarget) {
                targetPos = currentTarget.pos;
            } else if (spectatorTargetIdRef.current) {
                // If we have a ref but couldn't find player (shouldn't happen) or everyone is dead
                // Try to find the dead body of last target
                const lastTarget = state.players.find(p => p.id === spectatorTargetIdRef.current);
                if (lastTarget) targetPos = lastTarget.pos;
            }
        }

        let targetX = targetPos.x - cx;
        let targetY = targetPos.y - cy;

        const mouseX = mouseRef.current.x;
        const mouseY = mouseRef.current.y;

        // 相机预热：前 2 秒鼠标影响力极低，2-3 秒逐渐恢复
        const lockDuration = 2.0;    // 前 2 秒鼠标影响力很低
        const transitionDuration = 1.0; // 之后 1 秒逐渐恢复
        if (cameraWarmupRef.current < lockDuration + transitionDuration) {
            cameraWarmupRef.current += 1 / 60; // 假设 ~60fps
        }

        let mouseInfluence: number;
        if (cameraWarmupRef.current < lockDuration) {
            // 前 2 秒：仅 5% 影响力
            mouseInfluence = 0.05;
        } else {
            // 2-3 秒：从 5% 逐渐过渡到 100%
            const transitionProgress = (cameraWarmupRef.current - lockDuration) / transitionDuration;
            mouseInfluence = 0.05 + 0.95 * Math.min(1, transitionProgress);
        }

        // Leash Logic (鼠标影响力受预热期控制)
        let offsetX = (mouseX - cx) * 1.6 * mouseInfluence;
        let offsetY = (mouseY - cy) * 1.6 * mouseInfluence;

        const dist = Math.sqrt(offsetX * offsetX + offsetY * offsetY);

        // Define Leash Range
        // Normal: Allow seeing just a bit further than screen edge (~ half screen width)
        // Tank Artillery: Double range
        let maxDist = Math.min(innerWidth, innerHeight) * 0.6;

        // Check if spectating target is Tank Artillery or Human is Tank Artillery
        const focusEntity = human.isDead
            ? state.players.find(p => p.id === spectatorTargetIdRef.current)
            : human;

        if (focusEntity && focusEntity.type === CharacterType.TANK && focusEntity.tankMode === TankMode.ARTILLERY) {
            maxDist *= 2.5;
        }

        // Clamp Offset
        if (dist > maxDist) {
            const ratio = maxDist / dist;
            offsetX *= ratio;
            offsetY *= ratio;
        }

        // Auto-return / Center pull
        // The standard mapping (mouse - cx) * 1.6 implies that if mouse is at center, offset is 0.
        // So "auto-return" is natural when mouse moves back. 
        // We just ensure we add the offset to the target.

        targetX += offsetX;
        targetY += offsetY;

        // Map Clamping (World Bounds) + Extra padding for camera
        // Allow camera to see a bit of void to indicate edge
        targetX = Utils.clamp(targetX, -innerWidth / 2, MAP_SIZE.width + innerWidth / 2 - innerWidth);
        targetY = Utils.clamp(targetY, -innerHeight / 2, MAP_SIZE.height + innerHeight / 2 - innerHeight);

        // Apply Screen Shake
        if ((state.screenShakeTimer || 0) > 0) {
            const intensity = state.screenShakeIntensity || 0;
            const seedX = Math.random() - 0.5;
            const seedY = Math.random() - 0.5;
            targetX += seedX * intensity;
            targetY += seedY * intensity;
        }

        // [Safety] Ensure targets are finite
        if (!Number.isFinite(targetX)) targetX = state.camera.x;
        if (!Number.isFinite(targetY)) targetY = state.camera.y;

        // Smooth Camera Follow
        state.camera.x += (targetX - state.camera.x) * 0.08;
        state.camera.y += (targetY - state.camera.y) * 0.08;

        // [Safety] Final camera check
        if (!Number.isFinite(state.camera.x)) state.camera.x = 0;
        if (!Number.isFinite(state.camera.y)) state.camera.y = 0;
    };

    // --- Rendering ---

    const draw = (ctx: CanvasRenderingContext2D) => {
        const state = stateRef.current;
        const { width, height } = ctx.canvas;
        const human = getHumanPlayer();

        // Memoize images to avoid re-creating HTMLImageElements every frame
        if (!stateRef.current.imageCache) stateRef.current.imageCache = {};

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        try {
            ctx.translate(-state.camera.x, -state.camera.y);

            // Map Grid
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, MAP_SIZE.width, MAP_SIZE.height);
            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#1e293b';
            for (let x = 0; x <= MAP_SIZE.width; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP_SIZE.height); }
            for (let y = 0; y <= MAP_SIZE.height; y += 100) { ctx.moveTo(0, y); ctx.lineTo(MAP_SIZE.width, y); }
            ctx.stroke();

            // Obstacles (Sorted by priority for correct layering)
            [...state.obstacles].sort((a, b) => (a.priority || 0) - (b.priority || 0)).forEach(obs => {
                if (obs.type === 'WATER') {
                    // 1. Base Water Color
                    ctx.fillStyle = 'rgba(6, 182, 212, 0.45)';
                    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

                    // 2. Internal Shimmer/Sparkles
                    const time = Date.now() / 1000;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(obs.x, obs.y, obs.width, obs.height);
                    ctx.clip();

                    // A. Wave/Flow Undercurrent (Organic, staggered movement)
                    ctx.globalCompositeOperation = 'screen';

                    const waveSize = 450; // Vastly larger wave areas
                    const cols = Math.ceil(obs.width / waveSize) + 1;
                    const rows = Math.ceil(obs.height / waveSize) + 1;

                    for (let i = 0; i < 2; i++) {
                        const waveTime = time * (0.08 + i * 0.03); // Even slower for majestic feel
                        const driftX = Math.sin(waveTime * 0.45) * 45;
                        const driftY = Math.cos(waveTime * 0.35) * 45;
                        ctx.fillStyle = `rgba(165, 243, 252, ${0.05 - i * 0.02})`;

                        for (let c = -1; c <= cols; c++) {
                            for (let r = -1; r <= rows; r++) {
                                const sx = obs.x + c * waveSize;
                                const sy = obs.y + r * waveSize;
                                const cellSeed = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
                                const r1 = cellSeed - Math.floor(cellSeed);
                                const r2 = (cellSeed * 1.5) - Math.floor(cellSeed * 1.5);

                                // Skip 60% of ripples to ensure they are sparse and rare
                                if (r1 < 0.6) continue;

                                const wx = sx + r1 * waveSize * 0.8;
                                const wy = sy + r2 * waveSize * 0.8;

                                const wavePhase = (c * 0.9) + (r * 0.5) + (r2 * 12);
                                const wavePulse = Math.sin(waveTime + wavePhase) * 35;
                                const radius = (waveSize * 0.4) + (r1 * 60) + wavePulse;

                                ctx.beginPath();
                                ctx.arc(wx + driftX, wy + driftY, radius, 0, Math.PI * 2);
                                ctx.fill();
                            }
                        }
                    }

                    // B. Sparkles (Rarer, slower glints)
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.fillStyle = '#ffffff';

                    const sparkleDensity = 170; // Even sparser
                    for (let sx = obs.x; sx < obs.x + obs.width; sx += sparkleDensity) {
                        for (let sy = obs.y; sy < obs.y + obs.height; sy += sparkleDensity) {
                            const seed = Math.sin(sx * 12.9898 + sy * 78.233) * 43758.5453;
                            const rand1 = seed - Math.floor(seed);
                            const rand2 = (seed * 1.5) - Math.floor(seed * 1.5);

                            const blinkSpeed = 0.3 + rand1 * 0.4; // Very slow blinking
                            const phase = rand2 * Math.PI * 2;

                            const val = Math.sin(time * blinkSpeed + phase);
                            // Extremely tight threshold for very rare glints
                            if (val > 0.985) {
                                const alpha = (val - 0.985) / 0.015;
                                ctx.globalAlpha = alpha * 0.6;

                                const size = 1.0 + rand1 * 2.5;
                                const pX = sx + (rand2 * sparkleDensity);
                                const pY = sy + (rand1 * sparkleDensity);

                                ctx.beginPath();
                                ctx.arc(pX, pY, size, 0, Math.PI * 2);
                                ctx.fill();
                            }
                        }
                    }

                    ctx.restore();

                    // 3. Border
                    ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
                } else if (obs.type === 'LAVA') {
                    // Lava Rendering (Aligned with MAGMA_POOL)
                    // 1. Outer Base
                    ctx.fillStyle = 'rgba(127, 29, 29, 0.5)';
                    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

                    // 2. Inner Core (Mimics the inner circle of Magma Pool)
                    const inset = 25; // Balanced inset to show thicker "crust"
                    if (obs.width > inset * 2 && obs.height > inset * 2) {
                        ctx.fillStyle = 'rgba(185, 28, 28, 0.8)';
                        ctx.fillRect(obs.x + inset, obs.y + inset, obs.width - inset * 2, obs.height - inset * 2);
                    }

                    // 3. Organic Internal Flow (Multi-layered shifting patches)
                    const time = Date.now() / 1000;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(obs.x, obs.y, obs.width, obs.height);
                    ctx.clip();

                    // Use screen for a glowing "heat" effect
                    ctx.globalCompositeOperation = 'screen';

                    for (let i = 0; i < 3; i++) {
                        const layerTime = time * (0.3 + i * 0.2);
                        // Random-like drift
                        const driftX = Math.sin(layerTime * 0.5 + i) * 15;
                        const driftY = Math.cos(layerTime * 0.7 + i) * 15;

                        // Tuned: Even lower opacity for extreme subtlety
                        const hue = 10 + i * 15; // 10 (Red-Orange) to 40 (Orange)
                        ctx.fillStyle = `hsla(${hue}, 80%, 55%, ${0.02 + i * 0.01})`;

                        // Coverage grid for the flow patches
                        const step = 200;
                        for (let x = obs.x - step / 2; x < obs.x + obs.width + step / 2; x += step) {
                            for (let y = obs.y - step / 2; y < obs.y + obs.height + step / 2; y += step) {
                                const pulse = Math.sin(layerTime + (x * 0.01) + (y * 0.01)) * 30;
                                ctx.beginPath();
                                ctx.arc(x + driftX + pulse, y + driftY - pulse, step * 0.75, 0, Math.PI * 2);
                                ctx.fill();
                            }
                        }
                    }
                    ctx.restore();

                    // 3. Border
                    ctx.strokeStyle = 'rgba(185, 28, 28, 1.0)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
                } else {
                    ctx.fillStyle = TERRAIN_CONFIG.WALL_COLOR;
                    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
                    ctx.strokeStyle = TERRAIN_CONFIG.WALL_BORDER_COLOR;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
                }
            });

            // Ground Effects (High Priority Ground: above obstacles, below players/projectiles)
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

                    // [New] Detonation Flash
                    if (g.isPendingDetonation) {
                        const flashIntensity = Math.sin(Date.now() / 30) * 0.5 + 0.5;
                        ctx.fillStyle = `rgba(255, 255, 255, ${flashIntensity * 0.4})`;
                        ctx.beginPath();
                        ctx.arc(g.pos.x, g.pos.y, g.radius * 1.1, 0, Math.PI * 2);
                        ctx.fill();
                    }
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
                    ctx.moveTo(-l / 2, 0);
                    ctx.lineTo(-l / 4, -w / 3);
                    ctx.lineTo(0, 0);
                    ctx.lineTo(l / 4, w / 3);
                    ctx.lineTo(l / 2, 0);
                    ctx.lineTo(l / 4, -w / 4);
                    ctx.lineTo(0, -w / 6);
                    ctx.lineTo(-l / 4, w / 4);
                    ctx.closePath();
                    ctx.fill();

                    ctx.restore();
                }
            });

            // [High Priority Visuals 1] SCOOPER WARNING (Rendered AFTER obstacles, BEFORE players)
            state.groundEffects.forEach(g => {
                if (g.type === 'SCOOPER_WARNING') {
                    // 绘制预警阴影 (红色/危险感)
                    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'; // 淡淡的红
                    ctx.beginPath();
                    ctx.ellipse(g.pos.x, g.pos.y, g.radius, g.radius * 0.8, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // 绘制倒计时圈 (收缩)
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();

                    const ratio = Math.max(0, g.life / g.maxLife);
                    const currentRadius = g.radius * ratio;

                    if (currentRadius > 0) {
                        ctx.ellipse(g.pos.x, g.pos.y, currentRadius, currentRadius * 0.8, 0, 0, Math.PI * 2);
                        ctx.stroke();
                    }

                    // 绘制 "危" 字
                    ctx.fillStyle = '#ef4444';
                    ctx.font = 'bold 48px sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';
                    ctx.fillText('⚠', g.pos.x, g.pos.y);
                }
            });

            // [High Priority Visuals] Start Beacon (Rendered AFTER obstacles)
            state.groundEffects.forEach(g => {
                if (g.type === 'START_BEACON') {
                    // [Modified] Accelerate fade-out with power factor
                    const lifeRatio = Math.pow(Math.max(0, g.life / g.maxLife), 1.5);
                    const pulse = Math.sin(Date.now() / 150) * 0.1 + 0.9;

                    // [Modified] Dynamic Color based on Owner
                    const owner = state.players.find(p => p.id === g.ownerId);
                    const color = owner ? owner.color : '#22d3ee'; // Fallback Cyan

                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;

                    // Reduced Opacity (Fainter)
                    ctx.globalAlpha = 0.3 * lifeRatio;
                    ctx.beginPath();
                    ctx.arc(g.pos.x, g.pos.y, g.radius * pulse, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.05 * lifeRatio; // Very faint fill
                    ctx.fill();

                    // Inner Ring
                    ctx.beginPath();
                    ctx.strokeStyle = color; // Reuse main color for inner ring
                    ctx.lineWidth = 1; // Thinner
                    ctx.globalAlpha = 0.4 * lifeRatio;
                    ctx.arc(g.pos.x, g.pos.y, g.radius * pulse * 0.7, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.globalAlpha = 1.0;
                }
            });

            // Drones
            state.drones.forEach(d => {
                if (d.hp <= 0 || d.isDocked) return; // Don't draw if dead or docked

                ctx.save();
                ctx.translate(d.pos.x, d.pos.y);
                // Hover animation
                ctx.translate(0, Math.sin(Date.now() / 100) * 3);

                // 判定敌对显示红光：非自己所有，且其主人与自己非同队
                const owner = state.players.find(p => p.id === d.ownerId);
                const isEnemyDrone = d.ownerId !== human.id && (!owner || owner.teamId !== human.teamId);

                if (isEnemyDrone) {
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
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(armX, armY); ctx.stroke();
                    // Blade
                    ctx.beginPath();
                    ctx.ellipse(armX, armY, 6, 1, rAngle + rad, 0, Math.PI * 2);
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
                const alpha = Math.max(0, Math.min(1, p.life / (p.maxLife || 1)));
                ctx.globalAlpha = alpha;

                if (p.type === 'shard' && p.points) {
                    ctx.save();
                    ctx.translate(p.pos.x, p.pos.y);
                    ctx.rotate(p.angle || 0);

                    // Add a glint effect based on time/rotation
                    const glint = Math.sin(Date.now() / 100 + (parseInt(p.id) || 0)) > 0.8;
                    ctx.fillStyle = glint ? '#ffffff' : p.color;

                    ctx.beginPath();
                    ctx.moveTo(p.points[0].x, p.points[0].y);
                    for (let i = 1; i < p.points.length; i++) {
                        ctx.lineTo(p.points[i].x, p.points[i].y);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                } else {
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            ctx.globalAlpha = 1;

            // Projectiles
            state.projectiles.forEach(p => {
                if (p.projectileType === 'MAGIC_SPELL' || p.projectileType === 'EXPELLIARMUS') {
                    // 魔法球专用渲染 - 闪电/流星拖尾
                    const angle = Math.atan2(p.vel.y, p.vel.x);
                    const speed = Utils.mag(p.vel);
                    const trailLength = Math.min(100, speed * 6); // Slightly shorter trail

                    ctx.save();
                    ctx.translate(p.pos.x, p.pos.y);
                    ctx.rotate(angle);

                    // 1. Electric Trail (Dynamic Zig-Zag)
                    const steps = 10;
                    const startX = 2; // Start closer to center to avoid back-overflow
                    const stepSize = (trailLength + startX) / steps;

                    const gradient = ctx.createLinearGradient(startX, 0, -trailLength, 0);
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(0.2, p.color);
                    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

                    ctx.fillStyle = gradient;

                    ctx.beginPath();
                    ctx.moveTo(startX, 0);

                    // Top Edge (Jagged)
                    for (let i = 1; i <= steps; i++) {
                        const x = startX - i * stepSize;
                        // Thinner width: starts very thin, grows slightly towards middle, then tapers
                        const widthPct = i / steps;
                        const width = 0.8 + Math.sin(widthPct * Math.PI) * 1.5;
                        const jitter = (i < 2) ? 0 : (Math.random() - 0.5) * 4; // No jitter at very start
                        ctx.lineTo(x, -width + jitter);
                    }

                    // Bottom Edge (Jagged)
                    for (let i = steps; i >= 1; i--) {
                        const x = startX - i * stepSize;
                        const widthPct = i / steps;
                        const width = 0.8 + Math.sin(widthPct * Math.PI) * 1.5;
                        const jitter = (i < 2) ? 0 : (Math.random() - 0.5) * 4;
                        ctx.lineTo(x, width + jitter);
                    }

                    ctx.closePath();

                    ctx.shadowBlur = 8;
                    ctx.shadowColor = p.color;
                    ctx.fill();

                    // 2. Core Streak (Inner lightning bolt)
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(startX, 0);
                    for (let i = 1; i <= steps; i++) {
                        const x = startX - i * stepSize;
                        const jitter = (i < 2) ? 0 : (Math.random() - 0.5) * 3;
                        ctx.lineTo(x, jitter);
                    }
                    ctx.stroke();

                    // 3. Head (Glowing Orb)
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = p.color;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(0, 0, 4, 0, Math.PI * 2);
                    ctx.fill();

                    // 4. Side Sparks
                    if (Math.random() < 0.3) {
                        ctx.fillStyle = p.color;
                        ctx.globalAlpha = 0.6;
                        const sparkX = -Math.random() * trailLength * 0.7;
                        const sparkY = (Math.random() - 0.5) * 15;
                        const size = 1 + Math.random() * 1.5;
                        ctx.fillRect(sparkX, sparkY, size, size);
                        ctx.globalAlpha = 1.0;
                    }

                    ctx.restore();

                } else if (p.projectileType === 'DRONE_SHOT') {
                    // Drone Shot (Small laser)
                    const angle = Math.atan2(p.vel.y, p.vel.x);
                    ctx.save();
                    ctx.translate(p.pos.x, p.pos.y);
                    ctx.rotate(angle);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-10, -2, 20, 4); // Elongated
                    ctx.restore();
                } else {
                    // Standard Projectile (Circle)
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            // [修改核心] 遍历所有玩家进行绘制
            // 替换原有的 [state.player, state.enemy].forEach

            // 排序渲染顺序：飞扑的猫猫球和跳跃的猴子需要渲染在最上层
            const sortedPlayers = [...state.players].sort((a, b) => {
                // z-order: 0 = 地面, 1 = 空中
                const getZOrder = (p: PlayerState) => {
                    if (p.type === CharacterType.CAT && p.isPouncing) return 1;
                    if (p.type === CharacterType.WUKONG && p.wukongChargeState === 'SMASH') return 1;
                    return 0;
                };
                return getZOrder(a) - getZOrder(b);
            });

            sortedPlayers.forEach(p => {
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

                    // Exquisite Circular Indicator (Refined)
                    // 1. Faint Fill
                    ctx.fillStyle = 'rgba(250, 204, 21, 0.03)';
                    ctx.beginPath();
                    ctx.arc(0, 0, currentRange, 0, Math.PI * 2);
                    ctx.fill();

                    // 1.5. 风起云涌 & 电闪雷鸣 (Wind & Thunder Effects)
                    const time = Date.now() / 1000;

                    // Wind (Swirling Clouds)
                    for (let i = 0; i < 3; i++) {
                        ctx.save();
                        const dir = i % 2 === 0 ? 1 : -1;
                        const speed = 0.5 + i * 0.3;
                        ctx.rotate(time * speed * dir);

                        ctx.beginPath();
                        const radiusScale = 0.4 + i * 0.25;
                        // Draw random detached arcs
                        ctx.arc(0, 0, currentRange * radiusScale, 0, Math.PI * 1.2);
                        ctx.strokeStyle = `rgba(250, 204, 21, ${0.1 + i * 0.05})`;
                        ctx.lineWidth = 4 + i * 2;
                        ctx.lineCap = 'round';
                        ctx.stroke();
                        ctx.restore();
                    }

                    // Thunder (Random Sparks) - Refined for larger size and duration
                    const thunderSeed = Math.floor(Date.now() / 150); // Same seed for 150ms to keep it visible

                    // Simple inline seeded random function
                    const getSeeded = (s: number) => {
                        const x = Math.sin(s) * 10000;
                        return x - Math.floor(x);
                    };

                    // Use the seed combined with player id (or hash) for uniqueness
                    const playerSeed = p.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const thunderChance = getSeeded(thunderSeed + playerSeed) < 0.4;

                    if (thunderChance) {
                        const r1 = getSeeded(thunderSeed + playerSeed + 1);
                        const r2 = getSeeded(thunderSeed + playerSeed + 2);
                        const r3 = getSeeded(thunderSeed + playerSeed + 3);

                        const sparkAngle = r1 * Math.PI * 2;
                        const sparkDist = r2 * currentRange * 0.6;
                        const sx = Math.cos(sparkAngle) * sparkDist;
                        const sy = Math.sin(sparkAngle) * sparkDist;

                        ctx.save();
                        ctx.translate(sx, sy);
                        ctx.rotate(r3 * Math.PI * 2);

                        ctx.beginPath();
                        // Larger, more jagged path (increased to 30 units)
                        ctx.moveTo(-30, 0);
                        ctx.lineTo(-10, 15);
                        ctx.lineTo(0, -15);
                        ctx.lineTo(10, 15);
                        ctx.lineTo(30, 0);

                        ctx.strokeStyle = '#fff7ed'; // Sun-white
                        ctx.lineWidth = 4;
                        ctx.shadowColor = '#facc15';
                        ctx.shadowBlur = 20;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.stroke();

                        // Inner bright core
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#ffffff';
                        ctx.stroke();

                        ctx.restore();
                    }

                    // 2. Animated Border (Rotating Dashes or Pulsing)
                    ctx.rotate(time * 0.5); // Slow rotation

                    ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([15, 10]); // Longer dashes
                    ctx.beginPath();
                    ctx.arc(0, 0, currentRange, 0, Math.PI * 2);
                    ctx.stroke();

                    // 3. Inner Solid Ring (Clean edge)
                    ctx.setLineDash([]);
                    ctx.strokeStyle = 'rgba(250, 204, 21, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(0, 0, currentRange - 4, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.restore();
                }

                ctx.save();

                // === STEALTH VISUALS ===
                if (p.stealth) {
                    if (p.teamId === human.teamId) {
                        // Ally View: Ghostly Transparency
                        ctx.globalAlpha = 0.5;
                    } else {
                        // Enemy View: Glitch / Flicker
                        // Random visibility between 0 (invisible) and 0.4 (faint)
                        // Occasionally completely invisible for frames at a time
                        if (Math.random() < 0.3) {
                            ctx.globalAlpha = 0; // Completely invisible
                        } else {
                            ctx.globalAlpha = Math.random() * 0.4; // Faint flicker
                        }
                    }
                }

                ctx.translate(p.pos.x, p.pos.y);

                // [新增] 阵营高亮逻辑
                if (p.teamId !== human.teamId) {
                    ctx.shadowColor = '#ef4444'; // 敌对红色光晕
                    ctx.shadowBlur = 20;
                } else if (p.id !== human.id) {
                    ctx.shadowColor = '#3b82f6'; // 队友蓝色光晕
                    ctx.shadowBlur = 15;
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
                                color: 'rgba(245, 208, 254, 0.4)',
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

                // Fallback Colors if Image fails OR Override for Status
                // [Modified] Use unified status color system
                const statusInfo = getStatusInfo(p);

                if (statusInfo) {
                    ctx.fillStyle = statusInfo.color;
                } else {
                    ctx.fillStyle = p.color;
                }


                if (p.type === CharacterType.TANK) {
                    ctx.save();
                    ctx.rotate(p.aimAngle);
                    ctx.fillStyle = p.slowTimer > 0 ? '#475569' : (p.burnTimer > 0 ? '#ea580c' : ((p.charmTimer || 0) > 0 ? '#ec4899' : '#374151'));
                    ctx.fillRect(0, -8, p.radius + 20, 16);
                    ctx.restore();

                    if (p.tankMode === TankMode.LMG) {
                        ctx.save();
                        ctx.rotate(p.angle);
                        ctx.fillStyle = '#10b981';
                        ctx.shadowColor = '#34d399';
                        ctx.shadowBlur = 15;
                        ctx.beginPath();
                        ctx.arc(-p.radius + 5, -12, 6, 0, Math.PI * 2);
                        ctx.arc(-p.radius + 5, 12, 6, 0, Math.PI * 2);
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
                        ctx.translate(0, -liftPct * 30);

                        // Shake when holding max charge
                        if (p.wukongChargeHoldTimer > 0) {
                            ctx.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
                        }
                    }

                    // Draw Active Attack Visuals MOVED to post-render loop for layering correction


                    const animTime = performance.now() - p.wukongLastAttackTime;
                    const animDuration = 250;

                    // Draw Idle/Charge Staff (Jingu Bang)
                    if (animTime >= animDuration) {
                        ctx.rotate(p.aimAngle);
                        let staffOffset = 15;

                        // Staff charging animation
                        if (p.wukongChargeState === 'THRUST') {
                            const charge = Math.min(1, p.wukongChargeTime / p.wukongMaxCharge);
                            staffOffset -= charge * 10; // Pull back
                            if (charge > 0.8) staffOffset += (Math.random() - 0.5) * 5;
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
                    // [Modified] Status Color Support
                    const statusInfo = getStatusInfo(p);
                    const baseColor = statusInfo ? statusInfo.color : '#f5d0fe'; // fuchsia-200 or status
                    const spotColor = statusInfo ? Utils.adjustColor(statusInfo.color, -30) : '#a855f7'; // darker version for spots

                    // Draw Body
                    ctx.rotate(p.angle);
                    ctx.fillStyle = baseColor;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw Calico Spots
                    ctx.fillStyle = spotColor;
                    ctx.beginPath();
                    ctx.arc(-8, -10, 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#1f2937'; // gray-800 eyes always dark
                    ctx.beginPath();
                    ctx.arc(8, 12, 6, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw Tail (Wagging)
                    const tailWag = Math.sin(Date.now() / 200) * 0.5;
                    ctx.strokeStyle = baseColor;
                    ctx.lineWidth = 8;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(-p.radius, 0);
                    ctx.quadraticCurveTo(-p.radius - 20, 0, -p.radius - 25, tailWag * 20);
                    ctx.stroke();

                    // Rotate to Aim Direction for Ears & Face
                    ctx.rotate(-p.angle); // Reset body rotation
                    ctx.rotate(p.aimAngle); // Rotate to aim

                    // Ears - Match base color
                    ctx.fillStyle = baseColor;
                    ctx.beginPath(); ctx.moveTo(5, -p.radius + 5); ctx.lineTo(15, -p.radius - 10); ctx.lineTo(25, -p.radius + 10); ctx.fill(); // Right Ear
                    ctx.beginPath(); ctx.moveTo(5, p.radius - 5); ctx.lineTo(15, p.radius + 10); ctx.lineTo(25, p.radius - 10); ctx.fill(); // Left Ear

                    // Inner Ears (Pink usually, but maybe match status logic?)
                    // Let's keep them pinkish unless status is very dark?
                    // Actually if frozen/stone, inner ear should probably change too.
                    // Let's use a lighter version of baseColor for inner ears if status is present.
                    ctx.fillStyle = statusInfo ? Utils.adjustColor(statusInfo.color, 40) : '#f9a8d4';
                    ctx.beginPath(); ctx.moveTo(8, -p.radius + 6); ctx.lineTo(15, -p.radius - 6); ctx.lineTo(22, -p.radius + 9); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(8, p.radius - 6); ctx.lineTo(15, p.radius + 6); ctx.lineTo(22, p.radius - 9); ctx.fill();

                    // Whiskers
                    ctx.strokeStyle = '#4b5563';
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(p.radius, -5); ctx.lineTo(p.radius + 15, -10); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(p.radius, 5); ctx.lineTo(p.radius + 15, 10); ctx.stroke();

                    ctx.restore();
                    // Skip default ball render for cat
                    return;
                } else if (p.type === CharacterType.MAGIC) {
                    // --- RENDER MAGIC BALL & WAND ---

                    const statusInfo = getStatusInfo(p);
                    if (statusInfo) ctx.fillStyle = statusInfo.color;
                    else ctx.fillStyle = p.color;

                    ctx.beginPath();
                    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                    ctx.fill();

                    // 2. Draw Gloss
                    ctx.fillStyle = 'rgba(255,255,255,0.2)';
                    ctx.beginPath();
                    ctx.arc(-p.radius / 3, -p.radius / 3, p.radius / 3, 0, Math.PI * 2);
                    ctx.fill();

                    // 3. Draw Wand
                    ctx.save();
                    const swayOffset = Math.sin(Date.now() / 800) * 0.15;
                    ctx.rotate(p.aimAngle + swayOffset);

                    const wandLen = 32;
                    ctx.strokeStyle = '#4b3621';
                    ctx.lineWidth = 4;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';

                    ctx.beginPath();
                    const startX = p.radius - 5;
                    ctx.moveTo(startX, 0);
                    ctx.lineTo(startX + wandLen * 0.3, -3);
                    ctx.lineTo(startX + wandLen * 0.7, 2);
                    ctx.lineTo(startX + wandLen, -1);
                    ctx.stroke();

                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(startX + wandLen * 0.4, -2);
                    ctx.lineTo(startX + wandLen * 0.5, -6);
                    ctx.stroke();

                    ctx.fillStyle = p.magicForm === 'WHITE' ? '#fef08a' : '#22c55e';
                    ctx.shadowColor = ctx.fillStyle;
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(startX + wandLen, -1, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    ctx.restore();

                    // --- RENDER ARMOR SHIELD (ENHANCED) ---
                    if ((p.magicShieldHp || 0) > 0) {
                        const maxShield = CHAR_STATS[CharacterType.MAGIC].armorShieldHp;
                        const ratio = p.magicShieldHp! / maxShield;
                        const themeColor = p.magicForm === 'WHITE' ? '#fef08a' : '#22c55e';
                        const shieldR = p.radius + 30;
                        const time = Date.now() / 1000;

                        ctx.save();

                        // [New] Impact Shudder (Shake)
                        if (p.magicShieldShakeTimer && p.magicShieldShakeTimer > 0) {
                            const intensity = 4;
                            const sx = (Math.random() - 0.5) * intensity;
                            const sy = (Math.random() - 0.5) * intensity;
                            ctx.translate(sx, sy);
                        }

                        // 1. Outer Glow
                        ctx.shadowColor = themeColor;
                        ctx.shadowBlur = 15 + Math.sin(time * 4) * 5; // Pulsing glow

                        // 2. Shield Body with Radial Gradient
                        const grad = ctx.createRadialGradient(0, 0, p.radius * 0.5, 0, 0, shieldR);
                        grad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
                        grad.addColorStop(0.7, themeColor + '66'); // ~40% opacity
                        grad.addColorStop(1, themeColor + '88'); // ~53% opacity

                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.arc(0, 0, shieldR, 0, Math.PI * 2);
                        ctx.fill();

                        // 3. SOAP BUBBLE LIQUID FLOW (虹彩流光)
                        ctx.shadowBlur = 0;
                        ctx.save();
                        // Use screen composite for additive light effect
                        ctx.globalCompositeOperation = 'screen';

                        for (let i = 0; i < 4; i++) {
                            ctx.save();
                            // Phase-shifted organic movement
                            const layerTime = time * (0.8 + i * 0.4);
                            const driftX = Math.sin(layerTime * 0.7 + i) * 10;
                            const driftY = Math.cos(layerTime * 1.1 + i) * 10;
                            ctx.translate(driftX, driftY);
                            ctx.rotate(layerTime * 0.3 + i);

                            // Cycle through HSL colors for iridescence
                            const hue = (time * 40 + i * 60) % 360;
                            const color = `hsla(${hue}, 80%, 70%, 0.15)`;
                            ctx.fillStyle = color;

                            // Organic liquid patches
                            ctx.beginPath();
                            const patchR = shieldR * (0.6 + Math.sin(layerTime + i) * 0.2);
                            ctx.arc(shieldR * 0.2, 0, patchR, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.restore();
                        }

                        // 4. SURFACE SHIMMER & HIGHLIGHTS (表面反光)
                        for (let i = 0; i < 2; i++) {
                            ctx.save();
                            const reflectTime = time * (1.2 + i);
                            ctx.rotate(reflectTime * 0.5 + i * Math.PI);

                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                            ctx.lineWidth = 4 - i * 2;
                            ctx.lineCap = 'round';

                            ctx.beginPath();
                            // Moving reflection arcs
                            ctx.arc(0, 0, shieldR * 0.85, 0, Math.PI * 0.2);
                            ctx.stroke();

                            ctx.restore();
                        }
                        ctx.restore(); // End screen composite

                        // 5. White Rim & Edge highlight
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.arc(0, 0, shieldR, 0, Math.PI * 2);
                        ctx.stroke();

                        // 6. Progressive Crystalline Cracks (Deterministic & Static)
                        ctx.globalAlpha = 0.9;
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                        ctx.lineWidth = 1;
                        ctx.lineJoin = 'bevel';

                        const crackLimit = shieldR - 5;

                        // Deterministic pseudo-random helper (Based on Player ID/Seed)
                        const getSeedRandom = (idx: number) => {
                            const val = Math.sin(idx * 12.9898 + (p.id.length * 78.233)) * 43758.5453;
                            return val - Math.floor(val);
                        };

                        const drawStaticCrack = (baseIdx: number, x: number, y: number, size: number) => {
                            ctx.beginPath();
                            ctx.moveTo(x, y);
                            let curX = x;
                            let curY = y;
                            // [Refine] Fewer segments but larger step size for better "jaggedness"
                            for (let i = 0; i < 4; i++) {
                                const rx = getSeedRandom(baseIdx + i * 1.5) - 0.5;
                                const ry = getSeedRandom(baseIdx + i * 2.7) - 0.5;
                                curX += rx * size * 0.8;
                                curY += ry * size * 0.8;
                                ctx.lineTo(curX, curY);
                            }
                            ctx.stroke();
                        };

                        if (ratio <= 0.8) {
                            drawStaticCrack(101, crackLimit * 0.7, -crackLimit * 0.4, 30);
                            drawStaticCrack(202, -crackLimit * 0.5, crackLimit * 0.6, 25);
                        }
                        if (ratio <= 0.6) {
                            drawStaticCrack(303, crackLimit * 0.2, crackLimit * 0.8, 40);
                            drawStaticCrack(404, -crackLimit * 0.8, -crackLimit * 0.2, 35);
                        }
                        if (ratio <= 0.4) {
                            drawStaticCrack(505, 0, crackLimit * 0.9, 45);
                            drawStaticCrack(606, crackLimit * 0.6, 0.4, 40);
                            drawStaticCrack(707, -crackLimit * 0.4, -crackLimit * 0.7, 35);
                        }
                        if (ratio <= 0.2) {
                            for (let i = 0; i < 3; i++) {
                                const seed = 800 + i * 111;
                                const rx = (getSeedRandom(seed) - 0.5) * crackLimit;
                                const ry = (getSeedRandom(seed + 5) - 0.5) * crackLimit;
                                drawStaticCrack(seed + 10, rx, ry, 50);
                            }
                            // Structural beam link
                            ctx.beginPath();
                            ctx.moveTo(-crackLimit * 0.4, -crackLimit * 0.4);
                            ctx.lineTo(crackLimit * 0.3, crackLimit * 0.3);
                            ctx.stroke();
                        }

                        ctx.restore();
                    }

                    ctx.restore();

                    if (p.invincibleTimer && p.invincibleTimer > 0) ctx.globalAlpha = 1;
                    return;
                }

                // DEFAULT BALL RENDER (For Pyro, Tank, Wukong body)
                ctx.save(); // [Isolation] Rotate only body features
                ctx.rotate(p.angle);

                if (statusInfo) {
                    ctx.fillStyle = statusInfo.color;
                } else if (p.type === CharacterType.COACH) {
                    // Rainbow Effect for Coach Ball
                    const time = Date.now() / 15; // Speed of color cycle
                    const hue = time % 360;
                    ctx.fillStyle = `hsl(${hue}, 90%, 70%)`;

                    // Add a magical glow
                    ctx.shadowColor = `hsl(${hue}, 90%, 70%)`;
                    ctx.shadowBlur = 20;
                } else {
                    ctx.fillStyle = p.color;
                }

                ctx.beginPath();
                ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                ctx.fill();

                // Wukong Headband (only if not image)
                if (p.type === CharacterType.WUKONG) {
                    // [Modified] Headband color should also reflect status
                    if (statusInfo) {
                        // Use a slightly lighter/different shade of the status color for the ring
                        ctx.strokeStyle = statusInfo.color;
                        ctx.globalAlpha = 0.8; // Make it blend slightly
                    } else {
                        ctx.strokeStyle = '#facc15';
                        ctx.globalAlpha = 1.0;
                    }

                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.radius - 2, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.globalAlpha = 1.0; // Reset alpha
                }
                ctx.restore(); // [End Isolation] Back to non-rotated (but translated)

                // Gloss (Highlight) - Rendered in fixed orientation (Top-Left Light Source)
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.beginPath();
                ctx.arc(-p.radius / 3, -p.radius / 3, p.radius / 3, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
                if (p.invincibleTimer && p.invincibleTimer > 0) ctx.globalAlpha = 1;

                // Status Overlays
                if (p.type === CharacterType.PYRO && p.skillCooldown <= 0) {
                    const time = Date.now() / 200;
                    const orbitR = p.radius + 15;
                    for (let i = 5; i >= 1; i--) {
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
                        ctx.arc(0, 0, 5 * scale, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    }
                    const ox = Math.cos(time) * orbitR;
                    const oy = Math.sin(time) * orbitR;
                    ctx.save();
                    ctx.translate(p.pos.x + ox, p.pos.y + oy);
                    ctx.fillStyle = '#f97316';
                    ctx.beginPath();
                    ctx.arc(0, 0, 6, 0, Math.PI * 2);
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
                const alpha = Math.max(0, t.life / t.maxLife);
                if (alpha < 0.01) return;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = t.color;
                ctx.shadowBlur = 0;
                ctx.font = 'bold 16px sans-serif';
                ctx.fillText(t.text, t.pos.x - 20, t.pos.y);
                ctx.restore();
            });

            // [High Priority Render Layer] Wukong Attacks (Big Cudgel)
            // Rendered AFTER all players to ensure it appears on top of other balls and terrain
            state.players.forEach(p => {
                if (p.type !== CharacterType.WUKONG || p.isDead) return;

                const animTime = performance.now() - p.wukongLastAttackTime;
                const animDuration = 250;

                if (animTime < animDuration && p.wukongLastAttackType !== 'NONE') {
                    ctx.save();
                    ctx.translate(p.pos.x, p.pos.y);

                    // Re-apply Z-axis lift visual if in Smash Charge
                    if (p.wukongChargeState === 'SMASH') {
                        const liftPct = p.wukongChargeTime / p.wukongMaxCharge;
                        const scale = 1 + liftPct * 0.5;
                        ctx.scale(scale, scale);
                        ctx.translate(0, -liftPct * 30);
                        if (p.wukongChargeHoldTimer > 0) {
                            ctx.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
                        }
                    }

                    ctx.rotate(p.aimAngle);
                    const progress = animTime / animDuration;

                    if (p.wukongLastAttackType === 'COMBO_1' || p.wukongLastAttackType === 'COMBO_2') {
                        // Dynamic Swing Animation
                        const swingArc = Math.PI / 1.5; // 120 degrees
                        // Combo 1: -60 to +60. Combo 2: +60 to -60.
                        const startAngle = p.wukongLastAttackType === 'COMBO_1' ? -swingArc / 2 : swingArc / 2;
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
                        ctx.fillStyle = `rgba(254, 240, 138, ${0.5 * (1 - progress)})`;
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
                            ctx.fillRect(0, -width / 2, range, width);
                            ctx.restore();
                        }

                        // 2. Impact Flash (White Highlight) at the start
                        if (smashProg < 0.2) {
                            ctx.save();
                            ctx.shadowBlur = 30;
                            ctx.shadowColor = 'white';
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(10, -width / 4, range, width / 2);
                            ctx.restore();
                        } else {
                            // 3. Main Staff (Extended)
                            const stickWidth = 20;

                            ctx.shadowColor = '#fef08a';
                            ctx.shadowBlur = 20;

                            // Main Body - Aligned to 0 to match hitbox
                            ctx.fillStyle = '#b45309'; // Darker gold/bronze
                            ctx.fillRect(0, -stickWidth / 2, range, stickWidth);

                            // Tip (Gold Cap)
                            ctx.fillStyle = '#fef08a';
                            ctx.fillRect(range, -(stickWidth / 2 + 4), 30, stickWidth + 8);

                            // 4. [New] Circular Shockwave Visual
                            const waveAlpha = 1 - smashProg;
                            ctx.save();
                            ctx.rotate(-p.aimAngle); // Draw shockwave relative to player orientation
                            ctx.strokeStyle = `rgba(254, 240, 138, ${waveAlpha * 0.5})`;
                            ctx.lineWidth = 4;
                            ctx.beginPath();
                            ctx.arc(0, 0, range * smashProg, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.restore();
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
                            ctx.fillRect(0, -width / 2, range, width);
                            ctx.restore();
                        }

                        // 2. Staff Animation (Slamming down visual)
                        const stickWidth = 14;
                        ctx.fillStyle = '#a16207';
                        ctx.fillRect(10, -stickWidth / 2, range, stickWidth);
                        ctx.fillStyle = '#facc15';
                        ctx.fillRect(range, -(stickWidth / 2 + 2), 20, stickWidth + 4);

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

                    ctx.restore();
                }
            });


            // [High Priority Render Layer 2] Cat Scooper Smash (Giant Shovel)
            // Rendered AFTER Wukong's staff to ensure it's also on top of everything
            state.groundEffects.forEach(g => {
                if (g.type === 'SCOOPER_SMASH') {
                    // Shadow
                    const alpha = g.life / g.maxLife;
                    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.5})`;
                    ctx.beginPath();
                    ctx.ellipse(g.pos.x, g.pos.y, g.radius, g.radius * 0.8, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Giant Scooper
                    ctx.save();
                    ctx.translate(g.pos.x, g.pos.y - 100 * alpha); // Fall down effect
                    ctx.rotate(Math.PI / 4);
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

            // Draw Aim Guides (仅人类玩家显示)
            const p = getHumanPlayer();
            if (!p.isDead) {
                if (p.type === CharacterType.PYRO) {
                    const range = p.currentWeaponRange || CHAR_STATS[CharacterType.PYRO].flamethrowerRange;
                    const angle = p.currentWeaponAngle || CHAR_STATS[CharacterType.PYRO].flamethrowerAngle;

                    ctx.save();
                    ctx.translate(p.pos.x, p.pos.y);
                    ctx.rotate(p.aimAngle);

                    if (p.isBurnedOut) {
                        // Grey indicator for burnout
                        ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
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
                        ctx.moveTo(0, 0);
                        ctx.arc(0, 0, range, -angle, angle);
                        ctx.fill();
                    }
                    ctx.restore();
                } else if (p.type === CharacterType.TANK && p.tankMode === TankMode.ARTILLERY) {
                    // [修复] 受控状态下不显示
                    if (!isControlled(p)) {
                        const aimX = mouseRef.current.x + state.camera.x;
                        const aimY = mouseRef.current.y + state.camera.y;
                        const dist = Utils.dist(p.pos, { x: aimX, y: aimY });
                        const minRange = CHAR_STATS[CharacterType.TANK].artilleryMinRange;
                        const isValid = dist > minRange;

                        ctx.strokeStyle = isValid ? '#10b981' : '#ef4444';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([8, 6]);
                        ctx.beginPath();
                        ctx.arc(aimX, aimY, CHAR_STATS[CharacterType.TANK].artilleryRadius, 0, Math.PI * 2);
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
                        // Calculate Range (Same logic as above for consistency)
                        const chargePct = Math.min(1, p.wukongChargeTime / p.wukongMaxCharge);
                        const stats = CHAR_STATS[CharacterType.WUKONG];
                        const currentRange = stats.smashMinRange + (stats.smashMaxRange - stats.smashMinRange) * chargePct;

                        const aimX = mouseRef.current.x + state.camera.x;
                        const aimY = mouseRef.current.y + state.camera.y;

                        // Calculate direction and fixed distance (Radius of circle)
                        const dx = aimX - p.pos.x;
                        const dy = aimY - p.pos.y;
                        const angle = Math.atan2(dy, dx);

                        // Length is ALWAYS currentRange (fixed to circle radius)
                        const endX = p.pos.x + Math.cos(angle) * currentRange;
                        const endY = p.pos.y + Math.sin(angle) * currentRange;

                        // [修复] 受控状态下不显示指向线（避免直连鼠标）
                        if (!isControlled(p)) {
                            // Draw Exquisite Line Indicator
                            ctx.save();

                            // Glow Effect
                            ctx.shadowColor = '#facc15'; // Yellow-400
                            ctx.shadowBlur = 10;

                            // Main Line
                            ctx.beginPath();
                            ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
                            ctx.lineWidth = 3;
                            ctx.moveTo(p.pos.x, p.pos.y);
                            ctx.lineTo(endX, endY);
                            ctx.stroke();

                            // Endpoint Indicator (Circle/Dot at the limit)
                            ctx.fillStyle = '#fef08a'; // Yellow-200
                            ctx.beginPath();
                            ctx.arc(endX, endY, 5, 0, Math.PI * 2);
                            ctx.fill();

                            ctx.restore();
                            ctx.setLineDash([]);
                        }
                    }
                } else if (p.type === CharacterType.CAT) {
                    // Cat Aim Guide (Arrow)
                    ctx.save();
                    ctx.translate(p.pos.x, p.pos.y);
                    ctx.rotate(p.aimAngle);

                    const currentChargeTime = p.catIsCharging ? (performance.now() - (p.catChargeStartTime || 0)) / 1000 : 0;

                    // Pounce Arrow (Enhanced)
                    if (p.catIsCharging && currentChargeTime > CHAR_STATS[CharacterType.CAT].pounceChargeThreshold) {
                        const rawPct = Math.min(1, currentChargeTime / CHAR_STATS[CharacterType.CAT].pounceMaxCharge);
                        // Ease-out curve: 快速增长后平滑到达最大值
                        const chargePct = 1 - Math.pow(1 - rawPct, 2.5);

                        const baseLen = 100;
                        const addLen = 220;
                        const length = baseLen + addLen * chargePct;

                        // 箭头宽度 (随蓄力变粗)
                        const lineWidth = 4 + chargePct * 5;

                        // 脉冲辉光 (Pulsing Glow)
                        const pulsePhase = (performance.now() / 150) % (Math.PI * 2);
                        const pulseIntensity = 0.5 + 0.5 * Math.sin(pulsePhase);
                        ctx.shadowColor = `rgba(251, 191, 36, ${0.6 * pulseIntensity})`;
                        ctx.shadowBlur = 10 + 8 * pulseIntensity;

                        // 渐变色 (Gradient: 尾部淡 -> 头部亮)
                        const gradient = ctx.createLinearGradient(0, 0, length, 0);
                        gradient.addColorStop(0, `rgba(254, 243, 199, ${0.3 + chargePct * 0.3})`); // 淡黄
                        gradient.addColorStop(0.6, `rgba(251, 191, 36, ${0.6 + chargePct * 0.4})`); // 金黄
                        gradient.addColorStop(1, `rgba(245, 158, 11, ${0.8 + chargePct * 0.2})`); // 橙黄 (头部)

                        // 主线
                        ctx.strokeStyle = gradient;
                        ctx.lineWidth = lineWidth;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(p.radius * 0.5, 0); // 从球体边缘开始
                        ctx.lineTo(length, 0);
                        ctx.stroke();

                        // 箭头头部 (Arrowhead)
                        const arrowSize = 12 + chargePct * 8;
                        ctx.fillStyle = `rgba(245, 158, 11, ${0.8 + chargePct * 0.2})`;
                        ctx.beginPath();
                        ctx.moveTo(length + arrowSize, 0);
                        ctx.lineTo(length - arrowSize * 0.4, -arrowSize * 0.6);
                        ctx.lineTo(length - arrowSize * 0.4, arrowSize * 0.6);
                        ctx.closePath();
                        ctx.fill();

                        // 清除阴影以免影响后续渲染
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                    } else {
                        // Scratch Cone
                        const range = CHAR_STATS[CharacterType.CAT].scratchRange;
                        ctx.fillStyle = 'rgba(217, 70, 239, 0.2)';
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.arc(0, 0, range, -0.8, 0.8);
                        ctx.fill();
                    }
                    ctx.restore();
                }
            }
        } finally {
            ctx.restore();
        }

        // Health Bars (遍历所有玩家)
        state.players.forEach(p => {
            if (p.isDead) return;

            const barW = 60;
            const barH = 6;
            const barX = Math.round(p.pos.x - state.camera.x - barW / 2);
            const barY = Math.round(p.pos.y - state.camera.y - p.radius - 15);

            ctx.fillStyle = 'red';
            ctx.fillRect(barX, barY, barW, barH);

            const hpPct = p.hp / p.maxHp;
            if (hpPct > 0) {
                // 根据队伍 ID 决定颜色
                if (p.id === human.id) {
                    ctx.fillStyle = '#10b981'; // 绿色 (自己)
                } else if (p.teamId === human.teamId) {
                    ctx.fillStyle = '#3b82f6'; // 蓝色 (队友)
                } else {
                    ctx.fillStyle = '#f59e0b'; // 黄/红色 (敌人)
                }
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



    useEffect(() => {
        Sound.init();

        // 使用同一函数引用，确保 HMR 时能正确清理
        const preventContextMenu = (e: Event) => e.preventDefault();

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('contextmenu', preventContextMenu);

        if (canvasRef.current) {
            canvasRef.current.width = window.innerWidth;
            canvasRef.current.height = window.innerHeight;
        }

        let isRunning = true;

        const gameLoop = (time: number) => {
            let lastTime = time;
            const loop = (now: number) => {
                if (!isRunning) return; // Fix for HMR ghost loops

                const dt = Math.min((now - lastTime) / 1000, 0.1);
                lastTime = now;

                update(dt);

                const st = stateRef.current;
                // [修改] 获取本地玩家对象 (替换 st.player)
                const human = getHumanPlayer();

                // [FIX] 即使 human 为 null 也必须继续游戏循环
                if (!human) {
                    // 仍然绘制画面和继续循环
                    if (canvasRef.current) {
                        const ctx = canvasRef.current.getContext('2d');
                        if (ctx) draw(ctx);
                    }
                    if (st.gameStatus === 'PLAYING') {
                        requestRef.current = requestAnimationFrame(loop);
                    }
                    return;
                }

                // [Spectator Logic Fix] Determine which player's stats to show
                let uiTarget = human;
                let isSpectating = false;

                // [Modification] Only switch UI to spectator if we are in multiplayer mode (customConfig)
                if (human.isDead && customConfig) {
                    const spectatorId = spectatorTargetIdRef.current;
                    const target = st.players.find(p => p.id === spectatorId);
                    if (target) {
                        uiTarget = target;
                        isSpectating = true;
                    }
                }

                // 1. 更新玩家血条
                if (playerHpBarRef.current && playerHpTextRef.current) {
                    const hpPct = (uiTarget.hp / uiTarget.maxHp) * 100;
                    playerHpBarRef.current.style.width = `${Math.max(0, hpPct)}%`;
                    playerHpTextRef.current.textContent = `${uiTarget.hp.toFixed(0)} HP`;
                }

                // 2. 更新燃料条 (Pyro)
                if (heatBarRef.current && heatTextRef.current && uiTarget.type === CharacterType.PYRO) {
                    const fuelPct = (uiTarget.fuel / uiTarget.maxFuel) * 100;
                    heatBarRef.current.style.width = `${Math.min(100, Math.max(0, fuelPct))}%`;
                    heatTextRef.current.textContent = `${uiTarget.fuel.toFixed(0)}%`;
                }

                // 3. [修改] 更新敌人血条 (动态显示最近的敌人) - Relative to uiTarget
                const nearestEnemy = getNearestEnemy(uiTarget);
                let displayEnemy = nearestEnemy;

                // [Fix] If no active enemy found (or game over), use last known enemy
                if (!displayEnemy) {
                    displayEnemy = lastEnemyRef.current;
                } else {
                    // Update cache if we have a valid enemy
                    lastEnemyRef.current = nearestEnemy;
                }

                if (enemyHpBarRef.current && enemyHpTextRef.current) {
                    if (displayEnemy) {
                        // 有敌人(或缓存敌人)时显示
                        if (enemyHpBarRef.current.parentElement) enemyHpBarRef.current.parentElement.style.opacity = '1';

                        const ehpPct = (displayEnemy.hp / displayEnemy.maxHp) * 100;
                        enemyHpBarRef.current.style.width = `${Math.max(0, ehpPct)}%`;

                        // 显示敌人血量，不显示距离
                        enemyHpTextRef.current.textContent = `${Math.round(displayEnemy.hp)} / ${Math.round(displayEnemy.maxHp)}`;
                    } else {
                        // 无敌人且无缓存时隐藏 (Start of game)
                        if (enemyHpBarRef.current.parentElement) enemyHpBarRef.current.parentElement.style.opacity = '0';
                    }
                }

                // 4. 雷达 (Tank) - 指向最近敌人
                // 4. 雷达 (Tank) - 显示所有敌人
                if (radarCanvasRef.current && uiTarget.type === CharacterType.TANK) {
                    const ctx = radarCanvasRef.current.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, 48, 48);
                        const cx = 24;
                        const cy = 24;
                        const maxRadarRange = 2500; // 雷达最大显示范围
                        const radarRadius = 20;

                        st.players.forEach(p => {
                            // 排除没血的、自己
                            if (p.isDead || p.id === uiTarget.id) return;

                            const dx = p.pos.x - uiTarget.pos.x;
                            const dy = p.pos.y - uiTarget.pos.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            const angle = Math.atan2(dy, dx);

                            // 计算雷达上的距离 (线性映射)
                            let r = (dist / maxRadarRange) * radarRadius;
                            // 限制在雷达边缘
                            if (r > radarRadius) r = radarRadius;
                            // 最小显示距离 (避免重叠在中心)
                            if (r < 5) r = 5;

                            const dotX = cx + Math.cos(angle) * r;
                            const dotY = cy + Math.sin(angle) * r;

                            ctx.beginPath();
                            ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);

                            // Color Logic
                            if (p.teamId === uiTarget.teamId) {
                                ctx.fillStyle = '#3b82f6'; // Friendly: Blue
                            } else {
                                ctx.fillStyle = '#ef4444'; // Enemy: Red
                            }
                            ctx.fill();
                        });

                        // 绘制所有召唤物 (包括无人机)
                        // 目前只有 drones 数组存放这类实体，但在未来可能会有更多。
                        // 我们遍历 drones 并检查属性 (虽然在此上下文中 drones 肯定都是 summons)
                        const allSummons = [...st.drones];

                        allSummons.forEach(s => {
                            if (s.hp <= 0 || (s as any).isDocked) return;

                            // Check explicit isSummon flag if available, or implied by being in drones list
                            // But user specifically asked to check isSummon usage.
                            // However, 's' is explicitly typed as Drone in forEach if we iterate st.drones.
                            // Let's assume 's' has ownerId.

                            const owner = st.players.find(p => p.id === s.ownerId);
                            if (!owner) return;

                            const dx = s.pos.x - uiTarget.pos.x;
                            const dy = s.pos.y - uiTarget.pos.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            const angle = Math.atan2(dy, dx);

                            let r = (dist / maxRadarRange) * radarRadius;
                            if (r > radarRadius) r = radarRadius;
                            if (r < 5) r = 5;

                            const dotX = cx + Math.cos(angle) * r;
                            const dotY = cy + Math.sin(angle) * r;

                            ctx.beginPath();
                            ctx.arc(dotX, dotY, 1.5, 0, Math.PI * 2);

                            // Summon Color Logic
                            if (owner.teamId === uiTarget.teamId) {
                                ctx.fillStyle = '#93c5fd'; // Friendly Summon: Light Blue
                            } else {
                                ctx.fillStyle = '#f97316'; // Enemy Summon: Orange
                            }
                            ctx.fill();
                        });
                    }
                }

                // 5. 技能冷却遮罩
                if (skillCdOverlayRef.current) {
                    if (uiTarget.skillCooldown > 0) {
                        const pct = (uiTarget.skillCooldown / uiTarget.skillMaxCooldown) * 100;
                        skillCdOverlayRef.current.style.height = `${pct}%`;
                        skillCdOverlayRef.current.style.opacity = '1';
                    } else {
                        skillCdOverlayRef.current.style.height = '0%';
                        skillCdOverlayRef.current.style.opacity = '0';
                    }
                }

                // 6. 查找活跃无人机
                let activeDroneStats = null;
                if (uiTarget.droneState === 'DEPLOYED' && uiTarget.activeDroneId) {
                    const d = st.drones.find(drone => drone.id === uiTarget.activeDroneId && !drone.isDocked && drone.hp > 0);
                    if (d) {
                        activeDroneStats = { hp: d.hp, maxHp: d.maxHp, life: d.life, maxLife: d.maxLife };
                    }
                }

                // 7. 更新 UI State (使用 uiTarget 对象)
                setUiState({
                    pArtAmmo: uiTarget.artilleryAmmo, pMaxArtAmmo: uiTarget.maxArtilleryAmmo,
                    pLmgAmmo: uiTarget.lmgAmmo, pMaxLmgAmmo: uiTarget.maxLmgAmmo,
                    pIsReloadingLmg: uiTarget.isReloadingLmg,
                    pDroneState: uiTarget.droneState,
                    pDroneTimer: uiTarget.droneTimer, pDroneMaxTimer: uiTarget.droneMaxTimer,
                    pActiveDroneStats: activeDroneStats,
                    pTankMode: uiTarget.tankMode,
                    pType: uiTarget.type,
                    pUiThemeColor: uiTarget.uiThemeColor,
                    pSkillCD: uiTarget.skillCooldown, pSkillMaxCD: uiTarget.skillMaxCooldown,
                    pSecondarySkillCD: uiTarget.secondarySkillCooldown,
                    pSecondarySkillMaxCD: uiTarget.secondarySkillMaxCooldown,
                    pIsBurnedOut: uiTarget.isBurnedOut,
                    pWukongCharge: uiTarget.wukongChargeTime, pWukongMaxCharge: uiTarget.wukongMaxCharge,
                    pWukongThrustTimer: uiTarget.wukongThrustTimer,

                    // Cat UI Update
                    pCatLives: uiTarget.lives || 0,
                    pCatCharge: uiTarget.catIsCharging ? (performance.now() - (uiTarget.catChargeStartTime || 0)) / 1000 : 0,

                    // Magic UI Update
                    pMp: uiTarget.mp || 0,
                    pMaxMp: uiTarget.maxMp || 200,
                    pMagicForm: uiTarget.magicForm || 'WHITE',
                    pMagicShieldHp: uiTarget.magicShieldHp || 0,
                    pMagicShieldMaxHp: CHAR_STATS[CharacterType.MAGIC].armorShieldHp,

                    // 敌人状态基于显示对象(可能是缓存的)
                    eCatLives: (displayEnemy && displayEnemy.type === CharacterType.CAT) ? (displayEnemy.lives || 0) : 0,
                    eType: displayEnemy ? displayEnemy.type : uiTarget.type,
                    eDisplayName: displayEnemy ? getEntityDisplayName(displayEnemy) : '未知敌人',

                    gameStatus: st.gameStatus,
                    isSpectating: isSpectating
                });

                if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    if (ctx) {
                        try {
                            draw(ctx);
                        } catch (err) {
                            console.error("Draw error:", err);
                        }
                    }
                }

                if (st.gameStatus === 'PLAYING') {
                    requestRef.current = requestAnimationFrame(loop);
                }
            };
            requestRef.current = requestAnimationFrame(loop);
        };

        requestRef.current = requestAnimationFrame(gameLoop);

        return () => {
            isRunning = false;
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('contextmenu', preventContextMenu);
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
            [CharacterType.MAGIC]: '魔法球',
            [CharacterType.ENVIRONMENT]: '环境',
        };
        return names[type] || '未知球体';
    };

    // 获取任意实体（玩家或无人机）的显示名称
    const getEntityDisplayName = (entity: any) => {
        // 如果是无人机（有 ownerId 属性且没有 teamId 属性）
        if ('ownerId' in entity && !('teamId' in entity)) {
            const owner = stateRef.current.players.find(p => p.id === entity.ownerId);
            if (owner) {
                return `无人机（${getRoleName(owner.type)}）`;
            }
            return '无人机';
        }
        // 如果是玩家
        return getRoleName(entity.type);
    };
    const getModeName = (mode: TankMode) => mode === TankMode.ARTILLERY ? '重炮模式' : '机枪模式';
    const getSkillName = (type: CharacterType) => {
        switch (type) {
            case CharacterType.PYRO: return '岩浆池';
            case CharacterType.WUKONG: return '如意金箍棒';
            case CharacterType.CAT: return '铲屎官之怒';
            default: return '切换形态';
        }
    };
    const getDefeatText = (type: CharacterType) => {
        if (type === CharacterType.PYRO) return '火焰熄灭';
        if (type === CharacterType.TANK) return '机体严重损毁';
        if (type === CharacterType.WUKONG) return '修行不足';
        if (type === CharacterType.CAT) return '猫猫去睡觉了!';
        if (type === CharacterType.MAGIC) {
            return uiState.pMagicForm === 'BLACK' ? '“这不是终点。”' : '法力耗尽';
        }
        return '对局结束';
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

    const heatBarStyle = uiState.pIsBurnedOut
        ? 'bg-white animate-pulse'
        : (uiState.pType === CharacterType.PYRO ? 'bg-orange-500' : 'bg-slate-500');

    const cursorClass = uiState.gameStatus !== 'PLAYING'
        ? 'cursor-default'
        : (uiState.pType === CharacterType.TANK && uiState.pTankMode === TankMode.ARTILLERY && !uiState.isSpectating
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
                        <span className="font-bold text-white text-lg">
                            {uiState.isSpectating ? `观战中: ${getRoleName(uiState.pType)}` : getRoleName(uiState.pType)}
                        </span>
                        <span ref={playerHpTextRef} className="text-sm text-slate-400 font-mono">100 HP</span>
                    </div>
                    <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden mb-4 border border-slate-600">
                        <div
                            ref={playerHpBarRef}
                            className="h-full bg-gradient-to-r from-green-600 to-green-400"
                            style={{ width: '100%' }}
                        />
                    </div>

                    {/* RESOURCE BARS SEPARATED BY TYPE */}
                    {uiState.pType === CharacterType.PYRO && (
                        <>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-slate-300 font-bold uppercase">燃料能量 {uiState.pIsBurnedOut && <span className="text-red-500 ml-2 animate-pulse font-black">燃尽警报</span>}</span>
                                <span ref={heatTextRef} className={`text-xs font-mono ${uiState.pIsBurnedOut ? 'text-red-500' : 'text-orange-400'}`}>0%</span>
                            </div>
                            <div className={`relative w-full h-5 rounded overflow-hidden border ${uiState.pIsBurnedOut ? 'border-red-500 bg-red-900/50' : 'border-slate-600 bg-slate-800'}`}>
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
                                <span className="text-xs text-slate-300 font-bold uppercase">炮弹</span>
                                <span className="text-xs text-yellow-500 font-mono">{uiState.pArtAmmo} / 5</span>
                            </div>
                            <div className="flex gap-2 h-5">
                                {Array.from({ length: uiState.pMaxArtAmmo }).map((_, i) => (
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
                                    const isFilled = uiState.pLmgAmmo >= (currentSegmentThreshold - ammoPerSegment / 2);

                                    return (
                                        <div
                                            key={i}
                                            className={`flex-1 -skew-x-12 transition-colors duration-75 ${uiState.pIsReloadingLmg
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
                                <span className={`text-xs text-${uiState.pUiThemeColor}-400 font-mono`}>{uiState.pCatLives} / 9</span>
                            </div>
                            <div className="flex gap-1">
                                {Array.from({ length: 9 }).map((_, i) => (
                                    <div key={i} className={`w-3 h-3 rounded-full border border-${uiState.pUiThemeColor}-900/50 ${i < uiState.pCatLives ? `bg-${uiState.pUiThemeColor}-400 shadow-[0_0_5px_currentColor] text-${uiState.pUiThemeColor}-400` : 'bg-slate-800'}`}></div>
                                ))}
                            </div>
                            {/* Pounce charge bar removed as requested */}
                        </div>
                    )}

                    {/* MAGIC UI: MANA BAR */}
                    {uiState.pType === CharacterType.MAGIC && (
                        <>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-slate-300 font-bold uppercase">法力值</span>
                                <span className="text-xs text-blue-400 font-mono">{Math.floor(uiState.pMp)} / {uiState.pMaxMp}</span>
                            </div>
                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2 border border-slate-600">
                                <div
                                    className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                    style={{ width: `${(uiState.pMp / uiState.pMaxMp) * 100}%` }}
                                />
                            </div>
                        </>
                    )}

                    {/* SKILLS & STATUS */}
                    <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-700/50">
                        <div className="flex items-center gap-3">
                            {/* ENHANCED SKILL ICON */}
                            <div className={`w-14 h-14 rounded-lg border-2 overflow-hidden relative flex items-center justify-center transition-colors ${uiState.pSkillCD <= 0 ? `border-${uiState.pUiThemeColor}-400 shadow-[0_0_15px_currentColor] text-${uiState.pUiThemeColor}-400` : 'border-slate-600 bg-slate-800'}`}>
                                {getSkillIcon(uiState.pType)}

                                <div
                                    ref={skillCdOverlayRef}
                                    className="absolute bottom-0 left-0 w-full bg-black/80 z-20 pointer-events-none transition-all duration-75 ease-linear"
                                    style={{ height: '0%' }}
                                ></div>

                                {uiState.pSkillCD <= 0 && (
                                    <div className={`absolute inset-0 bg-${uiState.pUiThemeColor}-400/20 animate-pulse z-0`}></div>
                                )}
                            </div>

                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">技能 (Space)</span>
                                <span className={`text-sm font-bold ${uiState.pSkillCD <= 0 ? `text-${uiState.pUiThemeColor}-400` : 'text-slate-500'}`}>
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



                        {/* PYRO DETONATE INDICATOR */}
                        {uiState.pType === CharacterType.PYRO && (
                            <div className="flex flex-col items-end w-24">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">引爆岩浆 (右键)</span>
                                {uiState.pSecondarySkillCD > 0 ? (
                                    <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
                                        <div
                                            className={`h-full bg-${uiState.pUiThemeColor}-600`}
                                            style={{ width: `${(1 - uiState.pSecondarySkillCD / 3.0) * 100}%` }}
                                        ></div>
                                    </div>
                                ) : (
                                    <span className={`text-xs font-bold text-${uiState.pUiThemeColor}-400`}>就绪</span>
                                )}
                            </div>
                        )}

                        {/* WUKONG THRUST CD INDICATOR */}
                        {uiState.pType === CharacterType.WUKONG && (
                            <div className="flex flex-col items-end w-24">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">呔！ (右键)</span>
                                {uiState.pWukongThrustTimer > 0 ? (
                                    <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
                                        <div
                                            className={`h-full bg-${uiState.pUiThemeColor}-600`}
                                            style={{ width: `${(1 - uiState.pWukongThrustTimer / 4.0) * 100}%` }}
                                        ></div>
                                    </div>
                                ) : (
                                    <span className={`text-xs font-bold text-${uiState.pUiThemeColor}-400`}>就绪</span>
                                )}
                            </div>
                        )}

                        {/* CAT HISS CD INDICATOR */}
                        {uiState.pType === CharacterType.CAT && (
                            <div className="flex flex-col items-end w-24">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">哈气 (右键)</span>
                                {uiState.pSecondarySkillCD > 0 ? (
                                    <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
                                        <div
                                            className={`h-full bg-${uiState.pUiThemeColor}-600`}
                                            style={{ width: `${(1 - uiState.pSecondarySkillCD / uiState.pSecondarySkillMaxCD) * 100}%` }}
                                        ></div>
                                    </div>
                                ) : (
                                    <span className={`text-xs font-bold text-${uiState.pUiThemeColor}-400`}>就绪</span>
                                )}
                            </div>
                        )}

                        {/* MAGIC PROTECTION CD INDICATOR */}
                        {uiState.pType === CharacterType.MAGIC && (
                            <div className="flex flex-col items-end w-24">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">保护咒语 (右键)</span>
                                {uiState.pMagicShieldHp > 0 ? (
                                    // 护盾存在时显示护盾值和护盾条
                                    <>
                                        <span className="text-xs font-bold text-violet-400 text-center w-full">
                                            护盾
                                        </span>
                                        <div className="w-full h-1.5 bg-slate-700 rounded-full mt-0.5 overflow-hidden">
                                            <div
                                                className="h-full bg-violet-500"
                                                style={{ width: `${(uiState.pMagicShieldHp / uiState.pMagicShieldMaxHp) * 100}%` }}
                                            ></div>
                                        </div>
                                    </>
                                ) : uiState.pSecondarySkillCD > 0 ? (
                                    // CD中显示CD进度条
                                    <div className="w-full h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
                                        <div
                                            className={`h-full bg-${uiState.pUiThemeColor}-600`}
                                            style={{ width: `${(1 - uiState.pSecondarySkillCD / uiState.pSecondarySkillMaxCD) * 100}%` }}
                                        ></div>
                                    </div>
                                ) : (
                                    // 就绪或法力不足
                                    <span className={`text-xs font-bold ${uiState.pMp < CHAR_STATS[CharacterType.MAGIC].expelliarmusManaCost ? 'text-red-500' : `text-${uiState.pUiThemeColor}-400`}`}>
                                        {uiState.pMp < CHAR_STATS[CharacterType.MAGIC].expelliarmusManaCost ? '法力不足' : '就绪'}
                                    </span>
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
                                    <canvas ref={radarCanvasRef} width={48} height={48} className="absolute inset-0 w-full h-full" />

                                </div>
                            </div>

                            {/* Drone Status */}
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">无人机 (右键)</span>
                                {uiState.pDroneState === 'READY' ? (
                                    <span className={`text-xs font-bold text-${uiState.pUiThemeColor}-400`}>就绪</span>
                                ) : (uiState.pDroneState === 'DEPLOYED' ? (
                                    uiState.pActiveDroneStats ? (
                                        <div className="flex flex-col w-24">
                                            <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
                                                <span>结构</span>
                                                <span>{Math.ceil(uiState.pActiveDroneStats.hp)}</span>
                                            </div>
                                            <div className="w-full h-1 bg-slate-800 rounded-full mb-1">
                                                <div className="h-full bg-green-500" style={{ width: `${(uiState.pActiveDroneStats.hp / uiState.pActiveDroneStats.maxHp) * 100}%` }}></div>
                                            </div>
                                            <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
                                                <span>电池</span>
                                                <span>{Math.ceil(uiState.pActiveDroneStats.life / 1000)}s</span>
                                            </div>
                                            <div className="w-full h-1 bg-slate-800 rounded-full">
                                                <div className="h-full bg-blue-400" style={{ width: `${(uiState.pActiveDroneStats.life / uiState.pActiveDroneStats.maxLife) * 100}%` }}></div>
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
                                                style={{ width: `${(uiState.pDroneTimer / uiState.pDroneMaxTimer) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Teammates Status Bottom-Left (Multiplayer Only) */}
            {customConfig && (
                <div className="absolute bottom-4 left-4 flex flex-col gap-1 pointer-events-none select-none">
                    {stateRef.current.players
                        .filter(p => p.teamId === getHumanPlayer().teamId && p.id !== 'player')
                        .map(teammate => (
                            <div key={teammate.id} className={`bg-slate-900/80 px-2 py-1 rounded border min-w-[150px] ${teammate.isDead ? 'border-slate-600/50 opacity-60' : 'border-blue-500/50'}`}>
                                <div className="flex justify-between text-xs mb-0.5">
                                    <span className={teammate.isDead ? 'text-slate-500' : 'text-blue-400'}>{getRoleName(teammate.type)}</span>
                                    <span className="text-slate-400">{teammate.isDead ? 0 : Math.round(teammate.hp)}</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full ${teammate.isDead ? 'bg-slate-600' : 'bg-blue-500'}`} style={{ width: teammate.isDead ? '0%' : `${(teammate.hp / teammate.maxHp) * 100}%` }}></div>
                                </div>
                            </div>
                        ))}
                </div>
            )}

            {/* Enemy Boss Bar Top-Right */}
            <div className="absolute top-4 right-4 flex flex-col items-end gap-2 pointer-events-auto select-none">

                <button
                    onClick={() => {
                        Sound.playUI('CLICK');
                        onExit();
                    }}
                    className="px-6 py-2 bg-red-900/80 hover:bg-red-700 border border-red-500 text-white text-sm font-bold uppercase tracking-widest rounded transition-colors mb-2"
                >
                    结束战斗
                </button>

                <div className="w-[320px] bg-slate-900/90 p-3 rounded-lg border border-slate-700 shadow-lg pointer-events-none">
                    <div className="flex justify-between text-xs text-white drop-shadow mb-1">
                        <span className="font-bold text-red-400 uppercase tracking-widest">
                            {customConfig ? '最近敌对单位' : '敌对单位'}: {uiState.eDisplayName}
                        </span>
                        <span ref={enemyHpTextRef} className="font-mono">100 / 100</span>
                    </div>
                    {/* 敌方猫猫命数显示 (位于血条上方) */}
                    {uiState.eType === CharacterType.CAT && (
                        <div className="flex justify-end gap-1 mb-1.5">
                            {Array.from({ length: 9 }).map((_, i) => (
                                <div
                                    key={i}
                                    className={`w-2.5 h-2.5 rounded-full border border-red-900/50 ${i >= 9 - uiState.eCatLives ? `bg-${CHAR_STATS[CharacterType.CAT].uiThemeColor}-400 shadow-[0_0_5px_currentColor] text-${CHAR_STATS[CharacterType.CAT].uiThemeColor}-400` : 'bg-slate-800'}`}
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

                {/* All Enemies Status (Multiplayer Only) */}
                {customConfig && (
                    <div className="flex flex-col gap-1 mt-2">
                        {stateRef.current.players
                            .filter(p => p.teamId !== getHumanPlayer().teamId)
                            .map(enemy => (
                                <div key={enemy.id} className={`bg-slate-900/80 px-2 py-1 rounded border min-w-[150px] ${enemy.isDead ? 'border-slate-600/50 opacity-60' : 'border-red-500/50'}`}>
                                    <div className="flex justify-between text-xs mb-0.5">
                                        <span className={enemy.isDead ? 'text-slate-500' : 'text-red-400'}>{getRoleName(enemy.type)}</span>
                                        <span className="text-slate-400">{enemy.isDead ? 0 : Math.round(enemy.hp)}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div className={`h-full ${enemy.isDead ? 'bg-slate-600' : 'bg-red-600'}`} style={{ width: enemy.isDead ? '0%' : `${(enemy.hp / enemy.maxHp) * 100}%` }}></div>
                                    </div>
                                </div>
                            ))}
                    </div>
                )}
            </div>

            {/* Exit Confirmation Dialog */}
            {showExitDialog && uiState.gameStatus === 'PLAYING' && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-lg shadow-2xl flex flex-col items-center gap-6 min-w-[320px] animate-in fade-in zoom-in duration-200">
                        <h3 className="text-xl font-bold text-white tracking-wider">确定要结束战斗吗？</h3>

                        <div className="flex gap-4 w-full justify-center">
                            <button
                                onClick={() => {
                                    Sound.playUI('CLICK');
                                    setShowExitDialog(false);
                                }}
                                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors font-medium border border-slate-600"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => {
                                    Sound.playUI('CLICK');
                                    onExit();
                                }}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded transition-colors font-medium border border-red-500 shadow-lg shadow-red-900/20"
                            >
                                确定
                            </button>
                        </div>
                    </div>
                </div>
            )}

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