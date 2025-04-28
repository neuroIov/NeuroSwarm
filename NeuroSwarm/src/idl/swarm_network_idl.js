// This file exports the exact same IDL as the JSON file
// but in a format that Vite can process without JSON parsing errors
export default {
  "version": "0.1.0",
  "name": "swarm_network",
  "instructions": [
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "authority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "type": "string",
                "value": "state"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "type": "string",
                "value": "token_mint"
              }
            ]
          }
        },
        {
          "name": "rewardPool",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "type": "string",
                "value": "reward_pool"
              }
            ]
          }
        },
        {
          "name": "stakePool",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "type": "string",
                "value": "stake_pool"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bump",
          "type": "u8"
        },
        {
          "name": "decimals",
          "type": "u8"
        }
      ]
    },
    {
      "name": "registerDevice",
      "discriminator": [
        242,
        201,
        142,
        137,
        192,
        235,
        157,
        148
      ],
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "device",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "gpuModel",
          "type": "string"
        },
        {
          "name": "vram",
          "type": "u64"
        },
        {
          "name": "hashRate",
          "type": "u64"
        },
        {
          "name": "referrer",
          "type": {
            "option": "publicKey"
          }
        }
      ]
    },
    {
      "name": "createTask",
      "discriminator": [
        157,
        12,
        87,
        33,
        146,
        11,
        89,
        172
      ],
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "task",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "taskId",
          "type": "string"
        },
        {
          "name": "requirements",
          "type": {
            "defined": "TaskRequirements"
          }
        }
      ]
    },
    {
      "name": "assignTask",
      "discriminator": [
        198,
        89,
        123,
        45,
        211,
        178,
        34,
        156
      ],
      "accounts": [
        {
          "name": "task",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "device",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "completeTask",
      "discriminator": [
        167,
        122,
        98,
        156,
        201,
        45,
        123,
        78
      ],
      "accounts": [
        {
          "name": "task",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "result",
          "type": {
            "defined": "TaskResult"
          }
        }
      ]
    },
    {
      "name": "distributeReward",
      "discriminator": [
        211,
        67,
        156,
        98,
        178,
        123,
        45,
        89
      ],
      "accounts": [
        {
          "name": "authority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "rewardPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "deviceOwner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "device",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "state",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "referrerAccount",
          "isMut": true,
          "isSigner": false,
          "isOptional": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateDeviceStatus",
      "discriminator": [
        145,
        78,
        156,
        89,
        211,
        67,
        98,
        123
      ],
      "accounts": [
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "device",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "isActive",
          "type": "bool"
        }
      ]
    },
    {
      "name": "stakeTokens",
      "discriminator": [
        178,
        98,
        211,
        67,
        145,
        78,
        156,
        89
      ],
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "device",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "stakePool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "state",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimReferralRewards",
      "discriminator": [
        156,
        89,
        178,
        98,
        211,
        67,
        145,
        78
      ],
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "device",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rewardPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "state",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ],
  "types": [
    {
      "name": "TaskRequirements",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "minVram",
            "type": "u64"
          },
          {
            "name": "minHashRate",
            "type": "u64"
          },
          {
            "name": "minStake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "TaskResult",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "success",
            "type": "bool"
          },
          {
            "name": "computeTime",
            "type": "u64"
          },
          {
            "name": "hashRate",
            "type": "u64"
          },
          {
            "name": "signature",
            "type": "string"
          }
        ]
      }
    }
  ],
  "accounts": [
    {
      "name": "State",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "publicKey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "tokenMint",
            "type": "publicKey"
          },
          {
            "name": "rewardPool",
            "type": "publicKey"
          },
          {
            "name": "stakePool",
            "type": "publicKey"
          },
          {
            "name": "totalStaked",
            "type": "u64"
          },
          {
            "name": "totalRewardsDistributed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Device",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "publicKey"
          },
          {
            "name": "gpuModel",
            "type": "string"
          },
          {
            "name": "vram",
            "type": "u64"
          },
          {
            "name": "hashRate",
            "type": "u64"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "lastActive",
            "type": "u64"
          },
          {
            "name": "totalRewards",
            "type": "u64"
          },
          {
            "name": "referrer",
            "type": {
              "option": "publicKey"
            }
          },
          {
            "name": "referralRewards",
            "type": "u64"
          },
          {
            "name": "stakedAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Task",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "publicKey"
          },
          {
            "name": "taskId",
            "type": "string"
          },
          {
            "name": "requirements",
            "type": {
              "defined": "TaskRequirements"
            }
          },
          {
            "name": "assignedDevice",
            "type": {
              "option": "publicKey"
            }
          },
          {
            "name": "status",
            "type": "string"
          },
          {
            "name": "startTime",
            "type": "u64"
          },
          {
            "name": "endTime",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "result",
            "type": {
              "option": {
                "defined": "TaskResult"
              }
            }
          },
          {
            "name": "rewardAmount",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidStringLength",
      "msg": "String length exceeds maximum allowed size"
    },
    {
      "code": 6001,
      "name": "NoRewardsToClaim",
      "msg": "No rewards available to claim"
    },
    {
      "code": 6002,
      "name": "InvalidStakePool",
      "msg": "Invalid stake pool account"
    }
  ]
};
