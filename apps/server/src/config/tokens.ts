// Injection token for the validated settings object, so modules do not read process.env directly.
export const ENV = Symbol('ENV');
