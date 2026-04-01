export const safetyNetAbi = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "DAYS_IN_A_MONTH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAXIMUM_REDEEM_RATIO",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MINIMUM_REDEEM_RATIO",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allowedTokens",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "status",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "contest",
    "inputs": [
      {
        "name": "_requestId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "create",
    "inputs": [
      {
        "name": "_safetyNet",
        "type": "tuple",
        "internalType": "struct ISafetyNet.SafetyNet",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "minimumMembers",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maximumMembers",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "consensusThreshold",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "safetyNetStart",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "members",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "initialDeposit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fixedDeposit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "redeemRatio",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "autoThreshold",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "contestWindow",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "votingWindow",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "epochDuration",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "smallWithdrawsLimit",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "_id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createRequest",
    "inputs": [
      {
        "name": "_request",
        "type": "tuple",
        "internalType": "struct ISafetyNet.Request",
        "components": [
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "safetyNetId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "timestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "yesVotes",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "noVotes",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "decommission",
    "inputs": [
      {
        "name": "_id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {
        "name": "_id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "depositFor",
    "inputs": [
      {
        "name": "_id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_value",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_member",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "duesRemainingThisEpoch",
    "inputs": [
      {
        "name": "_id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_member",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "epochMemberDepositedAmount",
    "inputs": [
      {
        "name": "safetyNetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "epochIndex",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "member",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeContestedWithdrawal",
    "inputs": [
      {
        "name": "_idRequest",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getCurrentEpochIndex",
    "inputs": [
      {
        "name": "_safetyNetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMemberBalances",
    "inputs": [
      {
        "name": "_id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "_members",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "_balances",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMemberSafetyNets",
    "inputs": [
      {
        "name": "_member",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "_ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMembersNeedingDeposit",
    "inputs": [
      {
        "name": "_id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSafetyNet",
    "inputs": [
      {
        "name": "_id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "_safetyNet",
        "type": "tuple",
        "internalType": "struct ISafetyNet.SafetyNet",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "minimumMembers",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maximumMembers",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "consensusThreshold",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "safetyNetStart",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "members",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "initialDeposit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fixedDeposit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "redeemRatio",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "autoThreshold",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "contestWindow",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "votingWindow",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "epochDuration",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "smallWithdrawsLimit",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSafetyNets",
    "inputs": [
      {
        "name": "_ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "outputs": [
      {
        "name": "_safetyNets",
        "type": "tuple[]",
        "internalType": "struct ISafetyNet.SafetyNet[]",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "minimumMembers",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maximumMembers",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "consensusThreshold",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "safetyNetStart",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "members",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "initialDeposit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fixedDeposit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "redeemRatio",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "autoThreshold",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "contestWindow",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "votingWindow",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "epochDuration",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "smallWithdrawsLimit",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hasMemberDepositedInEpoch",
    "inputs": [
      {
        "name": "_safetyNetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_member",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_epochIndex",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "initialize",
    "inputs": [
      {
        "name": "_owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_allowedTokens",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "isContested",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "contested",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isDecommissionable",
    "inputs": [
      {
        "name": "_safetyNetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isExecuted",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "executed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isMember",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "member",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "status",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isTokenAllowed",
    "inputs": [
      {
        "name": "_token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "memberSafetyNets",
    "inputs": [
      {
        "name": "member",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "ids",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "memberWithdrawableBalance",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "member",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "withdrawableBalance",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextIdRequest",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "redeemInvite",
    "inputs": [
      {
        "name": "_invite",
        "type": "tuple",
        "internalType": "struct ISafetyNet.Invite",
        "components": [
          {
            "name": "safetyNetId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "_signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "requestVotes",
    "inputs": [
      {
        "name": "idReq",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "member",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "status",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "requests",
    "inputs": [
      {
        "name": "idReq",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "safetyNetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "yesVotes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "noVotes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "safetyNetBalance",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "safetyNetMemberContribute",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "member",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "monthlyContribute",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "safetyNets",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "minimumMembers",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maximumMembers",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "consensusThreshold",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "safetyNetStart",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "initialDeposit",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "fixedDeposit",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "redeemRatio",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "autoThreshold",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "contestWindow",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "votingWindow",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "epochDuration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "smallWithdrawsLimit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setTokenAllowed",
    "inputs": [
      {
        "name": "_token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_allowed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "smallWithdrawsCount",
    "inputs": [
      {
        "name": "safetyNetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "epochIndex",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "member",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "smallWithdrawsCount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "usedNonces",
    "inputs": [
      {
        "name": "safetyNetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "used",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vote",
    "inputs": [
      {
        "name": "_requestId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_vote",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [
      {
        "name": "_id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_daysRequested",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "FundsDeposited",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "member",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FundsWithdrawn",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "member",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Initialized",
    "inputs": [
      {
        "name": "version",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "InviteRedeemed",
    "inputs": [
      {
        "name": "safetyNetId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "redeemer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RequestCreated",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RequestEnded",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "yesVotes",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "noVotes",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SafetyNetCreated",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "minimumMembers",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maximumMembers",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "consensusThreshold",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "members",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "initialDeposit",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "fixedDeposit",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "redeemRatio",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "autoThreshold",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "epochDuration",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "smallWithdrawsLimit",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SafetyNetDecommissioned",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TokenAllowed",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "allowed",
        "type": "bool",
        "indexed": true,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Voted",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "voter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "vote",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawalApproved",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawalAutoExecuted",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawalContested",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawalPending",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyContested",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyDeposited",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyExecuted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyExists",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyMember",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyVoted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ContestWindowClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DepositBeforeSafetyNetStart",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DepositWindowClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuplicateMember",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignatureLength",
    "inputs": [
      {
        "name": "length",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignatureS",
    "inputs": [
      {
        "name": "s",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "ExceedsDepositAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExceedsSmallWithdrawalLimit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidCurrentIndex",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidDepositAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidEpochDuration",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidFixedDeposit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInitialDeposit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInitialization",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidMaxWithdraws",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidMaximumMembers",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidMemberAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidMinimumMembers",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidRatio",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidRequest",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSafetyNet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSafetyNetStartTime",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSigner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSmallWithdrawalLimit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSmallWithdrawsLimit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidThreshold",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InviteAlreadyUsed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAllVoted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotCommissioned",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotDecommissionable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotInitializing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotMember",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotWithdrawable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafetyNetExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafetyNetFull",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TokenNotAllowed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "VotingWindowClosed",
    "inputs": []
  }
] as const;
