import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api, apiList } from '../api';
import { useRouterData } from '../contexts/RouterDataContext';
import { useMessage } from '../hooks/useMessage';
import { MessageBar } from '../components/MessageBar';
import { ispLabel, netLabel } from '../utils/isp';
import { getNodeSide as getNodeSideRaw, anchorPoint as anchorPointRaw, edgePath } from '../utils/graph';

const NW = 190;
const NH = 100;
const getNodeSide = (fromPos, toPos) => getNodeSideRaw(fromPos, toPos, NW, NH);
const anchorPoint = (pos, side, offset) => anchorPointRaw(pos, side, offset, NW, NH);

export default function RoutesPage() {
  const { identity } = useRouterData();
  const [routes, setRoutes] = useState([]);
  const [interfaces, setInterfaces] = useState([]);
  const [ipAddresses, setIpAddresses] = useState([]);
  const [dhcpClients, setDhcpClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, showMsg] = useMessage();
  const [pccRatio, setPccRatio] = useState(null);

  const containerRef = useRef(null);
  const [containerW, setContainerW] = useState(0);
  const [positions, setPositions] = useState({});
  const [dragInfo, setDragInfo] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const [wgInterfaces, setWgInterfaces] = useState([]);
  const [wgPeers, setWgPeers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newRoute, setNewRoute] = useState({ 'dst-address': '', gateway: '', distance: '1' });
  const [customGw, setCustomGw] = useState(false);

  const knownGateways = useMemo(() => {
    const gws = [];
    dhcpClients.filter(c => c.disabled !== 'true' && c.gateway).forEach(c => {
      gws.push({
        value: c.gateway,
        label: ispLabel(c.interface, dhcpClients),
        sub: `${c.gateway} (${c.interface})`,
        color: '#22c55e',
      });
    });
    interfaces.filter(i => i.type === 'bridge' || /^(wireguard|wg)/i.test(i.name)).forEach(i => {
      const addr = ipAddresses.find(a => a.interface === i.name);
      if (!addr) return;
      gws.push({
        value: i.name,
        label: netLabel(i.name),
        sub: `${addr.address} (${i.name})`,
        color: /^(wireguard|wg)/i.test(i.name) ? '#f59e0b' : '#3b82f6',
      });
    });
    return gws;
  }, [dhcpClients, interfaces, ipAddresses]);

  const fetchAll = useCallback(async () => {
    try {
      const [rts, ifaces, addrs, dhcp, mgl, wg, wgp] = await Promise.all([
        apiList('GET', '/ip/route'),
        apiList('GET', '/interface'),
        apiList('GET', '/ip/address'),
        apiList('GET', '/ip/dhcp-client'),
        apiList('GET', '/ip/firewall/mangle'),
        apiList('GET', '/interface/wireguard'),
        apiList('GET', '/interface/wireguard/peers'),
      ]);
      setRoutes(rts);
      setInterfaces(ifaces);
      setIpAddresses(addrs);
      setDhcpClients(dhcp);
      setWgInterfaces(wg);
      setWgPeers(wgp);
      const pccRules = mgl.filter(m => m.comment?.match(/^PCC-PANEL: pcc \d+$/));
      if (pccRules.length > 0) {
        const marks = {};
        pccRules.forEach(r => {
          const m = r['new-connection-mark'];
          if (m) marks[m] = (marks[m] || 0) + 1;
        });
        const total = pccRules.length;
        const pccMap = {};
        Object.entries(marks).forEach(([mark, cnt]) => {
          const tbl = mark.replace(/_conn$/, '');
          pccMap[tbl] = Math.round(cnt / total * 100);
        });
        setPccRatio(pccMap);
      } else {
        setPccRatio(null);
      }
    } catch (e) { console.error('Routes fetch:', e); }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 10000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const wanIfaces = useMemo(() =>
    dhcpClients.filter(c => c.disabled !== 'true').map(c => c.interface),
  [dhcpClients]);

  const wgServers = useMemo(() => {
    return wgInterfaces.filter(wg => {
      const ifacePeers = wgPeers.filter(p => p.interface === wg.name);
      return ifacePeers.length === 0 || !ifacePeers.every(p => p['endpoint-address']);
    });
  }, [wgInterfaces, wgPeers]);

  const wgServerPeers = useMemo(() => {
    const peers = [];
    wgServers.forEach(srv => {
      wgPeers
        .filter(p => p.interface === srv.name && p.disabled !== 'true')
        .forEach(p => {
          peers.push({
            name: p.comment || p['public-key']?.substring(0, 8) + '...',
            iface: srv.name,
            allowedAddress: p['allowed-address'] || '',
            lastHandshake: p['last-handshake'],
            endpoint: p['current-endpoint-address'] || '',
          });
        });
    });
    return peers;
  }, [wgServers, wgPeers]);

  const nodes = useMemo(() => {
    const list = [];
    const wgIfaceNames = new Set(wgServers.map(w => w.name));
    const ifaceNameSet = new Set(interfaces.map(i => i.name));

    ipAddresses
      .filter(a => !wanIfaces.includes(a.interface) && ifaceNameSet.has(a.interface))
      .forEach(a => {
        const isWgServer = wgIfaceNames.has(a.interface);
        const wg = isWgServer ? wgServers.find(w => w.name === a.interface) : null;
        list.push({
          id: `lan-${a.interface}`,
          type: 'lan',
          label: netLabel(a.interface),
          detail: a.address,
          sub: isWgServer ? `${a.interface} :${wg?.['listen-port'] || '?'}` : a.interface,
          color: isWgServer ? '#f59e0b' : '#3b82f6',
          isWgServer,
        });
      });

    if (wgServerPeers.length > 0) {
      list.push({
        id: 'vpn-clients',
        type: 'vpn-clients',
        label: `VPN Clients (${wgServerPeers.length})`,
        detail: wgServerPeers.map(p => p.name).join(', '),
        sub: wgServerPeers.filter(p => p.endpoint).length + ' online',
        color: '#f59e0b',
        pccPercent: null,
      });
    }

    const ifaceNames = new Set(interfaces.map(i => i.name));
    const ispMap = {};
    routes
      .filter(r => r['dst-address'] === '0.0.0.0/0' && r.gateway)
      .sort((a, b) => (parseInt(a.distance) || 0) - (parseInt(b.distance) || 0))
      .forEach(r => {
        const iface = r['vrf-interface'] || (ifaceNames.has(r.gateway) ? r.gateway : '');
        const key = iface || r.gateway;
        if (!ispMap[key]) {
          ispMap[key] = { gateway: '', iface, active: false, pccPercent: null, routeIds: [], tables: [], dynamic: true };
        }
        const e = ispMap[key];
        if (r['vrf-interface']) e.iface = r['vrf-interface'];
        if (!ifaceNames.has(r.gateway) && r.gateway) e.gateway = r.gateway;
        if (r.active === 'true' && r.disabled !== 'true') e.active = true;
        if (r.dynamic !== 'true') e.dynamic = false;
        e.routeIds.push(r['.id']);
        const tbl = r['routing-table'] || 'main';
        if (!e.tables.includes(tbl)) e.tables.push(tbl);
        if (pccRatio !== null && pccRatio[tbl] != null) {
          e.pccPercent = pccRatio[tbl];
        }
      });

    Object.entries(ispMap).forEach(([key, val]) => {
      const active = val.pccPercent != null ? true : val.active;
      list.push({
        id: `isp-${key}`,
        type: 'isp',
        label: ispLabel(val.iface, dhcpClients),
        detail: val.gateway,
        sub: val.iface,
        color: active ? '#22c55e' : '#f59e0b',
        active,
        pccPercent: val.pccPercent,
        routeIds: val.routeIds,
        tables: val.tables,
        routeCount: val.routeIds.length,
        dynamic: val.dynamic,
      });
    });

    list.push({
      id: 'internet',
      type: 'internet',
      label: 'Internet',
      detail: '0.0.0.0/0',
      sub: '',
      color: '#8b5cf6',
      pccPercent: null,
    });

    return list;
  }, [routes, ipAddresses, wanIfaces, interfaces, dhcpClients, pccRatio, wgServers, wgServerPeers]);

  const edges = useMemo(() => {
    const list = [];
    const lanNodes = nodes.filter(n => n.type === 'lan');
    const ispNodes = nodes.filter(n => n.type === 'isp');

    for (let i = 0; i < lanNodes.length; i++) {
      for (let j = i + 1; j < lanNodes.length; j++) {
        list.push({
          id: `${lanNodes[i].id}<>${lanNodes[j].id}`,
          from: lanNodes[i].id, to: lanNodes[j].id,
          color: '#3b82f6', active: true, label: '',
        });
      }
    }

    lanNodes.filter(lan => !lan.isWgServer).forEach(lan => {
      ispNodes.forEach(isp => {
        if (isp.active) {
          list.push({
            id: `${lan.id}>${isp.id}`,
            from: lan.id, to: isp.id,
            color: '#22c55e', active: true,
            label: isp.pccPercent != null ? `${isp.pccPercent}%` : '',
          });
        }
      });
    });

    ispNodes.forEach(isp => {
      list.push({
        id: `${isp.id}>internet`,
        from: isp.id, to: 'internet',
        color: isp.color, active: isp.active,
        label: isp.pccPercent != null ? `PCC ${isp.pccPercent}%` : !isp.active ? 'Standby' : '',
      });
    });

    const vpnClientsNode = nodes.find(n => n.type === 'vpn-clients');
    const wgLanNode = lanNodes.find(n => n.isWgServer);
    if (vpnClientsNode && wgLanNode) {
      const wgPort = wgServers[0]?.['listen-port'];
      list.push({
        id: `vpn-clients>internet`,
        from: 'vpn-clients', to: 'internet',
        color: '#f59e0b', active: true,
        label: wgPort ? `:${wgPort}` : '',
      });
      ispNodes.forEach(isp => {
        list.push({
          id: `internet>${isp.id}:wg`,
          from: 'internet', to: isp.id,
          color: '#f59e0b', active: isp.active,
          label: '',
        });
        list.push({
          id: `${isp.id}>${wgLanNode.id}:wg`,
          from: isp.id, to: wgLanNode.id,
          color: '#f59e0b', active: isp.active,
          label: 'WireGuard',
        });
      });
    }

    return list;
  }, [nodes, wgServers, routes]);

  useEffect(() => {
    if (!containerRef.current) return;
    const measure = () => setContainerW(containerRef.current.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (containerW < 100) return;
    const lanNodes = nodes.filter(n => n.type === 'lan');
    const ispNodes = nodes.filter(n => n.type === 'isp');
    if (lanNodes.length === 0 && ispNodes.length === 0) return;

    const nodeIds = new Set(nodes.map(n => n.id));
    const staleKeys = Object.keys(positions).filter(k => !nodeIds.has(k));
    const hasMissing = nodes.some(n => !positions[n.id]);
    if (!hasMissing && staleKeys.length === 0) return;

    let base = positions;
    if (staleKeys.length > 0) {
      base = { ...positions };
      staleKeys.forEach(k => delete base[k]);
      if (!hasMissing) { setPositions(base); return; }
    }

    const hasVpnClients = !!nodes.find(n => n.type === 'vpn-clients');
    const cols = hasVpnClients ? 4 : 3;
    const gap = Math.max(Math.round((containerW - cols * NW) / (cols + 1)), 16);
    const colX = (col) => gap + col * (NW + gap);

    const maxRows = Math.max(lanNodes.length, ispNodes.length, 1);
    const totalH = maxRows * (NH + 16);
    const pos = { ...base };

    lanNodes.forEach((n, i) => {
      if (pos[n.id]) return;
      const off = (totalH - lanNodes.length * (NH + 16)) / 2;
      pos[n.id] = { x: colX(0), y: 20 + off + i * (NH + 16) };
    });
    ispNodes.forEach((n, i) => {
      if (pos[n.id]) return;
      const off = (totalH - ispNodes.length * (NH + 16)) / 2;
      pos[n.id] = { x: colX(1), y: 20 + off + i * (NH + 16) };
    });
    if (!pos['internet']) {
      pos['internet'] = { x: colX(2), y: 20 + (totalH - (NH + 16)) / 2 };
    }
    if (!pos['vpn-clients'] && hasVpnClients) {
      pos['vpn-clients'] = { x: colX(3), y: 20 + (totalH - (NH + 16)) / 2 };
    }

    setPositions(pos);
  }, [nodes, containerW, positions]);

  const canvasH = useMemo(() => {
    let max = 0;
    Object.values(positions).forEach(p => {
      if (p.y + NH + 30 > max) max = p.y + NH + 30;
    });
    return Math.max(max, 260);
  }, [positions]);

  const handlePointerDown = useCallback((e, nodeId) => {
    const pos = positions[nodeId];
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragInfo({ nodeId, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false });
  }, [positions]);

  const handlePointerMove = useCallback((e) => {
    if (!dragInfo) return;
    const dx = e.clientX - dragInfo.startX;
    const dy = e.clientY - dragInfo.startY;
    if (!dragInfo.moved && Math.abs(dx) + Math.abs(dy) > 4) dragInfo.moved = true;
    setPositions(prev => ({
      ...prev,
      [dragInfo.nodeId]: {
        x: dragInfo.origX + dx,
        y: dragInfo.origY + dy,
      },
    }));
  }, [dragInfo]);

  const handlePointerUp = useCallback(() => {
    if (dragInfo && !dragInfo.moved) {
      setSelectedNode(prev => prev === dragInfo.nodeId ? null : dragInfo.nodeId);
    }
    setDragInfo(null);
  }, [dragInfo]);

  const handleAddRoute = async () => {
    if (!newRoute['dst-address'] || !newRoute.gateway) return;
    const cidrPattern = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    if (!cidrPattern.test(newRoute['dst-address'])) {
      showMsg('Invalid destination format (use CIDR: x.x.x.x/x)');
      return;
    }
    setLoading(true);
    try {
      await api('PUT', '/ip/route', { 'dst-address': newRoute['dst-address'], gateway: newRoute.gateway, distance: newRoute.distance || '1' });
      showMsg('Route added');
      setShowAdd(false);
      setNewRoute({ 'dst-address': '', gateway: '', distance: '1' });
      await fetchAll();
    } catch (e) { showMsg('Failed to add route'); }
    setLoading(false);
  };

  const handleToggleRoute = async (routeId) => {
    const r = routes.find(x => x['.id'] === routeId);
    if (!r) return;
    setLoading(true);
    try {
      const a = r.disabled === 'true' ? 'enable' : 'disable';
      await api('POST', `/ip/route/${a}`, { numbers: routeId });
      showMsg(a === 'enable' ? 'Route enabled' : 'Route paused');
      await fetchAll();
    } catch (e) { showMsg('Toggle failed'); }
    setLoading(false);
  };

  const handleDeleteRoute = async (routeId) => {
    setLoading(true);
    try { await api('DELETE', `/ip/route/${routeId}`); showMsg('Route deleted'); await fetchAll(); }
    catch (e) { showMsg('Delete failed'); }
    setLoading(false);
  };

  const routeNodeMatch = useCallback((route) => {
    if (!selectedNode) return null;
    const node = nodes.find(n => n.id === selectedNode);
    if (!node) return null;
    const gw = route.gateway || '';
    const dst = route['dst-address'] || '';
    const vrfIface = route['vrf-interface'] || '';
    if (node.type === 'internet') {
      return dst === '0.0.0.0/0' ? node.color : null;
    }
    if (node.type === 'isp') {
      if (node.routeIds?.includes(route['.id'])) return node.color;
      if (node.sub && (gw === node.sub || vrfIface === node.sub)) return node.color;
      return null;
    }
    if (node.type === 'lan') {
      const iface = node.id.replace('lan-', '');
      if (gw === iface || dst.startsWith(ipAddresses.find(a => a.interface === iface)?.address?.split('/')[0]?.split('.').slice(0, -1).join('.') + '.')) return node.color;
      const addr = ipAddresses.find(a => a.interface === iface);
      if (addr) {
        const net = addr.address.split('/');
        if (dst === addr.address || gw === iface) return node.color;
      }
      return null;
    }
    if (node.type === 'vpn-clients') {
      if (/^(wireguard|wg)/i.test(gw)) return node.color;
      return null;
    }
    return null;
  }, [selectedNode, nodes, ipAddresses]);

  const S = {
    card: { background: '#12151c', borderRadius: 12, border: '1px solid #1a1f2e', padding: 16 },
    lbl: { fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#636b7e', fontFamily: "'Outfit', sans-serif" },
    mono: { fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4' },
    input: { padding: '6px 10px', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4', background: '#0d1017', border: '1px solid #1a1f2e', borderRadius: 6, outline: 'none', width: '100%' },
    btn: (c, sm) => ({ padding: sm ? '4px 10px' : '6px 14px', fontSize: sm ? 9 : 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', borderRadius: 6, cursor: loading ? 'default' : 'pointer', background: `${c}12`, color: c, border: `1px solid ${c}30`, transition: 'all 0.2s ease', opacity: loading ? 0.5 : 1 }),
  };

  const renderNode = (node) => {
    const pos = positions[node.id];
    if (!pos) return null;
    const isDragging = dragInfo?.nodeId === node.id;
    const isSelected = selectedNode === node.id;

    return (
      <div
        key={node.id}
        onPointerDown={e => handlePointerDown(e, node.id)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'absolute', left: pos.x, top: pos.y, width: NW, minHeight: NH, boxSizing: 'border-box',
          background: isSelected ? `${node.color}08` : '#12151c', borderRadius: 10,
          border: `1px solid ${isSelected ? `${node.color}60` : `${node.color}25`}`, padding: '10px 12px',
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none', userSelect: 'none',
          zIndex: isDragging ? 20 : 10,
          boxShadow: isSelected ? `0 0 16px ${node.color}20` : isDragging ? `0 8px 24px ${node.color}15` : 'none',
          transition: isDragging ? 'none' : 'all 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#eef0f4', fontFamily: "'Outfit', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {node.label}
          </span>
          {node.pccPercent != null && (
            <span style={{
              fontSize: 8, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginLeft: 4,
              padding: '1px 6px', borderRadius: 3,
              background: '#8b5cf612', color: '#8b5cf6', border: '1px solid #8b5cf625',
            }}>PCC {node.pccPercent}%</span>
          )}
          {node.type === 'isp' && node.pccPercent == null && (
            <span style={{
              fontSize: 8, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginLeft: 4,
              padding: '1px 6px', borderRadius: 3,
              background: `${node.color}12`, color: node.color, border: `1px solid ${node.color}25`,
            }}>{node.active ? 'Active' : 'Standby'}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {(node.type === 'isp' || node.type === 'internet') && (
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: node.color, boxShadow: `0 0 6px ${node.color}50`, flexShrink: 0 }} />
          )}
          <span style={{ ...S.mono, fontSize: 10, color: '#636b7e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.detail}
          </span>
        </div>
        {node.sub && (
          <div style={{ ...S.mono, fontSize: 9, color: '#636b7e50', marginTop: 2 }}>{node.sub}</div>
        )}
        {(() => {
          const cnt = routes.filter(r => r['dst-address'] && r.gateway && routeNodeMatch.call ? (() => {
            const gw = r.gateway || '';
            const dst = r['dst-address'] || '';
            const vrfIface = r['vrf-interface'] || '';
            if (node.type === 'internet') return dst === '0.0.0.0/0';
            if (node.type === 'isp') {
              if (node.routeIds?.includes(r['.id'])) return true;
              if (node.sub && (gw === node.sub || vrfIface === node.sub)) return true;
              return false;
            }
            if (node.type === 'lan') {
              const iface = node.id.replace('lan-', '');
              if (gw === iface) return true;
              const addr = ipAddresses.find(a => a.interface === iface);
              if (addr && dst.startsWith(addr.address.split('/')[0].split('.').slice(0, -1).join('.') + '.')) return true;
              return false;
            }
            if (node.type === 'vpn-clients') return /^(wireguard|wg)/i.test(gw);
            return false;
          })() : false).length;
          if (!cnt) return null;
          return (
            <div style={{ ...S.mono, fontSize: 8, color: '#636b7e', marginTop: 4 }}>
              {cnt} {cnt === 1 ? 'route' : 'routes'}
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <>
      <MessageBar message={message} />
      <style>{`
        @keyframes dashFlow { to { stroke-dashoffset: -16; } }
        @keyframes dashFlowBack { to { stroke-dashoffset: 16; } }
      `}</style>

      <div ref={containerRef} style={{ position: 'relative', minHeight: canvasH, marginBottom: 24 }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
          {(() => {
            const portCounts = {};
            const portIndex = {};
            edges.forEach(edge => {
              const fp = positions[edge.from], tp = positions[edge.to];
              if (!fp || !tp) return;
              const [s1, s2] = getNodeSide(fp, tp);
              const k1 = `${edge.from}:${s1}`, k2 = `${edge.to}:${s2}`;
              portCounts[k1] = (portCounts[k1] || 0) + 1;
              portCounts[k2] = (portCounts[k2] || 0) + 1;
            });
            return edges.map(edge => {
            const from = positions[edge.from];
            const to = positions[edge.to];
            if (!from || !to) return null;
            const [s1, s2] = getNodeSide(from, to);
            const k1 = `${edge.from}:${s1}`, k2 = `${edge.to}:${s2}`;
            if (!portIndex[k1]) portIndex[k1] = 0;
            if (!portIndex[k2]) portIndex[k2] = 0;
            const idx1 = portIndex[k1]++, idx2 = portIndex[k2]++;
            const cnt1 = portCounts[k1], cnt2 = portCounts[k2];
            const spread = 12;
            const off1 = (idx1 - (cnt1 - 1) / 2) * spread;
            const off2 = (idx2 - (cnt2 - 1) / 2) * spread;
            const p1 = anchorPoint(from, s1, off1);
            const p2 = anchorPoint(to, s2, off2);
            const path = edgePath(p1, p2, s1, s2);
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            return (
              <g key={edge.id}>
                <path d={path} fill="none" stroke={edge.color} strokeWidth={2} opacity={0.06} />
                {edge.active && (
                  <>
                    <path d={path} fill="none" stroke={edge.color} strokeWidth={2} strokeDasharray="8 8" opacity={0.3} style={{ animation: 'dashFlow 0.8s linear infinite' }} />
                    <path d={path} fill="none" stroke={edge.color} strokeWidth={1} strokeDasharray="6 10" opacity={0.15} style={{ animation: 'dashFlowBack 1s linear infinite' }} />
                    {[0, 0.9, 1.8].map((d, i) => (
                      <circle key={`f${i}`} r="3" fill={edge.color} opacity="0">
                        <animateMotion dur="2.5s" repeatCount="indefinite" begin={`${d}s`} path={path} />
                        <animate attributeName="opacity" values="0;0.7;0.7;0" keyTimes="0;0.05;0.9;1" dur="2.5s" repeatCount="indefinite" begin={`${d}s`} />
                      </circle>
                    ))}
                    {[0.5, 1.4].map((d, i) => (
                      <circle key={`b${i}`} r="2" fill={edge.color} opacity="0">
                        <animateMotion dur="3s" repeatCount="indefinite" begin={`${d}s`} path={path} keyPoints="1;0" keyTimes="0;1" calcMode="linear" />
                        <animate attributeName="opacity" values="0;0.4;0.4;0" keyTimes="0;0.05;0.9;1" dur="3s" repeatCount="indefinite" begin={`${d}s`} />
                      </circle>
                    ))}
                  </>
                )}
                {!edge.active && (
                  <path d={path} fill="none" stroke={edge.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.12} />
                )}
                {edge.label && (
                  <text x={mx} y={my - 8} textAnchor="middle" fill={edge.color} fontSize={9} fontFamily="'Outfit', sans-serif" fontWeight={600} opacity={0.7}>
                    {edge.label}
                  </text>
                )}
              </g>
            );
          });
          })()}
        </svg>

        {nodes.map(renderNode)}
      </div>

      {pccRatio !== null && Object.keys(pccRatio).length > 0 && (
        <div style={{ ...S.card, marginBottom: 12 }}>
          <div style={{ ...S.lbl, color: '#8b5cf6', marginBottom: 10 }}>PCC Load Balancing</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {nodes.filter(n => n.type === 'isp' && n.pccPercent != null).map(n => (
              <div key={n.id} style={{ flex: 1, background: '#0d1017', borderRadius: 8, padding: '10px 12px', border: '1px solid #1a1f2e' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#eef0f4', fontFamily: "'Outfit', sans-serif" }}>{n.label}</span>
                  <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#8b5cf6' }}>
                    {n.pccPercent}%
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: '#1a1f2e', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${n.pccPercent}%`, background: n.color, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ ...S.mono, fontSize: 9, color: '#636b7e', marginTop: 4 }}>{n.detail} · {n.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...S.card, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showAdd ? 12 : 0 }}>
          <div style={{ ...S.lbl, color: '#3b82f6' }}>Add Route</div>
          <button onClick={() => { setShowAdd(!showAdd); setCustomGw(false); setNewRoute({ 'dst-address': '', gateway: '', distance: '1' }); }} style={S.btn('#3b82f6', true)}>
            {showAdd ? 'Cancel' : '+'}
          </button>
        </div>
        {showAdd && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ ...S.lbl, marginBottom: 6 }}>Trафік до мережі</div>
              <input
                value={newRoute['dst-address']}
                onChange={e => setNewRoute({ ...newRoute, 'dst-address': e.target.value })}
                placeholder="0.0.0.0/0 — весь трафік, або 10.0.0.0/8 — конкретна мережа"
                style={{ ...S.input, width: '100%' }}
              />
            </div>

            <div>
              <div style={{ ...S.lbl, marginBottom: 6 }}>Відправляти через</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: customGw ? 8 : 0 }}>
                {knownGateways.map(gw => (
                  <button
                    key={gw.value}
                    onClick={() => { setNewRoute({ ...newRoute, gateway: gw.value }); setCustomGw(false); }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: newRoute.gateway === gw.value && !customGw ? `${gw.color}15` : '#0d1017',
                      border: `1px solid ${newRoute.gateway === gw.value && !customGw ? `${gw.color}50` : '#1a1f2e'}`,
                      transition: 'all 0.2s ease',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: newRoute.gateway === gw.value && !customGw ? gw.color : '#eef0f4', fontFamily: "'Outfit', sans-serif" }}>
                      {gw.label}
                    </div>
                    <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e', marginTop: 2 }}>
                      {gw.sub}
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => { setCustomGw(true); setNewRoute({ ...newRoute, gateway: '' }); }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: customGw ? '#636b7e15' : '#0d1017',
                    border: `1px solid ${customGw ? '#636b7e50' : '#1a1f2e'}`,
                    transition: 'all 0.2s ease',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: customGw ? '#c8ccd4' : '#636b7e', fontFamily: "'Outfit', sans-serif" }}>
                    Вручну
                  </div>
                  <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e', marginTop: 2 }}>
                    IP або інтерфейс
                  </div>
                </button>
              </div>
              {customGw && (
                <input
                  value={newRoute.gateway}
                  onChange={e => setNewRoute({ ...newRoute, gateway: e.target.value })}
                  placeholder="IP-адреса шлюзу або назва інтерфейсу"
                  style={{ ...S.input, width: '100%' }}
                  autoFocus
                />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'end', gap: 10 }}>
              <div style={{ width: 100 }}>
                <div style={{ ...S.lbl, marginBottom: 4 }}>Пріоритет</div>
                <input value={newRoute.distance} onChange={e => setNewRoute({ ...newRoute, distance: e.target.value })} type="number" min="1" style={S.input} />
              </div>
              <div style={{ fontSize: 9, color: '#636b7e', fontFamily: "'JetBrains Mono', monospace", paddingBottom: 8 }}>
                1 = найвищий, 10+ = резервний
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <button
                  onClick={handleAddRoute}
                  disabled={loading || !newRoute.gateway || !newRoute['dst-address']}
                  style={{ ...S.btn('#22c55e', false), padding: '8px 20px', opacity: (!newRoute.gateway || !newRoute['dst-address']) ? 0.3 : loading ? 0.5 : 1 }}
                >
                  {newRoute['dst-address'] && newRoute.gateway
                    ? `${newRoute['dst-address']} → ${knownGateways.find(g => g.value === newRoute.gateway && !customGw)?.label || newRoute.gateway}`
                    : 'Додати маршрут'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ ...S.card, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ ...S.lbl, color: '#636b7e' }}>
            Маршрути
            {selectedNode && (() => {
              const sn = nodes.find(n => n.id === selectedNode);
              return sn ? <span style={{ color: sn.color, marginLeft: 6 }}>· {sn.label}</span> : null;
            })()}
          </div>
          {selectedNode && (
            <button onClick={() => setSelectedNode(null)} style={S.btn('#636b7e', true)}>Скинути</button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {routes.filter(r => !r['dst-address']?.startsWith('DAd') && r['dst-address']).length === 0 && (
            <div style={{ ...S.mono, fontSize: 11, color: '#636b7e', padding: '8px 0' }}>Немає маршрутів</div>
          )}
          {routes
            .filter(r => r['dst-address'] && r.gateway)
            .sort((a, b) => (parseInt(a.distance) || 0) - (parseInt(b.distance) || 0))
            .map((r, idx) => {
              const matchColor = routeNodeMatch(r);
              const dimmed = selectedNode && !matchColor;
              const isActive = r.active === 'true' && r.disabled !== 'true';
              const isDisabled = r.disabled === 'true';
              const isDynamic = r.dynamic === 'true';
              const isConnected = r.connect === 'true';
              const isDhcp = r.dhcp === 'true';
              const gwLabel = (() => {
                const dc = dhcpClients.find(c => c.gateway === r.gateway);
                if (dc) return ispLabel(dc.interface, dhcpClients);
                if (/^(wireguard|wg)/i.test(r.gateway)) return 'VPN';
                if (/^bridge/i.test(r.gateway)) return 'Home LAN';
                return r.gateway;
              })();
              const typeTag = isConnected ? 'connected' : isDhcp ? 'dhcp' : null;
              return (
                <div
                  key={r['.id']}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    background: matchColor ? `${matchColor}08` : '#0d1017',
                    border: `1px solid ${matchColor ? `${matchColor}30` : '#1a1f2e'}`,
                    opacity: dimmed ? 0.3 : isConnected ? 0.5 : 1,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e', width: 16, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: isDisabled ? '#636b7e' : isActive ? '#22c55e' : '#f59e0b',
                    boxShadow: isDisabled ? 'none' : `0 0 6px ${isActive ? '#22c55e' : '#f59e0b'}50`,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ ...S.mono, fontSize: 11, fontWeight: 600 }}>{r['dst-address']}</span>
                      <span style={{ ...S.mono, fontSize: 9, color: '#636b7e' }}>→</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: matchColor || '#eef0f4', fontFamily: "'Outfit', sans-serif" }}>{gwLabel}</span>
                      {r['routing-table'] && r['routing-table'] !== 'main' && (
                        <span style={{
                          fontSize: 8, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                          padding: '1px 5px', borderRadius: 3,
                          background: '#8b5cf612', color: '#8b5cf6', border: '1px solid #8b5cf625',
                        }}>{r['routing-table']}</span>
                      )}
                      {typeTag && (
                        <span style={{
                          fontSize: 8, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                          padding: '1px 5px', borderRadius: 3,
                          background: '#636b7e12', color: '#636b7e', border: '1px solid #636b7e25',
                        }}>{typeTag}</span>
                      )}
                    </div>
                    <div style={{ ...S.mono, fontSize: 9, color: '#636b7e', marginTop: 2 }}>
                      gw {r.gateway}{r.distance ? ` · distance ${r.distance}` : ''}{r['vrf-interface'] ? ` · ${r['vrf-interface']}` : ''}{isDisabled ? ' · disabled' : ''}
                    </div>
                  </div>
                  {!isDynamic && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => handleToggleRoute(r['.id'])}
                        disabled={loading}
                        style={{ ...S.btn(isDisabled ? '#22c55e' : '#f59e0b', true), padding: '2px 6px', fontSize: 8 }}
                      >{isDisabled ? '▶' : '⏸'}</button>
                      <button
                        onClick={() => handleDeleteRoute(r['.id'])}
                        disabled={loading}
                        style={{ ...S.btn('#ef4444', true), padding: '2px 6px', fontSize: 8 }}
                      >✕</button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
