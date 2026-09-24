import { ErrorCode } from './error-code'
export function wrap(cause: unknown) {
  return Object.assign(new Error(ErrorCode.PIPELINE_MODE_MISMATCH), { cause })
}
