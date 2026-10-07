// De-dupes against pg-boss's own singletonKey once the relay sends the job (SCL-08, D25).
export interface EnqueueOptions {
  singletonKey?: string;
}
