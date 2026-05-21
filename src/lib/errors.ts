export class ApiError extends Error {
  constructor(public code: 'SKU_NOT_FOUND' | 'INVALID_INPUT' | 'INTERNAL', message: string, public status = 500) {
    super(message);
  }
}
