import { CharacterType } from "./types";

export const MAP_SIZE = { width: 2000, height: 2000 };
export const VIEWPORT_PADDING = 200;

export const PHYSICS = {
  FRICTION: 0.90,
  COLLISION_ELASTICITY: 0.2,
  ACCELERATION_SPEED: 0.2,
};

export const CHAR_STATS = {
  [CharacterType.COACH]: {
    hp: 50000, // 极高血量
    mass: 2000, // 非常重，不容易被击飞，方便测试连招
    radius: 45, // 稍大一点，容易命中
    speed: 1.0, // 极慢的移动速度

    color: '#e2e8f0', // 灰白色
    uiThemeColor: 'slate',

    skillCooldown: 99999,
    secondarySkillCooldown: 99999,
  },
  [CharacterType.PYRO]: {
    hp: 1200, // Buffed from 1000
    mass: 150,
    radius: 25,
    speed: 2.9,

    // Fuel System (replaces Heat) - 基于100%
    maxFuel: 100,
    fuelConsumption: 25,      // 喷射消耗速度 (4秒耗尽)
    fuelRegen: 40,            // 正常恢复速度 (2.5秒回满)
    fuelRegenMagma: 24,       // 岩浆池内额外恢复
    burnoutRegen: 30,         // 燃尽期恢复速度（比正常慢）
    magmaHealRate: 50,        // 岩浆池内回血速度（HP/秒）- 降低以加快内战节奏
    pyroDamageMultiplier: 1.0, // 火焰球对火焰球伤害倍率（已取消增幅）

    color: '#ef4444',
    uiThemeColor: 'red',
    skillCooldown: 6000,
    secondarySkillCooldown: 8000, // 8s Cooldown for Detonate
    flamethrowerRange: 320,   // 翻倍 (160 -> 320)
    flamethrowerAngle: 0.20,
    magmaProjSpeed: 9,
    magmaPoolRadius: 95, // Buffed from 80
  },
  [CharacterType.TANK]: {
    hp: 3000,
    mass: 5000,
    radius: 38,
    speed: 1.5,

    // Artillery Stats
    maxArtilleryAmmo: 5,
    artilleryRegenTime: 8000,
    artilleryDamage: 676, // Increased by 30% (520 -> 676)
    artilleryMinRange: 220,
    artilleryRadius: 130,

    // LMG Stats
    maxLmgAmmo: 200,
    lmgReloadDuration: 6000,
    lmgDamage: 12,
    lmgBulletMass: 5.0,
    color: '#10b981',
    uiThemeColor: 'emerald',
    skillCooldown: 1000,
    turretSpeed: 0.036, // Increased by 10% (0.033 -> 0.036)

    // Drone Stats
    droneHp: 180,
    droneLife: 15000,
    droneRadius: 12,
    droneSpeed: 4, // Faster
    droneAttackRange: 550, // Massive range buff
    droneAggroRange: 1500, // Added to fix missing property error
    droneDamage: 20,
    droneRechargeTime: 7500,
    droneReconstructTime: 30000,
    dronePatrolRadius: 500,
  },
  [CharacterType.WUKONG]: {
    hp: 1600, // Mid-tier HP
    mass: 200, // Slightly heavier than Pyro
    radius: 28,
    speed: 3, // Agile

    color: '#facc15', // Gold
    uiThemeColor: 'yellow',

    // Combat
    comboWindow: 1.2, // Time to hit next combo
    comboDamage: [120, 150, 320], // Buffed from [90, 110, 220]
    comboKnockback: [250, 250, 700],

    // Thrust (Right Click)
    thrustMinDmg: 180, // Buffed from 100
    thrustMaxDmg: 550, // Buffed from 350
    thrustMaxRange: 380, // Slight range buff
    thrustChargeTime: 1.2, // Faster charge

    // Pillar Smash (Skill)
    skillCooldown: 8000,
    smashMinDmg: 300,
    smashMaxDmg: 900,
    smashMinRange: 150,
    smashMaxRange: 500,
    smashWidthMin: 50,
    smashWidthMax: 90,
    smashChargeTime: 1.5,
  },
  [CharacterType.CAT]: {
    hp: 150, // Extremely low HP
    mass: 120, // Very Light
    radius: 22, // Small
    speed: 3.5, // Very Fast
    maxLives: 9, // Nine lives mechanic

    color: '#f5d0fe', // Fuchsia-200 (粉紫色)
    uiThemeColor: 'fuchsia',

    // Scratch (Attack)
    scratchDamage: 60,
    scratchRange: 60,
    scratchCooldown: 300,

    // Pounce (Charged Attack)
    pounceMaxCharge: 1.0, // 1s to max charge
    pounceSpeed: 1.5,
    pounceDamage: 300,
    pounceCooldown: 1000,

    // Hiss (Secondary)
    hissCooldown: 5000,
    hissRadius: 200,
    hissKnockback: 800,

    // Scooper Smash (Ultimate)
    skillCooldown: 15000,
    scoopDamage: 500,
    scoopRadius: 154,
    scoopDelay: 2000,
    scoopMaxRange: 600,
  }
};