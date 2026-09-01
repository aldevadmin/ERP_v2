import { Navigate } from 'react-router'
import { getLastSettingsPath } from './settingsNav'

/** The bare `/settings` route — there's no standalone landing page anymore
 * (see `SettingsLayout`'s docstring), so this sends you straight to
 * wherever you were last working, or Items on a first-ever visit. */
export default function SettingsRedirect() {
  return <Navigate to={getLastSettingsPath()} replace />
}
