// Tink-specific type definitions for bank sync integration

export type TinkAccount = {
  id: string;
  name: string;
  officialName?: string;
  mask?: string;
  type: string;
  balances: {
    current: number;
    available?: number;
    currency: string;
  };
};

export type TinkTransaction = {
  id: string;
  accountId: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  status: 'PENDING' | 'BOOKED';
  category?: string;
  merchant?: {
    name?: string;
  };
};

export type TinkConnection = {
  id: string;
  institutionId: string;
  institutionName: string;
  status: string;
};

export type SyncServerTinkAccount = {
  balance: number;
  account_id: string;
  institution?: string;
  orgDomain?: string;
  orgId?: string;
  name: string;
};
