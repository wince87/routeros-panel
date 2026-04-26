import { useState, useEffect, useRef, useCallback } from 'react';
import { api, apiList } from '../api';
import { useRouterData } from '../contexts/RouterDataContext';
import { formatSpeedNum } from '../utils/format';

export default function DashboardPage() {
  const { identity, resource } = useRouterData();
  const [routerboard, setRouterboard] = useState(null);
  const [packages, setPackages] = useState([]);
  const [interfaces, setInterfaces] = useState([]);
  const [ethernets, setEthernets] = useState([]);
  const [bridges, setBridges] = useState([]);
  const [bridgePorts, setBridgePorts] = useState([]);
  const [wifi, setWifi] = useState([]);
  const [ipAddresses, setIpAddresses] = useState([]);
  const [dhcpClients, setDhcpClients] = useState([]);
  const [dhcpServers, setDhcpServers] = useState([]);
  const [leases, setLeases] = useState([]);
  const [dns, setDns] = useState(null);
  const [natRules, setNatRules] = useState([]);
  const [filterRules, setFilterRules] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [wireguard, setWireguard] = useState([]);

  const wanRef = useRef(null);
  const coreRef = useRef(null);
  const bridgeRef = useRef(null);
  const lanRef = useRef(null);
  const [lines, setLines] = useState([]);
  const svgRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [rb, pkg, ifaces, eth, br, bp, wf, ipa, dc, ds, lease, dns, nat, fil, rts, wg] = await Promise.all([
        api('GET', '/system/routerboard').catch(() => null),
        apiList('GET', '/system/package'),
        apiList('GET', '/interface'),
        apiList('GET', '/interface/ethernet'),
        apiList('GET', '/interface/bridge'),
        apiList('GET', '/interface/bridge/port'),
        apiList('GET', '/interface/wifi'),
        apiList('GET', '/ip/address'),
        apiList('GET', '/ip/dhcp-client'),
        apiList('GET', '/ip/dhcp-server'),
        apiList('GET', '/ip/dhcp-server/lease'),
        api('GET', '/ip/dns').catch(() => null),
        apiList('GET', '/ip/firewall/nat'),
        apiList('GET', '/ip/firewall/filter'),
        apiList('GET', '/ip/route'),
        apiList('GET', '/interface/wireguard'),
      ]);
      setRouterboard(rb);
      setPackages(pkg);
      setInterfaces(ifaces);
      setEthernets(eth);
      setBridges(br);
      setBridgePorts(bp);
      setWifi(wf);
      setIpAddresses(ipa);
      setDhcpClients(dc);
      setDhcpServers(ds);
      setLeases(lease);
      setDns(dns);
      setNatRules(nat);
      setFilterRules(fil);
      setRoutes(rts);
      setWireguard(wg);
    } catch (e) { console.error('Dashboard fetch:', e); }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 15000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const wanInterfaces = dhcpClients.map(dc => dc.interface);
  const bridgeNames = bridges.map(b => b.name);
  const bridgePortNames = bridgePorts.map(bp => bp.interface);

  const wanEthernets = ethernets.filter(e => wanInterfaces.includes(e.name));
  const lanEthernets = ethernets.filter(e => bridgePortNames.includes(e.name));
  const unusedEthernets = ethernets.filter(e => !wanInterfaces.includes(e.name) && !bridgePortNames.includes(e.name) && !bridgeNames.includes(e.name));

  const activeLeases = leases.filter(l => l.status === 'bound');

  const cpuLoad = parseInt(resource?.['cpu-load']) || 0;
  const totalMem = parseInt(resource?.['total-memory']) || 1;
  const freeMem = parseInt(resource?.['free-memory']) || 0;
  const usedMemPct = Math.round(((totalMem - freeMem) / totalMem) * 100);

  const updateLines = useCallback(() => {
    if (!svgRef.current || !wanRef.current || !coreRef.current || !bridgeRef.current || !lanRef.current) return;
    const svg = svgRef.current.getBoundingClientRect();
    const wan = wanRef.current.getBoundingClientRect();
    const core = coreRef.current.getBoundingClientRect();
    const br = bridgeRef.current.getBoundingClientRect();
    const lan = lanRef.current.getBoundingClientRect();

    const newLines = [];
    newLines.push({
      x1: wan.right - svg.left,
      y1: wan.top + wan.height / 2 - svg.top,
      x2: core.left - svg.left,
      y2: core.top + core.height / 2 - svg.top,
      color: '#f59e0b',
    });
    newLines.push({
      x1: core.right - svg.left,
      y1: core.top + core.height / 2 - svg.top,
      x2: br.left - svg.left,
      y2: br.top + br.height / 2 - svg.top,
      color: '#22c55e',
    });
    newLines.push({
      x1: br.right - svg.left,
      y1: br.top + br.height / 2 - svg.top,
      x2: lan.left - svg.left,
      y2: lan.top + lan.height / 2 - svg.top,
      color: '#3b82f6',
    });
    setLines(newLines);
  }, []);

  useEffect(() => {
    const timer = setTimeout(updateLines, 100);
    window.addEventListener('resize', updateLines);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateLines);
    };
  }, [updateLines, interfaces]);

  const cardStyle = {
    background: '#12151c',
    borderRadius: 12,
    border: '1px solid #1a1f2e',
    padding: 16,
  };

  const labelStyle = {
    fontSize: 9,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#636b7e',
    fontFamily: "'Outfit', sans-serif",
  };

  const valStyle = {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#c8ccd4',
  };

  const portBlock = (name, status, color, ip) => (
    <div key={name} style={{
      background: '#0d1017',
      borderRadius: 6,
      padding: '8px 10px',
      border: `1px solid ${color}25`,
      marginBottom: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 600 }}>{name}</span>
        <span style={{
          fontSize: 9,
          fontFamily: "'JetBrains Mono', monospace",
          color: status === 'running' || status === 'bound' ? '#22c55e' : '#ef4444',
          textTransform: 'uppercase',
        }}>{status || 'down'}</span>
      </div>
      {ip && <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: color, marginTop: 2 }}>{ip}</div>}
    </div>
  );

  const getIfaceStatus = (name) => interfaces.find(i => i.name === name)?.running === 'true' ? 'running' : 'down';
  const getIpForIface = (name) => ipAddresses.find(a => a.interface === name)?.address || '';
  const getDhcpStatus = (name) => dhcpClients.find(c => c.interface === name)?.status || '';

  return (
    <>
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <svg ref={svgRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
          {lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeWidth={2} strokeDasharray="6 4" opacity={0.4} />
          ))}
        </svg>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr', gap: 16, position: 'relative', zIndex: 2 }}>
          <div ref={wanRef} style={cardStyle}>
            <div style={{ ...labelStyle, marginBottom: 10, color: '#f59e0b' }}>WAN</div>
            {wanEthernets.length === 0 && <div style={{ ...valStyle, color: '#636b7e' }}>No WAN</div>}
            {wanEthernets.map(e => portBlock(e.name, getDhcpStatus(e.name), '#f59e0b', getIpForIface(e.name)))}
          </div>

          <div ref={coreRef} style={{ ...cardStyle, border: '1px solid #8b5cf630' }}>
            <div style={{ ...labelStyle, marginBottom: 10, color: '#8b5cf6' }}>ROUTER CORE</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#eef0f4', marginBottom: 2, letterSpacing: '-0.02em' }}>{identity?.name || '—'}</div>
            <div style={{ ...valStyle, marginBottom: 10, color: '#636b7e' }}>
              {routerboard?.model || '—'} • {resource?.version || '—'} • {resource?.['architecture-name'] || ''}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ background: '#0d1017', borderRadius: 6, padding: '8px 10px', border: '1px solid #1a1f2e' }}>
                <div style={{ ...labelStyle, marginBottom: 4 }}>CPU</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#1a1f2e' }}>
                    <div style={{ height: '100%', width: `${cpuLoad}%`, borderRadius: 2, background: cpuLoad > 80 ? '#ef4444' : '#22c55e', transition: 'width 0.5s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{cpuLoad}%</span>
                </div>
              </div>
              <div style={{ background: '#0d1017', borderRadius: 6, padding: '8px 10px', border: '1px solid #1a1f2e' }}>
                <div style={{ ...labelStyle, marginBottom: 4 }}>RAM</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#1a1f2e' }}>
                    <div style={{ height: '100%', width: `${usedMemPct}%`, borderRadius: 2, background: usedMemPct > 80 ? '#ef4444' : '#3b82f6', transition: 'width 0.5s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{usedMemPct}%</span>
                </div>
              </div>
            </div>

            <div style={{ ...valStyle, color: '#636b7e', fontSize: 10 }}>
              Uptime: <span style={{ color: '#c8ccd4' }}>{resource?.uptime || '—'}</span>
            </div>
          </div>

          <div ref={bridgeRef} style={cardStyle}>
            <div style={{ ...labelStyle, marginBottom: 10, color: '#22c55e' }}>BRIDGE / LAN</div>
            {bridges.map(b => (
              <div key={b.name} style={{
                background: '#0d1017',
                borderRadius: 6,
                padding: '8px 10px',
                border: '1px solid #22c55e20',
                marginBottom: 4,
              }}>
                <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 600, marginBottom: 2 }}>{b.name}</div>
                <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#22c55e' }}>{getIpForIface(b.name)}</div>
                {dhcpServers.filter(s => s.interface === b.name).map(s => (
                  <div key={s['.id']} style={{ fontSize: 9, color: '#636b7e', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                    DHCP: {s['address-pool']} ({activeLeases.length} leases)
                  </div>
                ))}
              </div>
            ))}
            {wifi.length > 0 && wifi.map(w => (
              <div key={w['.id']} style={{
                background: '#0d1017',
                borderRadius: 6,
                padding: '8px 10px',
                border: '1px solid #8b5cf620',
                marginBottom: 4,
                marginTop: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 600 }}>{w.name}</span>
                  <span style={{ fontSize: 9, color: '#8b5cf6', fontFamily: "'JetBrains Mono', monospace" }}>WiFi</span>
                </div>
                {w.configuration && <div style={{ fontSize: 9, color: '#636b7e', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{w.configuration}</div>}
              </div>
            ))}
            {wireguard.length > 0 && wireguard.map(w => (
              <div key={w['.id']} style={{
                background: '#0d1017',
                borderRadius: 6,
                padding: '8px 10px',
                border: '1px solid #3b82f620',
                marginBottom: 4,
                marginTop: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', fontWeight: 600 }}>{w.name}</span>
                  <span style={{ fontSize: 9, color: '#3b82f6', fontFamily: "'JetBrains Mono', monospace" }}>WG</span>
                </div>
                <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#3b82f6', marginTop: 2 }}>{getIpForIface(w.name)}</div>
              </div>
            ))}
          </div>

          <div ref={lanRef} style={cardStyle}>
            <div style={{ ...labelStyle, marginBottom: 10, color: '#3b82f6' }}>LAN PORTS</div>
            {lanEthernets.length === 0 && <div style={{ ...valStyle, color: '#636b7e' }}>No LAN ports</div>}
            {lanEthernets.map(e => portBlock(e.name, getIfaceStatus(e.name), '#3b82f6', ''))}
            {unusedEthernets.length > 0 && (
              <>
                <div style={{ ...labelStyle, marginTop: 10, marginBottom: 6, color: '#636b7e' }}>UNUSED</div>
                {unusedEthernets.map(e => portBlock(e.name, getIfaceStatus(e.name), '#636b7e', ''))}
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: 10 }}>System</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={labelStyle}>Board</span>
              <span style={valStyle}>{routerboard?.['board-name'] || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={labelStyle}>Serial</span>
              <span style={valStyle}>{routerboard?.['serial-number'] || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={labelStyle}>Firmware</span>
              <span style={valStyle}>{routerboard?.['current-firmware'] || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={labelStyle}>Packages</span>
              <span style={valStyle}>{packages.length}</span>
            </div>
            {packages.map(p => (
              <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 8 }}>
                <span style={{ ...valStyle, fontSize: 10, color: '#636b7e' }}>{p.name}</span>
                <span style={{ ...valStyle, fontSize: 10 }}>{p.version}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: 10 }}>DHCP Leases</div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {activeLeases.length === 0 && <div style={{ ...valStyle, color: '#636b7e' }}>No active leases</div>}
            {activeLeases.map(l => (
              <div key={l['.id']} style={{
                background: '#0d1017',
                borderRadius: 6,
                padding: '6px 8px',
                border: '1px solid #1a1f2e',
                marginBottom: 3,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4' }}>{l.address}</span>
                  <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#22c55e' }}>{l['host-name'] || ''}</span>
                </div>
                <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e' }}>{l['mac-address']}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: 10 }}>Firewall & Routes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={labelStyle}>NAT Rules</span>
              <span style={valStyle}>{natRules.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={labelStyle}>Filter Rules</span>
              <span style={valStyle}>{filterRules.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={labelStyle}>Routes</span>
              <span style={valStyle}>{routes.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={labelStyle}>DNS</span>
              <span style={valStyle}>{dns?.servers || '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
