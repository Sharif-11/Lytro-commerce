// Single source for every request shape (ENGINEERING-STANDARDS §4). The server builds its DTOs from these schemas,
// so a shape is written once. Validation rules only; business rules stay in services.
export * from './identity';
