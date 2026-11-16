import type {Character} from "./character.types";

const character: Character = {
  info: {
    name: "Lucky Lars",
    description: "A tough and intimidating gunslinger who serves as an enforcer",
    gender: "Male",
    imageUrl: "https://i.pinimg.com/736x/b5/45/fa/b545fa7ec2cae918bf35c90247b47fc1--cowboy-cowboy-cowgirl.jpg",
    infoUrl: "https://app.legendkeeper.com/a/worlds/cm1bx72zf0pg90jnf4a1ngvav/cm1i3rxox0014039b82idcchc/",
    backgroundUrl: "https://www.youtube.com/watch?v=RfBgmw_xCVY",
    inspiration: false,
    level: 5,
    hp: {
      current: 42,
      max: 42,
      temporary: 0
    },
    ac: 15,
    initiative: 4,
    speed: "30 ft",
    proficiencyBonus: 3,
    weight: 0,
    carry_capacity: 165, // 11 STR x 15
    race: {
      name: "Custom Lineage",
      type: "Human"
    },
    class: {
      name: "Gunslinger",
      hitDice: {
        amount: 5,
        die: 8
      }
    },
    conditions: [],
    defences: [],
    state: {
      type: "Normal"
    }
  },
  spells: [],
  proficients: [
    {
      id: "armor",
      title: "Armor",
      value: ["Light Armor"]
    },
    {
      id: "weapons",
      title: "Weapons",
      value: ["Simple Weapons", "Firearms", "Whips"]
    },
    {
      id: "tools",
      title: "Tools",
      value: ["Thieves' Tools", "One Gaming Set"]
    },
    {
      id: "languages",
      title: "Languages",
      value: ["Common"]
    }
  ],
  feats: [
    {
      id: "deadeye",
      title: "Deadeye",
      description: "In combat, find your flow with deadly efficiency. Whenever you hit with a ranged weapon attack, the threshold to score a critical hit decreases by 1, minimum 16. Lost on miss, incapacitation, or no attacks for a turn. At 14th level, gain this benefit twice per hit.",
      level: 1,
      source: "base"
    },
    {
      id: "bad_medicine",
      title: "Bad Medicine",
      description: "Roll one additional weapon damage die when determining the extra damage for a critical hit with a firearm. The number of additional dice increases as you gain levels in this class.",
      level: 1,
      source: "base"
    },
    {
      id: "grit",
      title: "Grit",
      description: "Gain grit points equal to 1 + Wisdom modifier (minimum 1). Spend points on grit features. Regain 1 point on critical hits against hostile creatures, and all points on short/long rest. Start with Buck Up, Bullet Time, Covering Fire, and Dodge Roll features.",
      level: 2,
      source: "base"
    },
    {
      id: "buck_up",
      title: "Buck Up",
      description: "Spend 1 grit point as a bonus action to spend Hit Dice up to your proficiency bonus, following normal rules for regaining hit points.",
      level: 2,
      source: "base"
    },
    {
      id: "bullet_time",
      title: "Bullet Time",
      description: "When a creature you can see makes a ranged attack against you, spend 1 grit point to impose disadvantage on the attack roll.",
      level: 2,
      source: "base"
    },
    {
      id: "covering_fire",
      title: "Covering Fire",
      description: "While holding a firearm, when a creature you can see within 60 feet attacks another creature, spend 1 grit point as a reaction to impose disadvantage on the attack roll.",
      level: 2,
      source: "base"
    },
    {
      id: "dodge_roll",
      title: "Dodge Roll",
      description: "Spend 1 grit point as a bonus action to move up to 10 feet without provoking opportunity attacks. Cannot be used if speed is 0.",
      level: 2,
      source: "base"
    },
    {
      id: "quickdraw",
      title: "Quickdraw",
      description: "Gain advantage on initiative rolls. When drawing or stowing a firearm, can draw or stow any number of weapons as part of the same move or action.",
      level: 2,
      source: "base"
    },
    {
      id: "bloodhound",
      level: 3,
      source: "subclass",
      title: "Bloodhound",
      description: "Gain proficiency in Insight. Double proficiency bonus for Insight checks on Humanoids."
    },
    {
      id: "double-tough",
      level: 3,
      source: "subclass",
      title: "Double Tough",
      description: "When regaining HP in combat, gain equal temporary HP until end of next turn."
    },
    {
      id: "unforgiven",
      level: 3,
      source: "subclass",
      title: "Unforgiven",
      description: "Extra damage die on first hit against creatures that attacked you since your last turn."
    },
    {
      id: "bully",
      level: 1,
      source: "optional",
      title: "Bully",
      description: "No disadvantage on ranged attacks within 5ft. Can push and prone targets within 10ft (DC 14 STR save)."
    },
    {
      id: "pistolero",
      level: 4,
      source: "optional",
      title: "Pistolero",
      description: "Bonus action attack with pistol when attacking with one-handed weapon. Can act normally if surprised when using pistol first."
    },
    {
      id: "threadweeving",
      level: 4,
      source: "optional",
      title: "Thread of Metal Bending",
      description: "*You can change the natural properties of metal in movement.*\n" +
        "\n" +
        "## Basic\n" +
        "* You can change the natural gravitational properties of metal in movement, making you able to slightly change the direction or speed of moving metal (at your DM's discretion) a number of times equal to **your proficiency bonus.**\n" +
        "* You feel when metal is near you, but can't detect what kind, where or the direction.\n" +
        "\n" +
        "## Advanced\n" +
        "* You may now change the direction or speed of moving metal (under one pound) change its direction, increasing or decreasing the its speed, or bring it to a near stop (when it travels under a certain limit), you can also change the shape of a piece of metal (shape and size at you DM's discretion), the travel time and movement of the piece of metal, or the temperature of the piece of metal.\n" +
        "* You also have a metallic sense being able to detect metal and what type of metal down to a certain certainty, the dice decide.\n" +
        "\n" +
        "## Mastery\n" +
        "* You are in full control of metal and can change the shape of non moving metal (under one pund of metal), change the direction and speed of moving metal, or change its temperature in its entirety.\n" +
        "* You can for a certainty detect the metals around within a set range, and determine the type of metal, its speed, and direction"
    },
    {
      id: "extra_attack_5",
      level: 5,
      source: "class",
      title: "Extra Attack",
      description: "You can attack twice, instead of once, whenever you take the Attack action on your turn."
    }
  ],
  abilities: [
    {
      id: "str",
      title: "Strength",
      score: 12,
      modifier: 1
    },
    {
      id: "dex",
      title: "Dexterity",
      score: 18,
      modifier: 4
    },
    {
      id: "con",
      title: "Constitution",
      score: 14,
      modifier: 2
    },
    {
      id: "int",
      title: "Intelligence",
      score: 10,
      modifier: 0
    },
    {
      id: "wis",
      title: "Wisdom",
      score: 14,
      modifier: 2
    },
    {
      id: "cha",
      title: "Charisma",
      score: 12,
      modifier: 1
    }
  ],
  savingThrows: [
    {
      title: "Strength",
      modifier: 1,
      proficiency: 0
    },
    {
      title: "Dexterity",
      modifier: 7, // +4 DEX, +3 proficiency
      proficiency: 1
    },
    {
      title: "Constitution",
      modifier: 2,
      proficiency: 0
    },
    {
      title: "Intelligence",
      modifier: 0,
      proficiency: 0
    },
    {
      title: "Wisdom",
      modifier: 2,
      proficiency: 0
    },
    {
      title: "Charisma",
      modifier: 4, // +1 CHA, +3 proficiency
      proficiency: 1
    }
  ],
  skills: [
    {
      name: "Acrobatics",
      ability: "Dexterity",
      modifier: 4,
      proficiency: 0
    },
    {
      name: "Animal Handling",
      ability: "Wisdom",
      modifier: 2,
      proficiency: 0
    },
    {
      name: "Arcana",
      ability: "Intelligence",
      modifier: 0,
      proficiency: 0
    },
    {
      name: "Athletics",
      ability: "Strength",
      modifier: 1,
      proficiency: 0
    },
    {
      name: "Deception",
      ability: "Charisma",
      modifier: 4,
      proficiency: 1
    },
    {
      name: "History",
      ability: "Intelligence",
      modifier: 0,
      proficiency: 0
    },
    {
      name: "Insight",
      ability: "Wisdom",
      modifier: 5,
      proficiency: 1
    },
    {
      name: "Intimidation",
      ability: "Charisma",
      modifier: 4,
      proficiency: 1
    },
    {
      name: "Investigation",
      ability: "Intelligence",
      modifier: 0,
      proficiency: 0
    },
    {
      name: "Medicine",
      ability: "Wisdom",
      modifier: 2,
      proficiency: 0
    },
    {
      name: "Nature",
      ability: "Intelligence",
      modifier: 0,
      proficiency: 0
    },
    {
      name: "Perception",
      ability: "Wisdom",
      modifier: 5,
      proficiency: 1
    },
    {
      name: "Performance",
      ability: "Charisma",
      modifier: 1,
      proficiency: 0
    },
    {
      name: "Persuasion",
      ability: "Charisma",
      modifier: 1,
      proficiency: 0
    },
    {
      name: "Religion",
      ability: "Intelligence",
      modifier: 0,
      proficiency: 0
    },
    {
      name: "Sleight of Hand",
      ability: "Dexterity",
      modifier: 7,
      proficiency: 1
    },
    {
      name: "Stealth",
      ability: "Dexterity",
      modifier: 7,
      proficiency: 1
    },
    {
      name: "Survival",
      ability: "Wisdom",
      modifier: 2,
      proficiency: 0
    }
  ],
  senses: [
    {
      title: "Passive Perception",
      score: 15 // 10 + 5 (proficiency)
    },
    {
      title: "Passive Investigation",
      score: 10 // 10 + 0 (no proficiency)
    },
    {
      title: "Passive Insight",
      score: 15 // 10 + 5 (proficiency)
    },
    {
      title: "Darkvision",
      score: "60 ft",
      condition: "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light."
    }
  ],
  actions: [
    {
      name: "Hand Cannon Attack",
      layout: "Attack",
      type: "Action",
      range: { normal: 60, max: 180 },
      damage: [{
        amount: 1,
        dice: 8,
        type: "piercing",
        bonus: 4
      }],
      toHit: 7,
      properties: ["ammunition", "kick (12)", "loud", "reload (6)"]
    },
    {
      name: "Buck Up",
      description: "Spend Hit Dice to heal (max 2 dice)",
      layout: "Special",
      type: "Bonus",
    },
    {
      name: "Bullet Time",
      description: "Spend 1 grit to impose disadvantage on ranged attack against you",
      layout: "Special",
      type: "Other",
    },
    {
      name: "Covering Fire",
      description: "Spend 1 grit to impose disadvantage on attack against ally within 60ft",
      layout: "Special",
      type: "Reaction",
    },
    {
      name: "Dodge Roll",
      description: "Spend 1 grit to move 10ft without opportunity attacks",
      layout: "Special",
      type: "Bonus",
    },
    {
      name: "Pistolero Extra Attack",
      description: "When taking Attack action with one-handed weapon, bonus action attack with pistol",
      layout: "Special",
      type: "Bonus"
    },
    {
      name: "Bully Shove",
      description: "On hit with firearm within 10ft, force STR save (DC 14) or push 5ft and prone",
      layout: "Special",
      type: "Other"
    }
  ],
  inventory: [
    {
      id: "hand-cannon",
      title: "Hand Cannon",
      type: "weapon",
      subtype: "firearm",
      rarity: "common",
      attributes: ["ammunition", "kick", "loud", "reload"],
      description: "A heavy pistol that deals 1d8 piercing damage",
      value: { amount: 85, currency: "gp" },
      weight: 3,
      quantity: 1,
      equippable: true,
      equipped: true,
      properties: {
        damage: {
          amount: 1,
          dice: 8,
          type: "piercing",
          bonus: 4
        },
        range: {
          normal: 60,
          max: 180
        }
      }
    },
    {
      id: "leather-armor",
      title: "Leather Armor",
      type: "armor",
      rarity: "common",
      attributes: ["light"],
      description: "Light armor made of leather",
      value: { amount: 10, currency: "gp" },
      weight: 10,
      quantity: 1,
      equippable: true,
      equipped: true,
      properties: {
        ac: {
          base: 11,
          bonus: 0,
          dexModifier: true,
          maxDexBonus: 0
        }
      }
    },
    {
      id: "ammunition",
      title: "Ammunition",
      type: "ammunition",
      subtype: "rounds",
      rarity: "common",
      attributes: [],
      description: "Firearm ammunition",
      value: { amount: 3, currency: "gp" },
      weight: 1,
      quantity: 20,
      equippable: true,
      equipped: false
    },
    {
      id: "explorers-pack",
      title: "Explorer's Pack",
      type: "container",
      rarity: "common",
      attributes: [],
      description: "Includes a backpack, bedroll, mess kit, tinderbox, 10 torches, 10 days of rations, waterskin, 50 feet of hempen rope",
      value: { amount: 10, currency: "gp" },
      weight: 59,
      quantity: 1,
      equippable: false,
      equipped: false
    },
    {
      id: "thieves-tools",
      title: "Thieves' Tools",
      type: "tool",
      rarity: "common",
      attributes: [],
      description: "Set of tools for picking locks and disarming traps",
      value: { amount: 25, currency: "gp" },
      weight: 1,
      quantity: 1,
      equippable: false,
      equipped: false
    }
  ],
  currency: {
    cp: 0,
    sp: 0,
    gp: 31,
    pp: 0
  },
  background: {
    title: "Criminal",
    subTitle: "Enforcer",
    description: "As a ruthless enforcer, Lucky Lars made his name through intimidation and violence, working for various criminal organizations to collect debts and maintain order. His reputation for efficiency with a firearm preceded him in the underworld.",
    additional: [
      {
        title: "Criminal Contact",
        type: "feature",
        description: "You have reliable criminal contacts who can provide information about the local underworld."
      },
      {
        title: "Equipment",
        type: "equipment",
        description: "Dark common clothes with hood, gaming set, thieves' tools"
      },
      {
        title: "Specialty",
        type: "information",
        description: "Enforcer - You serve as muscle for thieves' guilds and criminal organizations"
      }
    ]
  },
  special: {
    name: "Grit points",
    regain: "Short rest",
    max: 5,
    current: 5
  },
  soundBoard: {
    id: "default_soundboard",
    name: "My Sound Board",
    clips: []
  },
  systems: ["dnd5e", "gunslinger"],
  overlay: null
}

export default character