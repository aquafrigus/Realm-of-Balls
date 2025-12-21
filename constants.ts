import { CharacterType } from "./types";

export const STATUS_CONFIG: Record<string, { label: string; color: string; isPositive: boolean; floatingTextCD?: number }> = {
  // Negative Statuses (Debuffs)
  stun: { label: '眩晕|拍扁', color: '#fbbf24', isPositive: false, floatingTextCD: 800 },   // Amber-400
  petrify: { label: '石化', color: '#94a3b8', isPositive: false, floatingTextCD: 800 },    // Slate-400
  sleep: { label: '催眠', color: '#818cf8', isPositive: false, floatingTextCD: 800 },      // Indigo-400
  fear: { label: '恐惧', color: '#c084fc', isPositive: false, floatingTextCD: 800 },       // Purple-400
  charm: { label: '魅惑|被萌翻', color: '#ec4899', isPositive: false, floatingTextCD: 800 },      // Pink-500
  taunt: { label: '嘲讽', color: '#ef4444', isPositive: false, floatingTextCD: 800 },      // Red-500
  silence: { label: '沉默', color: '#60a5fa', isPositive: false, floatingTextCD: 800 },    // Blue-400
  disarm: { label: '缴械|踩', color: '#f87171', isPositive: false, floatingTextCD: 800 },     // Red-400
  root: { label: '束缚', color: '#22c55e', isPositive: false, floatingTextCD: 800 },       // Green-500
  blind: { label: '致盲', color: '#10b981', isPositive: false, floatingTextCD: 800 },      // Emerald-500
  slow: { label: '减速', color: '#3b82f6', isPositive: false, floatingTextCD: 3000 },      // Blue-500
  burn: { label: '灼烧', color: '#ea580c', isPositive: false, floatingTextCD: 3000 },       // Orange-600
  wet: { label: '潮湿', color: '#06b6d4', isPositive: false, floatingTextCD: 800 },        // Cyan-500

  // Positive Statuses (Buffs)
  invincible: { label: '无敌', color: '#facc15', isPositive: true, floatingTextCD: 1000 }, // Yellow-400
  stealth: { label: '隐身', color: '#64748b', isPositive: true, floatingTextCD: 1000 },    // Slate-500
  haste: { label: '加速', color: '#0ea5e9', isPositive: true, floatingTextCD: 1000 },       // Sky-500
  heal: { label: '治疗', color: '#34d399', isPositive: true, floatingTextCD: 500 },    // Emerald-400
  revive: { label: '复活|有精神', color: '#22d3ee', isPositive: true, floatingTextCD: 2000 },      // Cyan-400
};

export const MAP_SIZE = { width: 2000, height: 2000 };
export const VIEWPORT_PADDING = 200;

export const TERRAIN_CONFIG = {
  WALL_COLOR: '#475569', // Slate-600 (Matches drawing)
  WALL_BORDER_COLOR: '#94a3b8', // Slate-400
  WALL_DEBRIS_COLOR: '#475569', // Slate-600
  WALL_SHATTER_PARTICLE_COUNT: 30,
};

export const PHYSICS = {
  FRICTION: 0.90,
  COLLISION_ELASTICITY: 0.2,
  ACCELERATION_SPEED: 0.2,
};

export const CHAR_STATS = {
  [CharacterType.COACH]: {
    hp: 3000,
    mass: 250,
    radius: 45, // 稍大一点，容易命中
    speed: 1.0, // 极慢的移动速度

    color: '#e2e8f0', // 基础为灰白色，但在渲染时会变为彩色光效 (Rainbow)
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
    smashKnockbackMin: 10000,
    smashKnockbackMax: 30000,
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
    pounceChargeThreshold: 0.2, // Time to trigger pounce/indicator
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
  },
  [CharacterType.MAGIC]: {
    hp: 800,
    mass: 160,
    radius: 26,
    speed: 2.5,

    color: '#e5e7eb',   // 基础色为白色，进入对局后若黑化则重新在对局内赋值colorDarkWizard
    darkWizardColor: '#020617',
    uiThemeColor: 'zinc',
    darkWizardUiThemeColor: 'slate',

    // MP System
    maxMp: 200,
    mpRegen: 20,        // MP/秒，匀速恢复

    // Left Click - Curse (普攻咒语)
    curseManaCost: 10,   // 初始消耗 (0.5s CD -> 10MP/s vs 20MP/s Regen)
    curseManaMaxCost: 60, // 连续使用最大消耗 (90MP/s Drain)
    curseRampUpTime: 2, // 达到最大消耗所需时间 (秒) - 约5发攻击
    curseCooldown: 400,  // 极快射速
    curseRange: 450,    // 最大飞行距离
    curseSpeed: 13,

    // Right Click - Protection Spell (保命咒语)
    protectManaCost: 40,
    expelliarmusManaCost: 100,
    // 《除你武器》: 缴械3秒, CD 5秒, 范围极近(80)
    expelliarmusRange: 80,
    expelliarmusDuration: 5000,
    expelliarmusCooldown: 5000,
    // 《盔甲护身》: 护盾500HP, 持续5秒, CD 7秒
    armorShieldHp: 500,
    armorDuration: 5000,
    armorCooldown: 7000,
    // 《移形换影》: 解除控制+闪现, CD 9秒
    blinkCooldown: 9000,

    // Ultimate - Skill Cooldown
    skillCooldown: 15000,
    secondarySkillCooldown: 5000, // 右键初始CD
    // 《呼神护卫》(白): 冲击波击退, 光灵球持续5秒
    patronusKnockback: 1200,
    patronusRange: 350,
    lightSpiritDuration: 5000,
    lightSpiritHealRate: 15,   // HP/秒
    lightSpiritMpRegenMultiplier: 2,
    // 《阿瓦达啃大瓜》(黑): 蓄力贯穿光束
    avadaMaxDamage: 2500,      // 最大伤害(需低血量+高MP)
    avadaMpDrainRate: 80,      // 蓄力时MP消耗速度/秒
  }
};

export const MAGIC_SPELL_LINES: Record<string, string> = {
  stun: '昏昏倒地',
  petrify: '统统石化',
  sleep: '沉沉入梦',
  fear: '震心慑魄',
  charm: '意乱情迷',
  taunt: '你过来啊',
  silence: '无声无息',
  root: '速速禁锢',
  blind: '目眩失明',
  slow: '障碍重重',
  burn: '火焰熊熊',

  disarm: '除你武器',
  blink: '移形换影',
  armor: '盔甲护身',

  patronus: '呼神护卫',
  avada: '阿瓦达啃大瓜',

};