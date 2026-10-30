import { Module } from '@nestjs/common';
import { DrizzleCustomerStore } from '../../database/adapters/customers.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { CustomerService } from './services/customer.service';
import { CUSTOMER_STORE } from './tokens';

// D4-12: the customers module -- a shop's customers, and (Slice 4.4) its shoppers and their sign-in. It depends only on
// catalogue's activity log writer, as orders does; orders keep it up to date inside their own transactions.
@Module({
  imports: [CatalogueModule],
  providers: [{ provide: CUSTOMER_STORE, useClass: DrizzleCustomerStore }, CustomerService],
  exports: [CustomerService],
})
export class CustomersModule {}
