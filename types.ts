

export enum CharacterType {
  PYRO = 'PYRO',
  TANK = 'TANK',
}

export enum TankMode {
  ARTILLERY = 'ARTILLERY',
  LMG = 'LMG',
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
}

export interface PlayerState extends GameEntity {
  type: CharacterType;
  hp: number;
  maxHp: number;
  
  // Death State
  isDead: boolean;
  matchEndTimer: number; // Time since death to delay game over screen

  // Pyro Resource: HEAT SYSTEM
  heat: number;      // 0 to maxHeat
  maxHeat: number;
  isOverheated: boolean;

  // Tank Resources
  artilleryAmmo: number;     // 0-5
  maxArtilleryAmmo: number;
  artilleryReloadTimer: number; 

  lmgAmmo: number;           // 0-200
  maxLmgAmmo: number;
  isReloadingLmg: boolean;   // New: Track manual reload phase
  lmgReloadTimer: number;    // Timer for the reload duration

  angle: number; // Body rotation
  aimAngle: number; // Turret/Aim rotation
  
  // Tank specific
  tankMode: TankMode;
  siegeSwitchTimer: number;

  // Pyro specific
  isFiringFlamethrower: boolean;
  
  // Cooldowns
  skillCooldown: number;
  skillMaxCooldown: number;
  attackCooldown: number;

  // Status Effects
  slowTimer: number; // Duration of slow effect
  burnTimer: number; // Duration of burn effect
  flameExposure: number; // 0-100, determines damage ramping

  // AI specific
  lastPos?: Vector2;
  stuckTimer?: number;
  unstuckDir?: Vector2;
  unstuckTimer?: number;
  burstTimer?: number;
}

export interface Projectile extends GameEntity {
  damage: number;
  ownerId: string;
  maxLife: number;
  life: number;
  projectileType: 'BULLET' | 'BOMB' | 'MAGMA_PROJ'; 
  targetPos?: Vector2; // For lobbed shots
  isAoe?: boolean;
  aoeRadius?: number;
  hitTargets?: string[]; // IDs of entities already hit (for penetration)
}

export interface GroundEffect {
  id: string;
  pos: Vector2;
  radius: number;
  life: number;
  maxLife: number;
  type: 'MAGMA_POOL';
  ownerId: string;
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
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'WALL' | 'WATER';
}

export interface GameState {
  player: PlayerState;
  enemy: PlayerState;
  projectiles: Projectile[];
  groundEffects: GroundEffect[]; 
  particles: Particle[];
  obstacles: Obstacle[];
  floatingTexts: FloatingText[]; // Added for status text
  camera: Vector2;
  gameStatus: 'PLAYING' | 'VICTORY' | 'DEFEAT';
}

export interface FloatingText {
  id: string;
  pos: Vector2;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  velY: number;
}