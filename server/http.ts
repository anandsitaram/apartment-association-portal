// Throw from anywhere in an action; the handler turns it into a JSON error response.
export class HttpError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
export const fail = (code: number, message: string): never => {
  throw new HttpError(code, message);
};
