import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useMessage } from '../hooks/useMessage';
import { MessageBar } from '../components/MessageBar';
import { inputStyle, badgeStyle, tabStyle } from '../styles/shared';
import { ipToNum, isInDhcpRange, getSubnetForIp as getSubnet } from '../utils/net';

const BLOCKED_LIST = 'blocked-clients';

export default function ClientsPage() {
  const [leases, setLeases] = useState(null);
  const [arpEntries, setArpEntries] = useState([]);
  const [routerAddresses, setRouterAddresses] = useState([]);
  const [blockedList, setBlockedList] = useState([]);
  const [natRules, setNatRules] = useState([]);
  const [filterRuleExists, setFilterRuleExists] = useState(false);
  const [search, setSearch] = useState('');
  const [subnetFilter, setSubnetFilter] = useState('all');
  const [showArp, setShowArp] = useState(false);
  const [loading, setLoading] = useState({});
  const [message, showMsg] = useMessage();
  const [forwardFor, setForwardFor] = useState(null);
  const [fwdForm, setFwdForm] = useState({ dstPort: '', toPort: '', protocol: 'tcp', wanIface: 'all' });
  const [wanInterfaces, setWanInterfaces] = useState([]);
  const [allInterfaces, setAllInterfaces] = useState([]);
  const [tab, setTab] = useState('all');
  const [wgPeers, setWgPeers] = useState([]);
  const [dhcpPools, setDhcpPools] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [leasesData, addrList, filterRules, nat, dhcpClients, arpData, ipAddresses, wgData, poolData, ifaceData] = await Promise.all([
        api('GET', '/ip/dhcp-server/lease'),
        api('GET', '/ip/firewall/address-list'),
        api('GET', '/ip/firewall/filter'),
        api('GET', '/ip/firewall/nat'),
        api('GET', '/ip/dhcp-client'),
        api('GET', '/ip/arp'),
        api('GET', '/ip/address'),
        api('GET', '/interface/wireguard/peers').catch(() => []),
        api('GET', '/ip/pool').catch(() => []),
        api('GET', '/interface').catch(() => []),
      ]);
      setLeases(leasesData || []);
      setArpEntries(arpData || []);
      setRouterAddresses(ipAddresses || []);
      setBlockedList((addrList || []).filter(a => a.list === BLOCKED_LIST));
      setNatRules((nat || []).filter(r => r.action === 'dst-nat' && r['to-addresses']));
      setWanInterfaces((dhcpClients || []).filter(c => c.disabled !== 'true'));
      setFilterRuleExists((filterRules || []).some(r =>
        r['src-address-list'] === BLOCKED_LIST && r.chain === 'forward' && r.action === 'drop'
      ));
      setWgPeers(wgData || []);
      setDhcpPools(poolData || []);
      setAllInterfaces((ifaceData || []).filter(i => i.disabled !== 'true' && i.type !== 'loopback'));
    } catch (e) {
      if (!leases) setLeases([]);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [fetchData]);

  const routerIps = useMemo(() => {
    const set = new Set();
    for (const ra of routerAddresses) {
      const ip = (ra.address || '').split('/')[0];
      if (ip) set.add(ip);
    }
    return set;
  }, [routerAddresses]);

  const wanIfaceNames = useMemo(() => {
    const set = new Set();
    for (const w of wanInterfaces) {
      if (w.interface) set.add(w.interface);
    }
    return set;
  }, [wanInterfaces]);

  const mergedClients = useMemo(() => {
    const map = new Map();

    for (const lease of (leases || [])) {
      const mac = (lease['mac-address'] || '').toUpperCase();
      if (!mac) continue;
      map.set(mac, {
        mac,
        ip: lease.address || '',
        hostname: lease['host-name'] || '',
        status: lease.status || '',
        source: 'dhcp',
        leaseId: lease['.id'] || '',
        dynamic: lease.dynamic,
        interface: '',
        subnet: getSubnet(lease.address || '', routerAddresses),
      });
    }

    for (const arp of arpEntries) {
      const mac = (arp['mac-address'] || '').toUpperCase();
      if (!mac) continue;
      if (routerIps.has(arp.address)) continue;
      if (wanIfaceNames.has(arp.interface)) continue;
      const isStatic = !isInDhcpRange(arp.address || '', dhcpPools);
      if (!isStatic && arp.complete !== 'true') continue;

      const existing = map.get(mac);
      if (existing) {
        if (!existing.interface) existing.interface = arp.interface || '';
      } else {
        map.set(mac, {
          mac,
          ip: arp.address || '',
          hostname: '',
          status: arp.status || '',
          source: 'arp',
          leaseId: '',
          dynamic: arp.dynamic,
          interface: arp.interface || '',
          subnet: getSubnet(arp.address || '', routerAddresses),
        });
      }
    }

    return Array.from(map.values());
  }, [leases, arpEntries, routerAddresses, routerIps, wanIfaceNames, dhcpPools]);

  const subnets = useMemo(() => {
    const counts = {};
    for (const c of mergedClients) {
      const key = c.subnet ? c.subnet.cidr : 'unknown';
      if (!counts[key]) counts[key] = { cidr: key, interface: c.subnet?.interface || '', count: 0 };
      counts[key].count++;
    }
    return Object.values(counts);
  }, [mergedClients]);

  const ensureFilterRule = async () => {
    if (filterRuleExists) return;
    await api('PUT', '/ip/firewall/filter', {
      chain: 'forward',
      'src-address-list': BLOCKED_LIST,
      action: 'drop',
      comment: 'RouterOS Panel - Block clients',
    });
    setFilterRuleExists(true);
  };

  const handleBlock = async (lease) => {
    const ip = lease.address;
    if (!ip) return;
    setLoading(prev => ({ ...prev, [ip]: true }));
    try {
      await ensureFilterRule();
      await api('PUT', '/ip/firewall/address-list', {
        list: BLOCKED_LIST,
        address: ip,
        comment: lease['host-name'] || lease['mac-address'] || '',
      });
      showMsg(`Blocked ${lease['host-name'] || ip}`);
      await fetchData();
    } catch (e) {
      showMsg('Failed to block');
    }
    setLoading(prev => ({ ...prev, [ip]: false }));
  };

  const handleUnblock = async (lease) => {
    const ip = lease.address;
    const entry = blockedList.find(b => b.address === ip);
    if (!entry) return;
    setLoading(prev => ({ ...prev, [ip]: true }));
    try {
      await api('DELETE', `/ip/firewall/address-list/${entry['.id']}`);
      showMsg(`Unblocked ${lease['host-name'] || ip}`);
      await fetchData();
    } catch (e) {
      showMsg('Failed to unblock');
    }
    setLoading(prev => ({ ...prev, [ip]: false }));
  };

  const handleMakeStatic = async (lease) => {
    const id = lease['.id'];
    if (!id) return;
    setLoading(prev => ({ ...prev, [lease.address]: true }));
    try {
      await api('POST', '/ip/dhcp-server/lease/make-static', { numbers: id });
      showMsg(`Bound ${lease.address} → ${lease['mac-address']}`);
      await fetchData();
    } catch (e) {
      showMsg('Failed to bind');
    }
    setLoading(prev => ({ ...prev, [lease.address]: false }));
  };

  const handleMakeDynamic = async (lease) => {
    const id = lease['.id'];
    if (!id) return;
    setLoading(prev => ({ ...prev, [lease.address]: true }));
    try {
      await api('DELETE', `/ip/dhcp-server/lease/${id}`);
      showMsg(`Unbound ${lease.address}`);
      await fetchData();
    } catch (e) {
      showMsg('Failed to unbind');
    }
    setLoading(prev => ({ ...prev, [lease.address]: false }));
  };

  const handleAddForward = async (lease) => {
    const ip = lease.address;
    if (!ip || !fwdForm.dstPort) return;
    setLoading(prev => ({ ...prev, [ip]: true }));
    try {
      const protocols = fwdForm.protocol === 'tcp+udp' ? ['tcp', 'udp'] : [fwdForm.protocol];
      for (const proto of protocols) {
        const rule = {
          chain: 'dstnat',
          action: 'dst-nat',
          protocol: proto,
          'dst-port': fwdForm.dstPort,
          'to-addresses': ip,
          'to-ports': fwdForm.toPort || fwdForm.dstPort,
          comment: `RouterOS Panel → ${lease['host-name'] || ip}`,
        };
        if (fwdForm.wanIface !== 'all') {
          rule['in-interface'] = fwdForm.wanIface;
        }
        await api('PUT', '/ip/firewall/nat', rule);
      }
      showMsg(`Port ${fwdForm.dstPort} → ${ip}:${fwdForm.toPort || fwdForm.dstPort}`);
      setForwardFor(null);
      setFwdForm({ dstPort: '', toPort: '', protocol: 'tcp', wanIface: 'all' });
      await fetchData();
    } catch (e) {
      showMsg('Failed to create forward');
    }
    setLoading(prev => ({ ...prev, [ip]: false }));
  };

  const handleDeleteForward = async (rule) => {
    try {
      await api('DELETE', `/ip/firewall/nat/${rule['.id']}`);
      showMsg(`Removed forward :${rule['dst-port']}`);
      await fetchData();
    } catch (e) {
      showMsg('Failed to delete forward');
    }
  };

  const getForwards = (ip) => natRules.filter(r => r['to-addresses'] === ip);

  const isBlocked = (ip) => blockedList.some(b => b.address === ip);

  const staticClients = useMemo(() =>
    mergedClients.filter(c => c.source === 'arp' && !isInDhcpRange(c.ip, dhcpPools)),
    [mergedClients, dhcpPools]
  );

  const filtered = mergedClients.filter(c => {
    if (tab === 'dhcp') {
      if (c.source === 'arp') return false;
    } else if (tab === 'all') {
      if (c.source === 'arp' && isInDhcpRange(c.ip, dhcpPools) && !showArp) return false;
    }
    if (subnetFilter !== 'all' && (c.subnet?.cidr || 'unknown') !== subnetFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return c.hostname.toLowerCase().includes(s) ||
      c.ip.toLowerCase().includes(s) ||
      c.mac.toLowerCase().includes(s) ||
      c.interface.toLowerCase().includes(s);
  });

  const sortedClients = [...filtered].sort((a, b) => {
    const aBlocked = isBlocked(a.ip);
    const bBlocked = isBlocked(b.ip);
    if (aBlocked !== bBlocked) return aBlocked ? -1 : 1;
    const aDhcpBound = a.source === 'dhcp' && a.status === 'bound';
    const bDhcpBound = b.source === 'dhcp' && b.status === 'bound';
    if (aDhcpBound !== bDhcpBound) return aDhcpBound ? -1 : 1;
    const aArp = a.source === 'arp';
    const bArp = b.source === 'arp';
    if (aArp !== bArp) return aArp ? -1 : 1;
    const aName = a.hostname || a.ip;
    const bName = b.hostname || b.ip;
    return aName.localeCompare(bName);
  });

  const dhcpCount = filtered.filter(c => c.source === 'dhcp').length;
  const staticInFiltered = filtered.filter(c => c.source === 'arp' && !isInDhcpRange(c.ip, dhcpPools)).length;
  const poolArpCount = mergedClients.filter(c => c.source === 'arp' && isInDhcpRange(c.ip, dhcpPools)).length;
  const showSubnetFilter = subnets.length > 1;

  if (leases === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#636b7e', fontSize: 13 }}>
        Loading clients...
      </div>
    );
  }

  const renderDhcpTab = () => (
    <>
      {showSubnetFilter && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setSubnetFilter('all')} style={tabStyle(subnetFilter === 'all')}>All ({mergedClients.length})</button>
          {subnets.map(s => (
            <button key={s.cidr} onClick={() => setSubnetFilter(s.cidr)} style={tabStyle(subnetFilter === s.cidr)}>
              {s.interface ? `${s.interface} / ` : ''}{s.cidr} ({s.count})
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 4px' }}>
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
          {filtered.length} client{filtered.length !== 1 ? 's' : ''}
          {dhcpCount > 0 && <span style={{ color: '#22c55e', marginLeft: 8 }}>{dhcpCount} dhcp</span>}
          {staticInFiltered > 0 && <span style={{ color: '#3b82f6', marginLeft: 8 }}>{staticInFiltered} static</span>}
          {tab === 'all' && poolArpCount > 0 && <span style={{ color: '#f59e0b', marginLeft: 8 }}>{poolArpCount} arp</span>}
          {blockedList.length > 0 && <span style={{ color: '#ef4444', marginLeft: 8 }}>{blockedList.length} blocked</span>}
        </span>
        {tab === 'all' && poolArpCount > 0 && (
          <button onClick={() => setShowArp(p => !p)} style={tabStyle(showArp, '#f59e0b')}>
            {showArp ? 'Hide' : 'Show'} ARP ({poolArpCount})
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: `calc(100vh - ${showSubnetFilter ? 320 : 276}px)`, overflowY: 'auto' }}>
        {sortedClients.map(client => {
          const ip = client.ip;
          const blocked = isBlocked(ip);
          const isArpOnly = client.source === 'arp';
          const active = client.source === 'dhcp' && client.status === 'bound';
          const hostname = client.hostname || '—';
          const mac = client.mac || '—';
          const busy = loading[ip];
          const isStatic = client.source === 'dhcp' && client.dynamic !== 'true';
          const forwards = getForwards(ip);
          const showFwdForm = forwardFor === ip;

          const leaseCompat = {
            address: client.ip,
            'host-name': client.hostname,
            'mac-address': client.mac,
            '.id': client.leaseId,
            status: client.status,
            dynamic: client.dynamic,
          };

          const dotColor = blocked ? '#ef4444' : active ? '#22c55e' : isArpOnly ? '#f59e0b' : '#636b7e';
          const dotGlow = blocked ? '0 0 6px #ef444460' : active ? '0 0 6px #22c55e40' : isArpOnly ? '0 0 6px #f59e0b40' : 'none';

          return (
            <div key={client.mac} style={{
              background: '#12151c',
              borderRadius: 8,
              border: `1px solid ${blocked ? '#ef444430' : '#1a1f2e'}`,
              overflow: 'hidden',
              transition: 'border-color 0.2s ease',
              flexShrink: 0,
            }}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: dotGlow }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      color: blocked ? '#ef4444' : isArpOnly && !client.hostname ? '#636b7e' : '#eef0f4',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{hostname}</span>
                    {blocked && <span style={badgeStyle('#ef4444')}>BLOCKED</span>}
                    {isArpOnly && <span style={badgeStyle('#3b82f6')}>ARP</span>}
                    {isStatic && <span style={badgeStyle('#8b5cf6')}>STATIC</span>}
                    {forwards.length > 0 && <span style={badgeStyle('#f59e0b')}>{forwards.length} FWD</span>}
                    <span style={{
                      fontSize: 9, fontWeight: 500, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: isArpOnly ? '#f59e0b' : active ? '#22c55e' : '#636b7e',
                      background: isArpOnly ? '#f59e0b10' : active ? '#22c55e10' : '#0d1017',
                      padding: '2px 6px', borderRadius: 3,
                      border: `1px solid ${isArpOnly ? '#f59e0b20' : active ? '#22c55e20' : '#1a1f2e'}`,
                    }}>{isArpOnly ? 'arp' : client.status || 'unknown'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>{ip || '—'}</span>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>{mac}</span>
                    {isArpOnly && client.interface && (
                      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#3b82f680' }}>{client.interface}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      if (showFwdForm) { setForwardFor(null); }
                      else { setForwardFor(ip); setFwdForm({ dstPort: '', toPort: '', protocol: 'tcp', wanIface: 'all' }); }
                    }}
                    disabled={!ip}
                    style={{
                      padding: '6px 14px', fontSize: 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                      textTransform: 'uppercase', letterSpacing: '0.08em', borderRadius: 6,
                      cursor: !ip ? 'default' : 'pointer',
                      background: showFwdForm ? '#f59e0b20' : '#f59e0b15', color: '#f59e0b',
                      border: `1px solid ${showFwdForm ? '#f59e0b50' : '#f59e0b30'}`, transition: 'all 0.2s ease',
                    }}
                  >FWD</button>
                  {!isArpOnly && (
                    <button
                      onClick={() => isStatic ? handleMakeDynamic(leaseCompat) : handleMakeStatic(leaseCompat)}
                      disabled={busy || !ip}
                      style={{
                        padding: '6px 14px', fontSize: 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                        textTransform: 'uppercase', letterSpacing: '0.08em', borderRadius: 6,
                        cursor: busy || !ip ? 'default' : 'pointer',
                        background: isStatic ? '#8b5cf615' : '#3b82f615',
                        color: isStatic ? '#8b5cf6' : '#3b82f6',
                        border: `1px solid ${isStatic ? '#8b5cf630' : '#3b82f630'}`,
                        transition: 'all 0.2s ease', opacity: busy ? 0.5 : 1,
                      }}
                    >{busy ? '...' : isStatic ? 'Unbind' : 'Bind'}</button>
                  )}
                  <button
                    onClick={() => blocked ? handleUnblock(leaseCompat) : handleBlock(leaseCompat)}
                    disabled={busy || !ip}
                    style={{
                      padding: '6px 14px', fontSize: 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                      textTransform: 'uppercase', letterSpacing: '0.08em', borderRadius: 6,
                      cursor: busy || !ip ? 'default' : 'pointer',
                      background: blocked ? '#22c55e15' : '#ef444415',
                      color: blocked ? '#22c55e' : '#ef4444',
                      border: `1px solid ${blocked ? '#22c55e30' : '#ef444430'}`,
                      transition: 'all 0.2s ease', opacity: busy ? 0.5 : 1,
                    }}
                  >{busy ? '...' : blocked ? 'Unblock' : 'Block'}</button>
                </div>
              </div>

              {(forwards.length > 0 || showFwdForm) && (
                <div style={{ borderTop: '1px solid #1a1f2e', padding: '10px 16px', background: '#0d1017' }}>
                  {forwards.map(rule => (
                    <div key={rule['.id']} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#f59e0b' }}>
                        :{rule['dst-port']} → {rule['to-addresses']}:{rule['to-ports'] || rule['dst-port']}
                        <span style={{ color: '#636b7e', marginLeft: 8 }}>{rule.protocol || 'tcp'}</span>
                        {rule['in-interface'] && <span style={{ color: '#3b82f6', marginLeft: 8 }}>{rule['in-interface']}</span>}
                      </span>
                      <button onClick={() => handleDeleteForward(rule)} style={{
                        padding: '2px 8px', fontSize: 9, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                        borderRadius: 4, cursor: 'pointer', background: '#ef444410', color: '#ef4444', border: '1px solid #ef444425',
                      }}>DEL</button>
                    </div>
                  ))}

                  {showFwdForm && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: forwards.length > 0 ? 10 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', color: '#636b7e', width: 60, flexShrink: 0 }}>Port</span>
                        <input value={fwdForm.dstPort} onChange={e => setFwdForm(p => ({ ...p, dstPort: e.target.value }))} placeholder="External" style={{ ...inputStyle, width: 80 }} />
                        <span style={{ color: '#636b7e', fontSize: 12 }}>→</span>
                        <input value={fwdForm.toPort} onChange={e => setFwdForm(p => ({ ...p, toPort: e.target.value }))} placeholder="Internal" style={{ ...inputStyle, width: 80 }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', color: '#636b7e', width: 60, flexShrink: 0 }}>Protocol</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {['tcp', 'udp', 'tcp+udp'].map(p => (
                            <button key={p} onClick={() => setFwdForm(prev => ({ ...prev, protocol: p }))} style={{
                              padding: '4px 8px', fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                              borderRadius: 4, cursor: 'pointer',
                              background: fwdForm.protocol === p ? '#f59e0b20' : '#12151c',
                              color: fwdForm.protocol === p ? '#f59e0b' : '#636b7e',
                              border: `1px solid ${fwdForm.protocol === p ? '#f59e0b40' : '#1a1f2e'}`,
                            }}>{p}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', color: '#636b7e', width: 60, flexShrink: 0 }}>Iface</span>
                        <select
                          value={fwdForm.wanIface}
                          onChange={e => setFwdForm(prev => ({ ...prev, wanIface: e.target.value }))}
                          style={{ ...inputStyle, width: 'auto', minWidth: 120 }}
                        >
                          <option value="all">All</option>
                          {allInterfaces.map(i => (
                            <option key={i.name} value={i.name}>{i.name}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleAddForward(leaseCompat)} disabled={!fwdForm.dstPort || busy} style={{
                          padding: '6px 16px', fontSize: 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                          textTransform: 'uppercase', letterSpacing: '0.08em', borderRadius: 6,
                          cursor: !fwdForm.dstPort || busy ? 'default' : 'pointer',
                          background: '#22c55e15', color: '#22c55e', border: '1px solid #22c55e30',
                          opacity: !fwdForm.dstPort || busy ? 0.5 : 1,
                        }}>ADD</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {sortedClients.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#636b7e', fontSize: 13 }}>
            {search ? 'No clients match your search' : 'No clients found'}
          </div>
        )}
      </div>
    </>
  );

  const renderWgTab = () => {
    const filteredPeers = wgPeers.filter(p => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (p.name || '').toLowerCase().includes(s) ||
        (p['endpoint-address'] || '').toLowerCase().includes(s) ||
        (p['allowed-address'] || '').toLowerCase().includes(s) ||
        (p.interface || '').toLowerCase().includes(s);
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 276px)', overflowY: 'auto' }}>
        <div style={{ padding: '0 4px', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
            {filteredPeers.length} peer{filteredPeers.length !== 1 ? 's' : ''}
          </span>
        </div>
        {filteredPeers.map(p => {
          const name = p.name || p['.id'];
          const endpoint = p['current-endpoint-address'] || p['endpoint-address'] || '—';
          const port = p['current-endpoint-port'] || p['endpoint-port'] || '';
          const allowed = p['allowed-address'] || '—';
          const lastHandshake = p['last-handshake'] || 'never';
          const iface = p.interface || '—';
          const rx = p.rx ? `${(parseInt(p.rx) / 1024).toFixed(0)} KB` : '—';
          const tx = p.tx ? `${(parseInt(p.tx) / 1024).toFixed(0)} KB` : '—';
          const active = lastHandshake !== 'never' && lastHandshake !== '';

          return (
            <div key={p['.id']} style={{
              background: '#12151c', borderRadius: 8, border: '1px solid #1a1f2e',
              padding: '12px 16px', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#22c55e' : '#636b7e', flexShrink: 0, boxShadow: active ? '0 0 6px #22c55e40' : 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#eef0f4' }}>{name}</span>
                    <span style={badgeStyle('#8b5cf6')}>{iface}</span>
                    {active && <span style={badgeStyle('#22c55e')}>ACTIVE</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#c8ccd4' }}>
                      {endpoint}{port ? `:${port}` : ''}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>{allowed}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, paddingLeft: 20 }}>
                <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                  Handshake <span style={{ color: active ? '#22c55e' : '#ef4444' }}>{lastHandshake}</span>
                </span>
                <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                  RX <span style={{ color: '#3b82f6' }}>{rx}</span>
                </span>
                <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
                  TX <span style={{ color: '#22c55e' }}>{tx}</span>
                </span>
              </div>
            </div>
          );
        })}
        {filteredPeers.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#636b7e', fontSize: 13 }}>No WireGuard peers configured</div>
        )}
      </div>
    );
  };

  const renderStaticTab = () => {
    const filteredStatic = staticClients.filter(c => {
      if (!search) return true;
      const s = search.toLowerCase();
      return c.ip.toLowerCase().includes(s) ||
        c.mac.toLowerCase().includes(s) ||
        c.interface.toLowerCase().includes(s);
    }).sort((a, b) => {
      const aBlocked = isBlocked(a.ip);
      const bBlocked = isBlocked(b.ip);
      if (aBlocked !== bBlocked) return aBlocked ? -1 : 1;
      return ipToNum(a.ip) - ipToNum(b.ip);
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 276px)', overflowY: 'auto' }}>
        <div style={{ padding: '0 4px', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>
            {filteredStatic.length} static client{filteredStatic.length !== 1 ? 's' : ''}
            {blockedList.length > 0 && <span style={{ color: '#ef4444', marginLeft: 8 }}>{blockedList.length} blocked</span>}
          </span>
        </div>
        {filteredStatic.map(client => {
          const ip = client.ip;
          const blocked = isBlocked(ip);
          const mac = client.mac || '—';
          const busy = loading[ip];
          const forwards = getForwards(ip);
          const showFwdForm = forwardFor === ip;

          const leaseCompat = {
            address: client.ip,
            'host-name': '',
            'mac-address': client.mac,
          };

          return (
            <div key={client.mac} style={{
              background: '#12151c',
              borderRadius: 8,
              border: `1px solid ${blocked ? '#ef444430' : '#1a1f2e'}`,
              overflow: 'hidden',
              transition: 'border-color 0.2s ease',
              flexShrink: 0,
            }}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: blocked ? '#ef4444' : '#3b82f6', flexShrink: 0, boxShadow: blocked ? '0 0 6px #ef444460' : '0 0 6px #3b82f640' }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: blocked ? '#ef4444' : '#eef0f4' }}>{ip}</span>
                    {blocked && <span style={badgeStyle('#ef4444')}>BLOCKED</span>}
                    {forwards.length > 0 && <span style={badgeStyle('#f59e0b')}>{forwards.length} FWD</span>}
                    {client.interface && <span style={badgeStyle('#3b82f6')}>{client.interface}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>{mac}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      if (showFwdForm) { setForwardFor(null); }
                      else { setForwardFor(ip); setFwdForm({ dstPort: '', toPort: '', protocol: 'tcp', wanIface: 'all' }); }
                    }}
                    disabled={!ip}
                    style={{
                      padding: '6px 14px', fontSize: 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                      textTransform: 'uppercase', letterSpacing: '0.08em', borderRadius: 6,
                      cursor: !ip ? 'default' : 'pointer',
                      background: showFwdForm ? '#f59e0b20' : '#f59e0b15', color: '#f59e0b',
                      border: `1px solid ${showFwdForm ? '#f59e0b50' : '#f59e0b30'}`, transition: 'all 0.2s ease',
                    }}
                  >FWD</button>
                  <button
                    onClick={() => blocked ? handleUnblock(leaseCompat) : handleBlock(leaseCompat)}
                    disabled={busy || !ip}
                    style={{
                      padding: '6px 14px', fontSize: 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                      textTransform: 'uppercase', letterSpacing: '0.08em', borderRadius: 6,
                      cursor: busy || !ip ? 'default' : 'pointer',
                      background: blocked ? '#22c55e15' : '#ef444415',
                      color: blocked ? '#22c55e' : '#ef4444',
                      border: `1px solid ${blocked ? '#22c55e30' : '#ef444430'}`,
                      transition: 'all 0.2s ease', opacity: busy ? 0.5 : 1,
                    }}
                  >{busy ? '...' : blocked ? 'Unblock' : 'Block'}</button>
                </div>
              </div>

              {(forwards.length > 0 || showFwdForm) && (
                <div style={{ borderTop: '1px solid #1a1f2e', padding: '10px 16px', background: '#0d1017' }}>
                  {forwards.map(rule => (
                    <div key={rule['.id']} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#f59e0b' }}>
                        :{rule['dst-port']} → {rule['to-addresses']}:{rule['to-ports'] || rule['dst-port']}
                        <span style={{ color: '#636b7e', marginLeft: 8 }}>{rule.protocol || 'tcp'}</span>
                        {rule['in-interface'] && <span style={{ color: '#3b82f6', marginLeft: 8 }}>{rule['in-interface']}</span>}
                      </span>
                      <button onClick={() => handleDeleteForward(rule)} style={{
                        padding: '2px 8px', fontSize: 9, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                        borderRadius: 4, cursor: 'pointer', background: '#ef444410', color: '#ef4444', border: '1px solid #ef444425',
                      }}>DEL</button>
                    </div>
                  ))}

                  {showFwdForm && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: forwards.length > 0 ? 10 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', color: '#636b7e', width: 60, flexShrink: 0 }}>Port</span>
                        <input value={fwdForm.dstPort} onChange={e => setFwdForm(p => ({ ...p, dstPort: e.target.value }))} placeholder="External" style={{ ...inputStyle, width: 80 }} />
                        <span style={{ color: '#636b7e', fontSize: 12 }}>→</span>
                        <input value={fwdForm.toPort} onChange={e => setFwdForm(p => ({ ...p, toPort: e.target.value }))} placeholder="Internal" style={{ ...inputStyle, width: 80 }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', color: '#636b7e', width: 60, flexShrink: 0 }}>Protocol</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {['tcp', 'udp', 'tcp+udp'].map(p => (
                            <button key={p} onClick={() => setFwdForm(prev => ({ ...prev, protocol: p }))} style={{
                              padding: '4px 8px', fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                              borderRadius: 4, cursor: 'pointer',
                              background: fwdForm.protocol === p ? '#f59e0b20' : '#12151c',
                              color: fwdForm.protocol === p ? '#f59e0b' : '#636b7e',
                              border: `1px solid ${fwdForm.protocol === p ? '#f59e0b40' : '#1a1f2e'}`,
                            }}>{p}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', color: '#636b7e', width: 60, flexShrink: 0 }}>Iface</span>
                        <select
                          value={fwdForm.wanIface}
                          onChange={e => setFwdForm(prev => ({ ...prev, wanIface: e.target.value }))}
                          style={{ ...inputStyle, width: 'auto', minWidth: 120 }}
                        >
                          <option value="all">All</option>
                          {allInterfaces.map(i => (
                            <option key={i.name} value={i.name}>{i.name}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleAddForward(leaseCompat)} disabled={!fwdForm.dstPort || busy} style={{
                          padding: '6px 16px', fontSize: 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                          textTransform: 'uppercase', letterSpacing: '0.08em', borderRadius: 6,
                          cursor: !fwdForm.dstPort || busy ? 'default' : 'pointer',
                          background: '#22c55e15', color: '#22c55e', border: '1px solid #22c55e30',
                          opacity: !fwdForm.dstPort || busy ? 0.5 : 1,
                        }}>ADD</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filteredStatic.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#636b7e', fontSize: 13 }}>
            {search ? 'No static clients match your search' : 'No static clients found'}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <MessageBar message={message} />

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button onClick={() => setTab('all')} style={tabStyle(tab === 'all', '#c8ccd4')}>
          All ({(leases || []).length + staticClients.length})
        </button>
        <button onClick={() => setTab('dhcp')} style={tabStyle(tab === 'dhcp', '#22c55e')}>
          DHCP ({(leases || []).length})
        </button>
        <button onClick={() => setTab('static')} style={tabStyle(tab === 'static', '#3b82f6')}>
          Static ({staticClients.length})
        </button>
        <button onClick={() => setTab('wg')} style={tabStyle(tab === 'wg', '#f59e0b')}>
          WireGuard ({wgPeers.length})
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

      {tab === 'all' && renderDhcpTab()}
      {tab === 'dhcp' && renderDhcpTab()}
      {tab === 'static' && renderStaticTab()}
      {tab === 'wg' && renderWgTab()}
    </>
  );
}
