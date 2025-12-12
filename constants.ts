

import { CharacterType } from "./types";

export const MAP_SIZE = { width: 2000, height: 2000 };
export const VIEWPORT_PADDING = 200; 

export const PHYSICS = {
  FRICTION: 0.90, 
  COLLISION_ELASTICITY: 0.2, 
  ACCELERATION_SPEED: 0.2,
};

export const CHAR_STATS = {
  [CharacterType.PYRO]: {
    hp: 1200, // Buffed from 1000
    mass: 150, 
    radius: 25,
    speed: 2.9,
    
    // Heat System
    maxHeat: 200,
    heatGen: 40,
    heatDissipation: 60,
    overheatCooling: 80,
    
    color: '#ef4444', 
    skillCooldown: 6000, 
    secondarySkillCooldown: 8000, // 8s Cooldown for Detonate
    flamethrowerRange: 160, 
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
    skillCooldown: 1000,
    turretSpeed: 0.036, // Increased by 10% (0.033 -> 0.036)

    // Drone Stats
    droneHp: 200,
    droneLife: 15000,
    droneRadius: 12,
    droneSpeed: 5, // Faster
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
    
    color: '#fef3c7', // Cream
    
    // Scratch (Attack)
    scratchDamage: 60,
    scratchRange: 60,
    scratchCooldown: 300,
    
    // Pounce (Charged Attack)
    pounceMaxCharge: 1.0, // 1s to max charge
    pounceSpeed: 0.6,
    pounceDamage: 300, 
    pounceCooldown: 1000,

    // Hiss (Secondary)
    hissCooldown: 5000,
    hissRadius: 200,
    hissKnockback: 800,

    // Scooper Smash (Ultimate)
    skillCooldown: 15000,
    scoopDamage: 500,
    scoopRadius: 220,
    scoopDelay: 2000,
    scoopMaxRange: 600,
  }
};