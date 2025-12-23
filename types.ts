export enum CharacterType {
  PYRO = 'PYRO',
  TANK = 'TANK',
  WUKONG = 'WUKONG',
  CAT = 'CAT',
  COACH = 'COACH',
  MAGIC = 'MAGIC',
  ENVIRONMENT = 'ENVIRONMENT',
}

export enum TankMode {
  ARTILLERY = 'ARTILLERY',
  LMG = 'LMG',
}

export enum DamageType {
  PHYSICAL = 'PHYSICAL',
  MAGIC = 'MAGIC',
  WATER = 'WATER',
  FIRE = 'FIRE',
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface GameEntity {
  id: string;
  pos: Vector2;
  vel: Vector2;
  radius: number;
  mass: number;
  color: string;
  isMechanical?: boolean;
}

export interface Drone extends GameEntity {
  ownerId: string;
  hp: number;
  maxHp: number;
  life: number; // Battery
  maxLife: number;
  state: 'PATROL' | 'ATTACK' | 'RETURN';
  attackCooldown: number;
  patrolAngle: number;
  isSummon: boolean; // Attribute for targeting priority
  isDocked?: boolean; // Flag for removal logic
}

export interface PlayerState extends GameEntity {
  type: CharacterType;
  teamId: number;
  isBot: boolean;
  hp: number;
  maxHp: number;
  uiThemeColor: string;

  // Death State
  isDead: boolean;
  matchEndTimer: number; // Time since death to delay game over screen

  // Pyro Resource: FUEL SYSTEM
  fuel: number;      // 0 to maxFuel
  maxFuel: number;
  isBurnedOut: boolean;

  // Tank Resources
  artilleryAmmo: number;     // 0-5
  maxArtilleryAmmo: number;
  artilleryReloadTimer: number;

  lmgAmmo: number;           // 0-200
  maxLmgAmmo: number;
  isReloadingLmg: boolean;   // New: Track manual reload phase
  lmgReloadTimer: number;    // Timer for the reload duration

  // Tank Drone
  droneState: 'READY' | 'DEPLOYED' | 'CHARGING' | 'RECONSTRUCTING';
  activeDroneId?: string;
  droneTimer: number; // For charging/reconstructing
  droneMaxTimer: number;

  // Wukong Resources
  wukongComboStep: number; // 0, 1, 2
  wukongComboTimer: number; // Window to hit next combo
  wukongChargeState: 'NONE' | 'THRUST' | 'SMASH'; // Right click or Space
  wukongChargeTime: number;
  wukongMaxCharge: number;
  wukongChargeHoldTimer: number; // Track how long max charge is held
  wukongVaultTimer: number; // Animation timer for vaulting
  wukongThrustTimer: number; // Cooldown for Thrust skill
  isVaulting: boolean; // Flag for vaulting animation state

  // Wukong Visuals
  wukongLastAttackTime: number; // For rendering attack animations
  wukongLastAttackType: 'COMBO_1' | 'COMBO_2' | 'COMBO_SMASH' | 'SKILL_SMASH' | 'THRUST' | 'NONE';
  wukongLastChargePct: number; // Store charge % at moment of release for rendering correct length
  wukongUltKnockbackCharge?: number; // [New] Track if knocked back by Wukong Ult (>= 0.8 trigger)
  wukongUltSourceDamage?: number; // [New] Store original damage for bonus calc

  // Cat Resources
  lives?: number; // 9 Lives mechanism
  maxLives?: number;
  catChargeStartTime?: number; // For Pounce charging
  catIsCharging?: boolean; // Is holding LMB
  idleTimer?: number; // Track idle time for zZz animation
  pounceCooldown: number; // [新增] 飞扑内置CD
  isPouncing: boolean;    // [新增] 是否处于飞扑（滞空）状态
  pounceTimer: number;
  hasPounceHit: boolean;  // [新增] 本次飞扑是否已经触发过攻击（防止对同一敌人多次触发）

  // 状态追踪 (用于 UI/飘字)
  _prevStatus?: {
    tankMode?: TankMode;
    isReloadingLmg?: boolean;
    lives?: number;
    isBurnedOut?: boolean;
  };

  angle: number; // Body rotation
  aimAngle: number; // Turret/Aim rotation

  // Tank specific
  tankMode: TankMode;
  siegeSwitchTimer: number;

  // Pyro specific
  isFiringFlamethrower: boolean;
  currentWeaponRange?: number; // 当前根据鼠标距离计算出的射程
  currentWeaponAngle?: number; // 当前根据射程换算出的扩散角度 (弧度)

  // Cooldowns
  skillCooldown: number;
  skillMaxCooldown: number;
  secondarySkillCooldown: number; // Right click skill (Pyro Detonate)
  secondarySkillMaxCooldown: number;
  attackCooldown: number;

  // Status Effects
  stunTimer: number;
  blindTimer: number;
  tauntTimer: number;
  tauntSourceId?: string; // [新增] 嘲讽来源ID
  burnSourceId?: string;  // [新增] 灼烧来源ID
  rootTimer: number;
  sleepTimer: number;
  silenceTimer: number;
  disarmTimer: number;
  fearTimer: number;
  petrifyTimer: number;
  charmTimer?: number;
  invincibleTimer: number;
  stealthTimer?: number;
  hasteTimer?: number;
  slowTimer: number;
  isWet: boolean;
  smashWidthMin?: number;
  smashWidthMax?: number;
  smashChargeTime?: number;
  smashKnockbackMin?: number;
  smashKnockbackMax?: number;
  burnTimer: number;
  flameExposure: number;
  bufferedInput: string;
  // 飘字系统专用字段
  statusLabel?: string;
  statusLabelColor?: string; // [New] Override color for floating text
  statusLabelPos?: Vector2; // [New] Spawning position
  statusQueue?: { text: string; color?: string; pos?: Vector2 }[]; // [New] Queue for multiple indicators
  pendingStatusQueue?: { text: string; color?: string; pos?: Vector2 }[]; // [New] Buffer for floating texts during forced movement
  statusHistory: string[]; // [New] Track status application order for color priority
  aiSkipSkills?: boolean;
  stealth: boolean;
  burstFlag?: boolean;

  // Magic Ball Resources
  mp?: number;           // 当前法力值
  maxMp?: number;        // 最大法力值
  magicForm?: 'WHITE' | 'BLACK';  // 魔法形态
  darkWizardColor?: string; // 暗黑巫师形态下的颜色
  magicShieldHp?: number;         // 盔甲护身护盾值
  magicShieldTimer?: number;      // 盔甲护身持续时间
  lightSpiritTimer?: number;      // 光灵球持续时间
  magicUltCharging?: boolean;     // 黑魔法大招蓄力状态
  magicUltChargeTime?: number;    // 蓄力时间
  magicChargeTimer?: number;      // 普攻连续使用计时
  ccImmuneTimer?: number;         // 控制免疫计时器
  magicShieldShakeTimer?: number;  // 护盾受击抖动计时器
  magicShieldDamageLevel?: number; // 护盾破损等级 (0-4)

  // AI specific
  lastPos?: Vector2;
  stuckTimer?: number;
  unstuckDir?: Vector2;
  unstuckTimer?: number;
  burstTimer?: number;
  aiHissTimer?: number;
  aiHissDelay?: number;
  aiIsEscapingHazard?: boolean;
  aiHazardEscapeDir?: Vector2;
  aiHazardEscapeTimer?: number;
  aiTacticalRetreatDir?: Vector2;
  aiTacticalRetreatTimer?: number;
  forcedMoveTimer?: number; // [New] Track if being knocked back
  aimLockTimer?: number; // [New] Lock aim angle for auto-aim skills

  // AI Movement Variance
  aiSeed?: number;
  aiPreferredDistOffset?: number; // +/- offset to optimal range
  aiStrafeDir?: number; // 1 or -1
  aiStrafeTimer?: number;
  aiChangeDistTimer?: number;
}

export interface Projectile extends GameEntity {
  damage: number;
  ownerId: string;
  maxLife: number;
  life: number;
  projectileType: 'BULLET' | 'BOMB' | 'MAGMA_PROJ' | 'DRONE_SHOT' | 'MAGIC_SPELL' | 'MAGIC_BEAM' | 'EXPELLIARMUS';
  targetPos?: Vector2; // For lobbed shots
  isAoe?: boolean;
  aoeRadius?: number;
  hitTargets?: string[]; // IDs of entities already hit (for penetration)
  isEmp?: boolean; // New attribute: EMP attack
  damageType?: DamageType;
  statusType?: string;
  spawnedInsideWall?: boolean; // New: Allow firing from within walls
}

export interface GroundEffect {
  id: string;
  pos: Vector2;
  radius: number;
  life: number;
  maxLife: number;
  type: 'MAGMA_POOL' | 'WUKONG_SMASH' | 'CRACK' | 'SCOOPER_SMASH' | 'SCOOPER_WARNING' | 'START_BEACON' | 'LIGHT_SPIRIT' | 'PATRONUS_WAVE';
  ownerId: string;
  width?: number;
  length?: number;
  rotation?: number;
  targetId?: string;
  damageType?: DamageType;
  isPendingDetonation?: boolean;
  detonationTimer?: number;
}

export interface DangerZone {
  type: 'CIRCLE' | 'RECT';
  hazardType: 'SKILL' | 'WATER' | 'MAGMA' | 'WALL' | 'MAP_EDGE';
  timeLeft: number; // Time until impact or remaining duration (seconds). Use a high value for permanent hazards.
  weight?: number;  // Danger weight (e.g. 1.0 = standard, 2.0 = critical, -1.0 = preferred)
  // Circle
  center?: Vector2;
  radius?: number;
  // Rect (Capsule-like for beams/thrusts)
  p1?: Vector2;
  p2?: Vector2;
  width?: number; // Total width (diameter)
}

export interface Particle {
  id: string;
  pos: Vector2;
  vel: Vector2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  drag?: number; // Added for deceleration (Steam effect)
  type?: 'circle' | 'shard';
  angle?: number;
  spin?: number;
  points?: Vector2[];
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'WALL' | 'WATER' | 'LAVA';
  priority?: number;
}

export interface GameState {
  players: PlayerState[];
  projectiles: Projectile[];
  groundEffects: GroundEffect[];
  particles: Particle[];
  obstacles: Obstacle[];
  drones: Drone[]; // Added Drones array
  floatingTexts: FloatingText[]; // Added for status text
  camera: Vector2;
  screenShakeTimer?: number;
  screenShakeIntensity?: number;
  gameStatus: 'PLAYING' | 'VICTORY' | 'DEFEAT' | 'PAUSED';
  imageCache?: Record<string, HTMLImageElement>;
}

export interface FloatingText {
  id: string;
  pos: Vector2;
  text: string;
  color: string;
  size?: number;
  life: number;
  maxLife: number;
  velY: number;
}