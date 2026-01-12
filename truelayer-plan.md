# TrueLayer Integration Plan

This document outlines the implementation plan for integrating TrueLayer as a new bank sync provider in Actual Budget.

## Overview

TrueLayer is a European open banking platform that provides access to bank account data and transactions. This integration will add TrueLayer as a fourth sync provider alongside GoCardless, SimpleFIN, and Pluggy.ai.

**Key Benefits:**
- Standard OAuth 2.0 REST API (no frontend SDK required)
- Connects to 95%+ of European bank accounts
- Pure backend integration (matches existing provider patterns)
- Strong focus on data aggregation (perfect for transaction sync)
- Developer has prior positive experience with the platform

**Documentation**: https://docs.truelayer.com/docs/build-data-auth-links

## Why TrueLayer Over Tink

TrueLayer was chosen over Tink for these reasons:

1. **Simpler Architecture**: Pure REST API vs. SDK-required integration
2. **Pattern Match**: Follows same OAuth flow as GoCardless/SimpleFIN
3. **Lower Complexity**: 6-9 hour estimated implementation vs. 10-14 hours for Tink
4. **Developer Experience**: Team member has successfully used TrueLayer before
5. **Better Fit**: Focused on data aggregation (our exact use case)

See [tink-integration-plan.abandoned.md](tink-integration-plan.abandoned.md) for detailed comparison.

## Architecture Summary

Actual Budget uses a two-layer architecture for bank synchronization:

1. **Sync Server Layer** (`packages/sync-server/src/`) - Backend microservice handling API credentials and bank connections
2. **Client/Core Layer** (`packages/loot-core/src/server/accounts/`) - Transaction reconciliation, account linking, UI/API handlers

TrueLayer integration follows this pattern with pure backend OAuth flow.

## Implementation Plan

### 1. Sync Server Layer (Backend API Integration)

**New directory**: `packages/sync-server/src/app-truelayer/`

#### Files to create:

**`app-truelayer.js`** - Express router with endpoints:

- `POST /truelayer/status` - Check if TrueLayer credentials are configured
- `POST /truelayer/exchange` - Exchange authorization code for access token
- `POST /truelayer/accounts` - Fetch linked bank accounts
- `POST /truelayer/transactions` - Fetch transactions for a specific account

**`truelayer-service.js`** - TrueLayer API wrapper using HTTPS client

- OAuth 2.0 authorization URL generation
- Token exchange (authorization code → access/refresh tokens)
- Token refresh logic
- Account data fetching
- Transaction fetching with pagination support
- Balance retrieval

**`truelayer-normalizer.js`** - Transform TrueLayer transaction format to `BankSyncTransaction`

- Map TrueLayer's transaction schema to Actual Budget's internal format
- Handle date formats (ISO 8601 → YYYY-MM-DD)
- Convert amount representation to integer cents
- Map transaction status (pending vs completed)
- Handle currency codes
- Map payee/merchant information

**Dependencies**:
- Use built-in `https` or `node-fetch` (likely already available)
- No external SDK required

### 2. Secrets Management

**Update**: `packages/sync-server/src/services/secrets-service.js`

Add to secret definitions:

```javascript
// TrueLayer OAuth credentials
'truelayer_clientId',
'truelayer_clientSecret',
```

These are obtained from TrueLayer Console: https://console.truelayer.com/

### 3. Server Routing

**Update**: `packages/sync-server/src/app.ts`

Add TrueLayer router:

```typescript
import * as truelayerApp from './app-truelayer/app-truelayer';
app.use('/truelayer', truelayerApp.handlers);
```

### 4. Core Layer Integration (Transaction Processing)

**Update**: `packages/loot-core/src/server/accounts/sync.ts`

- Add `downloadTrueLayerTransactions()` function
- Add case for `account_sync_source === 'truelayer'` in sync logic

**Update**: `packages/loot-core/src/server/accounts/app.ts`

Add TrueLayer-specific RPC methods:
- `'truelayer-status'` - Check configuration status
- `'truelayer-authorize'` - Generate OAuth authorization URL
- `'truelayer-exchange'` - Exchange auth code for tokens
- `'truelayer-accounts'` - Fetch available accounts
- `'truelayer-accounts-link'` - Link account to Actual Budget

**Update**: `packages/loot-core/src/server/server-config.ts`

```typescript
TRUELAYER_SERVER: joinURL(url, '/truelayer'),
```

### 5. Type Definitions

**Create**: `packages/loot-core/src/types/models/truelayer.ts`

```typescript
import { type AccountEntity } from './account';
import { type BankSyncResponse } from './bank-sync';

export type TrueLayerAccount = {
  account_id: string;
  account_type: string;
  display_name: string;
  currency: string;
  account_number?: {
    iban?: string;
    number?: string;
    sort_code?: string;
  };
  provider?: {
    provider_id: string;
    display_name: string;
  };
};

export type TrueLayerBalance = {
  current: number;
  available?: number;
  currency: string;
  update_timestamp: string;
};

export type TrueLayerTransaction = {
  transaction_id: string;
  timestamp: string;
  description: string;
  amount: number;
  currency: string;
  transaction_type: string;
  transaction_category: string;
  merchant_name?: string;
  running_balance?: {
    amount: number;
    currency: string;
  };
};

export type TrueLayerBatchSyncResponse = {
  [accountId: NonNullable<AccountEntity['account_id']>]: BankSyncResponse;
};

export type SyncServerTrueLayerAccount = {
  balance: number;
  account_id: string;
  institution?: string;
  name: string;
  type?: string;
  official_name?: string;
};
```

**Update**: `packages/loot-core/src/types/models/index.ts`

```typescript
export type * from './truelayer';
```

**Update**: `packages/loot-core/src/types/models/bank-sync.ts`

```typescript
export const BankSyncProviders = [
  'goCardless',
  'simpleFin',
  'pluggyai',
  'truelayer',
] as const;
```

### 6. Desktop Client UI

**Create**: `packages/desktop-client/src/components/modals/TrueLayerInitialiseModal.tsx`

Modal for entering TrueLayer credentials:
- Client ID input field
- Client Secret input field
- Save button to store in secrets
- Link to TrueLayer Console for credential creation
- Validation and error handling

**Create**: `packages/desktop-client/src/hooks/useTrueLayerStatus.ts`

```typescript
import { useEffect, useState } from 'react';
import { send } from 'loot-core/platform/client/fetch';
import { useSyncServerStatus } from './useSyncServerStatus';

export function useTrueLayerStatus() {
  const [configuredTrueLayer, setConfiguredTrueLayer] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const status = useSyncServerStatus();

  useEffect(() => {
    async function fetch() {
      setIsLoading(true);
      const results = await send('truelayer-status');
      setConfiguredTrueLayer(results.configured || false);
      setIsLoading(false);
    }

    if (status === 'online') {
      fetch();
    }
  }, [status]);

  return {
    configuredTrueLayer,
    isLoading,
  };
}
```

**Update**: `packages/desktop-client/src/components/modals/CreateAccountModal.tsx`

Add TrueLayer integration:
- "Set up TrueLayer for bank sync" button when not configured
- "Link bank account with TrueLayer" button when configured
- Reset credentials menu option
- OAuth redirect flow handling

**Update**: `packages/desktop-client/src/components/modals/SelectLinkedAccountsModal.tsx`

Add support for TrueLayer account selection:
- Handle `syncSource: 'truelayer'` case
- Display TrueLayer account information
- Account type and institution display

**Update**: `packages/desktop-client/src/components/Modals.tsx`

Register the modal:
```typescript
import { TrueLayerInitialiseModal } from './modals/TrueLayerInitialiseModal';

// In modal switch:
case 'truelayer-init':
  return <TrueLayerInitialiseModal key={key} {...modal.options} />;
```

**Update**: `packages/desktop-client/src/modals/modalsSlice.ts`

Add modal type:
```typescript
type TrueLayerInitModalOptions = {
  onSuccess?: () => void;
};

// Add to Modal union:
| { name: 'truelayer-init'; options: TrueLayerInitModalOptions }
```

**Update**: Sync source displays

`packages/desktop-client/src/components/banksync/index.tsx`:
```typescript
const syncSourceReadable = {
  goCardless: 'GoCardless',
  simpleFin: 'SimpleFIN',
  pluggyai: 'Pluggy.ai',
  truelayer: 'TrueLayer',
  unlinked: t('Unlinked'),
};
```

Mobile sync source display:
`packages/mobile/src/components/accounts/AccountDetails.tsx`

### 7. State Management

**Update**: `packages/desktop-client/src/accounts/accountsSlice.ts`

Add Redux thunk action:
```typescript
export const linkAccountTrueLayer = createAsyncThunk(
  'accounts/linkAccountTrueLayer',
  async ({
    externalAccount,
    newAccountId,
  }: {
    externalAccount: SyncServerTrueLayerAccount;
    newAccountId: string;
  }) => {
    return send('truelayer-accounts-link', {
      accountId: newAccountId,
      truelayerAccountId: externalAccount.account_id,
      institutionName: externalAccount.institution || externalAccount.name,
      balance: externalAccount.balance,
    });
  },
);
```

### 8. Database Schema

**No changes needed** - Existing schema supports the integration:

`accounts` table:
- `account_sync_source` → stores `'truelayer'`
- `account_id` → stores TrueLayer account ID
- `bank` → references `banks` table

`banks` table:
- `id` → primary key
- `bank_id` → stores TrueLayer provider/connection ID
- `name` → institution name

## TrueLayer OAuth 2.0 Flow

TrueLayer uses standard OAuth 2.0 Authorization Code flow:

### 1. Authorization Request

Generate authorization URL and redirect user:

```
https://auth.truelayer.com/?
  response_type=code&
  client_id={CLIENT_ID}&
  scope=info accounts balance transactions offline_access&
  redirect_uri={REDIRECT_URI}&
  providers={PROVIDER_IDs}
```

**Scopes needed:**
- `info` - Basic account information
- `accounts` - Account details
- `balance` - Account balances
- `transactions` - Transaction history
- `offline_access` - Refresh token for continuous access

### 2. User Authorization

User is redirected to TrueLayer:
1. Selects their bank
2. Authenticates with banking credentials
3. Grants consent for data sharing

### 3. Callback & Token Exchange

TrueLayer redirects back with authorization code:

```
{REDIRECT_URI}?code={AUTHORIZATION_CODE}
```

Exchange code for tokens:

```bash
POST https://auth.truelayer.com/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
client_id={CLIENT_ID}&
client_secret={CLIENT_SECRET}&
redirect_uri={REDIRECT_URI}&
code={AUTHORIZATION_CODE}
```

Response:
```json
{
  "access_token": "...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "refresh_token": "...",
  "scope": "info accounts balance transactions offline_access"
}
```

### 4. Token Storage

Store tokens in `banks` table or secrets:
- `access_token` - For API requests (expires in 1 hour)
- `refresh_token` - For obtaining new access tokens (long-lived)

### 5. Token Refresh

When access token expires:

```bash
POST https://auth.truelayer.com/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
client_id={CLIENT_ID}&
client_secret={CLIENT_SECRET}&
refresh_token={REFRESH_TOKEN}
```

## Data Flow

```
1. User Opens CreateAccountModal
   ↓
2. Clicks "Set up TrueLayer" (if not configured)
   ↓ (Opens TrueLayerInitialiseModal)
3. Enters Client ID & Secret
   ↓ (Stored in secrets)
4. Clicks "Link bank account with TrueLayer"
   ↓
5. RPC call: 'truelayer-authorize'
   ↓ (Generates OAuth URL)
6. User Redirected to TrueLayer
   ↓ (Selects bank, authenticates, grants consent)
7. Callback with Authorization Code
   ↓
8. RPC call: 'truelayer-exchange'
   ↓ (Exchange code for access/refresh tokens)
9. RPC call: 'truelayer-accounts'
   ↓ (Fetch available accounts)
10. SelectLinkedAccountsModal Opens
    ↓ (User selects accounts to link)
11. RPC call: 'truelayer-accounts-link'
    ↓ (Create account in Actual Budget)
12. Bank & Account Records Created
    ↓
13. Initial Sync Triggered
    ↓
14. Sync Server Fetches Transactions via TrueLayer API
    ↓
15. Transactions Normalized to BankSyncTransaction Format
    ↓
16. Reconciliation & Matching
    ↓
17. Database Update & UI Notification
```

## Transaction Data Model Mapping

### TrueLayer Transaction Format (Input)

```json
{
  "transaction_id": "a6f4e8...",
  "timestamp": "2024-01-15T10:30:00Z",
  "description": "ACME CORP LONDON",
  "amount": -42.50,
  "currency": "GBP",
  "transaction_type": "DEBIT",
  "transaction_category": "PURCHASE",
  "merchant_name": "ACME Corp",
  "running_balance": {
    "amount": 1234.56,
    "currency": "GBP"
  }
}
```

### BankSyncTransaction Format (Target)

From `packages/loot-core/src/types/models/bank-sync.ts`:

```typescript
{
  transactionId: "a6f4e8...",
  date: "2024-01-15",              // ISO string → YYYY-MM-DD
  payeeName: "ACME Corp",          // merchant_name || description
  notes: "ACME CORP LONDON",       // description
  booked: true,                    // transaction_type !== "PENDING"
  transactionAmount: {
    amount: -42.50,                // decimal
    currency: "GBP"
  },
  balanceAfterTransaction: {
    amount: 1234.56,
    currency: "GBP"
  }
}
```

### ImportTransactionEntity Format (Final)

From `packages/loot-core/src/types/models/import-transaction.ts`:

```typescript
{
  account: "account-uuid",
  date: "2024-01-15",
  amount: -4250,                   // Integer cents: -42.50 * 100
  payee_name: "ACME Corp",
  imported_payee: "ACME CORP LONDON",
  imported_id: "a6f4e8...",
  cleared: true,
  notes: "ACME CORP LONDON"
}
```

### Normalizer Logic

```javascript
function normalizeTrueLayerTransaction(tlTransaction) {
  return {
    transactionId: tlTransaction.transaction_id,
    date: tlTransaction.timestamp.split('T')[0], // ISO → YYYY-MM-DD
    payeeName: tlTransaction.merchant_name || tlTransaction.description,
    notes: tlTransaction.description,
    booked: tlTransaction.transaction_type !== 'PENDING',
    transactionAmount: {
      amount: tlTransaction.amount,
      currency: tlTransaction.currency,
    },
    balanceAfterTransaction: tlTransaction.running_balance ? {
      amount: tlTransaction.running_balance.amount,
      currency: tlTransaction.running_balance.currency,
    } : undefined,
  };
}
```

## API Endpoints Reference

### Accounts API

**Get Accounts:**
```bash
GET https://api.truelayer.com/data/v1/accounts
Authorization: Bearer {ACCESS_TOKEN}
```

Response:
```json
{
  "results": [
    {
      "account_id": "abc123...",
      "account_type": "TRANSACTION",
      "display_name": "Current Account",
      "currency": "GBP",
      "account_number": {
        "iban": "GB...",
        "number": "12345678",
        "sort_code": "12-34-56"
      },
      "provider": {
        "provider_id": "uk-ob-all-...",
        "display_name": "HSBC"
      }
    }
  ]
}
```

**Get Account Balance:**
```bash
GET https://api.truelayer.com/data/v1/accounts/{ACCOUNT_ID}/balance
Authorization: Bearer {ACCESS_TOKEN}
```

Response:
```json
{
  "results": [
    {
      "current": 1234.56,
      "available": 1200.00,
      "currency": "GBP",
      "update_timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Transactions API

**Get Transactions:**
```bash
GET https://api.truelayer.com/data/v1/accounts/{ACCOUNT_ID}/transactions
Authorization: Bearer {ACCESS_TOKEN}
```

Query parameters:
- `from` - Start date (YYYY-MM-DD)
- `to` - End date (YYYY-MM-DD)

Response:
```json
{
  "results": [
    {
      "transaction_id": "a6f4e8...",
      "timestamp": "2024-01-15T10:30:00Z",
      "description": "ACME CORP LONDON",
      "amount": -42.50,
      "currency": "GBP",
      "transaction_type": "DEBIT",
      "transaction_category": "PURCHASE",
      "merchant_name": "ACME Corp",
      "running_balance": {
        "amount": 1234.56,
        "currency": "GBP"
      }
    }
  ]
}
```

**Pagination:**
TrueLayer uses cursor-based pagination with `next` token in response for additional pages.

## Implementation Phases

### Phase 1: Basic Infrastructure

**Estimated time: 2-3 hours**

1. Create `app-truelayer` directory structure
2. Implement secrets management for TrueLayer credentials
3. Set up Express routing
4. Create basic TrueLayer service with OAuth stubs
5. Add TrueLayer to provider type union

**Deliverables:**
- `packages/sync-server/src/app-truelayer/app-truelayer.js` - Express routes
- `packages/sync-server/src/app-truelayer/truelayer-service.js` - Service with OAuth flow
- Added `truelayer_clientId`, `truelayer_clientSecret` to secrets
- Wired `/truelayer` router into Express app
- Updated `BankSyncProviders` type

### Phase 2: Account Linking

**Estimated time: 2-3 hours**

1. Implement OAuth 2.0 authorization URL generation
2. Implement token exchange logic
3. Create account fetching endpoint
4. Add account linking handler in core layer
5. Update type definitions
6. Add UI components for TrueLayer initialization and account selection
7. Add state management for account linking

**Deliverables:**
- OAuth flow working end-to-end
- `truelayer-status` RPC handler
- `truelayer-authorize` RPC handler
- `truelayer-exchange` RPC handler
- `truelayer-accounts` RPC handler
- `truelayer-accounts-link` RPC handler
- TrueLayerInitialiseModal component
- useTrueLayerStatus hook
- CreateAccountModal integration
- SelectLinkedAccountsModal integration
- linkAccountTrueLayer Redux action

### Phase 3: Transaction Sync

**Estimated time: 2-3 hours**

1. Implement transaction fetching from TrueLayer API
2. Create transaction normalizer
3. Integrate with core sync logic
4. Add reconciliation support
5. Implement token refresh logic
6. Add pagination support for large transaction sets

**Deliverables:**
- `truelayer-normalizer.js` with transaction mapping
- `downloadTrueLayerTransactions()` in sync.ts
- Token refresh logic in service
- Pagination handling
- Error handling for expired tokens

### Phase 4: UI Integration & Polish

**Estimated time: 1-2 hours**

1. Update sync source displays (desktop & mobile)
2. Add connection status indicators
3. Add error state handling in UI
4. Add loading states during account fetching
5. Test OAuth redirect flow in desktop app
6. Add connection management UI (view/delete connections)

**Deliverables:**
- Updated sync source labels
- Error handling UI
- Loading states
- Connection management
- User-facing documentation

### Phase 5: Testing & Polish

**Estimated time: 1-2 hours**

1. Write comprehensive test suite
2. Test with multiple European banks
3. Error handling and edge cases
4. Multi-currency transaction testing
5. Token expiration/refresh testing
6. Documentation and user guides

**Deliverables:**
- Unit tests for normalizer
- Integration tests for OAuth flow
- Error scenario tests
- User documentation
- Setup guide for TrueLayer Console

## Reference Implementation Files

**Primary reference**: `packages/sync-server/src/app-simplefin/`
- SimpleFIN uses similar REST API pattern
- Token-based authentication (similar to TrueLayer's access tokens)
- Clean, straightforward structure

**Secondary reference**: `packages/sync-server/src/app-gocardless/`
- OAuth flow implementation
- Bank/institution handling
- Transaction normalization patterns

**Core sync logic**: `packages/loot-core/src/server/accounts/sync.ts`
- Transaction sync orchestration
- Reconciliation logic
- Provider integration points

## Key Technical Considerations

### 1. OAuth Redirect Handling

TrueLayer requires a redirect URI for OAuth callback. Options:

**Option A: Local HTTP server** (like GoCardless does)
- Start temporary local server on `http://localhost:PORT/callback`
- Register this URL in TrueLayer Console
- Listen for callback with authorization code
- Exchange code for tokens
- Shut down server

**Option B: Custom protocol handler**
- Register custom protocol (e.g., `actualbudget://oauth/callback`)
- Handle redirect in Electron app
- More seamless UX but requires protocol registration

**Recommendation**: Start with Option A (local server) as it matches GoCardless pattern.

### 2. Token Storage & Security

Tokens must be stored securely:
- `access_token` - Short-lived (1 hour), used for API requests
- `refresh_token` - Long-lived, used to obtain new access tokens

**Storage options:**
1. In `banks` table with bank record (current pattern for GoCardless)
2. In secrets service (more secure but harder to manage per-connection)

**Recommendation**: Store in `banks` table following existing pattern, encrypted at rest.

### 3. Token Refresh Strategy

Access tokens expire after 1 hour. Implement automatic refresh:

```javascript
async function makeAuthenticatedRequest(bankId, endpoint) {
  let tokens = await getTokensForBank(bankId);

  // Check if token is expired or near expiration
  if (isTokenExpired(tokens.access_token)) {
    tokens = await refreshAccessToken(tokens.refresh_token);
    await saveTokensForBank(bankId, tokens);
  }

  return fetch(endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
}
```

### 4. Error Handling

Implement robust error handling for:

- **OAuth errors**: Invalid client credentials, user denies access
- **Token errors**: Expired tokens, invalid refresh token
- **API errors**: Rate limiting, temporary outages, invalid account
- **Network errors**: Timeouts, DNS failures
- **Data errors**: Missing fields, unexpected formats

### 5. Rate Limiting

TrueLayer has API rate limits. Implement:
- Exponential backoff for rate limit errors
- Request queuing to avoid hitting limits
- Caching of account data where appropriate

### 6. Multi-Currency Support

TrueLayer supports accounts in different currencies:
- Store currency with each transaction
- Display currency in UI
- Handle currency conversion if needed for reporting

### 7. Webhook Support (Future Enhancement)

TrueLayer supports webhooks for real-time transaction updates:
- Requires public endpoint for webhook delivery
- Needs webhook signature verification
- Consider for v2 implementation

## Testing Strategy

### Unit Tests

Test transaction normalizer:
- Various transaction types (DEBIT, CREDIT, PENDING)
- Different date formats
- Missing optional fields
- Multi-currency transactions
- Edge cases (zero amounts, missing merchant names)

### Integration Tests

Test OAuth flow:
- Authorization URL generation
- Token exchange
- Token refresh
- Error handling (invalid code, expired refresh token)

Test API integration:
- Account fetching
- Balance retrieval
- Transaction fetching
- Pagination handling

### Manual Testing

Test with real banks:
- UK banks (HSBC, Barclays, Lloyds, etc.)
- EU banks (various countries)
- Different account types (current, savings, credit)
- Multi-currency accounts
- Test edge cases (accounts with no transactions, very old accounts)

## Security Considerations

1. **Client Secret Storage**: Store in secrets service, never commit to repo
2. **Token Encryption**: Encrypt tokens at rest in database
3. **HTTPS Only**: All API communication over HTTPS
4. **Redirect URI Validation**: Validate OAuth callback to prevent CSRF
5. **State Parameter**: Use OAuth state parameter to prevent CSRF attacks
6. **Token Scope**: Request minimum necessary scopes
7. **Token Expiration**: Implement proper token lifecycle management

## Migration from Tink

Since Tink integration was 50% complete, many patterns can be reused:

### Components to Rename/Adapt

1. **TinkInitialiseModal** → **TrueLayerInitialiseModal**
   - Change from 3 fields (clientId, clientSecret, market) to 2 (clientId, clientSecret)
   - Update links to TrueLayer Console
   - Update text/translations

2. **useTinkStatus** → **useTrueLayerStatus**
   - Change RPC call from 'tink-status' to 'truelayer-status'

3. **CreateAccountModal Tink integration** → **TrueLayer integration**
   - Rename functions: `onConnectTink` → `onConnectTrueLayer`
   - Update RPC calls
   - Update button text

4. **Type definitions**
   - Rename `tink.ts` → `truelayer.ts`
   - Adapt types to TrueLayer API schema
   - Update provider union

5. **RPC Handlers**
   - Rename handlers (tink-* → truelayer-*)
   - Update implementation to use TrueLayer API

### New Components (Not in Tink)

1. OAuth redirect handling (Tink used SDK, TrueLayer uses standard OAuth)
2. Token exchange endpoint
3. Token refresh logic

## Next Steps

1. Set up TrueLayer developer account at https://console.truelayer.com/
2. Obtain test credentials (Client ID, Client Secret)
3. Test TrueLayer API in sandbox environment
4. Begin Phase 1 implementation
5. Reuse Tink UI components (rename and adapt)
6. Implement OAuth flow
7. Test with real bank accounts

## Resources

- **TrueLayer Documentation**: https://docs.truelayer.com/
  - Auth Links: https://docs.truelayer.com/docs/build-data-auth-links
  - Accounts API: https://docs.truelayer.com/reference/accounts-v1
  - Transactions API: https://docs.truelayer.com/reference/transactions-v1
- **TrueLayer Console**: https://console.truelayer.com/
- **API Reference**: https://docs.truelayer.com/reference/
- **OAuth 2.0 Flow**: https://docs.truelayer.com/docs/retrieve-account-and-transaction-data

**Existing sync providers in codebase:**
- GoCardless: `packages/sync-server/src/app-gocardless/` (OAuth reference)
- SimpleFIN: `packages/sync-server/src/app-simplefin/` (REST API reference)
- Pluggy.ai: `packages/sync-server/src/app-pluggyai/` (Simple provider reference)

## Notes

- **Development Mode**: TrueLayer provides sandbox environment for testing
- **Bank Selection**: TrueLayer's auth flow lets users select their bank
- **Coverage**: 95%+ of European banks, 98%+ of UK banks
- **Consent Duration**: Typically 90 days, can be extended via re-authentication
- **Data Retention**: Follow TrueLayer's data retention policies
- **GDPR Compliance**: TrueLayer is GDPR compliant, ensure proper user consent handling
