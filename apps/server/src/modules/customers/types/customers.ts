import type { SelectCustomer } from '@lytronix/db';

// The stored row, as an alias of the shared type (ENGINEERING-STANDARDS §4), never a copy.
export type CustomerRecord = SelectCustomer;
