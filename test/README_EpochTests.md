# Epoch Functionality Tests

This document describes the comprehensive test suite for the epoch/round functionality implemented in the Breadfund contract.

## Test File: `BreadfundEpochTest.sol`

### Test Coverage

#### ✅ **Core Epoch Calculation Tests**
- `testGetCurrentEpochIndex()` - Verifies epoch calculation based on time elapsed
- `testBoundaryConditions()` - Tests epoch transitions at exact boundaries
- `testLongRunningEpochs()` - Tests epoch calculation over extended periods

#### ✅ **Deposit Tracking Tests**  
- `testMemberDepositInCurrentEpoch()` - Verifies individual member deposit tracking
- `testDuplicateDepositPrevention()` - Ensures members can't deposit twice per epoch
- `testDepositInDifferentEpochs()` - Confirms members can deposit in different epochs

#### ✅ **Epoch Completion Tests**
- `testEpochCompletionEvent()` - Verifies `EpochCompleted` event emission
- `testPartialEpochCompletion()` - Tests incomplete epochs (not all members deposited)

#### ✅ **Historical Verification Tests**
- `testHasAllMembersDepositedForAllEpochs_SingleEpoch()` - Single epoch completion check
- `testHasAllMembersDepositedForAllEpochs_MultipleEpochs()` - Multi-epoch verification
- `testHasAllMembersDepositedForAllEpochs_SkippedEpoch()` - Detects missed epochs

#### ✅ **Edge Case Tests**
- `testEpochIndexBeforeBreadfundStart()` - Behavior before breadfund activation
- `testInvalidBreadfundId()` - Handling of non-existent breadfunds
- `testDepositBeforeBreadfundStart()` - Deposit prevention before start time

## Key Test Scenarios

### Scenario 1: Normal Epoch Progression
```solidity
// All members deposit in epoch 0 -> EpochCompleted event
// Time advances to epoch 1 -> hasAllMembersDepositedForAllEpochs() returns false
// All members deposit in epoch 1 -> hasAllMembersDepositedForAllEpochs() returns true
```

### Scenario 2: Skipped Epoch Detection
```solidity
// All members deposit in epoch 0
// Time jumps to epoch 2 (skip epoch 1)
// Even if all deposit in epoch 2, hasAllMembersDepositedForAllEpochs() returns false
```

### Scenario 3: Duplicate Deposit Prevention
```solidity
// Member deposits in current epoch -> Success
// Same member tries to deposit again -> AlreadyDeposited error
// Time advances to next epoch -> Member can deposit again
```

## Test Parameters

- **Epoch Duration**: 1 day
- **Members**: 3 test addresses
- **Initial Deposit**: 1000 tokens
- **Fixed Deposit**: 100 tokens  
- **Member Deposit**: 500 tokens

## Expected Results

All tests should pass, confirming:

1. **Epoch Calculation**: Accurate time-based epoch indexing
2. **Deposit Tracking**: Per-member, per-epoch deposit recording
3. **Completion Detection**: Event emission when all members participate
4. **Historical Verification**: Complete participation tracking across all epochs
5. **Error Handling**: Proper rejection of invalid operations

## Usage

Run tests with:
```bash
forge test --match-contract BreadfundEpochTest -v
```

Note: Tests require OpenZeppelin dependencies to be installed for full compilation.