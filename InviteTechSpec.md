# Technical Spec: Safety Net Invite Function 

## 1. Background

**Problem Statement:**
Currently, all participants must be declared at Safety Net creation, which is friction for organizers who want to start a breadfund and invite others progressively. The first proposal (on-chain stored invites) leaked discoverable data. A later proposal added counters and Merkle allowlists but was unnecessarily complex for the core use case.

**Solution:**
Use a **simple EIP-712 signed invite**: the Safety Net owner signs a message off-chain (fund ID, nonce, optional expiry). Anyone holding the signature can redeem it once to join the fund. No discoverability.

**Stakeholders:**
Fund owners, prospective members, Breadchain maintainers, UI developers.

---

## 2. Motivation

**Goals:**

* Allow progressive onboarding.
* Keep invites private until redeemed.
* Enforce single-use via nonce tracking.
* Keep implementation lean and auditable for the MVP.

**Non-Goals:**

* Multi-use or allowlist invites (can be added later).
* Global counter revocation.

---

## 3. Flow

### 3.1 Main Path

1. **Owner signs invite** off-chain: `(fundId, nonce, deadline)`.
2. **Invite is shared** (link or QR containing struct + signature).
3. **User calls `redeemInvite(inv, sig)`**.

   * Contract checks:
      * Invite not expired.
      * Nonce not used before.
      * Signature matches fund owner.
      * Marks nonce used.
      * Adds user as member.
      * Emits `InviteRedeemed`.

### 3.2 Error Paths

| Condition             | Revert Reason         |
| --------------------- | --------------------- |
| Nonce already used    | `Invite already used` |
| Deadline passed       | `Invite expired`      |
| Wrong signer          | `Invalid signer`      |
| Caller already member | `Already member`      |

---

## 4. Data Model

```solidity
struct Invite {
    uint256 fundId;
    uint256 nonce;
    uint48  deadline; // 0 = no expiry (?)
}
```

### Additional storage needed in the contract

```solidity
mapping(uint256 => mapping(uint256 => bool)) public usedNonces;
```

---

## 5. Contract API

### Function: `redeemInvite`

```solidity
function redeemInvite(Invite calldata inv, bytes calldata sig) external;
```

**Checks:**

* `!usedNonces[inv.fundId][inv.nonce]`
* `block.timestamp <= deadline` (if set)
* `ECDSA.recover(inviteDigest, sig) == ownerOf[fundId]`
* `!isMember[fundId][msg.sender]`

**Effects:**

* Marks nonce used.
* Adds caller as member.
* Emits `InviteRedeemed`.

### Event

```solidity
event InviteRedeemed(uint256 indexed fundId, address indexed redeemer, uint256 nonce);
```

---

## 6. Security

* **No on-chain discoverability:** invites exist only as off-chain signatures.
* **Replay protection:** each invite has a unique `nonce`, enforced once.
* **Expiry:** optional `deadline` caps lifetime.
* **Signature domain binding:** EIP-712 domain separator (contract + chainId) prevents cross-chain replay.

---

## 7. Example Link Format

Off-chain, the signed invite is packaged into a URL:

```
/join?fundId=1&nonce=42&deadline=1700000000&sig=0x...
```

The frontend decodes the query, reconstructs the `Invite`, and calls `redeemInvite`.

---

## 8. Open Questions

* Should fund owners be able to **invalidate unused invites** (e.g. via counter like @bagelface said) in the MVP?
* Should invites be **transferable** (redeemed by someone other than the original recipient)?

---
