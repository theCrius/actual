# Tink Integration Plan

This document outlines the implementation plan for integrating Tink as a new bank sync provider in Actual Budget.

## Overview

Tink is a European open banking platform that provides access to bank account data and transactions. This integration will add Tink as a fourth sync provider alongside GoCardless, SimpleFIN, and Pluggy.ai.

**Documentation**: https://docs.tink.com/resources/transactions/continuous-connect-to-a-bank-account

## Architecture Summary

Actual Budget uses a two-layer architecture for bank synchronization:

1. **Sync Server Layer** (`packages/sync-server/src/`) - Backend microservice handling API credentials and bank connections
2. **Client/Core Layer** (`packages/loot-core/src/server/accounts/`) - Transaction reconciliation, account linking, UI/API handlers

## Implementation Plan

### 1. Sync Server Layer (Backend API Integration)

**New directory**: `packages/sync-server/src/app-tink/`

#### Files to create:

**`app-tink.ts`** - Express router with endpoints:
- `POST /tink/status` - Check if Tink credentials are configured
- `POST /tink/create-link` - Initialize Tink Link for bank authorization
- `POST /tink/accounts` - Fetch linked bank accounts
- `POST /tink/transactions` - Fetch transactions for a specific account

**`tink-service.ts`** - Tink API wrapper using their SDK or HTTPS client
- Authentication with OAuth 2.0 (client credentials or authorization code flow)
- Transaction fetching with pagination support
- Account balance retrieval

**`tink-normalizer.ts`** - Transform Tink transaction format to `BankSyncTransaction` format
- Map Tink's transaction schema to Actual Budget's internal format
- Handle date formats (ISO 8601)
- Convert amount representation (cents vs decimal)
- Distinguish pending vs booked transactions
- Handle currency conversion

**Dependencies**: Add Tink's official SDK to `packages/sync-server/package.json`

### 2. Secrets Management

**Update**: [packages/sync-server/src/services/secrets-service.js](packages/sync-server/src/services/secrets-service.js)

Add to `SecretName` object:
```typescript
export const SecretName = {
  // ... existing secrets
  tink_clientId: 'tink_clientId',
  tink_clientSecret: 'tink_clientSecret',
  tink_market: 'tink_market', // e.g., 'SE', 'GB', 'DE'
};
```

### 3. Server Routing

**Update**: [packages/sync-server/src/app.ts](packages/sync-server/src/app.ts)

Add Tink router:
```typescript
import * as tinkApp from './app-tink/app-tink';
app.use('/tink', tinkApp.handlers);
```

### 4. Core Layer Integration (Transaction Processing)

**Update**: [packages/loot-core/src/server/accounts/sync.ts](packages/loot-core/src/server/accounts/sync.ts)
- Add `downloadTinkTransactions()` function
- Add case for `account_sync_source === 'tink'` in sync logic

**Update**: [packages/loot-core/src/server/accounts/app.ts](packages/loot-core/src/server/accounts/app.ts)
- Add `linkTinkAccount()` handler
- Add Tink-specific RPC methods:
  - `'tink-create-link'`
  - `'tink-get-accounts'`
  - `'tink-status'`

**Update**: [packages/loot-core/src/server/server-config.ts](packages/loot-core/src/server/server-config.ts)
```typescript
TINK_SERVER: joinURL(url, '/tink'),
```

### 5. Type Definitions

**Create**: [packages/loot-core/src/types/models/tink.ts](packages/loot-core/src/types/models/tink.ts)
- Define Tink-specific TypeScript types
- Include types for accounts, transactions, connections, and API responses

**Update**: [packages/loot-core/src/types/models/bank-sync.ts](packages/loot-core/src/types/models/bank-sync.ts)
```typescript
export const BankSyncProviders = ['goCardless', 'simpleFin', 'pluggyai', 'tink'] as const;
```

### 6. Desktop Client UI

**Update**: [packages/desktop-client/src/components/banksync/index.tsx](packages/desktop-client/src/components/banksync/index.tsx)
```typescript
const syncSourceReadable = {
  goCardless: 'GoCardless',
  simpleFin: 'SimpleFIN',
  pluggyai: 'Pluggy.ai',
  tink: 'Tink',
  unlinked: t('Unlinked'),
};
```

**Potentially create**: Settings page for Tink configuration where users enter their Tink API credentials
- Component for entering client ID and client secret
- Market selection dropdown
- Test connection functionality

### 7. Database Schema

**No changes needed** - The existing schema supports the integration:

The `accounts` table already has:
- `account_sync_source` - will store `'tink'`
- `account_id` - will store Tink's account identifier
- `bank` - references to `banks` table for the Tink connection

The `banks` table already has:
- `id` - primary key
- `bank_id` - will store Tink's connection/requisition ID
- `name` - institution name

### 8. Testing

**Create**: `packages/sync-server/src/app-tink/tests/`
- Mock Tink API responses
- Test transaction normalization
- Test error handling (expired tokens, API errors)
- Test authentication flow
- Test pagination for large transaction sets

**Update**: Existing test suites to include Tink in integration tests

## Key Technical Considerations

### 1. Authentication Flow
Tink uses OAuth 2.0 with a redirect-based authorization flow (Tink Link), which differs from GoCardless's web token approach. Implementation needs to:
- Handle the redirect URL properly
- Store and refresh OAuth tokens
- Manage token expiration and renewal

### 2. Transaction Format Mapping
Map Tink's transaction schema to the `BankSyncTransaction` type:
- **Date formats**: ISO 8601 conversion
- **Amount representation**: Convert to integer cents (e.g., 12030 = $120.30)
- **Transaction status**: Map pending vs booked transactions to `booked` boolean
- **Currency handling**: Store and convert multi-currency transactions
- **Unique IDs**: Use Tink's transaction IDs for deduplication

### 3. Continuous Sync
Tink supports webhook notifications for new transactions. Consider:
- Adding webhook endpoint support in the sync server
- Implementing real-time transaction updates
- Handling webhook authentication and verification

### 4. Market-Specific Logic
Tink operates in different markets (UK, EU, etc.) with potentially different data formats. May need:
- Market-specific normalizers (similar to GoCardless's bank factory pattern)
- Region-specific date/currency handling
- Locale-specific institution listings

### 5. Error Handling
Implement robust error handling for:
- Expired or invalid OAuth tokens
- Rate limiting from Tink API
- Network failures
- Invalid account states
- Missing or incomplete transaction data

## Data Flow

```
1. User Configures Tink Credentials
   ↓ (Client ID, Secret, Market)
2. User Initiates Bank Connection
   ↓ (Creates Tink Link session)
3. OAuth Redirect to Tink
   ↓ (User authorizes bank access)
4. Callback with Authorization Code
   ↓ (Exchange for access token)
5. Account/Bank Record Created
   ↓ (Store connection details)
6. Initial Sync Triggered
   ↓
7. Sync Server Fetches Transactions via Tink API
   ↓
8. Transactions Normalized to BankSyncTransaction Format
   ↓
9. Reconciliation & Matching Against Existing Transactions
   ↓
10. Database Update & UI Notification
```

## Transaction Data Model Mapping

### Tink Transaction Format (Input)
Based on Tink API documentation, transactions typically include:
- `id` - Unique transaction identifier
- `accountId` - Associated account ID
- `amount` - Transaction amount with currency
- `currency` - ISO 4217 currency code
- `date` - Transaction date
- `description` - Transaction description
- `status` - PENDING or BOOKED
- `category` - Transaction category
- `merchant` - Merchant information

### BankSyncTransaction Format (Target)
From [packages/loot-core/src/types/models/bank-sync.ts](packages/loot-core/src/types/models/bank-sync.ts):
```typescript
type BankSyncTransaction = {
  transactionId?: string;
  date: string;                    // YYYY-MM-DD
  payeeName: string;
  notes?: string;
  booked: boolean;                // cleared vs pending
  transactionAmount: {
    amount: number;                // decimal
    currency: string;
  };
  balanceAfterTransaction?: {...};
}
```

### ImportTransactionEntity Format (Final)
From [packages/loot-core/src/types/models/import-transaction.ts](packages/loot-core/src/types/models/import-transaction.ts):
```typescript
type ImportTransactionEntity = {
  account: string;                 // Account ID
  date: string;                    // YYYY-MM-DD
  amount?: number;                 // Integer cents (e.g., 12030 = $120.30)
  payee_name?: string;
  imported_payee?: string;         // Raw description
  imported_id?: string;            // Unique transaction ID
  cleared?: boolean;
  notes?: string;
  category?: string;
}
```

## Reference Implementation Files

**Simplest reference**: [packages/sync-server/src/app-pluggyai/](packages/sync-server/src/app-pluggyai/)
- Good starting point for basic provider implementation
- Clean, straightforward structure

**Most comprehensive**: [packages/sync-server/src/app-gocardless/](packages/sync-server/src/app-gocardless/)
- Bank factory pattern for institution-specific normalizers
- 60+ individual bank implementations
- Complex but well-documented

**Core sync logic**: [packages/loot-core/src/server/accounts/sync.ts](packages/loot-core/src/server/accounts/sync.ts)
- Transaction sync orchestration
- Reconciliation logic
- Provider integration points

## Implementation Phases

### Phase 1: Basic Infrastructure
1. Create app-tink directory structure
2. Implement secrets management for Tink credentials
3. Set up Express routing
4. Create basic Tink service with authentication

### Phase 2: Account Linking
1. Implement Tink Link authorization flow
2. Create account fetching endpoint
3. Add account linking handler in core layer
4. Update type definitions

### Phase 3: Transaction Sync
1. Implement transaction fetching from Tink API
2. Create transaction normalizer
3. Integrate with core sync logic
4. Add reconciliation support

### Phase 4: UI Integration
1. Update banksync components
2. Add Tink configuration settings page
3. Add Tink to sync source displays
4. Implement connection status indicators

### Phase 5: Testing & Polish
1. Write comprehensive test suite
2. Test with multiple markets/regions
3. Error handling and edge cases
4. Documentation and user guides

## Next Steps

1. Research Tink API documentation in detail
2. Determine which Tink SDK/library to use
3. Set up Tink developer account and test credentials
4. Begin Phase 1 implementation

## Notes & Questions

- **SDK Choice**: Need to determine official Tink SDK for Node.js or whether to use direct HTTPS
- **Webhook Support**: Should we implement webhook support in initial version or defer to later?
- **Market Coverage**: Which markets should we prioritize for initial release?
- **Token Storage**: How should we securely store and refresh OAuth tokens?
- **Rate Limiting**: What are Tink's API rate limits and how should we handle them?

## Resources

- Tink API Documentation: https://docs.tink.com/resources/transactions/continuous-connect-to-a-bank-account
- Existing sync providers in codebase:
  - GoCardless: `packages/sync-server/src/app-gocardless/`
  - SimpleFIN: `packages/sync-server/src/app-simplefin/`
  - Pluggy.ai: `packages/sync-server/src/app-pluggyai/`
