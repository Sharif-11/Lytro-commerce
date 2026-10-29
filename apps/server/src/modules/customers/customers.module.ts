import { Module } from '@nestjs/common';
import { DrizzleCustomerStore } from '../../database/adapters/customers.adapter';
import { CustomerService } from './services/customer.service';
import { CUSTOMER_STORE } from './tokens';

// D4-12: the customers module -- a shop's customers, and (Slice 4.4) its shoppers and their sign-in. It depends on no
// other module; orders keep it up to date inside their own transactions.
@Module({
  providers: [{ provide: CUSTOMER_STORE, useClass: DrizzleCustomerStore }, CustomerService],
  exports: [CustomerService],
})
export class CustomersModule {}
