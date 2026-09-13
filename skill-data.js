module.exports = {
  "professions": [
    "闢路者",
    "堅守者",
    "霧行者",
    "織光者"
  ],
  "initial": [
    {
      "key": "initial:基礎攻擊",
      "name": "基礎攻擊",
      "source": "初始戰技",
      "category": "initial",
      "level": 1,
      "timing": "主動",
      "cost": "1AP",
      "weapon": "所有",
      "effect": "【1.0物理】指定一名敵方進行近戰攻擊",
      "actionCode": "ATTACK",
      "targetCode": "ENEMY",
      "manual": true,
      "needsRoll": true,
      "timingCode": "DURING_SKILL",
      "skillKind": "active",
      "pipeline": [
        {
          "module": "resolve_targets",
          "params": {
            "targetCode": "ENEMY",
            "emitDeclare": true,
            "tags": {
              "attack": true,
              "melee": true,
              "ranged": false,
              "physical": true,
              "magic": false
            }
          }
        },
        {
          "module": "activate_skill",
          "params": {
            "spendCost": true,
            "onUse": []
          }
        },
        {
          "module": "attack_segment",
          "params": {
            "packets": [
              {
                "multiplier": 1,
                "hits": 1,
                "damageType": "物理"
              }
            ],
            "onHit": []
          }
        },
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "initial:救援",
      "name": "救援",
      "source": "初始戰技",
      "category": "initial",
      "level": 1,
      "timing": "主動",
      "cost": "1AP",
      "weapon": "所有",
      "effect": "【蓄力1】指定一名被擊倒的友方，使其恢復到1點HP",
      "actionCode": "HEAL",
      "targetCode": "ALLY_DOWN",
      "manual": true,
      "needsRoll": false,
      "timingCode": "DURING_SKILL",
      "skillKind": "active",
      "pipeline": [
        {
          "module": "resolve_targets",
          "params": {
            "targetCode": "ALLY_DOWN",
            "emitDeclare": true,
            "tags": {}
          }
        },
        {
          "module": "activate_skill",
          "params": {
            "spendCost": true,
            "onUse": []
          }
        },
        {
          "module": "charge_pending",
          "params": {
            "logicCode": "RESCUE"
          }
        },
        {
          "module": "finalize",
          "params": {}
        }
      ],
      "charge": true
    },
    {
      "key": "initial:基礎格擋",
      "name": "基礎格擋",
      "source": "初始戰技",
      "category": "initial",
      "level": 1,
      "timing": "自身被攻擊指定時",
      "cost": "1SP",
      "weapon": "所有",
      "effect": "對本次攻擊進行格擋",
      "actionCode": "GUARD",
      "targetCode": "SELF",
      "manual": true,
      "needsRoll": false,
      "skillKind": "auxiliary",
      "pipeline": [
        {
          "module": "activate_skill",
          "params": {
            "spendCost": false,
            "onUse": [
              {
                "op": "apply_status",
                "on": "actor",
                "statusKeys": [
                  "guard_ready"
                ]
              }
            ]
          }
        },
        {
          "module": "finalize",
          "params": {}
        }
      ],
      "reaction": {
        "timingCode": "ON_TARGET_DECLARED",
        "match": {
          "relation": "SELF_IS_TARGET"
        },
        "note": "對本次攻擊進行格擋"
      },
      "utilityMode": "basic_guard",
      "statusGrants": [
        "guard_ready"
      ]
    },
    {
      "key": "initial:基礎移動",
      "name": "基礎移動",
      "source": "初始戰技",
      "category": "initial",
      "level": 1,
      "timing": "主動/自身進行主要行動前",
      "cost": "1AP/1SP",
      "weapon": "所有",
      "effect": "移動至任意一個未被佔據的格子",
      "actionCode": "MOVE",
      "targetCode": "SELF",
      "manual": true,
      "needsRoll": false,
      "timingCode": "BEFORE_MAIN_ACTION",
      "skillKind": "active",
      "pipeline": [
        {
          "module": "activate_skill",
          "params": {
            "spendCost": true,
            "onUse": []
          }
        },
        {
          "module": "move_segment",
          "params": {}
        },
        {
          "module": "finalize",
          "params": {}
        }
      ]
    }
  ],
  "professionSkills": {
    "闢路者": [
      {
        "key": "闢路者:順劈",
        "name": "順劈",
        "source": "闢路者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍、斧、槍",
        "effect": "【0.75物理】指定兩名相鄰且同一排的敵方進行近戰攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY_ROW",
        "manual": true,
        "needsRoll": true,
        "targetShape": "ROW_ADJACENT_2",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY_ROW",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.75,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:防禦斬",
        "name": "防禦斬",
        "source": "闢路者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍、斧、槍",
        "effect": "【1.0物理】指定一名敵方進行近戰攻擊\n本輪內自身防禦+25%",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": [],
              "afterAttackSelf": [
                "defense_stance"
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "defense",
            "mode": "pct",
            "value": 25
          }
        ]
      },
      {
        "key": "闢路者:組合劍",
        "name": "組合劍",
        "source": "闢路者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍",
        "effect": "【0.5物理x3】指定一名敵方進行3段近戰攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 3,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:穿刺擊",
        "name": "穿刺擊",
        "source": "闢路者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍、槍",
        "effect": "【1.5物理】指定一名敵方進行近戰攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1.5,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:撥擋",
        "name": "撥擋",
        "source": "闢路者",
        "category": "profession",
        "level": 1,
        "timing": "自身被近戰攻擊指定時",
        "cost": "1SP",
        "weapon": "劍",
        "effect": "使攻擊的其中一段傷害對自身無效，自身AP+1",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "SELF_IS_TARGET",
            "attack": {
              "melee": true
            }
          },
          "note": "使本次攻擊其中一段傷害無效，並 AP+1"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "negate_one_segment",
                  "on": "original_target"
                },
                {
                  "op": "gain_resource",
                  "ap": 1
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:追擊",
        "name": "追擊",
        "source": "闢路者",
        "category": "profession",
        "level": 1,
        "timing": "其他友方進行攻擊後",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "【0.5物理】對該友方的攻擊目標進行近戰追擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "attack": {
                "melee": true,
                "physical": true,
                "ranged": false
              },
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "AFTER_ATTACK",
          "match": {
            "relation": "ALLY_OF_ACTOR_OTHER"
          },
          "note": "對該友方的攻擊目標進行【0.5物理】近戰追擊",
          "expand": "attack_targets"
        }
      },
      {
        "key": "闢路者:箭擊掩護",
        "name": "箭擊掩護",
        "source": "闢路者",
        "category": "profession",
        "level": 1,
        "timing": "其他友方被遠程物理攻擊指定時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "使攻擊傷害對其無效",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "ALLY_OF_TARGET_OTHER",
            "attack": {
              "ranged": true,
              "physical": true
            }
          },
          "note": "使 ${targetName} 本次遠程物理攻擊傷害無效"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "negate_all_damage",
                  "on": "original_target"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:終結",
        "name": "終結",
        "source": "闢路者",
        "category": "profession",
        "level": 1,
        "timing": "輪結束時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "【0.75物理】指定一名敵方進行近戰攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.75,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "attack": {
                "melee": true,
                "physical": true,
                "ranged": false
              },
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ROUND_END",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "【0.75物理】指定一名敵方進行近戰攻擊",
          "pick": {
            "kind": "enemy_target"
          }
        }
      },
      {
        "key": "闢路者:神秘刃",
        "name": "神秘刃",
        "source": "闢路者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍、斧、槍",
        "effect": "【1.0物理】【1.0魔法】指定一名敵方進行近戰攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": true
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                },
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "魔法"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:豎劈",
        "name": "豎劈",
        "source": "闢路者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍、斧、槍",
        "effect": "【1.0物理】指定一名敵方進行近戰攻擊，若目標為飛行系，則必定命中，改為【1.5物理】",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:鋼鐵開膛手",
        "name": "鋼鐵開膛手",
        "source": "闢路者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "斧、槍、錘",
        "effect": "【1.0物理】指定一名敵方進行近戰攻擊，若目標為重裝系，則無視其50%防禦，改為【1.5物理】",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:護盾猛擊",
        "name": "護盾猛擊",
        "source": "闢路者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "盾",
        "effect": "【0.5物理】指定一名敵方進行近戰攻擊\n【命中時】施加【暈厥】異常狀態",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": [
                {
                  "op": "apply_status",
                  "on": "target",
                  "statusKeys": [
                    "stun"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "stun"
        ]
      },
      {
        "key": "闢路者:高速直擊",
        "name": "高速直擊",
        "source": "闢路者",
        "category": "profession",
        "level": 5,
        "timing": "戰鬥開始時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "【唯一】【無法格擋】【1.0物理】指定一名敵方進行近戰攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BATTLE_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "【1.0物理】指定敵方近戰",
          "pick": {
            "kind": "enemy_target"
          }
        }
      },
      {
        "key": "闢路者:戰吼",
        "name": "戰吼",
        "source": "闢路者",
        "category": "profession",
        "level": 5,
        "timing": "自身發動主動戰技前",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "使與自身處於同一排的友方本輪內造成傷害+25%",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "apply_status",
                  "on": "recipients",
                  "statusKeys": [
                    "damage_up_25"
                  ],
                  "recipients": {
                    "mode": "same_row",
                    "excludeSelf": false
                  }
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BEFORE_SKILL",
          "match": {
            "relation": "SELF_IS_ACTOR"
          },
          "note": "同排友方造成傷害+25%"
        },
        "statusGrants": [
          {
            "type": "mod",
            "stat": "damage",
            "mode": "pct",
            "value": 25
          }
        ]
      },
      {
        "key": "闢路者:加速",
        "name": "加速",
        "source": "闢路者",
        "category": "profession",
        "level": 5,
        "timing": "其他角色回合結束時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "本輪內自身命中+20、迴避+20、速度+10（可疊加）",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "TURN_END",
          "match": {
            "relation": "OTHER_TURN_ENDED"
          },
          "note": "本輪命中/迴避/速度提升"
        },
        "statusGrants": [
          {
            "type": "mod",
            "stat": "hit",
            "mode": "flat",
            "value": 20
          },
          {
            "type": "mod",
            "stat": "dodge",
            "mode": "flat",
            "value": 20
          },
          {
            "type": "mod",
            "stat": "speed",
            "mode": "flat",
            "value": 10
          }
        ]
      },
      {
        "key": "闢路者:掩護",
        "name": "掩護",
        "source": "闢路者",
        "category": "profession",
        "level": 5,
        "timing": "其他友方被攻擊指定時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "與其分攤該次攻擊",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "cover_share"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "ALLY_OF_TARGET_OTHER"
          },
          "note": "與 ${targetName} 各分攤一半傷害"
        }
      },
      {
        "key": "闢路者:亂舞",
        "name": "亂舞",
        "source": "闢路者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "劍、斧、槍、錘",
        "effect": "【0.4物理x5】指定一名敵方進行5段近戰攻擊，無視50%防禦\n【全部命中時】自身AP+1",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.4,
                  "hits": 5,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:螺旋劍",
        "name": "螺旋劍",
        "source": "闢路者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍",
        "effect": "【1.0物理】指定一名敵方進行近戰攻擊\n【使用時】本輪內使其迴避-20，自身迴避+20",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "physical": true
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "apply_mod",
                  "on": "target",
                  "mods": [
                    {
                      "stat": "dodge",
                      "mode": "flat",
                      "value": -20
                    }
                  ]
                },
                {
                  "op": "apply_mod",
                  "on": "actor",
                  "mods": [
                    {
                      "stat": "dodge",
                      "mode": "flat",
                      "value": 20
                    }
                  ]
                }
              ]
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "damageType": "物理",
                  "hits": 1
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:迴旋擊",
        "name": "迴旋擊",
        "source": "闢路者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "劍、斧、槍、錘",
        "effect": "【0.5物理x3】指定一排敵方進行3段近戰攻擊，無視50%防禦",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY_ROW",
        "manual": true,
        "needsRoll": true,
        "targetShape": "ROW",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY_ROW",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 3,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:虐殺",
        "name": "虐殺",
        "source": "闢路者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "斧、錘",
        "effect": "【0.75物理】指定一名敵方進行近戰攻擊\n【命中時】解除其身上的一個增益",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.75,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:重擊聲援",
        "name": "重擊聲援",
        "source": "闢路者",
        "category": "profession",
        "level": 10,
        "timing": "其他友方進行攻擊時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "該次攻擊暴擊率+50%",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "ALLY_OF_ACTOR_OTHER"
          },
          "note": "使 ${actorName} 本次攻擊暴擊率 +50%"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "add_flag_number",
                  "key": "critFlat",
                  "value": 50
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:墊步",
        "name": "墊步",
        "source": "闢路者",
        "category": "profession",
        "level": 10,
        "timing": "自身攻擊命中後",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "移動至任意一個未被佔據的格子，自身SP+1",
        "actionCode": "MOVE",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": []
            }
          },
          {
            "module": "move_segment",
            "params": {
              "fromReaction": true
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "gain_resource",
                  "sp": 1
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "AFTER_HIT_CHECK",
          "match": {
            "relation": "SELF_IS_ACTOR_HIT"
          },
          "note": "移動至任意空格，自身SP+1",
          "pick": {
            "kind": "any_empty_cell"
          }
        }
      },
      {
        "key": "闢路者:進攻架勢",
        "name": "進攻架勢",
        "source": "闢路者",
        "category": "profession",
        "level": 10,
        "timing": "自身發動主動戰技後",
        "cost": "2SP",
        "weapon": "所有",
        "effect": "自身AP+1，本輪內物理攻擊+25%",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "apply_status",
                  "on": "actor",
                  "statusKeys": [
                    "patk_up_25"
                  ]
                },
                {
                  "op": "gain_resource",
                  "ap": 1
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "AFTER_ACTIVE_SKILL",
          "match": {
            "relation": "SELF_IS_ACTOR"
          },
          "note": "物理攻擊+25%，AP+1"
        },
        "statusGrants": [
          {
            "type": "mod",
            "stat": "patk",
            "mode": "pct",
            "value": 25
          }
        ]
      },
      {
        "key": "闢路者:戰爭號角",
        "name": "戰爭號角",
        "source": "闢路者",
        "category": "profession",
        "level": 10,
        "timing": "戰鬥開始時",
        "cost": "2SP",
        "weapon": "所有",
        "effect": "【唯一】本輪內對所有友方的攻擊附加【無法格擋】",
        "actionCode": "BUFF",
        "targetCode": "ALL_ALLIES",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BATTLE_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "友方攻擊附加無法格擋"
        },
        "statusGrants": [
          "war_horn"
        ]
      },
      {
        "key": "闢路者:當身",
        "name": "當身",
        "source": "闢路者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "劍、槍",
        "effect": "【0.5物理】【蓄力1】指定一名敵方進行近戰攻擊\n若蓄力時被攻擊指定，進行格擋後將攻擊目標改為攻擊者，然後立即發動本戰技，倍率改為【1.5物理】且暴擊率+【格擋率x2】",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:流星劍",
        "name": "流星劍",
        "source": "闢路者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "劍",
        "effect": "【0.25物理x9】指定一名敵方進行9段近戰攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.25,
                  "hits": 9,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:魔技賦予",
        "name": "魔技賦予",
        "source": "闢路者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "所有",
        "effect": "【1.0物理】【蓄力1】指定一排敵方進行近戰攻擊\n蓄力期間，其他友方在發動非蓄力魔法遠程攻擊戰技時可以宣言賦予\n本戰技命中時，適用所有賦予戰技的倍率（一段）以及【命中時】效果",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY_ROW",
        "manual": true,
        "needsRoll": true,
        "targetShape": "ROW",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY_ROW",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": true,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:盡毀",
        "name": "盡毀",
        "source": "闢路者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "斧、錘",
        "effect": "【1.75物理】【蓄力1】指定一名敵方進行近戰攻擊\n【命中時】對目標鄰近的所有角色造成【目標受到的最終傷害】點物理傷害，無視100%防禦",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1.75,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "闢路者:回返",
        "name": "回返",
        "source": "闢路者",
        "category": "profession",
        "level": 15,
        "timing": "自身的攻擊沒有命中後",
        "cost": "2SP",
        "weapon": "所有",
        "effect": "捨棄該次攻擊結果，重新進行命中檢定",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "return_reroll"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "AFTER_ATTACK",
          "match": {
            "relation": "SELF_ATTACK_ALL_MISSED"
          },
          "note": "捨棄該次攻擊結果，重新進行命中檢定"
        }
      },
      {
        "key": "闢路者:傳承",
        "name": "傳承",
        "source": "闢路者",
        "category": "profession",
        "level": 15,
        "timing": "輪開始時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "指定一名其他友方，使其獲得一個自身在上一輪結束時持有的增益",
        "actionCode": "BUFF",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "legacy_copy"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ROUND_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "指定一名其他友方，複製自身上一輪結束時持有的一個增益",
          "pick": {
            "kind": "legacy_buff"
          }
        }
      },
      {
        "key": "闢路者:戰慄",
        "name": "戰慄",
        "source": "闢路者",
        "category": "profession",
        "level": 15,
        "timing": "自身的攻擊結束後",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "恢復自身【0.25物理x命中段數】點HP",
        "actionCode": "HEAL",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": []
            }
          },
          {
            "module": "heal_segment",
            "params": {
              "mode": "patk_segments",
              "ratio": 0.25,
              "on": "actor"
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "AFTER_ATTACK",
          "match": {
            "relation": "SELF_IS_ACTOR"
          },
          "note": "恢復自身【0.25物理×命中段數】點HP"
        }
      },
      {
        "key": "闢路者:死鬥",
        "name": "死鬥",
        "source": "闢路者",
        "category": "profession",
        "level": 15,
        "timing": "自身發動主動戰技前",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "指定一名敵方，然後對自身施加【死鬥】特殊狀態\n若【死鬥】結束前該敵方沒有被擊倒，自身HP扣除至0",
        "actionCode": "UTILITY",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "mark_duel_target"
                },
                {
                  "op": "apply_status",
                  "on": "actor",
                  "statusKeys": [
                    "duel"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BEFORE_SKILL",
          "match": {
            "relation": "SELF_IS_ACTOR"
          },
          "note": "指定敵方並對自身施加死鬥",
          "pick": {
            "kind": "enemy_target"
          }
        },
        "statusGrants": [
          "duel"
        ],
        "applySelfStatus": true,
        "buffValueFromTarget": true
      }
    ],
    "堅守者": [
      {
        "key": "堅守者:尖刺",
        "name": "尖刺",
        "source": "堅守者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "【0.75物理】指定一名敵方進行近戰攻擊\n【自身HP低於50%時】改為【1.25物理】",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.75,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:挑釁",
        "name": "挑釁",
        "source": "堅守者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "指定一名敵方施加【嘲諷】異常狀態，使其本輪內行動速度-10",
        "actionCode": "DEBUFF",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "taunt",
          {
            "type": "mod",
            "stat": "speed",
            "mode": "flat",
            "value": -10
          }
        ]
      },
      {
        "key": "堅守者:猛擊",
        "name": "猛擊",
        "source": "堅守者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "錘、斧",
        "effect": "【0.75物理】指定一名敵方進行近戰攻擊\n【命中時】本輪內目標防禦-25%",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.75,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": [
                {
                  "op": "apply_mod",
                  "on": "target",
                  "mods": [
                    {
                      "stat": "defense",
                      "mode": "pct",
                      "value": -25
                    }
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "defense",
            "mode": "pct",
            "value": -25
          }
        ]
      },
      {
        "key": "堅守者:長槍突刺",
        "name": "長槍突刺",
        "source": "堅守者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "槍",
        "effect": "【無法攔截】【1.0物理】指定最多兩名前後相連的敵方進行近戰攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY_COLUMN",
        "manual": true,
        "needsRoll": true,
        "targetShape": "COLUMN_ADJACENT_2",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY_COLUMN",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:守護",
        "name": "守護",
        "source": "堅守者",
        "category": "profession",
        "level": 1,
        "timing": "其他友方被攻擊指定時",
        "cost": "1SP",
        "weapon": "盾",
        "effect": "代為承受該攻擊，並進行格擋",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "ALLY_OF_TARGET_OTHER"
          },
          "note": "代替 ${targetName} 承受本次攻擊"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "intercept_as_self"
                },
                {
                  "op": "apply_status",
                  "on": "actor",
                  "statusKeys": [
                    "guard_ready"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:堅守",
        "name": "堅守",
        "source": "堅守者",
        "category": "profession",
        "level": 1,
        "timing": "自身受到物理傷害後",
        "cost": "1SP",
        "weapon": "盾",
        "effect": "本輪自身防禦+25%，格擋率+25%（可疊加）",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "AFTER_DAMAGE",
          "match": {
            "relation": "SELF_TOOK_PHYSICAL_HP_LOSS"
          }
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "apply_status",
                  "on": "actor",
                  "statusKeys": [
                    "steadfast"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "defense",
            "mode": "pct",
            "value": 25
          },
          {
            "type": "mod",
            "stat": "block",
            "mode": "flat",
            "value": 25
          }
        ]
      },
      {
        "key": "堅守者:震怒",
        "name": "震怒",
        "source": "堅守者",
        "category": "profession",
        "level": 1,
        "timing": "其他友方受到傷害時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "本輪自身造成傷害+25%，命中+25（可疊加）",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_DAMAGE",
          "match": {
            "relation": "ALLY_TOOK_HP_LOSS_OTHER"
          }
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "apply_status",
                  "on": "actor",
                  "statusKeys": [
                    "rage"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "damage",
            "mode": "pct",
            "value": 25
          },
          {
            "type": "mod",
            "stat": "hit",
            "mode": "flat",
            "value": 25
          }
        ]
      },
      {
        "key": "堅守者:沉重反擊",
        "name": "沉重反擊",
        "source": "堅守者",
        "category": "profession",
        "level": 1,
        "timing": "自身受到主動行動攻擊後",
        "cost": "1SP",
        "weapon": "錘、斧",
        "effect": "【0.5物理】對攻擊者進行近戰攻擊，若目標為重裝系則無視其50%防禦",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "reaction": {
          "timingCode": "AFTER_ATTACK",
          "match": {
            "relation": "SELF_WAS_ATTACK_TARGET"
          }
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "counter_damage",
                  "effectId": "HEAVY_COUNTER"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:防守姿態",
        "name": "防守姿態",
        "source": "堅守者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "盾",
        "effect": "本輪內自身防禦+25%，自身SP+1",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {
              "resourceGain": {
                "sp": 1
              }
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "defense",
            "mode": "pct",
            "value": 25
          }
        ]
      },
      {
        "key": "堅守者:掙脫",
        "name": "掙脫",
        "source": "堅守者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "解除自身所有減益",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "dispel_all",
                  "on": "actor",
                  "kind": "debuff"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:擲槍",
        "name": "擲槍",
        "source": "堅守者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "槍",
        "effect": "【0.5物理】指定一名敵方進行遠程攻擊，若目標為飛行系，則改為【物理1.5】",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:輪擺",
        "name": "輪擺",
        "source": "堅守者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "錘、斧、槍",
        "effect": "【0.25x3物理】【命中-25】指定一排敵方進行3段近戰攻擊\n【命中時】本輪內目標防禦-25%",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY_ROW",
        "manual": true,
        "needsRoll": true,
        "targetShape": "ROW",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY_ROW",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.25,
                  "hits": 3,
                  "damageType": "物理"
                }
              ],
              "onHit": [
                {
                  "op": "apply_mod",
                  "on": "target",
                  "mods": [
                    {
                      "stat": "defense",
                      "mode": "pct",
                      "value": -25
                    }
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "defense",
            "mode": "pct",
            "value": -25
          }
        ]
      },
      {
        "key": "堅守者:鋼鐵帷幕",
        "name": "鋼鐵帷幕",
        "source": "堅守者",
        "category": "profession",
        "level": 5,
        "timing": "戰鬥開始時",
        "cost": "1SP",
        "weapon": "盾",
        "effect": "【唯一】本輪內除自身以外的友方格擋率+50%",
        "actionCode": "BUFF",
        "targetCode": "ALL_ALLIES",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {
              "recipients": {
                "mode": "all_allies",
                "excludeSelf": true
              }
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BATTLE_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "友方格擋率+50%"
        },
        "statusGrants": [
          {
            "type": "mod",
            "stat": "block",
            "mode": "flat",
            "value": 50
          }
        ]
      },
      {
        "key": "堅守者:奉獻",
        "name": "奉獻",
        "source": "堅守者",
        "category": "profession",
        "level": 5,
        "timing": "其他友方被攻擊指定後",
        "cost": "1SP",
        "weapon": "盾",
        "effect": "代為承受該攻擊，自身防禦和魔抗無效，自身SP+1",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "ALLY_OF_TARGET_OTHER"
          },
          "note": "代替 ${targetName} 承受攻擊；防禦/魔抗視為 0"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "intercept_as_self"
                },
                {
                  "op": "set_flag",
                  "key": "ignoreDefenseTargetId",
                  "value": "__actor__"
                },
                {
                  "op": "gain_resource",
                  "sp": 1
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:偏斜",
        "name": "偏斜",
        "source": "堅守者",
        "category": "profession",
        "level": 5,
        "timing": "自身被攻擊指定時",
        "cost": "1SP",
        "weapon": "盾",
        "effect": "對本次攻擊進行格擋，攻擊者下一次受到的傷害+25%",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "SELF_IS_TARGET"
          },
          "note": "對本次攻擊進行格擋"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "apply_status",
                  "on": "original_target",
                  "statusKeys": [
                    "guard_ready"
                  ]
                },
                {
                  "op": "apply_mod",
                  "on": "attacker",
                  "mods": [
                    {
                      "stat": "damageTaken",
                      "mode": "pct",
                      "value": 25
                    }
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:破陣",
        "name": "破陣",
        "source": "堅守者",
        "category": "profession",
        "level": 5,
        "timing": "自身進行攻擊時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "為本次攻擊附加【無法格擋】和命中時施加【格擋封印】異常狀態",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "SELF_IS_ACTOR"
          },
          "note": "本次攻擊無法格擋，命中時施加格擋封印"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "set_flag",
                  "key": "unblockable",
                  "value": true
                },
                {
                  "op": "set_flag",
                  "key": "applyBlockSealOnHit",
                  "value": true
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "break_formation"
        ]
      },
      {
        "key": "堅守者:戰線保衛",
        "name": "戰線保衛",
        "source": "堅守者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "盾",
        "effect": "使與自身處於同一排的其他友方本輪內防禦+50%",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {
              "recipients": {
                "mode": "same_row",
                "excludeSelf": true
              }
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "defense",
            "mode": "pct",
            "value": 50
          }
        ]
      },
      {
        "key": "堅守者:戰線剋星",
        "name": "戰線剋星",
        "source": "堅守者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "錘、斧、槍",
        "effect": "【無法代受】【無法格擋】【1.0物理】指定一排敵方進行近戰攻擊\n【命中時】本輪內目標防禦-25%",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY_ROW",
        "manual": true,
        "needsRoll": true,
        "targetShape": "ROW",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY_ROW",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": [
                {
                  "op": "apply_mod",
                  "on": "target",
                  "mods": [
                    {
                      "stat": "defense",
                      "mode": "pct",
                      "value": -25
                    }
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "defense",
            "mode": "pct",
            "value": -25
          }
        ]
      },
      {
        "key": "堅守者:衝撞",
        "name": "衝撞",
        "source": "堅守者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "【無法代受】【無法格擋】【0.5物理】【0.5防禦】指定一名敵方進行近戰攻擊\n【命中時】使目標後退一格，若目標後方存在角色或無法後退，則兩者再受到同樣的傷害",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:廣域猛擊",
        "name": "廣域猛擊",
        "source": "堅守者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "錘、斧、槍",
        "effect": "【地面】【無法代受】【無法格擋】【無法攔截】【0.5物理】指定所有敵方進行近戰攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ALL_ENEMIES",
        "manual": true,
        "needsRoll": true,
        "targetShape": "ALL_ENEMIES",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALL_ENEMIES",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:吸引目光",
        "name": "吸引目光",
        "source": "堅守者",
        "category": "profession",
        "level": 10,
        "timing": "戰鬥開始時",
        "cost": "1SP",
        "weapon": "盾",
        "effect": "【唯一】指定一排敵方施加【嘲諷】異常狀態",
        "actionCode": "DEBUFF",
        "targetCode": "ENEMY_ROW",
        "manual": true,
        "needsRoll": false,
        "targetShape": "ROW",
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY_ROW",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BATTLE_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "指定一排敵方嘲諷",
          "pick": {
            "kind": "enemy_row"
          }
        },
        "statusGrants": [
          "taunt"
        ]
      },
      {
        "key": "堅守者:戰線守護",
        "name": "戰線守護",
        "source": "堅守者",
        "category": "profession",
        "level": 10,
        "timing": "其他友方被攻擊指定時",
        "cost": "2SP",
        "weapon": "盾",
        "effect": "為一排友方承受該攻擊，並進行格擋",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "intercept_as_self"
                },
                {
                  "op": "set_flag",
                  "key": "lineGuardRow",
                  "value": true
                },
                {
                  "op": "apply_status",
                  "on": "actor",
                  "statusKeys": [
                    "guard_ready"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "ALLY_OF_TARGET_OTHER"
          },
          "note": "為同排友方承受攻擊並格擋"
        }
      },
      {
        "key": "堅守者:狂暴",
        "name": "狂暴",
        "source": "堅守者",
        "category": "profession",
        "level": 10,
        "timing": "自身進行主要行動前",
        "cost": "2SP",
        "weapon": "所有",
        "effect": "對自身施加【狂暴】特殊狀態，AP+1",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "apply_status",
                  "on": "actor",
                  "statusKeys": [
                    "berserk"
                  ]
                },
                {
                  "op": "gain_resource",
                  "ap": 1
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BEFORE_MAIN_ACTION",
          "match": {
            "relation": "SELF_IS_ACTOR"
          },
          "note": "獲得【狂暴】，AP+1"
        },
        "statusGrants": [
          "berserk"
        ],
        "applySelfStatus": true
      },
      {
        "key": "堅守者:退避",
        "name": "退避",
        "source": "堅守者",
        "category": "profession",
        "level": 10,
        "timing": "自身被攻擊指定時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "【唯一】將該次攻擊目標改為另一可被攻擊的角色",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "redirect_target"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "SELF_IS_TARGET"
          },
          "note": "將本次攻擊目標改為另一名合法目標",
          "pick": {
            "kind": "redirect_legal_target"
          }
        }
      },
      {
        "key": "堅守者:保護",
        "name": "保護",
        "source": "堅守者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "盾",
        "effect": "【蓄力1】指定一名友方\n蓄力期間，將該友方受到的所有原始傷害改為扣除自身的HP",
        "actionCode": "UTILITY",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "charge_pending",
            "params": {
              "logicCode": "PROTECT"
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:生命護盾",
        "name": "生命護盾",
        "source": "堅守者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "扣除自身25%HP，獲得自身25%HP的護盾",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "life_shield"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "life_shield"
        ],
        "utilityMode": "life_shield"
      },
      {
        "key": "堅守者:同生",
        "name": "同生",
        "source": "堅守者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "扣除自身50%當前HP，指定一名其他友方使其獲得自身因此失去的HP",
        "actionCode": "HEAL",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "heal_segment",
            "params": {
              "logicCode": "LIFE_TRANSFER",
              "mode": "life_transfer"
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "healMode": "life_transfer"
      },
      {
        "key": "堅守者:不惜生命",
        "name": "不惜生命",
        "source": "堅守者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "【自身HP低於25%時】失去所有防禦，獲得因此失去的防禦點物理攻擊",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "life_sacrifice"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "堅守者:極致防禦",
        "name": "極致防禦",
        "source": "堅守者",
        "category": "profession",
        "level": 15,
        "timing": "自身被攻擊指定時",
        "cost": "1+SP",
        "weapon": "盾",
        "effect": "對本次攻擊進行格擋，該次攻擊中格擋率+【消耗SPx10%】",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "ultimate_guard"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "SELF_IS_TARGET"
          },
          "note": "消耗任意 SP，格擋率 +消耗×10%，並進行格擋",
          "pick": {
            "kind": "sp_amount"
          }
        }
      },
      {
        "key": "堅守者:並肩作戰",
        "name": "並肩作戰",
        "source": "堅守者",
        "category": "profession",
        "level": 15,
        "timing": "其他友方被攻擊指定時",
        "cost": "1SP",
        "weapon": "盾",
        "effect": "盡可能移動到該友方的鄰近格子，然後代為承受該攻擊",
        "actionCode": "UTILITY",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": []
            }
          },
          {
            "module": "move_segment",
            "params": {
              "fromReaction": true,
              "optional": true
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "intercept_as_self"
                },
                {
                  "op": "apply_status",
                  "on": "actor",
                  "statusKeys": [
                    "guard_ready"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "ALLY_OF_TARGET_OTHER"
          },
          "note": "移動至鄰近格後代替 ${targetName} 承受攻擊",
          "pick": {
            "kind": "adjacent_empty"
          }
        }
      },
      {
        "key": "堅守者:爭取時間",
        "name": "爭取時間",
        "source": "堅守者",
        "category": "profession",
        "level": 15,
        "timing": "輪開始時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "指定一名敵方，使其本行動序的回合延後至自身的回合後",
        "actionCode": "UTILITY",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "delay_turn"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ROUND_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "延後一名敵方回合",
          "pick": {
            "kind": "enemy_target"
          }
        }
      },
      {
        "key": "堅守者:城墻反擊",
        "name": "城墻反擊",
        "source": "堅守者",
        "category": "profession",
        "level": 15,
        "timing": "自身受到攻擊後",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "若該次攻擊造成了低於1點傷害，使攻擊者損失【1.0防禦】點HP",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "AFTER_ATTACK",
          "match": {
            "relation": "SELF_WAS_ATTACK_TARGET_LOW_HP_LOSS"
          }
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "counter_damage",
                  "effectId": "WALL_COUNTER"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      }
    ],
    "霧行者": [
      {
        "key": "霧行者:竊取",
        "name": "竊取",
        "source": "霧行者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "【0.5物理】指定一名敵方進行近戰攻擊\n【命中時】竊取目標最多2SP，被格擋時不會生效",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:單發射擊",
        "name": "單發射擊",
        "source": "霧行者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "弓",
        "effect": "【1.0物理】指定一名敵方進行遠程攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:移位",
        "name": "移位",
        "source": "霧行者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "指定一名友方與其交換位置，本輪內雙方迴避+30",
        "actionCode": "MOVE",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY",
              "emitDeclare": false,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "move_segment",
            "params": {
              "swap": true,
              "grantBoth": [
                "dodge_up_30"
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:視線轉移",
        "name": "視線轉移",
        "source": "霧行者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "指定一名敵方使其本輪內迴避-50%",
        "actionCode": "UTILITY",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": false,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "apply_mod",
                  "on": "target",
                  "mods": [
                    {
                      "stat": "dodge",
                      "mode": "pct",
                      "value": -50
                    }
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "dodge",
            "mode": "pct",
            "value": -50
          }
        ]
      },
      {
        "key": "霧行者:精準打擊",
        "name": "精準打擊",
        "source": "霧行者",
        "category": "profession",
        "level": 1,
        "timing": "自身進行攻擊時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "使本次攻擊暴擊傷害+50%",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "SELF_IS_ACTOR"
          },
          "note": "本次攻擊暴擊傷害 +50%"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "add_flag_number",
                  "key": "critDamageBonus",
                  "value": 50
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:佯攻",
        "name": "佯攻",
        "source": "霧行者",
        "category": "profession",
        "level": 1,
        "timing": "友方進行攻擊時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "在本次攻擊前增加一段必定命中的【0物理】的傷害",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "set_flag",
                  "key": "feintZeroHit",
                  "value": true
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "DURING_ATTACK",
          "match": {
            "relation": "ALLY_OF_ACTOR_OTHER"
          },
          "note": "在本次攻擊前增加一段必定命中的【0物理】"
        }
      },
      {
        "key": "霧行者:快速裝填",
        "name": "快速裝填",
        "source": "霧行者",
        "category": "profession",
        "level": 1,
        "timing": "自身進行攻擊後",
        "cost": "1SP",
        "weapon": "弓",
        "effect": "【0.5物理】指定一名敵方進行遠程攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "attack": {
                "ranged": true,
                "physical": true,
                "melee": false
              },
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "AFTER_ATTACK",
          "match": {
            "relation": "SELF_IS_ACTOR"
          },
          "note": "【0.5物理】指定一名敵方進行遠程攻擊",
          "pick": {
            "kind": "enemy_target"
          }
        }
      },
      {
        "key": "霧行者:重整姿態",
        "name": "重整姿態",
        "source": "霧行者",
        "category": "profession",
        "level": 1,
        "timing": "自身成功迴避時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "自身AP+1",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "gain_resource",
                  "ap": 1
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "AFTER_HIT_CHECK",
          "match": {
            "relation": "SELF_DODGED"
          },
          "note": "自身 AP+1"
        }
      },
      {
        "key": "霧行者:雙重射擊",
        "name": "雙重射擊",
        "source": "霧行者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "弓",
        "effect": "【0.5物理】指定最多兩名敵方進行遠程攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:淬毒",
        "name": "淬毒",
        "source": "霧行者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍、斧、槍、弓",
        "effect": "【0.25物理】指定一名敵方進行遠程攻擊\n【命中時】施加【中毒】異常狀態",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.25,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": [
                {
                  "op": "apply_status",
                  "on": "target",
                  "statusKeys": [
                    "poison"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "poison"
        ]
      },
      {
        "key": "霧行者:處決",
        "name": "處決",
        "source": "霧行者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍、弓",
        "effect": "【1.0物理】指定一名敵方進行近戰攻擊，使用本戰技擊倒敵方後，本場戰鬥中倍率+0.5（可疊加）",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:寡兵殺手",
        "name": "寡兵殺手",
        "source": "霧行者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍、斧、槍",
        "effect": "【0.75物理】指定一名敵方進行近戰攻擊，若目標相鄰沒有其他角色，改為【物理1.75】",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.75,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:封口",
        "name": "封口",
        "source": "霧行者",
        "category": "profession",
        "level": 5,
        "timing": "戰鬥開始時",
        "cost": "1SP",
        "weapon": "劍",
        "effect": "【唯一】【0.25x2物理】【無法攔截】指定一名敵方進行兩段近戰攻擊\n【命中時】分別施加【格擋封印】和【輔助封印】異常狀態",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.25,
                  "hits": 1,
                  "damageType": "物理"
                },
                {
                  "multiplier": 0.25,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": [],
              "onHitPerPacket": [
                [
                  "block_seal"
                ],
                [
                  "aux_seal"
                ]
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BATTLE_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "兩段近戰並施加封印",
          "pick": {
            "kind": "enemy_target"
          }
        }
      },
      {
        "key": "霧行者:共享恢復",
        "name": "共享恢復",
        "source": "霧行者",
        "category": "profession",
        "level": 5,
        "timing": "自身受到其他角色的恢復時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "指定一名友方恢復【0.5魔法】點HP，解除其身上的所有減益",
        "actionCode": "HEAL",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "heal_segment",
            "params": {
              "logicCode": "CLEANSE_HEAL",
              "mode": "normal",
              "cleanse": true
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ON_HEAL",
          "match": {
            "relation": "SELF_WAS_HEALED"
          },
          "note": "指定友方恢復並解除減益",
          "pick": {
            "kind": "ally_target"
          }
        },
        "healMode": "normal",
        "healCleanse": true
      },
      {
        "key": "霧行者:絆腳",
        "name": "絆腳",
        "source": "霧行者",
        "category": "profession",
        "level": 5,
        "timing": "自身前方的敵方進行近戰攻擊時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "該次攻擊命中-40",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "add_flag_number",
                  "key": "hitFlatBonus",
                  "value": -40
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "DURING_ATTACK",
          "match": {
            "relation": "ENEMY_MELEE_IN_FRONT",
            "positionFilter": "attacker_directly_above"
          },
          "note": "該次攻擊命中-40",
          "positionFilter": "attacker_directly_above"
        }
      },
      {
        "key": "霧行者:借力蹬脫",
        "name": "借力蹬脫",
        "source": "霧行者",
        "category": "profession",
        "level": 5,
        "timing": "自身成功迴避時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "移動至任意一個未被佔據的格子，自身SP+1",
        "actionCode": "MOVE",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "move_segment",
            "params": {}
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "gain_resource",
                  "sp": 1
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "AFTER_HIT_CHECK",
          "match": {
            "relation": "SELF_DODGED"
          },
          "note": "移動並 SP+1",
          "pick": {
            "kind": "any_empty_cell"
          }
        }
      },
      {
        "key": "霧行者:強力射擊",
        "name": "強力射擊",
        "source": "霧行者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "弓",
        "effect": "【1.0物理】指定一名敵方進行遠程攻擊，在前排發動時改為【2.0物理】",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:暗影噬咬",
        "name": "暗影噬咬",
        "source": "霧行者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "劍、弓",
        "effect": "【0.25物理】指定一排敵方進行遠程攻擊\n【命中時】施加【黑暗】異常狀態，使目標本輪內行動速度-10",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY_ROW",
        "manual": true,
        "needsRoll": true,
        "targetShape": "ROW",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY_ROW",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.25,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": [
                {
                  "op": "apply_mod",
                  "on": "target",
                  "mods": [
                    {
                      "stat": "speed",
                      "mode": "flat",
                      "value": -10
                    }
                  ]
                },
                {
                  "op": "apply_status",
                  "on": "target",
                  "statusKeys": [
                    "darkness"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "speed",
            "mode": "flat",
            "value": -10
          },
          "darkness"
        ]
      },
      {
        "key": "霧行者:落井下石",
        "name": "落井下石",
        "source": "霧行者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "劍、斧、槍",
        "effect": "【1.0物理】指定一名敵方進行近戰攻擊，若目標處於異常狀態，則改為【2.0物理】且自身SP+1",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:音速擊",
        "name": "音速擊",
        "source": "霧行者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍、槍",
        "effect": "【0.25物理】指定一名敵方進行近戰攻擊，造成額外【自身行動速度-目標行動速度】點傷害",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.25,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:快速移位",
        "name": "快速移位",
        "source": "霧行者",
        "category": "profession",
        "level": 10,
        "timing": "其他友方被攻擊指定時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "與其交換位置，並代為承受該攻擊",
        "actionCode": "MOVE",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "ALLY_OF_TARGET_OTHER"
          },
          "note": "與 ${targetName} 交換位置並代受"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "move_segment",
            "params": {
              "swap": true
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "swap_with_original_target"
                },
                {
                  "op": "intercept_as_self"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:連斬",
        "name": "連斬",
        "source": "霧行者",
        "category": "profession",
        "level": 10,
        "timing": "自身擊倒敵人時",
        "cost": "2SP",
        "weapon": "所有",
        "effect": "自身AP+1，立即再進行一個回合",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "gain_resource",
                  "ap": 1
                },
                {
                  "op": "grant_extra_turn",
                  "on": "actor"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ON_KO",
          "match": {
            "relation": "SELF_KO_ENEMY"
          },
          "note": "AP+1 並立即再行動"
        }
      },
      {
        "key": "霧行者:鋒銳",
        "name": "鋒銳",
        "source": "霧行者",
        "category": "profession",
        "level": 10,
        "timing": "自身進行攻擊時",
        "cost": "1SP",
        "weapon": "劍、斧、槍、弓",
        "effect": "為本次攻擊附加【命中時】施加【流血】異常狀態",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "SELF_IS_ACTOR"
          },
          "note": "本次攻擊命中時施加流血"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "set_flag",
                  "key": "applyBleedOnHit",
                  "value": true
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "sharpness"
        ]
      },
      {
        "key": "霧行者:潛伏",
        "name": "潛伏",
        "source": "霧行者",
        "category": "profession",
        "level": 10,
        "timing": "自身發動主要戰技前",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "為自身的下一次攻擊附加【蓄力1】、【無法攔截】",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "next_attack_mods",
                  "charge": 1,
                  "cannotIntercept": true
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BEFORE_MAIN_ACTION",
          "match": {
            "relation": "SELF_IS_ACTOR"
          },
          "note": "下一次攻擊附加蓄力1、無法攔截"
        }
      },
      {
        "key": "霧行者:移轉",
        "name": "移轉",
        "source": "霧行者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "指定一名其他友方，使其移動至任意一個未被佔據的格子；或指定一名敵方進行遠程攻擊\n【命中時】使其移動至任意一個未被佔據的格子",
        "actionCode": "ATTACK",
        "targetCode": "ALLY_OR_ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY_OR_ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "attack": {
                "ranged": true,
                "physical": true,
                "melee": false
              },
              "enemiesOnly": true,
              "onHit": []
            }
          },
          {
            "module": "move_segment",
            "params": {
              "on": "target",
              "when": "ally_or_hit"
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:疾風箭",
        "name": "疾風箭",
        "source": "霧行者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "弓",
        "effect": "【0.75物理】指定一名敵方進行遠程攻擊\n【使用時】本輪內使其迴避-50",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "ranged": true,
                "physical": true
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "apply_mod",
                  "on": "target",
                  "mods": [
                    {
                      "stat": "dodge",
                      "mode": "flat",
                      "value": -50
                    }
                  ]
                }
              ]
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.75,
                  "damageType": "物理",
                  "hits": 1
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:移花接木",
        "name": "移花接木",
        "source": "霧行者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "所有",
        "effect": "【蓄力1】重新配置所有友方的位置\n若蓄力期間受到傷害則會中斷蓄力",
        "actionCode": "MOVE",
        "targetCode": "ALL_ALLIES",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "move_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:假死",
        "name": "假死",
        "source": "霧行者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "所有",
        "effect": "為自身施加【假死】特殊狀態",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "apply_status",
                  "on": "actor",
                  "statusKeys": [
                    "feign_death"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "feign_death"
        ],
        "applySelfStatus": true
      },
      {
        "key": "霧行者:獵鷹之眼",
        "name": "獵鷹之眼",
        "source": "霧行者",
        "category": "profession",
        "level": 15,
        "timing": "自身進行遠程攻擊時",
        "cost": "2SP",
        "weapon": "所有",
        "effect": "為本次攻擊附加【無法迴避】",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "SELF_IS_ACTOR",
            "attack": {
              "ranged": true
            }
          },
          "note": "本次遠程攻擊無法迴避"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "set_flag",
                  "key": "cannotEvade",
                  "value": true
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "霧行者:影踏術",
        "name": "影踏術",
        "source": "霧行者",
        "category": "profession",
        "level": 15,
        "timing": "與自身處於相對位置的敵方進行攻擊時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "該次攻擊造成傷害-25%",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "add_flag_number",
                  "key": "damageDealtPct",
                  "value": -0.25
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "DURING_ATTACK",
          "match": {
            "relation": "ENEMY_OPPOSITE_ATTACKING"
          },
          "note": "該次攻擊造成傷害-25%"
        }
      },
      {
        "key": "霧行者:先制射擊",
        "name": "先制射擊",
        "source": "霧行者",
        "category": "profession",
        "level": 15,
        "timing": "戰鬥開始時",
        "cost": "1SP",
        "weapon": "弓",
        "effect": "【唯一】【無法攔截】【1.0物理】指定一名敵方進行遠程攻擊\n【命中時】施加【暈厥】異常狀態",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": true,
                "magic": false
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1,
                  "hits": 1,
                  "damageType": "物理"
                }
              ],
              "onHit": [
                {
                  "op": "apply_status",
                  "on": "target",
                  "statusKeys": [
                    "stun"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BATTLE_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "遠程攻擊並暈厥",
          "pick": {
            "kind": "enemy_target"
          }
        },
        "statusGrants": [
          "stun"
        ]
      },
      {
        "key": "霧行者:蜃景",
        "name": "蜃景",
        "source": "霧行者",
        "category": "profession",
        "level": 15,
        "timing": "輪開始時",
        "cost": "2SP",
        "weapon": "所有",
        "effect": "指定一名其他友方施加【幻影】增益",
        "actionCode": "BUFF",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ROUND_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "友方獲得幻影",
          "pick": {
            "kind": "ally_other"
          }
        },
        "statusGrants": [
          "mirage"
        ]
      }
    ],
    "織光者": [
      {
        "key": "織光者:曳光",
        "name": "曳光",
        "source": "織光者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "杖",
        "effect": "【0.5魔法x2】指定一名敵方進行2段遠程攻擊",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": false,
                "magic": true
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 2,
                  "damageType": "魔法"
                }
              ],
              "onHit": []
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "織光者:賦能",
        "name": "賦能",
        "source": "織光者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "指定一名友方，本輪內其下一次物理近戰攻擊每段附帶【0.5魔法】點傷害",
        "actionCode": "BUFF",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "empower"
        ]
      },
      {
        "key": "織光者:治療",
        "name": "治療",
        "source": "織光者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "指定一名友方恢復【1.0魔法】點HP",
        "actionCode": "HEAL",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "heal_segment",
            "params": {
              "logicCode": "GENERIC_HEAL"
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "織光者:束縛",
        "name": "束縛",
        "source": "織光者",
        "category": "profession",
        "level": 1,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "杖",
        "effect": "指定一名敵方施加【格擋封印】異常狀態",
        "actionCode": "DEBUFF",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "block_seal"
        ]
      },
      {
        "key": "織光者:快速治療",
        "name": "快速治療",
        "source": "織光者",
        "category": "profession",
        "level": 1,
        "timing": "友方受到傷害後",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "恢復該友方【0.75魔法】點HP",
        "actionCode": "HEAL",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "AFTER_DAMAGE",
          "match": {
            "relation": "DAMAGED_ALLY_ALIVE"
          },
          "expand": "damages"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": []
            }
          },
          {
            "module": "heal_segment",
            "params": {
              "mode": "magic_ratio",
              "ratio": 0.75,
              "appendPrognosis": true
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "織光者:急救",
        "name": "急救",
        "source": "織光者",
        "category": "profession",
        "level": 1,
        "timing": "輪結束時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "指定一名友方恢復其20%HP",
        "actionCode": "HEAL",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": []
            }
          },
          {
            "module": "heal_segment",
            "params": {
              "mode": "max_hp_ratio",
              "ratio": 0.2
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ROUND_END",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "指定一名友方恢復其20%HP",
          "pick": {
            "kind": "ally_target"
          }
        }
      },
      {
        "key": "織光者:障壁",
        "name": "障壁",
        "source": "織光者",
        "category": "profession",
        "level": 1,
        "timing": "友方被攻擊指定時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "使其下一次受到的傷害-25%",
        "actionCode": "BUFF",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "ALLY_OF_TARGET"
          },
          "note": "使 ${targetName} 下一次受到的傷害 -25%"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "apply_mod",
                  "on": "original_target",
                  "mods": [
                    {
                      "stat": "damageTaken",
                      "mode": "pct",
                      "value": -25,
                      "consumeOnDamage": true
                    }
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "damageTaken",
            "mode": "pct",
            "value": -25,
            "consumeOnDamage": true
          }
        ]
      },
      {
        "key": "織光者:快速解咒",
        "name": "快速解咒",
        "source": "織光者",
        "category": "profession",
        "level": 1,
        "timing": "友方被施加減益時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "解除其身上的其中一個減益",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "dispel_one",
                  "kind": "debuff"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ON_EFFECT_APPLIED",
          "match": {
            "relation": "ALLY_RECEIVED_DEBUFF"
          },
          "note": "解除其身上的其中一個減益",
          "expand": "affected"
        }
      },
      {
        "key": "織光者:進攻指令",
        "name": "進攻指令",
        "source": "織光者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍",
        "effect": "本輪內所有友方物理和魔法攻擊+25%",
        "actionCode": "BUFF",
        "targetCode": "ALL_ALLIES",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "patk",
            "mode": "pct",
            "value": 25
          },
          {
            "type": "mod",
            "stat": "matk",
            "mode": "pct",
            "value": 25
          }
        ]
      },
      {
        "key": "織光者:防護指令",
        "name": "防護指令",
        "source": "織光者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍",
        "effect": "本輪內所有友方防禦和魔抗+50%",
        "actionCode": "BUFF",
        "targetCode": "ALL_ALLIES",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "defense",
            "mode": "pct",
            "value": 50
          },
          {
            "type": "mod",
            "stat": "resist",
            "mode": "pct",
            "value": 50
          }
        ]
      },
      {
        "key": "織光者:火球術",
        "name": "火球術",
        "source": "織光者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "杖",
        "effect": "【0.75魔法】指定一名敵方進行遠程攻擊\n【命中時】施加【燃燒】異常狀態",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": false,
                "magic": true
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.75,
                  "hits": 1,
                  "damageType": "魔法"
                }
              ],
              "onHit": [
                {
                  "op": "apply_status",
                  "on": "target",
                  "statusKeys": [
                    "burning"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "burning"
        ]
      },
      {
        "key": "織光者:寒冰箭",
        "name": "寒冰箭",
        "source": "織光者",
        "category": "profession",
        "level": 5,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "杖",
        "effect": "【0.5魔法】指定一名敵方進行遠程攻擊\n【命中時】施加【冰凍】異常狀態",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": false,
                "magic": true
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "魔法"
                }
              ],
              "onHit": [
                {
                  "op": "apply_status",
                  "on": "target",
                  "statusKeys": [
                    "frozen"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "frozen"
        ]
      },
      {
        "key": "織光者:純淨領域",
        "name": "純淨領域",
        "source": "織光者",
        "category": "profession",
        "level": 5,
        "timing": "戰鬥開始時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "【唯一】對所有友方施加【庇護】增益",
        "actionCode": "BUFF",
        "targetCode": "ALL_ALLIES",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BATTLE_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "全友方庇護"
        },
        "statusGrants": [
          "sanctuary"
        ]
      },
      {
        "key": "織光者:重燃",
        "name": "重燃",
        "source": "織光者",
        "category": "profession",
        "level": 5,
        "timing": "其他友方發動輔助戰技後",
        "cost": "1SP",
        "weapon": "提燈",
        "effect": "該友方SP+1",
        "actionCode": "UTILITY",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "AFTER_SKILL",
          "match": {
            "relation": "ALLY_SPENT_SP_AUX"
          }
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "gain_resource",
                  "on": "target",
                  "sp": 1
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "織光者:復甦",
        "name": "復甦",
        "source": "織光者",
        "category": "profession",
        "level": 5,
        "timing": "輪結束時",
        "cost": "1SP",
        "weapon": "提燈",
        "effect": "指定一名被擊倒的友方，使其恢復到1點HP",
        "actionCode": "HEAL",
        "targetCode": "ALLY_DOWN",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY_DOWN",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "revive_one"
                }
              ]
            }
          },
          {
            "module": "heal_segment",
            "params": {
              "mode": "revive"
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ROUND_END",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "指定一名被擊倒的友方，使其恢復到1點HP",
          "pick": {
            "kind": "downed_ally"
          }
        },
        "healMode": "revive"
      },
      {
        "key": "織光者:快速淨化",
        "name": "快速淨化",
        "source": "織光者",
        "category": "profession",
        "level": 5,
        "timing": "敵方被施加增益時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "解除其身上的其中一個增益",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "dispel_one",
                  "kind": "buff"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ON_EFFECT_APPLIED",
          "match": {
            "relation": "ENEMY_RECEIVED_BUFF"
          },
          "note": "解除其身上的其中一個增益",
          "expand": "affected"
        }
      },
      {
        "key": "織光者:戰線治療",
        "name": "戰線治療",
        "source": "織光者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "指定一排友方恢復【0.5魔法】點HP",
        "actionCode": "HEAL",
        "targetCode": "ALLY_ROW",
        "manual": true,
        "needsRoll": false,
        "targetShape": "ROW",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY_ROW",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "heal_segment",
            "params": {
              "logicCode": "GENERIC_HEAL"
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "織光者:狙擊指令",
        "name": "狙擊指令",
        "source": "織光者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "劍",
        "effect": "本輪內所有友方命中+30",
        "actionCode": "BUFF",
        "targetCode": "ALL_ALLIES",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          {
            "type": "mod",
            "stat": "hit",
            "mode": "flat",
            "value": 30
          }
        ]
      },
      {
        "key": "織光者:再生",
        "name": "再生",
        "source": "織光者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "指定一名友方施加【再生】增益",
        "actionCode": "BUFF",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALLY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "regeneration"
        ]
      },
      {
        "key": "織光者:雷霆劍",
        "name": "雷霆劍",
        "source": "織光者",
        "category": "profession",
        "level": 10,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "劍",
        "effect": "【無法攔截】【1.25魔法】指定自身正前方的所有敵方進行近戰攻擊\n【命中時】施加【暈厥】異常狀態",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY_COLUMN",
        "manual": true,
        "needsRoll": true,
        "targetShape": "FORWARD_COLUMN",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY_COLUMN",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": true,
                "ranged": false,
                "physical": false,
                "magic": true
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 1.25,
                  "hits": 1,
                  "damageType": "魔法"
                }
              ],
              "onHit": [
                {
                  "op": "apply_status",
                  "on": "target",
                  "statusKeys": [
                    "stun"
                  ]
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "stun"
        ]
      },
      {
        "key": "織光者:快速詠唱",
        "name": "快速詠唱",
        "source": "織光者",
        "category": "profession",
        "level": 10,
        "timing": "戰鬥開始時",
        "cost": "2SP",
        "weapon": "所有",
        "effect": "【唯一】本輪內僅限一次自身的行動順序改為第一",
        "actionCode": "BUFF",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BATTLE_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "自身先手一次"
        },
        "statusGrants": [
          "quick_cast"
        ]
      },
      {
        "key": "織光者:光導",
        "name": "光導",
        "source": "織光者",
        "category": "profession",
        "level": 10,
        "timing": "其他友方進行攻擊時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "為該次攻擊附加【無法迴避】、【無法暴擊】",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "ALLY_OF_ACTOR_OTHER"
          },
          "note": "支援 ${actorName} 本次攻擊"
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "set_flag",
                  "key": "cannotEvade",
                  "value": true
                },
                {
                  "op": "set_flag",
                  "key": "cannotCrit",
                  "value": true
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "織光者:飛速指令",
        "name": "飛速指令",
        "source": "織光者",
        "category": "profession",
        "level": 10,
        "timing": "戰鬥開始時",
        "cost": "2SP",
        "weapon": "劍",
        "effect": "【唯一】本輪內所有友方的行動速度+10",
        "actionCode": "BUFF",
        "targetCode": "ALL_ALLIES",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BATTLE_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "全友方速度+10"
        },
        "statusGrants": [
          {
            "type": "mod",
            "stat": "speed",
            "mode": "flat",
            "value": 10
          }
        ]
      },
      {
        "key": "織光者:熠光連結",
        "name": "熠光連結",
        "source": "織光者",
        "category": "profession",
        "level": 10,
        "timing": "其他友方發動主要戰技前",
        "cost": "1SP",
        "weapon": "提燈",
        "effect": "本輪內自身魔法攻擊-50%，該友方獲得自身因此失去的魔法攻擊",
        "actionCode": "BUFF",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "light_link"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "BEFORE_SKILL",
          "match": {
            "relation": "ALLY_OF_ACTOR_OTHER",
            "mainAction": true
          },
          "note": "將自身魔攻轉移給 ${actorName}"
        },
        "utilityMode": "light_link"
      },
      {
        "key": "織光者:格擋指令",
        "name": "格擋指令",
        "source": "織光者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "劍",
        "effect": "指定所有友方施加【自動格擋】增益",
        "actionCode": "BUFF",
        "targetCode": "ALL_ALLIES",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALL_ALLIES",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "auto_guard"
        ]
      },
      {
        "key": "織光者:魂靈風息",
        "name": "魂靈風息",
        "source": "織光者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "2AP",
        "weapon": "杖",
        "effect": "【無法攔截】【0.75魔法】指定自身以及任意正點方向（前後左右）的所有角色，若是敵方則進行遠程攻擊，若是友方則恢復【0.75魔法】點HP",
        "actionCode": "ATTACK",
        "targetCode": "ANY_ORTHOGONAL",
        "manual": true,
        "needsRoll": true,
        "targetShape": "ORTHOGONAL_LINE",
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ANY_ORTHOGONAL",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": false,
                "magic": true
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.75,
                  "hits": 1,
                  "damageType": "魔法"
                }
              ],
              "onHit": [],
              "allyHeal": {
                "ratio": 0.75,
                "stat": "magic"
              }
            }
          },
          {
            "module": "heal_segment",
            "params": {
              "mode": "magic_ratio",
              "ratio": 0.75,
              "alliesInTargets": true
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "織光者:元素交響曲",
        "name": "元素交響曲",
        "source": "織光者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "3AP",
        "weapon": "杖",
        "effect": "【無法攔截】【0.5魔法】【蓄力1】隨機五次指定一名敵方進行遠程攻擊，同一名角色可以被重複指定\n【命中時】分別施加【燃燒】、【中毒】、【暈厥】、【黑暗】、【冰凍】異常狀態",
        "actionCode": "ATTACK",
        "targetCode": "ENEMY",
        "manual": true,
        "needsRoll": true,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ENEMY",
              "emitDeclare": true,
              "tags": {
                "attack": true,
                "melee": false,
                "ranged": true,
                "physical": false,
                "magic": true
              }
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "attack_segment",
            "params": {
              "packets": [
                {
                  "multiplier": 0.5,
                  "hits": 1,
                  "damageType": "魔法"
                }
              ],
              "onHit": [],
              "onHitPerPacket": [
                [
                  "burning"
                ],
                [
                  "poison"
                ],
                [
                  "stun"
                ],
                [
                  "darkness"
                ],
                [
                  "frozen"
                ]
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "織光者:行進指令",
        "name": "行進指令",
        "source": "織光者",
        "category": "profession",
        "level": 15,
        "timing": "主動",
        "cost": "1AP",
        "weapon": "所有",
        "effect": "指定所有友方施加【疾行】增益",
        "actionCode": "BUFF",
        "targetCode": "ALL_ALLIES",
        "manual": true,
        "needsRoll": false,
        "skillKind": "active",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ALL_ALLIES",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "statusGrants": [
          "marching_order"
        ]
      },
      {
        "key": "織光者:再起",
        "name": "再起",
        "source": "織光者",
        "category": "profession",
        "level": 15,
        "timing": "其他友方回合結束時",
        "cost": "4SP",
        "weapon": "所有",
        "effect": "該友方AP+1且立即再進行一個回合。",
        "actionCode": "UTILITY",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "gain_resource",
                  "on": "target",
                  "ap": 1
                },
                {
                  "op": "grant_extra_turn",
                  "on": "target"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "TURN_END",
          "match": {
            "relation": "ALLY_TURN_ENDED"
          },
          "note": "該友方 AP+1 再回合"
        }
      },
      {
        "key": "織光者:預後",
        "name": "預後",
        "source": "織光者",
        "category": "profession",
        "level": 15,
        "timing": "自身造成恢復效果時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "同時施加等同於50%治療量的【護盾】",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "reaction": {
          "timingCode": "ON_HEAL",
          "match": {
            "relation": "SELF_IS_HEALER"
          }
        },
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": false,
              "onUse": [
                {
                  "op": "prognosis_shield"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ]
      },
      {
        "key": "織光者:促進/妨礙",
        "name": "促進/妨礙",
        "source": "織光者",
        "category": "profession",
        "level": 15,
        "timing": "輪開始時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "指定一名角色，使其行動序與其之前或之後的角色調換",
        "actionCode": "UTILITY",
        "targetCode": "SELF",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "resolve_targets",
            "params": {
              "targetCode": "ANY",
              "emitDeclare": true,
              "tags": {}
            }
          },
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": [
                {
                  "op": "swap_initiative"
                }
              ]
            }
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ROUND_START",
          "match": {
            "relation": "SELF_ALWAYS"
          },
          "note": "調換行動序",
          "pick": {
            "kind": "any_character"
          }
        }
      },
      {
        "key": "織光者:隨風而行",
        "name": "隨風而行",
        "source": "織光者",
        "category": "profession",
        "level": 15,
        "timing": "自身指定友方時",
        "cost": "1SP",
        "weapon": "所有",
        "effect": "使其中一名友方本輪內行動速度+10",
        "actionCode": "BUFF",
        "targetCode": "ALLY",
        "manual": true,
        "needsRoll": false,
        "skillKind": "auxiliary",
        "pipeline": [
          {
            "module": "activate_skill",
            "params": {
              "spendCost": true,
              "onUse": []
            }
          },
          {
            "module": "buff_segment",
            "params": {}
          },
          {
            "module": "finalize",
            "params": {}
          }
        ],
        "reaction": {
          "timingCode": "ON_TARGET_DECLARED",
          "match": {
            "relation": "SELF_DECLARED_ALLY"
          },
          "note": "被指定友方速度+10"
        },
        "statusGrants": [
          {
            "type": "mod",
            "stat": "speed",
            "mode": "flat",
            "value": 10
          }
        ]
      }
    ]
  },
  "common": [
    {
      "key": "通用戰技:解咒",
      "name": "解咒",
      "source": "通用戰技",
      "category": "common",
      "level": 1,
      "timing": "主動",
      "cost": "1AP",
      "weapon": "所有",
      "effect": "指定一名友方，解除其身上的其中一個減益\n若成功解除，恢復其【0.5魔法】點HP",
      "actionCode": "UTILITY",
      "targetCode": "ALLY",
      "manual": true,
      "needsRoll": false,
      "skillKind": "active",
      "pipeline": [
        {
          "module": "resolve_targets",
          "params": {
            "targetCode": "ALLY",
            "emitDeclare": false,
            "tags": {}
          }
        },
        {
          "module": "activate_skill",
          "params": {
            "spendCost": true,
            "onUse": [
              {
                "op": "dispel_one",
                "kind": "debuff"
              }
            ]
          }
        },
        {
          "module": "heal_segment",
          "params": {
            "mode": "magic_ratio",
            "ratio": 0.5,
            "requireDispelled": true
          }
        },
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:恢復強化",
      "name": "恢復強化",
      "source": "通用戰技",
      "category": "common",
      "level": 1,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "造成恢復效果時，額外恢復自身與目標2點HP",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:會心侵蝕",
      "name": "會心侵蝕",
      "source": "通用戰技",
      "category": "common",
      "level": 1,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "自身的攻擊暴擊時，施加燃燒/中毒/冰凍/暈厥/流血/黑暗",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "activate_skill",
          "params": {
            "spendCost": false,
            "onUse": [
              {
                "op": "crit_erosion_choice"
              }
            ]
          }
        },
        {
          "module": "finalize",
          "params": {}
        }
      ],
      "reaction": {
        "timingCode": "BATTLE_START",
        "match": {
          "relation": "SELF_ALWAYS"
        },
        "note": "選定一種異常：暴擊命中時施加",
        "pick": {
          "kind": "abnormal_choice"
        }
      }
    },
    {
      "key": "通用戰技:自動解咒",
      "name": "自動解咒",
      "source": "通用戰技",
      "category": "common",
      "level": 1,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "每場戰鬥自身第一次受到減益時，解除該減益",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:魔鋒刃",
      "name": "魔鋒刃",
      "source": "通用戰技",
      "category": "common",
      "level": 1,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "自身的物理攻擊戰技命中時，額外造成1點魔法傷害",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:回氣",
      "name": "回氣",
      "source": "通用戰技",
      "category": "common",
      "level": 5,
      "timing": "主動",
      "cost": "1AP",
      "weapon": "所有",
      "effect": "恢復自身【等級】點HP",
      "actionCode": "HEAL",
      "targetCode": "SELF",
      "manual": true,
      "needsRoll": false,
      "skillKind": "active",
      "pipeline": [
        {
          "module": "activate_skill",
          "params": {
            "spendCost": true,
            "onUse": []
          }
        },
        {
          "module": "heal_segment",
          "params": {
            "logicCode": "LEVEL_HEAL"
          }
        },
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:適性之力",
      "name": "適性之力",
      "source": "通用戰技",
      "category": "common",
      "level": 5,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "每輪開始時，使自身本輪內命中+10/迴避+10/行動速度+5",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "activate_skill",
          "params": {
            "spendCost": false,
            "onUse": [
              {
                "op": "aptitude_choice"
              }
            ]
          }
        },
        {
          "module": "finalize",
          "params": {}
        }
      ],
      "reaction": {
        "timingCode": "ROUND_START",
        "match": {
          "relation": "SELF_ALWAYS"
        },
        "note": "選擇本輪：命中+10／迴避+10／行動速度+5",
        "pick": {
          "kind": "aptitude_choice"
        }
      }
    },
    {
      "key": "通用戰技:鋼鐵信念",
      "name": "鋼鐵信念",
      "source": "通用戰技",
      "category": "common",
      "level": 5,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "自身的攻擊累計命中同一目標3次後，對其施加【嘲諷】異常狀態",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:飾品解放",
      "name": "飾品解放",
      "source": "通用戰技",
      "category": "common",
      "level": 5,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "獲得一個額外飾品位，但自身無法裝備同名裝備",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:物法雙修",
      "name": "物法雙修",
      "source": "通用戰技",
      "category": "common",
      "level": 5,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "基礎物理和魔法攻擊變為【（物理+魔法）x 0.60】",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:魔力擊",
      "name": "魔力擊",
      "source": "通用戰技",
      "category": "common",
      "level": 10,
      "timing": "主動",
      "cost": "1AP",
      "weapon": "所有",
      "effect": "【1.0魔法】指定一名敵方進行近戰攻擊",
      "actionCode": "ATTACK",
      "targetCode": "ENEMY",
      "manual": true,
      "needsRoll": true,
      "skillKind": "active",
      "pipeline": [
        {
          "module": "resolve_targets",
          "params": {
            "targetCode": "ENEMY",
            "emitDeclare": true,
            "tags": {
              "attack": true,
              "melee": true,
              "ranged": false,
              "physical": false,
              "magic": true
            }
          }
        },
        {
          "module": "activate_skill",
          "params": {
            "spendCost": true,
            "onUse": []
          }
        },
        {
          "module": "attack_segment",
          "params": {
            "packets": [
              {
                "multiplier": 1,
                "hits": 1,
                "damageType": "魔法"
              }
            ],
            "onHit": []
          }
        },
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:過量治療",
      "name": "過量治療",
      "source": "通用戰技",
      "category": "common",
      "level": 10,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "造成超過HP上限的治療轉化為【護盾】",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:萬能藥",
      "name": "萬能藥",
      "source": "通用戰技",
      "category": "common",
      "level": 10,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "使用消耗品時，同時解除目標的一個減益",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:根性",
      "name": "根性",
      "source": "通用戰技",
      "category": "common",
      "level": 10,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "HP降至0以下時也不會被擊倒（在HP回到0以前依舊無法行動）\n若自身的下一個回合開始時，HP仍在0以下，則陷入擊倒狀態",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:凝聚",
      "name": "凝聚",
      "source": "通用戰技",
      "category": "common",
      "level": 10,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "從第二輪起、每輪開始時，物理和魔法攻擊+1（可疊加），持續整場戰鬥",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:高速蓄力",
      "name": "高速蓄力",
      "source": "通用戰技",
      "category": "common",
      "level": 15,
      "timing": "戰鬥開始時",
      "cost": "2SP",
      "weapon": "所有",
      "effect": "【唯一】發動一個【蓄力】戰技",
      "actionCode": "UTILITY",
      "targetCode": "SELF",
      "manual": true,
      "needsRoll": false,
      "skillKind": "auxiliary",
      "pipeline": [
        {
          "module": "activate_skill",
          "params": {
            "spendCost": true,
            "onUse": []
          }
        },
        {
          "module": "charge_pending",
          "params": {
            "logicCode": "CHARGE_CAST"
          }
        },
        {
          "module": "finalize",
          "params": {}
        }
      ],
      "reaction": {
        "timingCode": "BATTLE_START",
        "match": {
          "relation": "SELF_ALWAYS"
        },
        "note": "發動一個蓄力戰技"
      }
    },
    {
      "key": "通用戰技:見縫插針",
      "name": "見縫插針",
      "source": "通用戰技",
      "category": "common",
      "level": 15,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "自身施加的燃燒、中毒、流血造成的HP損失可以暴擊",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:無限可能的呼喚",
      "name": "無限可能的呼喚",
      "source": "通用戰技",
      "category": "common",
      "level": 15,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "每場戰鬥一次，可以使自身的AP/SP+1，但下一次恢復的AP/SP-1",
      "actionCode": "SPECIAL",
      "targetCode": "SELF",
      "manual": true,
      "needsRoll": false,
      "skillKind": "auxiliary",
      "pipeline": [
        {
          "module": "activate_skill",
          "params": {
            "spendCost": true,
            "onUse": [
              {
                "op": "infinite_call"
              }
            ]
          }
        },
        {
          "module": "finalize",
          "params": {}
        }
      ],
      "reaction": {
        "timingCode": "BATTLE_START",
        "match": {
          "relation": "SELF_ALWAYS"
        },
        "note": "AP/SP+1，下次恢復-1"
      },
      "oncePerBattle": true,
      "castablePassive": true
    },
    {
      "key": "通用戰技:捨戰求避",
      "name": "捨戰求避",
      "source": "通用戰技",
      "category": "common",
      "level": 15,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "迴避+50%，造成的傷害-50%",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    },
    {
      "key": "通用戰技:蓄力強化",
      "name": "蓄力強化",
      "source": "通用戰技",
      "category": "common",
      "level": 15,
      "timing": "被動",
      "cost": "無",
      "weapon": "所有",
      "effect": "處於蓄力狀態時，自動格擋所有攻擊",
      "actionCode": "PASSIVE",
      "targetCode": "SELF",
      "manual": false,
      "needsRoll": false,
      "skillKind": "passive",
      "pipeline": [
        {
          "module": "finalize",
          "params": {}
        }
      ]
    }
  ]
};
