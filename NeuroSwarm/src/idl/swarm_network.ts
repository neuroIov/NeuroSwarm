import { Idl } from '@project-serum/anchor';

export const SwarmNetwork: Idl = {
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
  "version": "0.1.0",
  "name": "swarm_network",
  "instructions": [
    {
      "name": "initialize",
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
          "type": { "option": "publicKey" }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "state",
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
      "name": "device",
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
            "type": { "option": "publicKey" }
          },
          {
            "name": "referralRewards",
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
    }
  ]
} as const;

export default SwarmNetwork;
