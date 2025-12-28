

import { CharacterType } from "./types";

// SVG Data URIs for Wukong and Tank assets
// Encoded for safe usage as src strings without external files

// Wukong: Monkey King with Phoenix-feather Cap (Fengchi Zijin Guan) & Pheasant Feathers
const WUKONG_AVATAR = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3C!-- Pheasant Feathers (Lingzi) --%3E%3Cpath d='M20 55 C 5 30 15 5 45 5' stroke='%23b91c1c' stroke-width='4' fill='none' stroke-linecap='round'/%3E%3Cpath d='M80 55 C 95 30 85 5 55 5' stroke='%23b91c1c' stroke-width='4' fill='none' stroke-linecap='round'/%3E%3C!-- Feather Details --%3E%3Cpath d='M18 45 L22 43 M14 30 L18 28 M84 43 L80 45 M86 30 L82 28' stroke='%237f1d1d' stroke-width='2' opacity='0.6'/%3E%3C!-- Head Base --%3E%3Ccircle cx='50' cy='60' r='35' fill='%23451a03' stroke='%23f59e0b' stroke-width='2'/%3E%3C!-- Face Area (Mask) --%3E%3Cpath d='M30 60 Q 50 85 70 60 Q 75 50 70 45 Q 50 35 30 45 Q 25 50 30 60' fill='%23fcd34d'/%3E%3C!-- Phoenix Wing Cap (Gold) --%3E%3Cpath d='M25 50 Q 50 20 75 50' stroke='%23facc15' stroke-width='5' fill='none'/%3E%3Cpath d='M25 50 Q 20 35 35 25' stroke='%23facc15' stroke-width='3' fill='none'/%3E%3Cpath d='M75 50 Q 80 35 65 25' stroke='%23facc15' stroke-width='3' fill='none'/%3E%3C!-- Central Gem --%3E%3Ccircle cx='50' cy='38' r='6' fill='%23ef4444' stroke='%23facc15' stroke-width='2'/%3E%3C!-- Eyes --%3E%3Ccircle cx='40' cy='58' r='3' fill='%23000'/%3E%3Ccircle cx='60' cy='58' r='3' fill='%23000'/%3E%3C/svg%3E`;

// Wukong Skill: Golden Cudgel (Ruyi Jingu Bang)
const WUKONG_SKILL = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='s' x1='1' y1='0' x2='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%23facc15'/%3E%3Cstop offset='50%25' stop-color='%23a16207'/%3E%3Cstop offset='100%25' stop-color='%23facc15'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23451a03' rx='20'/%3E%3Cpath d='M20 80 L80 20' stroke='url(%23s)' stroke-width='14' stroke-linecap='round'/%3E%3Cpath d='M15 85 L25 75' stroke='%23fef08a' stroke-width='4'/%3E%3Cpath d='M75 25 L85 15' stroke='%23fef08a' stroke-width='4'/%3E%3Ccircle cx='50' cy='50' r='25' stroke='%23facc15' stroke-width='2' fill='none' opacity='0.5'/%3E%3C/svg%3E`;

// Tank: Green Heavy Armor
const TANK_AVATAR = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect x='10' y='10' width='80' height='80' rx='15' fill='%23064e3b' stroke='%2310b981' stroke-width='4'/%3E%3Crect x='25' y='60' width='50' height='20' rx='5' fill='%23065f46'/%3E%3Cpath d='M20 65 h60 v10 h-60 z' fill='%23022c22'/%3E%3Crect x='35' y='30' width='30' height='30' rx='5' fill='%2334d399'/%3E%3Crect x='46' y='10' width='8' height='35' fill='%2310b981'/%3E%3Ccircle cx='50' cy='45' r='6' fill='%23064e3b'/%3E%3C/svg%3E`;

// Tank Skill: Mode Switch
const TANK_SKILL = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%230f172a' rx='20'/%3E%3Cpath d='M50 20 A30 30 0 0 1 80 50' stroke='%2310b981' stroke-width='8' fill='none' stroke-linecap='round'/%3E%3Cpath d='M50 80 A30 30 0 0 1 20 50' stroke='%23fbbf24' stroke-width='8' fill='none' stroke-linecap='round'/%3E%3Cpolygon points='80,50 90,40 70,40' fill='%2310b981'/%3E%3Cpolygon points='20,50 10,60 30,60' fill='%23fbbf24'/%3E%3Ctext x='50' y='60' font-family='sans-serif' font-size='30' text-anchor='middle' fill='white' font-weight='bold'%3E%E2%86%B9%3C/text%3E%3C/svg%3E`;

// Pyro Avatar: Fire Spirit with Goggles
const PYRO_AVATAR = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3C!-- Outer Swirling Magma --%3E%3Cpath d='M50 5 Q 15 20, 10 55 Q 15 90, 50 95 Q 85 90, 90 55 Q 85 20, 50 5' fill='%23991b1b' stroke='%237f1d1d' stroke-width='2'/%3E%3C!-- Middle Flame Layer --%3E%3Cpath d='M50 15 Q 28 30, 25 55 Q 32 80, 50 85 Q 68 80, 75 55 Q 72 30, 50 15' fill='%23ea580c'/%3E%3C!-- Inner Bright Flame --%3E%3Cpath d='M50 28 Q 38 42, 38 58 Q 45 72, 50 72 Q 55 72, 62 58 Q 62 42, 50 28' fill='%23f59e0b'/%3E%3C!-- Core Intense Heat Source --%3E%3Ccircle cx='50' cy='55' r='12' fill='%23fef3c7' stroke='%23fde68a' stroke-width='3'/%3E%3C!-- Embers --%3E%3Ccircle cx='30' cy='40' r='3' fill='%23fbbf24' opacity='0.8'/%3E%3Ccircle cx='70' cy='35' r='2' fill='%23fbbf24' opacity='0.8'/%3E%3Ccircle cx='45' cy='80' r='2' fill='%23ea580c' opacity='0.8'/%3E%3C/svg%3E`;

// Pyro Skill: Magma Pool
const PYRO_SKILL = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23450a0a' rx='20'/%3E%3Ccircle cx='50' cy='60' r='30' fill='%23ef4444' opacity='0.6'/%3E%3Cpath d='M50 20 L50 60' stroke='%23f97316' stroke-width='6' stroke-linecap='round'/%3E%3Ccircle cx='50' cy='60' r='15' fill='%23f59e0b'/%3E%3Cpath d='M20 70 Q50 90 80 70' stroke='%23ef4444' stroke-width='4' fill='none'/%3E%3C/svg%3E`;

// Cat: Cream/Calico Cat - Updated
const CAT_AVATAR = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3C!-- Body --%3E%3Ccircle cx='50' cy='55' r='35' fill='%23fae8ff' stroke='%23c026d3' stroke-width='3'/%3E%3C!-- Ears --%3E%3Cpolygon points='20,35 15,10 40,25' fill='%23fae8ff' stroke='%23c026d3' stroke-width='3' stroke-linejoin='round'/%3E%3Cpolygon points='80,35 85,10 60,25' fill='%231f2937' stroke='%23c026d3' stroke-width='3' stroke-linejoin='round'/%3E%3C!-- Calico Spot --%3E%3Cpath d='M70 35 Q80 30 85 50 Q75 60 65 50' fill='%23c026d3' opacity='0.8'/%3E%3C!-- Eyes --%3E%3Ccircle cx='35' cy='50' r='4' fill='%23000'/%3E%3Ccircle cx='65' cy='50' r='4' fill='%23000'/%3E%3C!-- Nose --%3E%3Cpath d='M47 60 L53 60 L50 64 Z' fill='%23ec4899'/%3E%3C!-- Whiskers --%3E%3Cpath d='M20 58 L5 52 M20 62 L5 66 M80 58 L95 52 M80 62 L95 66' stroke='%231f2937' stroke-width='2'/%3E%3C/svg%3E`;

// Cat Skill: Scooper
const CAT_SKILL = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23fffbeb' rx='20'/%3E%3C!-- Handle --%3E%3Crect x='45' y='50' width='10' height='40' fill='%239ca3af'/%3E%3C!-- Scoop --%3E%3Cpath d='M20 20 L80 20 L70 60 L30 60 Z' fill='%23ef4444' stroke='%23b91c1c' stroke-width='3' stroke-linejoin='round'/%3E%3C!-- Slots --%3E%3Crect x='35' y='30' width='5' height='20' fill='%23b91c1c' rx='2'/%3E%3Crect x='50' y='30' width='5' height='20' fill='%23b91c1c' rx='2'/%3E%3Crect x='65' y='30' width='5' height='20' fill='%23b91c1c' rx='2'/%3E%3C/svg%3E`;

// Coach Avatar: Target Dummy
const COACH_AVATAR = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='45' fill='%23f8fafc' stroke='%23475569' stroke-width='4'/%3E%3Ccircle cx='50' cy='50' r='35' fill='%23ef4444'/%3E%3Ccircle cx='50' cy='50' r='25' fill='%23f8fafc'/%3E%3Ccircle cx='50' cy='50' r='15' fill='%23ef4444'/%3E%3Ccircle cx='50' cy='50' r='5' fill='%23f8fafc'/%3E%3C/svg%3E`;
const COACH_SKILL = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext x='50' y='60' text-anchor='middle' fill='white' font-size='20'%3EAI%3C/text%3E%3C/svg%3E`;

// Magic Ball Avatar: Wizard Ball (White/Gold to Black/Purple Gradient) with Hat
const MAGIC_AVATAR = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3CradialGradient id='voidOrb' cx='35%25' cy='35%25' r='65%25'%3E%3Cstop offset='0%25' stop-color='%23f8fafc'/%3E%3Cstop offset='40%25' stop-color='%2364748b'/%3E%3Cstop offset='100%25' stop-color='%23020617'/%3E%3C/radialGradient%3E%3ClinearGradient id='robeDark' x1='20%25' y1='0%25' x2='80%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23334155'/%3E%3Cstop offset='100%25' stop-color='%23020617'/%3E%3C/linearGradient%3E%3ClinearGradient id='silverTrim' x1='0%25' y1='0%25' x2='100%25' y2='0%25'%3E%3Cstop offset='0%25' stop-color='%2394a3b8'/%3E%3Cstop offset='50%25' stop-color='%23f1f5f9'/%3E%3Cstop offset='100%25' stop-color='%2394a3b8'/%3E%3C/linearGradient%3E%3C/defs%3E%3C!-- Magic Aura --%3E%3Ccircle cx='50' cy='50' r='46' stroke='%23334155' stroke-width='0.5' fill='none' stroke-dasharray='4 2' opacity='0.4'/%3E%3C!-- Robe Group (Transparent) --%3E%3Cg opacity='0.7'%3E%3C!-- Robe Body --%3E%3Cpath d='M15 95 C 10 60, 25 10, 50 10 C 75 10, 90 60, 85 95' fill='url(%23robeDark)' stroke='%231e293b' stroke-width='2'/%3E%3C!-- Grey Patterns/Folds --%3E%3Cpath d='M25 45 Q 35 65 20 85' stroke='%2364748b' stroke-width='1' fill='none' opacity='0.5'/%3E%3Cpath d='M75 45 Q 65 65 80 85' stroke='%2364748b' stroke-width='1' fill='none' opacity='0.5'/%3E%3Cpath d='M32 25 Q 50 35 68 25' stroke='%2364748b' stroke-width='1' fill='none' opacity='0.4'/%3E%3Cpath d='M42 85 L 50 78 L 58 85' stroke='%2364748b' stroke-width='1' fill='none' opacity='0.4'/%3E%3C!-- Opening Trim --%3E%3Cpath d='M28 55 Q 50 25 72 55' stroke='url(%23silverTrim)' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/g%3E%3C!-- Void Orb (Inside Hood) --%3E%3Ccircle cx='50' cy='60' r='20' fill='url(%23voidOrb)' stroke='%230f172a' stroke-width='1'/%3E%3C!-- Mystic Sigil --%3E%3Cpath d='M50 52 L56 60 L50 68 L44 60 Z' fill='none' stroke='%23f8fafc' stroke-width='1.5' opacity='0.9'/%3E%3Ccircle cx='50' cy='60' r='3' fill='%23f8fafc' opacity='0.9'/%3E%3C!-- Sparkles --%3E%3Ctext x='80' y='30' fill='%2394a3b8' font-size='10' opacity='0.6'%3E✦%3C/text%3E%3Ctext x='18' y='80' fill='%2364748b' font-size='8' opacity='0.6'%3E✦%3C/text%3E%3C/svg%3E`;

// Magic Ball Skill: 魔杖
const MAGIC_SKILL = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3CradialGradient id='g' cx='50%25' cy='50%25' r='50%25'%3E%3Cstop offset='0%25' stop-color='%23ffffff'/%3E%3Cstop offset='60%25' stop-color='%2338bdf8'/%3E%3Cstop offset='100%25' stop-color='transparent'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%230f172a' rx='20'/%3E%3C!-- Shockwaves --%3E%3Ccircle cx='50' cy='50' r='38' stroke='%2338bdf8' stroke-width='1' fill='none' opacity='0.3'/%3E%3Ccircle cx='50' cy='50' r='30' stroke='%2338bdf8' stroke-width='2' fill='none' opacity='0.5'/%3E%3C!-- Wings/Aura --%3E%3Cpath d='M20 45 Q 10 20, 50 15 Q 90 20, 80 45 Q 90 65, 50 85 Q 10 65, 20 45' fill='none' stroke='%23bae6fd' stroke-width='2' stroke-linecap='round' opacity='0.8'/%3E%3C!-- Light Rays --%3E%3Ccircle cx='30' cy='30' r='1.5' fill='%23bae6fd' opacity='0.8'/%3E%3Ccircle cx='70' cy='30' r='1.5' fill='%23bae6fd' opacity='0.8'/%3E%3Ccircle cx='35' cy='65' r='1' fill='%23bae6fd' opacity='0.6'/%3E%3Ccircle cx='65' cy='65' r='1' fill='%23bae6fd' opacity='0.6'/%3E%3C!-- Spirit Core --%3E%3Ccircle cx='50' cy='50' r='20' fill='url(%23g)' opacity='0.8'/%3E%3Ccircle cx='50' cy='50' r='10' fill='%23ffffff'/%3E%3C!-- Sparkles --%3E%3Ccircle cx='20' cy='40' r='2' fill='%23facc15'/%3E%3Ccircle cx='75' cy='20' r='1.5' fill='%23facc15'/%3E%3Ccircle cx='60' cy='80' r='1.5' fill='%23facc15'/%3E%3C/svg%3E`;

// Magic Ball Skill (Black): Avada Kedavra
export const MAGIC_SKILL_BLACK = `data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3CradialGradient id='avadaGlow' cx='50%25' cy='50%25' r='50%25'%3E%3Cstop offset='0%25' stop-color='%2384cc16' stop-opacity='0.4'/%3E%3Cstop offset='100%25' stop-color='transparent'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23020617' rx='20'/%3E%3Ccircle cx='50' cy='50' r='45' fill='url(%23avadaGlow)'/%3E%3C!-- Chaotic Runes --%3E%3Cpath d='M10 10 Q 30 50 10 90' stroke='%2314532d' stroke-width='2' fill='none' opacity='0.5'/%3E%3Cpath d='M90 10 Q 70 50 90 90' stroke='%2314532d' stroke-width='2' fill='none' opacity='0.5'/%3E%3C!-- The Beam --%3E%3Cpath d='M20 80 L 35 60 L 30 50 L 55 30 L 50 20 L 80 10' stroke='%23a3e635' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M20 80 L 35 60 L 30 50 L 55 30 L 50 20 L 80 10' stroke='%23ecfccb' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C!-- Source Flare --%3E%3Ccircle cx='20' cy='80' r='6' fill='%2384cc16'/%3E%3C!-- Wand Base --%3E%3Cpath d='M5 95 L 20 80' stroke='%23713f12' stroke-width='4' stroke-linecap='round'/%3E%3C!-- Particles --%3E%3Ccircle cx='60' cy='40' r='2' fill='%23a3e635'/%3E%3Ccircle cx='40' cy='60' r='1.5' fill='%23a3e635'/%3E%3Ccircle cx='70' cy='20' r='2.5' fill='%23bef264'/%3E%3C/svg%3E`;

export interface CharacterImageSet {
    avatar: string;
    skill: string;
}

export const CHARACTER_IMAGES: Record<CharacterType, CharacterImageSet> = {
    [CharacterType.ENVIRONMENT]: {
        avatar: '',
        skill: ''
    },
    [CharacterType.PYRO]: {
        avatar: PYRO_AVATAR,
        skill: PYRO_SKILL
    },
    [CharacterType.WUKONG]: {
        avatar: WUKONG_AVATAR,
        skill: WUKONG_SKILL
    },
    [CharacterType.TANK]: {
        avatar: TANK_AVATAR,
        skill: TANK_SKILL
    },
    [CharacterType.CAT]: {
        avatar: CAT_AVATAR,
        skill: CAT_SKILL
    },
    [CharacterType.COACH]: {
        avatar: COACH_AVATAR,
        skill: COACH_SKILL
    },
    [CharacterType.MAGIC]: {
        avatar: MAGIC_AVATAR,
        skill: MAGIC_SKILL
    }
};