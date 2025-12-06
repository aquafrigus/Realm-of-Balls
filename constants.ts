
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
    hp: 1000,
    mass: 150, 
    radius: 25,
    speed: 3, 
    
    // Heat System
    maxHeat: 100,
    heatGen: 45,       // Heat per second firing
    heatDissipation: 30, // Passive cooling per second
    overheatCooling: 25, // Reduced from 50 to 25 (Double recovery time)
    
    color: '#ef4444', 
    skillCooldown: 6000, 
    flamethrowerRange: 160, 
    flamethrowerAngle: 0.20, 
    magmaProjSpeed: 5.5, 
    magmaPoolRadius: 80,
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
  }
};