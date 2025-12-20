import { CharacterType } from '../types';
import { CHAR_STATS } from '../constants';

export interface WikiEntry {
  id: string;
  title: string;
  icon?: string; // SVG path
  description: string;
  type: 'GENERAL' | 'BALL';
  ballType?: CharacterType;
  stats?: {
    hp: number;
    speed: number;
    mass: number;
  };
  skills?: {
    key: 'LMB' | 'RMB' | 'SPACE' | 'PASSIVE';
    name: string;
    description: string;
    cooldown?: number;
  }[];
}

export const WIKI_DATA: WikiEntry[] = [
  // === 公共规则 ===
  {
    id: 'rules_basic',
    title: '基础规则与环境',
    description: '欢迎来到球之域。这里的物理法则既真实又致命。',
    type: 'GENERAL',
    skills: [
      {
        key: 'PASSIVE',
        name: '胜利条件',
        description: '将敌人的生命值 (HP) 归零。当生命值耗尽时，球体将破碎。'
      },
      {
        key: 'PASSIVE',
        name: '物理碰撞',
        description: '球体之间存在真实的物理碰撞体积。高速撞击会造成双方伤害（基于相对速度）。利用地形将敌人逼入死角是有效的战术。'
      },
      {
        key: 'PASSIVE',
        name: '地形：水域 (Water)',
        description: '蓝色的区域是水。大多数球在水中移动会变慢，如果停止移动还会溺水。火焰球在水中会持续受到高额伤害（熄火）。'
      },
      {
        key: 'PASSIVE',
        name: '地形：障碍物 (Walls)',
        description: '灰色的方块是墙壁。子弹无法穿透墙壁（除了无人机的特制穿甲弹）。某些强力技能（如悟空的大招、猫猫的铲子）可以粉碎墙壁改变地形。'
      }
    ]
  },

  // === 火焰球 PYRO ===
  {
    id: 'ball_pyro',
    title: '火焰球 (Pyro)',
    description: '高机动性的持续输出者。核心机制是【热能管理】。',
    type: 'BALL',
    ballType: CharacterType.PYRO,
    stats: {
      hp: CHAR_STATS.PYRO.hp,
      speed: CHAR_STATS.PYRO.speed * 10, // 归一化显示
      mass: CHAR_STATS.PYRO.mass,
    },
    skills: [
      {
        key: 'LMB',
        name: '火焰喷射',
        description: `持续喷射高温火焰。鼠标离球心越近，喷射角度越宽（适合近战）；离球心越远，喷射越集中（适合远程）。\n注意：持续开火会【燃尽】，期间无法攻击。`
      },
      {
        key: 'RMB',
        name: '引爆 (Detonate)',
        description: `引爆场上所有的【岩浆池】。对附近的敌人造成爆发伤害和击退。`,
        cooldown: CHAR_STATS.PYRO.secondarySkillCooldown / 1000
      },
      {
        key: 'SPACE',
        name: '岩浆池 (Magma Pool)',
        description: `向光标处抛射一团岩浆，生成燃烧区域。敌人在区域内持续受损，自己在区域内可回复生命并加速散热。`,
        cooldown: CHAR_STATS.PYRO.skillCooldown / 1000
      },
      {
        key: 'PASSIVE',
        name: '元素体质',
        description: '对火焰伤害有高额抗性。弱点：在【水域】中会受到持续的快速伤害（熄火），无论是否移动。'
      }
    ]
  },

  // === 坦克球 TANK ===
  {
    id: 'ball_tank',
    title: '坦克球 (Tank)',
    description: '拥有双形态切换和召唤能力的重装堡垒。',
    type: 'BALL',
    ballType: CharacterType.TANK,
    stats: {
      hp: CHAR_STATS.TANK.hp,
      speed: CHAR_STATS.TANK.speed * 10,
      mass: CHAR_STATS.TANK.mass,
    },
    skills: [
      {
        key: 'SPACE',
        name: '形态切换',
        description: '在【重炮模式】和【机枪模式】之间切换。机枪模式下移动速度大幅提升，但防御能力不变。'
      },
      {
        key: 'LMB',
        name: '主武器 (根据形态)',
        description: `重炮模式：发射重型炮弹，造成 ${CHAR_STATS.TANK.artilleryDamage} 点高额伤害，有最小射程限制。\n机枪模式：高射速轻机枪，单发伤害低但压制力强。需换弹。`
      },
      {
        key: 'RMB',
        name: '部署无人机',
        description: '释放一架自动攻击的无人机。无人机属于【电子机械】，免疫部分精神控制（如恐惧、哈气）。无人机没电后会返回充电，被摧毁后需长时间重构。'
      },
      {
        key: 'PASSIVE',
        name: '重装甲',
        description: '拥有全游戏最高的生命值和物理质量，极难被撞动。'
      }
    ]
  },

  // === 悟空球 WUKONG ===
  {
    id: 'ball_wukong',
    title: '悟空球 (Wukong)',
    description: '高机动的近战刺客，擅长连招和地形破坏。',
    type: 'BALL',
    ballType: CharacterType.WUKONG,
    stats: {
      hp: CHAR_STATS.WUKONG.hp,
      speed: CHAR_STATS.WUKONG.speed * 10,
      mass: CHAR_STATS.WUKONG.mass,
    },
    skills: [
      {
        key: 'LMB',
        name: '金箍棒连招',
        description: '三段式攻击：左挥 -> 右挥 -> 强力下劈。第三段攻击造成高额伤害和击退。'
      },
      {
        key: 'RMB',
        name: '定海神针·刺 (Thrust)',
        description: '按住蓄力，松开后向前突刺。蓄力越久，攻击距离越远，伤害越高。'
      },
      {
        key: 'SPACE',
        name: '如意金箍棒 (Smash)',
        description: '蓄力腾空（期间免疫部分地面伤害），松开后重击地面。可粉碎墙壁，造成范围震荡波。'
      },
      {
        key: 'PASSIVE',
        name: '修行之躯',
        description: '凌波微步：在水面上移动如履平地，不会减速。对火焰伤害有 30% 抗性。'
      }
    ]
  },

  // === 猫猫球 CAT ===
  {
    id: 'ball_cat',
    title: '猫猫球 (Cat)',
    description: '极其脆弱但极其致命的刺客。拥有独特的九命机制。',
    type: 'BALL',
    ballType: CharacterType.CAT,
    stats: {
      hp: CHAR_STATS.CAT.hp,
      speed: CHAR_STATS.CAT.speed * 10,
      mass: CHAR_STATS.CAT.mass,
    },
    skills: [
      {
        key: 'LMB',
        name: '猫猫拳 / 飞扑',
        description: `点按：快速抓挠。\n长按蓄力：【飞扑】。飞扑命中敌人造成【缴械 + 沉默 + 减速】并打断蓄力。若两只猫猫球空中对撞，会触发拼刀弹开。`
      },
      {
        key: 'RMB',
        name: '哈气 (Hiss)',
        description: '发出声波震开周围敌人。如果只剩最后一条命，哈气会造成【恐惧】效果。电子机械单位免疫此效果。',
        cooldown: CHAR_STATS.CAT.hissCooldown / 1000
      },
      {
        key: 'SPACE',
        name: '铲屎官之怒',
        description: `召唤巨大的铲子拍击地面。对非猫猫球生物造成毁灭性打击，并【粉碎地形】。离中心越近伤害越高。`
      },
      {
        key: 'PASSIVE',
        name: '九命怪猫',
        description: `初始拥有 ${CHAR_STATS.CAT.maxLives} 条命。每次死亡会消耗一条命并满血复活。内战时自带 70% 伤害减免。`
      }
    ]
  },
  {
    id: 'ball_magic',
    title: '魔法球 (Magic)',
    description: '充满随机性的神秘施法者。拥有隐藏的黑白双形态，所有技能消耗法力值(MP)。',
    type: 'BALL',
    ballType: CharacterType.MAGIC,
    stats: {
      hp: CHAR_STATS.MAGIC.hp,
      speed: CHAR_STATS.MAGIC.speed * 10,
      mass: CHAR_STATS.MAGIC.mass,
    },
    skills: [
      {
        key: 'LMB',
        name: '随机诅咒',
        description: `发射一道咒语，命中敌人施加随机负面状态（0.5-3秒）。不造成直接伤害。\n消耗: ${CHAR_STATS.MAGIC.curseManaCost} MP`,
        cooldown: CHAR_STATS.MAGIC.curseCooldown / 1000
      },
      {
        key: 'RMB',
        name: '保命咒语',
        description: `随机释放三种咒语之一：\n【除你武器】近身缴械敌人3秒\n【盔甲护身】获得${CHAR_STATS.MAGIC.armorShieldHp}HP护盾\n【移形换影】解除控制并闪现到安全位置`,
        cooldown: 5
      },
      {
        key: 'SPACE',
        name: '终极魔法',
        description: `白魔法球：【呼神护卫】消耗全部MP，释放冲击波击退敌人，召唤光灵球守护自己5秒（持续回血回蓝、免疫控制）。\n黑魔法球：【阿瓦达啃大瓜】消耗全部MP，向瞄准方向发射致命光束，血越低、MP越多伤害越高。`,
        cooldown: CHAR_STATS.MAGIC.skillCooldown / 1000
      },
      {
        key: 'PASSIVE',
        name: '魔法天赋',
        description: `进入对局有10%概率变为黑魔法球形态。MP持续匀速恢复(${CHAR_STATS.MAGIC.mpRegen}/秒)，上限${CHAR_STATS.MAGIC.maxMp}。`
      }
    ]
  }
];