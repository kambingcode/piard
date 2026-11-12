/**
 * Pintu publik fitur auth untuk kode server: route handler, layout, dan halaman.
 * Kode klien memakai `./index` (lihat docs/architecture.md bagian "pintu fitur").
 */
import "server-only";

export { getAuthStatus, signInFlow, signOutFlow, signUpFlow } from "./server/flows";
export {
  authedRoute,
  authenticateRequest,
  getCurrentUser,
  requireUser,
  SIGN_IN_PATH,
} from "./server/session";
