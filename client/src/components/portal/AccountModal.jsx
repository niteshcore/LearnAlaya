import { useState } from 'react'
import PasswordForm from '../../auth/PasswordForm.jsx'
import useAction from '../../hooks/useAction.js'
import { IDLE_MINUTES } from '../../hooks/useIdleSignOut.js'
import { supabase } from '../../lib/supabase.js'
import { ConfirmButton, Modal, Notice } from '../admin/AdminUi.jsx'
import './portal.css'

export default function AccountModal({ user, onClose, onSignedOut }) {
  const [changed, setChanged] = useState(false)
  const { error, run } = useAction()

  async function signOutEverywhere() {
    // 'global' revokes every refresh token of this account, this device included.
    if (await run(async () => {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
      if (signOutError) throw new Error('We couldn’t sign out the other devices. Check your connection and try again.')
    })) onSignedOut()
  }

  return (
    <Modal title="Your account" onClose={onClose}>
      <div className="account-modal">
        <dl className="account-facts">
          <div><dt>Name</dt><dd>{user.full_name}</dd></div>
          <div><dt>Login ID</dt><dd>{user.login_id}</dd></div>
        </dl>
        <section>
          <h3>Change password</h3>
          {changed
            ? <Notice tone="success">Password changed. Other phones and computers signed in to this account have been signed out.</Notice>
            : <PasswordForm loginId={user.login_id} onChanged={() => setChanged(true)} />}
        </section>
        <section>
          <h3>Signed in somewhere you shouldn’t be?</h3>
          <p className="admin-hint">This signs you out on every phone and computer, this one included. If you think someone knows your password, change it first.</p>
          <Notice>{error}</Notice>
          <ConfirmButton className="admin-btn-danger" confirmLabel="Sign out everywhere?" onConfirm={signOutEverywhere}>Sign out of all devices</ConfirmButton>
        </section>
        <p className="admin-hint">For safety, LearnAlaya signs you out after {IDLE_MINUTES[user.role]} minutes without activity.</p>
      </div>
    </Modal>
  )
}
