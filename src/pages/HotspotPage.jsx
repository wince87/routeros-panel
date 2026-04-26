import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useMessage } from '../hooks/useMessage';
import { MessageBar } from '../components/MessageBar';
import {
  inputStyle,
  badgeStyle,
  tabStyle,
  btnStyle as btnStyleShared,
  selectStyle,
  cardCompactStyle as cardStyle,
} from '../styles/shared';

const btnStyle = (color, disabled) => btnStyleShared(color, disabled, false);

const labelStyle = {
  fontSize: 9,
  fontWeight: 600,
  fontFamily: "'Outfit', sans-serif",
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#636b7e',
  marginBottom: 4,
};

const fieldRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
};

export default function HotspotPage() {
  const [hotspots, setHotspots] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [userProfiles, setUserProfiles] = useState([]);
  const [active, setActive] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [walledGarden, setWalledGarden] = useState([]);
  const [interfaces, setInterfaces] = useState([]);
  const [pools, setPools] = useState([]);
  const [tab, setTab] = useState('server');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState({});
  const [message, showMsg] = useMessage();

  const [setupForm, setSetupForm] = useState({
    name: 'hotspot1',
    interface: '',
    'address-pool': '',
    profile: 'default',
    'dns-name': '',
  });

  const [editingServer, setEditingServer] = useState(null);
  const [editingProfile, setEditingProfile] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editingUserProfile, setEditingUserProfile] = useState(null);
  const [editingBinding, setEditingBinding] = useState(null);
  const [editingWalled, setEditingWalled] = useState(null);

  const [addingUser, setAddingUser] = useState(false);
  const [addingBinding, setAddingBinding] = useState(false);
  const [addingWalled, setAddingWalled] = useState(false);
  const [addingUserProfile, setAddingUserProfile] = useState(false);

  const [newUser, setNewUser] = useState({ name: '', password: '', profile: 'default' });
  const [newBinding, setNewBinding] = useState({ 'mac-address': '', address: '', type: 'bypassed' });
  const [newWalled, setNewWalled] = useState({ 'dst-host': '', 'dst-port': '', action: 'allow' });
  const [newUserProfile, setNewUserProfile] = useState({ name: '', 'rate-limit': '', 'session-timeout': '00:00:00', 'shared-users': '1' });

  const fetchData = useCallback(async () => {
    try {
      const [hs, prof, usr, uprof, act, bind, wg, ifaces, pl] = await Promise.all([
        api('GET', '/ip/hotspot'),
        api('GET', '/ip/hotspot/profile'),
        api('GET', '/ip/hotspot/user'),
        api('GET', '/ip/hotspot/user/profile'),
        api('GET', '/ip/hotspot/active'),
        api('GET', '/ip/hotspot/ip-binding'),
        api('GET', '/ip/hotspot/walled-garden'),
        api('GET', '/interface').catch(() => []),
        api('GET', '/ip/pool').catch(() => []),
      ]);
      setHotspots(hs || []);
      setProfiles(prof || []);
      setUsers(usr || []);
      setUserProfiles(uprof || []);
      setActive(act || []);
      setBindings(bind || []);
      setWalledGarden(wg || []);
      setInterfaces((ifaces || []).filter(i =>
        ['bridge', 'wlan', 'ether', 'vlan'].includes(i.type)
      ));
      setPools(pl || []);
    } catch (e) {
      if (!hotspots) setHotspots([]);
      showMsg(`Failed to load hotspot data: ${e?.message || 'unknown error'}`);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!hotspots || hotspots.length === 0) return;
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [hotspots, fetchData]);

  const runOp = async (key, action, successMsg, failureMsg, after) => {
    setLoading(p => ({ ...p, [key]: true }));
    try {
      await action();
      showMsg(successMsg);
      after?.();
      await fetchData();
    } catch (e) {
      showMsg(`${failureMsg}: ${e.message}`);
    }
    setLoading(p => ({ ...p, [key]: false }));
  };

  const flipDisabled = (d) => (d === 'false' ? 'true' : 'false');

  const handleCreateHotspot = () => {
    if (!setupForm.interface) { showMsg('Select an interface'); return; }
    return runOp('setup', () => api('PUT', '/ip/hotspot', setupForm), 'Hotspot created', 'Failed to create hotspot');
  };

  const handleToggleServer = (s) =>
    runOp(s['.id'], () => api('PATCH', `/ip/hotspot/${s['.id']}`, { disabled: flipDisabled(s.disabled) }),
      s.disabled === 'false' ? 'Server disabled' : 'Server enabled', 'Failed to toggle server');

  const handleSaveServer = (s) =>
    runOp(s['.id'], () => api('PATCH', `/ip/hotspot/${s['.id']}`, editingServer),
      'Server updated', 'Failed to update server', () => setEditingServer(null));

  const handleDeleteServer = (s) =>
    runOp(s['.id'], () => api('DELETE', `/ip/hotspot/${s['.id']}`),
      `Server ${s.name} deleted`, 'Failed to delete server');

  const handleSaveProfile = (prof) =>
    runOp(`prof-${prof['.id']}`, () => api('PATCH', `/ip/hotspot/profile/${prof['.id']}`, editingProfile),
      'Profile updated', 'Failed to update profile', () => setEditingProfile(null));

  const handleAddUser = () => {
    if (!newUser.name) { showMsg('Enter username'); return; }
    return runOp('addUser', () => api('PUT', '/ip/hotspot/user', newUser),
      `User ${newUser.name} created`, 'Failed to create user',
      () => { setNewUser({ name: '', password: '', profile: 'default' }); setAddingUser(false); });
  };

  const handleSaveUser = (user) =>
    runOp(`user-${user['.id']}`, () => api('PATCH', `/ip/hotspot/user/${user['.id']}`, editingUser),
      'User updated', 'Failed to update user', () => setEditingUser(null));

  const handleDeleteUser = (user) =>
    runOp(`user-${user['.id']}`, () => api('DELETE', `/ip/hotspot/user/${user['.id']}`),
      `User ${user.name} deleted`, 'Failed to delete user');

  const handleToggleUser = (user) =>
    runOp(`user-${user['.id']}`, () => api('PATCH', `/ip/hotspot/user/${user['.id']}`, { disabled: flipDisabled(user.disabled) }),
      user.disabled === 'false' ? 'User disabled' : 'User enabled', 'Failed to toggle user');

  const handleAddUserProfile = () => {
    if (!newUserProfile.name) { showMsg('Enter profile name'); return; }
    return runOp('addUProf', () => api('PUT', '/ip/hotspot/user/profile', newUserProfile),
      `Profile ${newUserProfile.name} created`, 'Failed to create profile',
      () => { setNewUserProfile({ name: '', 'rate-limit': '', 'session-timeout': '00:00:00', 'shared-users': '1' }); setAddingUserProfile(false); });
  };

  const handleSaveUserProfile = (prof) =>
    runOp(`uprof-${prof['.id']}`, () => api('PATCH', `/ip/hotspot/user/profile/${prof['.id']}`, editingUserProfile),
      'User profile updated', 'Failed to update user profile', () => setEditingUserProfile(null));

  const handleDeleteUserProfile = (prof) =>
    runOp(`uprof-${prof['.id']}`, () => api('DELETE', `/ip/hotspot/user/profile/${prof['.id']}`),
      `Profile ${prof.name} deleted`, 'Failed to delete profile');

  const handleDisconnect = (session) =>
    runOp(`act-${session['.id']}`, () => api('DELETE', `/ip/hotspot/active/${session['.id']}`),
      `Disconnected ${session.user || session.address}`, 'Failed to disconnect');

  const handleAddBinding = () =>
    runOp('addBind', () => api('PUT', '/ip/hotspot/ip-binding', newBinding),
      'Binding created', 'Failed to create binding',
      () => { setNewBinding({ 'mac-address': '', address: '', type: 'bypassed' }); setAddingBinding(false); });

  const handleSaveBinding = (bind) =>
    runOp(`bind-${bind['.id']}`, () => api('PATCH', `/ip/hotspot/ip-binding/${bind['.id']}`, editingBinding),
      'Binding updated', 'Failed to update binding', () => setEditingBinding(null));

  const handleDeleteBinding = (bind) =>
    runOp(`bind-${bind['.id']}`, () => api('DELETE', `/ip/hotspot/ip-binding/${bind['.id']}`),
      'Binding deleted', 'Failed to delete binding');

  const handleAddWalled = () =>
    runOp('addWall', () => api('PUT', '/ip/hotspot/walled-garden', newWalled),
      'Walled garden entry created', 'Failed to create entry',
      () => { setNewWalled({ 'dst-host': '', 'dst-port': '', action: 'allow' }); setAddingWalled(false); });

  const handleSaveWalled = (entry) =>
    runOp(`wall-${entry['.id']}`, () => api('PATCH', `/ip/hotspot/walled-garden/${entry['.id']}`, editingWalled),
      'Entry updated', 'Failed to update entry', () => setEditingWalled(null));

  const handleDeleteWalled = (entry) =>
    runOp(`wall-${entry['.id']}`, () => api('DELETE', `/ip/hotspot/walled-garden/${entry['.id']}`),
      'Entry deleted', 'Failed to delete entry');

  if (hotspots === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#636b7e', fontSize: 13 }}>
        Loading hotspot...
      </div>
    );
  }

  if (hotspots.length === 0) {
    return (
      <>
        <MessageBar message={message} />
        <div style={{ ...cardStyle, padding: 24, maxWidth: 480 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#eef0f4', marginBottom: 4 }}>
            Create Hotspot Server
          </div>
          <div style={{ fontSize: 11, color: '#636b7e', marginBottom: 20 }}>
            No hotspot server configured. Set up a new one.
          </div>

          <div style={fieldRow}>
            <span style={{ ...labelStyle, width: 90, flexShrink: 0, marginBottom: 0 }}>Name</span>
            <input value={setupForm.name} onChange={e => setSetupForm(p => ({ ...p, name: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
          </div>

          <div style={fieldRow}>
            <span style={{ ...labelStyle, width: 90, flexShrink: 0, marginBottom: 0 }}>Interface</span>
            <select value={setupForm.interface} onChange={e => setSetupForm(p => ({ ...p, interface: e.target.value }))} style={{ ...selectStyle, flex: 1 }}>
              <option value="">Select...</option>
              {interfaces.map(i => <option key={i.name} value={i.name}>{i.name} ({i.type})</option>)}
            </select>
          </div>

          <div style={fieldRow}>
            <span style={{ ...labelStyle, width: 90, flexShrink: 0, marginBottom: 0 }}>Address Pool</span>
            <select value={setupForm['address-pool']} onChange={e => setSetupForm(p => ({ ...p, 'address-pool': e.target.value }))} style={{ ...selectStyle, flex: 1 }}>
              <option value="">None</option>
              {pools.map(p => <option key={p.name} value={p.name}>{p.name} ({p.ranges})</option>)}
            </select>
          </div>

          <div style={fieldRow}>
            <span style={{ ...labelStyle, width: 90, flexShrink: 0, marginBottom: 0 }}>Profile</span>
            <select value={setupForm.profile} onChange={e => setSetupForm(p => ({ ...p, profile: e.target.value }))} style={{ ...selectStyle, flex: 1 }}>
              {profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>

          <div style={fieldRow}>
            <span style={{ ...labelStyle, width: 90, flexShrink: 0, marginBottom: 0 }}>DNS Name</span>
            <input value={setupForm['dns-name']} onChange={e => setSetupForm(p => ({ ...p, 'dns-name': e.target.value }))} placeholder="hotspot.local" style={{ ...inputStyle, flex: 1 }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={handleCreateHotspot} disabled={loading.setup} style={btnStyle('#22c55e', loading.setup)}>
              {loading.setup ? '...' : 'Create Hotspot'}
            </button>
          </div>
        </div>
      </>
    );
  }

  const renderServerTab = () => {
    const filteredServers = hotspots.filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return s.name?.toLowerCase().includes(q) || s.interface?.toLowerCase().includes(q);
    });
    const filteredProfiles = profiles.filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return p.name?.toLowerCase().includes(q);
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 276px)', overflowY: 'auto' }}>
        <div style={{ padding: '0 4px', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
            {filteredServers.length} server{filteredServers.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredServers.map(server => {
          const id = server['.id'];
          const busy = loading[id];
          const isEditing = editingServer && editingServer._id === id;
          const disabled = server.disabled === 'true';

          return (
            <div key={id} style={{ ...cardStyle, border: `1px solid ${disabled ? '#ef444430' : '#1a1f2e'}` }}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: disabled ? '#ef4444' : '#22c55e', flexShrink: 0, boxShadow: `0 0 6px ${disabled ? '#ef444460' : '#22c55e60'}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 70, marginBottom: 0 }}>Name</span>
                        <input value={editingServer.name || ''} onChange={e => setEditingServer(p => ({ ...p, name: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 70, marginBottom: 0 }}>Interface</span>
                        <select value={editingServer.interface || ''} onChange={e => setEditingServer(p => ({ ...p, interface: e.target.value }))} style={{ ...selectStyle, flex: 1 }}>
                          {interfaces.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 70, marginBottom: 0 }}>Pool</span>
                        <select value={editingServer['address-pool'] || ''} onChange={e => setEditingServer(p => ({ ...p, 'address-pool': e.target.value }))} style={{ ...selectStyle, flex: 1 }}>
                          <option value="">None</option>
                          {pools.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 70, marginBottom: 0 }}>DNS</span>
                        <input value={editingServer['dns-name'] || ''} onChange={e => setEditingServer(p => ({ ...p, 'dns-name': e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: disabled ? '#ef4444' : '#eef0f4' }}>{server.name}</span>
                        {disabled && <span style={badgeStyle('#ef4444')}>DISABLED</span>}
                        <span style={badgeStyle('#3b82f6')}>{server.interface}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                          pool: {server['address-pool'] || '—'}
                        </span>
                        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                          profile: {server.profile || '—'}
                        </span>
                        {server['dns-name'] && (
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                            dns: {server['dns-name']}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {isEditing ? (
                    <>
                      <button onClick={() => handleSaveServer(server)} disabled={busy} style={btnStyle('#22c55e', busy)}>Save</button>
                      <button onClick={() => setEditingServer(null)} style={btnStyle('#636b7e', false)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditingServer({ _id: id, name: server.name, interface: server.interface, 'address-pool': server['address-pool'], 'dns-name': server['dns-name'] || '' })} style={btnStyle('#3b82f6', false)}>Edit</button>
                      <button onClick={() => handleToggleServer(server)} disabled={busy} style={btnStyle(disabled ? '#22c55e' : '#f59e0b', busy)}>
                        {busy ? '...' : disabled ? 'Enable' : 'Disable'}
                      </button>
                      <button onClick={() => handleDeleteServer(server)} disabled={busy} style={btnStyle('#ef4444', busy)}>Del</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ padding: '16px 4px 4px', marginTop: 8 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
            {filteredProfiles.length} server profile{filteredProfiles.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredProfiles.map(prof => {
          const id = prof['.id'];
          const busy = loading[`prof-${id}`];
          const isEditing = editingProfile && editingProfile._id === id;

          return (
            <div key={id} style={cardStyle}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 90, marginBottom: 0 }}>Login By</span>
                        <input value={editingProfile['login-by'] || ''} onChange={e => setEditingProfile(p => ({ ...p, 'login-by': e.target.value }))} style={{ ...inputStyle, flex: 1 }} placeholder="cookie,http-chap,http-pap" />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 90, marginBottom: 0 }}>Rate Limit</span>
                        <input value={editingProfile['rate-limit'] || ''} onChange={e => setEditingProfile(p => ({ ...p, 'rate-limit': e.target.value }))} style={{ ...inputStyle, flex: 1 }} placeholder="rx/tx e.g. 1M/2M" />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 90, marginBottom: 0 }}>HTML Dir</span>
                        <input value={editingProfile['html-directory'] || ''} onChange={e => setEditingProfile(p => ({ ...p, 'html-directory': e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#eef0f4' }}>{prof.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                          login: {prof['login-by'] || '—'}
                        </span>
                        {prof['rate-limit'] && (
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                            rate: {prof['rate-limit']}
                          </span>
                        )}
                        {prof['html-directory'] && (
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                            html: {prof['html-directory']}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {isEditing ? (
                    <>
                      <button onClick={() => handleSaveProfile(prof)} disabled={busy} style={btnStyle('#22c55e', busy)}>Save</button>
                      <button onClick={() => setEditingProfile(null)} style={btnStyle('#636b7e', false)}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setEditingProfile({ _id: id, 'login-by': prof['login-by'] || '', 'rate-limit': prof['rate-limit'] || '', 'html-directory': prof['html-directory'] || '' })} style={btnStyle('#3b82f6', false)}>Edit</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderUsersTab = () => {
    const filteredUsers = users.filter(u => {
      if (!search) return true;
      const q = search.toLowerCase();
      return u.name?.toLowerCase().includes(q) || u.profile?.toLowerCase().includes(q);
    });
    const filteredUProfiles = userProfiles.filter(p => {
      if (!search) return true;
      return p.name?.toLowerCase().includes(search.toLowerCase());
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 276px)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
            {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => { setAddingUser(true); setNewUser({ name: '', password: '', profile: 'default' }); }} style={btnStyle('#22c55e', false)}>Add User</button>
        </div>

        {addingUser && (
          <div style={{ ...cardStyle, border: '1px solid #22c55e30' }}>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 70, marginBottom: 0 }}>Name</span>
                <input value={newUser.name} onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 70, marginBottom: 0 }}>Password</span>
                <input value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 70, marginBottom: 0 }}>Profile</span>
                <select value={newUser.profile} onChange={e => setNewUser(p => ({ ...p, profile: e.target.value }))} style={{ ...selectStyle, flex: 1 }}>
                  {userProfiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                <button onClick={() => setAddingUser(false)} style={btnStyle('#636b7e', false)}>Cancel</button>
                <button onClick={handleAddUser} disabled={loading.addUser} style={btnStyle('#22c55e', loading.addUser)}>
                  {loading.addUser ? '...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {filteredUsers.map(user => {
          const id = user['.id'];
          const busy = loading[`user-${id}`];
          const isEditing = editingUser && editingUser._id === id;
          const disabled = user.disabled === 'true';

          return (
            <div key={id} style={{ ...cardStyle, border: `1px solid ${disabled ? '#ef444430' : '#1a1f2e'}` }}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: disabled ? '#ef4444' : '#22c55e', flexShrink: 0, boxShadow: `0 0 6px ${disabled ? '#ef444460' : '#22c55e60'}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 70, marginBottom: 0 }}>Name</span>
                        <input value={editingUser.name || ''} onChange={e => setEditingUser(p => ({ ...p, name: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 70, marginBottom: 0 }}>Password</span>
                        <input value={editingUser.password || ''} onChange={e => setEditingUser(p => ({ ...p, password: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 70, marginBottom: 0 }}>Profile</span>
                        <select value={editingUser.profile || ''} onChange={e => setEditingUser(p => ({ ...p, profile: e.target.value }))} style={{ ...selectStyle, flex: 1 }}>
                          {userProfiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: disabled ? '#ef4444' : '#eef0f4' }}>{user.name}</span>
                        {disabled && <span style={badgeStyle('#ef4444')}>DISABLED</span>}
                        <span style={badgeStyle('#3b82f6')}>{user.profile}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {user.uptime && user.uptime !== '0s' && (
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                            uptime: {user.uptime}
                          </span>
                        )}
                        {user['bytes-in'] && user['bytes-in'] !== '0' && (
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                            in: {user['bytes-in']} / out: {user['bytes-out']}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {isEditing ? (
                    <>
                      <button onClick={() => handleSaveUser(user)} disabled={busy} style={btnStyle('#22c55e', busy)}>Save</button>
                      <button onClick={() => setEditingUser(null)} style={btnStyle('#636b7e', false)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditingUser({ _id: id, name: user.name, password: user.password || '', profile: user.profile })} style={btnStyle('#3b82f6', false)}>Edit</button>
                      <button onClick={() => handleToggleUser(user)} disabled={busy} style={btnStyle(disabled ? '#22c55e' : '#f59e0b', busy)}>
                        {busy ? '...' : disabled ? 'Enable' : 'Disable'}
                      </button>
                      <button onClick={() => handleDeleteUser(user)} disabled={busy} style={btnStyle('#ef4444', busy)}>Del</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 4px 4px', marginTop: 8 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
            {filteredUProfiles.length} user profile{filteredUProfiles.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => { setAddingUserProfile(true); setNewUserProfile({ name: '', 'rate-limit': '', 'session-timeout': '00:00:00', 'shared-users': '1' }); }} style={btnStyle('#22c55e', false)}>Add Profile</button>
        </div>

        {addingUserProfile && (
          <div style={{ ...cardStyle, border: '1px solid #22c55e30' }}>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 100, marginBottom: 0 }}>Name</span>
                <input value={newUserProfile.name} onChange={e => setNewUserProfile(p => ({ ...p, name: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 100, marginBottom: 0 }}>Rate Limit</span>
                <input value={newUserProfile['rate-limit']} onChange={e => setNewUserProfile(p => ({ ...p, 'rate-limit': e.target.value }))} placeholder="rx/tx e.g. 1M/2M" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 100, marginBottom: 0 }}>Session Timeout</span>
                <input value={newUserProfile['session-timeout']} onChange={e => setNewUserProfile(p => ({ ...p, 'session-timeout': e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 100, marginBottom: 0 }}>Shared Users</span>
                <input value={newUserProfile['shared-users']} onChange={e => setNewUserProfile(p => ({ ...p, 'shared-users': e.target.value }))} style={{ ...inputStyle, width: 60 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                <button onClick={() => setAddingUserProfile(false)} style={btnStyle('#636b7e', false)}>Cancel</button>
                <button onClick={handleAddUserProfile} disabled={loading.addUProf} style={btnStyle('#22c55e', loading.addUProf)}>
                  {loading.addUProf ? '...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {filteredUProfiles.map(prof => {
          const id = prof['.id'];
          const busy = loading[`uprof-${id}`];
          const isEditing = editingUserProfile && editingUserProfile._id === id;

          return (
            <div key={id} style={cardStyle}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 100, marginBottom: 0 }}>Rate Limit</span>
                        <input value={editingUserProfile['rate-limit'] || ''} onChange={e => setEditingUserProfile(p => ({ ...p, 'rate-limit': e.target.value }))} placeholder="rx/tx" style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 100, marginBottom: 0 }}>Session Timeout</span>
                        <input value={editingUserProfile['session-timeout'] || ''} onChange={e => setEditingUserProfile(p => ({ ...p, 'session-timeout': e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 100, marginBottom: 0 }}>Shared Users</span>
                        <input value={editingUserProfile['shared-users'] || ''} onChange={e => setEditingUserProfile(p => ({ ...p, 'shared-users': e.target.value }))} style={{ ...inputStyle, width: 60 }} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#eef0f4' }}>{prof.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {prof['rate-limit'] && (
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                            rate: {prof['rate-limit']}
                          </span>
                        )}
                        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                          timeout: {prof['session-timeout'] || '—'}
                        </span>
                        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                          shared: {prof['shared-users'] || '1'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {isEditing ? (
                    <>
                      <button onClick={() => handleSaveUserProfile(prof)} disabled={busy} style={btnStyle('#22c55e', busy)}>Save</button>
                      <button onClick={() => setEditingUserProfile(null)} style={btnStyle('#636b7e', false)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditingUserProfile({ _id: id, 'rate-limit': prof['rate-limit'] || '', 'session-timeout': prof['session-timeout'] || '', 'shared-users': prof['shared-users'] || '' })} style={btnStyle('#3b82f6', false)}>Edit</button>
                      <button onClick={() => handleDeleteUserProfile(prof)} disabled={busy} style={btnStyle('#ef4444', busy)}>Del</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderActiveTab = () => {
    const filteredActive = active.filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return s.user?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q) ||
        s['mac-address']?.toLowerCase().includes(q);
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 276px)', overflowY: 'auto' }}>
        <div style={{ padding: '0 4px', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
            {filteredActive.length} active session{filteredActive.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredActive.map(session => {
          const id = session['.id'];
          const busy = loading[`act-${id}`];

          return (
            <div key={id} style={cardStyle}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 6px #22c55e60' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#eef0f4' }}>{session.user || '—'}</span>
                    <span style={badgeStyle('#22c55e')}>{session['login-by'] || 'unknown'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                      {session.address}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                      {session['mac-address']}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                      uptime: {session.uptime || '—'}
                    </span>
                    {session['bytes-in'] && (
                      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                        in: {session['bytes-in']} / out: {session['bytes-out']}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleDisconnect(session)} disabled={busy} style={btnStyle('#ef4444', busy)}>
                  {busy ? '...' : 'Disconnect'}
                </button>
              </div>
            </div>
          );
        })}

        {filteredActive.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#636b7e', fontSize: 13 }}>
            No active sessions
          </div>
        )}
      </div>
    );
  };

  const renderBindingsTab = () => {
    const filteredBindings = bindings.filter(b => {
      if (!search) return true;
      const q = search.toLowerCase();
      return b['mac-address']?.toLowerCase().includes(q) ||
        b.address?.toLowerCase().includes(q) ||
        b.type?.toLowerCase().includes(q);
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 276px)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
            {filteredBindings.length} binding{filteredBindings.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => { setAddingBinding(true); setNewBinding({ 'mac-address': '', address: '', type: 'bypassed' }); }} style={btnStyle('#22c55e', false)}>Add Binding</button>
        </div>

        {addingBinding && (
          <div style={{ ...cardStyle, border: '1px solid #22c55e30' }}>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>MAC</span>
                <input value={newBinding['mac-address']} onChange={e => setNewBinding(p => ({ ...p, 'mac-address': e.target.value }))} placeholder="AA:BB:CC:DD:EE:FF" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>Address</span>
                <input value={newBinding.address} onChange={e => setNewBinding(p => ({ ...p, address: e.target.value }))} placeholder="192.168.88.x" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>Type</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['bypassed', 'blocked', 'regular'].map(t => (
                    <button key={t} onClick={() => setNewBinding(p => ({ ...p, type: t }))} style={{
                      padding: '4px 8px', fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                      borderRadius: 4, cursor: 'pointer',
                      background: newBinding.type === t ? (t === 'blocked' ? '#ef444420' : t === 'bypassed' ? '#22c55e20' : '#3b82f620') : '#12151c',
                      color: newBinding.type === t ? (t === 'blocked' ? '#ef4444' : t === 'bypassed' ? '#22c55e' : '#3b82f6') : '#636b7e',
                      border: `1px solid ${newBinding.type === t ? (t === 'blocked' ? '#ef444440' : t === 'bypassed' ? '#22c55e40' : '#3b82f640') : '#1a1f2e'}`,
                    }}>{t}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                <button onClick={() => setAddingBinding(false)} style={btnStyle('#636b7e', false)}>Cancel</button>
                <button onClick={handleAddBinding} disabled={loading.addBind} style={btnStyle('#22c55e', loading.addBind)}>
                  {loading.addBind ? '...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {filteredBindings.map(bind => {
          const id = bind['.id'];
          const busy = loading[`bind-${id}`];
          const isEditing = editingBinding && editingBinding._id === id;
          const typeColor = bind.type === 'blocked' ? '#ef4444' : bind.type === 'bypassed' ? '#22c55e' : '#3b82f6';

          return (
            <div key={id} style={{ ...cardStyle, border: `1px solid ${bind.type === 'blocked' ? '#ef444430' : '#1a1f2e'}` }}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: typeColor, flexShrink: 0, boxShadow: `0 0 6px ${typeColor}60` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>MAC</span>
                        <input value={editingBinding['mac-address'] || ''} onChange={e => setEditingBinding(p => ({ ...p, 'mac-address': e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>Address</span>
                        <input value={editingBinding.address || ''} onChange={e => setEditingBinding(p => ({ ...p, address: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>Type</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {['bypassed', 'blocked', 'regular'].map(t => (
                            <button key={t} onClick={() => setEditingBinding(p => ({ ...p, type: t }))} style={{
                              padding: '4px 8px', fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                              borderRadius: 4, cursor: 'pointer',
                              background: editingBinding.type === t ? (t === 'blocked' ? '#ef444420' : t === 'bypassed' ? '#22c55e20' : '#3b82f620') : '#12151c',
                              color: editingBinding.type === t ? (t === 'blocked' ? '#ef4444' : t === 'bypassed' ? '#22c55e' : '#3b82f6') : '#636b7e',
                              border: `1px solid ${editingBinding.type === t ? (t === 'blocked' ? '#ef444440' : t === 'bypassed' ? '#22c55e40' : '#3b82f640') : '#1a1f2e'}`,
                            }}>{t}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#eef0f4' }}>{bind.address || bind['mac-address'] || '—'}</span>
                        <span style={badgeStyle(typeColor)}>{bind.type}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {bind['mac-address'] && (
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                            mac: {bind['mac-address']}
                          </span>
                        )}
                        {bind.address && bind['mac-address'] && (
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                            ip: {bind.address}
                          </span>
                        )}
                        {bind['to-address'] && (
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                            to: {bind['to-address']}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {isEditing ? (
                    <>
                      <button onClick={() => handleSaveBinding(bind)} disabled={busy} style={btnStyle('#22c55e', busy)}>Save</button>
                      <button onClick={() => setEditingBinding(null)} style={btnStyle('#636b7e', false)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditingBinding({ _id: id, 'mac-address': bind['mac-address'] || '', address: bind.address || '', type: bind.type || 'regular' })} style={btnStyle('#3b82f6', false)}>Edit</button>
                      <button onClick={() => handleDeleteBinding(bind)} disabled={busy} style={btnStyle('#ef4444', busy)}>Del</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredBindings.length === 0 && !addingBinding && (
          <div style={{ textAlign: 'center', padding: 40, color: '#636b7e', fontSize: 13 }}>
            No IP bindings configured
          </div>
        )}
      </div>
    );
  };

  const renderWalledTab = () => {
    const filteredWalled = walledGarden.filter(w => {
      if (!search) return true;
      const q = search.toLowerCase();
      return w['dst-host']?.toLowerCase().includes(q) ||
        w['dst-port']?.toLowerCase().includes(q);
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 276px)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
            {filteredWalled.length} entr{filteredWalled.length !== 1 ? 'ies' : 'y'}
          </span>
          <button onClick={() => { setAddingWalled(true); setNewWalled({ 'dst-host': '', 'dst-port': '', action: 'allow' }); }} style={btnStyle('#22c55e', false)}>Add Entry</button>
        </div>

        {addingWalled && (
          <div style={{ ...cardStyle, border: '1px solid #22c55e30' }}>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>Dst Host</span>
                <input value={newWalled['dst-host']} onChange={e => setNewWalled(p => ({ ...p, 'dst-host': e.target.value }))} placeholder="*.example.com" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>Dst Port</span>
                <input value={newWalled['dst-port']} onChange={e => setNewWalled(p => ({ ...p, 'dst-port': e.target.value }))} placeholder="80,443" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>Action</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['allow', 'deny'].map(a => (
                    <button key={a} onClick={() => setNewWalled(p => ({ ...p, action: a }))} style={{
                      padding: '4px 8px', fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                      borderRadius: 4, cursor: 'pointer',
                      background: newWalled.action === a ? (a === 'deny' ? '#ef444420' : '#22c55e20') : '#12151c',
                      color: newWalled.action === a ? (a === 'deny' ? '#ef4444' : '#22c55e') : '#636b7e',
                      border: `1px solid ${newWalled.action === a ? (a === 'deny' ? '#ef444440' : '#22c55e40') : '#1a1f2e'}`,
                    }}>{a}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                <button onClick={() => setAddingWalled(false)} style={btnStyle('#636b7e', false)}>Cancel</button>
                <button onClick={handleAddWalled} disabled={loading.addWall} style={btnStyle('#22c55e', loading.addWall)}>
                  {loading.addWall ? '...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {filteredWalled.map(entry => {
          const id = entry['.id'];
          const busy = loading[`wall-${id}`];
          const isEditing = editingWalled && editingWalled._id === id;
          const isAllow = entry.action !== 'deny';

          return (
            <div key={id} style={cardStyle}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isAllow ? '#22c55e' : '#ef4444', flexShrink: 0, boxShadow: `0 0 6px ${isAllow ? '#22c55e60' : '#ef444460'}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>Dst Host</span>
                        <input value={editingWalled['dst-host'] || ''} onChange={e => setEditingWalled(p => ({ ...p, 'dst-host': e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>Dst Port</span>
                        <input value={editingWalled['dst-port'] || ''} onChange={e => setEditingWalled(p => ({ ...p, 'dst-port': e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...labelStyle, width: 80, marginBottom: 0 }}>Action</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {['allow', 'deny'].map(a => (
                            <button key={a} onClick={() => setEditingWalled(p => ({ ...p, action: a }))} style={{
                              padding: '4px 8px', fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                              borderRadius: 4, cursor: 'pointer',
                              background: editingWalled.action === a ? (a === 'deny' ? '#ef444420' : '#22c55e20') : '#12151c',
                              color: editingWalled.action === a ? (a === 'deny' ? '#ef4444' : '#22c55e') : '#636b7e',
                              border: `1px solid ${editingWalled.action === a ? (a === 'deny' ? '#ef444440' : '#22c55e40') : '#1a1f2e'}`,
                            }}>{a}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#eef0f4' }}>{entry['dst-host'] || '—'}</span>
                        <span style={badgeStyle(isAllow ? '#22c55e' : '#ef4444')}>{entry.action || 'allow'}</span>
                      </div>
                      {entry['dst-port'] && (
                        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                          port: {entry['dst-port']}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {isEditing ? (
                    <>
                      <button onClick={() => handleSaveWalled(entry)} disabled={busy} style={btnStyle('#22c55e', busy)}>Save</button>
                      <button onClick={() => setEditingWalled(null)} style={btnStyle('#636b7e', false)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditingWalled({ _id: id, 'dst-host': entry['dst-host'] || '', 'dst-port': entry['dst-port'] || '', action: entry.action || 'allow' })} style={btnStyle('#3b82f6', false)}>Edit</button>
                      <button onClick={() => handleDeleteWalled(entry)} disabled={busy} style={btnStyle('#ef4444', busy)}>Del</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredWalled.length === 0 && !addingWalled && (
          <div style={{ textAlign: 'center', padding: 40, color: '#636b7e', fontSize: 13 }}>
            No walled garden entries
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <MessageBar message={message} />

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button onClick={() => setTab('server')} style={tabStyle(tab === 'server', '#c8ccd4')}>
          Server ({hotspots.length})
        </button>
        <button onClick={() => setTab('users')} style={tabStyle(tab === 'users', '#22c55e')}>
          Users ({users.length})
        </button>
        <button onClick={() => setTab('active')} style={tabStyle(tab === 'active', '#3b82f6')}>
          Active ({active.length})
        </button>
        <button onClick={() => setTab('bindings')} style={tabStyle(tab === 'bindings', '#f59e0b')}>
          Bindings ({bindings.length})
        </button>
        <button onClick={() => setTab('walled')} style={tabStyle(tab === 'walled', '#a855f7')}>
          Walled Garden ({walledGarden.length})
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          style={{
            width: '100%', padding: '10px 14px', fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4',
            background: '#12151c', border: '1px solid #1a1f2e', borderRadius: 8,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {tab === 'server' && renderServerTab()}
      {tab === 'users' && renderUsersTab()}
      {tab === 'active' && renderActiveTab()}
      {tab === 'bindings' && renderBindingsTab()}
      {tab === 'walled' && renderWalledTab()}
    </>
  );
}
