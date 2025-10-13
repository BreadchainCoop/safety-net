# Invite Generator Utility

## Overview

The `InviteGenerator` is a Solidity utility contract for generating cryptographic signatures that allow new members to join Safety Nets after their start. It uses EIP-712 signature format to create secure, single-use invites.

## Usage

### Importing the Utility

```solidity
import "./InviteGenerator.sol";

InviteGenerator inviteGenerator = new InviteGenerator();
```

### Generating a Single Invite

```solidity
uint256 creatorPrivateKey = 0xYourPrivateKey; // Keep this secret!
uint256 safetyNetId = 1;
uint256 nonce = 1;
address safetyNetContract = address(0xSafetyNetProxy),

bytes memory signature = inviteGenerator.generateInvite(
    creatorPrivateKey,
    safetyNetId,
    nonce,
    safetyNetContract
);
```

### Generating Multiple Invites

```solidity
uint256[] memory nonces = new uint256[](3);
nonces[0] = 1;
nonces[1] = 2;
nonces[2] = 3;
address redeemer = address(0);
address safetyNetContract = address(0xSafetyNetProxy);

bytes[] memory signatures = inviteGenerator.generateInvites(
    creatorPrivateKey,
    safetyNetId,
    nonces,
    redeemer,
    safetyNetContract
);
```

### Using the Invite to Join a Safety Net

Once you have a signature, share it with the person you want to invite:

```solidity
SafetyNet.Invite memory invite = SafetyNet.Invite({
    safetyNetId: safetyNetId,
    nonce: nonce,
});

safetyNet.redeemInvite(invite, signature);
```

## Important Notes

### Security Considerations

1. **Private Key Protection**: Never expose your private key. This utility is meant for testing and script usage, not production key management.

2. **Nonce Uniqueness**: Each nonce can only be used once. After a member joins using a nonce, that nonce is marked as used and cannot be reused.

3. **Fund Specificity**: Signatures are bound to a specific Safety Net ID and verifying contract. A signature for fund `1` cannot be used for fund `2` or a different contract instance.

4. **Creator Verification**: Only signatures from the Safety Net owner are valid. The contract checks the recovered signer matches the owner stored on-chain.

### Best Practices

1. **Sequential Nonces**: Use sequential nonces (1, 2, 3...) for easier tracking.

2. **Secure Distribution**: Share invites (`safetyNetId`, nonce, signature) through secure channels.

3. **Batch Generation**: When onboarding multiple members, generate all invites at once using `generateInvites()` for efficiency.

## Helper Functions

### Get Address from Private Key

```solidity
address creatorAddress = inviteGenerator.addressFromPrivateKey(creatorPrivateKey);
```

This helps verify which address corresponds to a private key before generating invites.

## Example: Complete Invite Flow

```solidity
// 1. Owner creates a Safety Net (not shown) and obtains its ID and contract address
uint256 safetyNetId = 1;
address safetyNetContract = address(0xSafetyNetProxy);

// 2. Owner generates invites for 3 new members
uint256[] memory nonces = new uint256[](3);
nonces[0] = 1;
nonces[1] = 2;
nonces[2] = 3;

bytes[] memory invites = inviteGenerator.generateInvites(
    creatorPrivateKey,
    safetyNetId,
    nonces,
    safetyNetContract
);

// 3. Share invite data with each member:
//    - Member 1: safetyNetId, nonces[0], invites[0]
//    - Member 2: safetyNetId, nonces[1], invites[1]
//    - Member 3: safetyNetId, nonces[2], invites[2]

// 4. Each member redeems their invite on-chain
safetyNet.redeemInvite(
    SafetyNet.Invite({safetyNetId: safetyNetId, nonce: nonces[0]}),
    invites[0]
);
```

## Testing

When applicable, add or run Foundry tests (e.g. `test/InviteGenerator.t.sol`):

```bash
forge test --match-contract InviteGeneratorTest -vv
```

Tests cover:
- Single invite generation
- Batch invite generation
- Invalid signer rejection
- Nonce reuse prevention
- Safety Net-specific validation
- Address derivation
- Message hash format verification
