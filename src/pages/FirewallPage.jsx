import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api, apiList } from '../api';
import { useRouterData } from '../contexts/RouterDataContext';
import { useMessage } from '../hooks/useMessage';
import { MessageBar } from '../components/MessageBar';
import { ispLabel } from '../utils/isp';
import { getNodeSide as getNodeSideRaw, anchorPoint as anchorPointRaw, edgePath } from '../utils/graph';

const NW = 160;
const NH = 80;
const getNodeSide = (fromPos, toPos) => getNodeSideRaw(fromPos, toPos, NW, NH);
const anchorPoint = (pos, side, offset) => anchorPointRaw(pos, side, offset, NW, NH);

function actionColor(action) {
  if (!action) return '#636b7e';
  const a = action.toLowerCase();
  if (a === 'accept') return '#22c55e';
  if (a === 'drop' || a === 'reject') return '#ef4444';
  if (a === 'masquerade' || a === 'dst-nat' || a === 'src-nat' || a === 'redirect' || a === 'netmap' || a === 'same') return '#3b82f6';
  if (a.startsWith('mark-') || a === 'passthrough') return '#8b5cf6';
  if (a === 'log') return '#f59e0b';
  if (a === 'jump' || a === 'return') return '#636b7e';
  return '#636b7e';
}

const TABS = [
  { key: 'filter', label: 'Filter', color: '#3b82f6', path: '/ip/firewall/filter' },
  { key: 'nat', label: 'NAT', color: '#22c55e', path: '/ip/firewall/nat' },
  { key: 'mangle', label: 'Mangle', color: '#8b5cf6', path: '/ip/firewall/mangle' },
  { key: 'raw', label: 'Raw', color: '#f59e0b', path: '/ip/firewall/raw' },
  { key: 'address-list', label: 'Address Lists', color: '#636b7e', path: '/ip/firewall/address-list' },
];

const LAYERS = [
  { key: 'filter', label: 'Filter', color: '#3b82f6' },
  { key: 'nat', label: 'NAT', color: '#22c55e' },
  { key: 'mangle', label: 'Mangle', color: '#8b5cf6' },
  { key: 'raw', label: 'Raw', color: '#f59e0b' },
];

const FORM_FIELDS = {
  filter: [
    { key: 'chain', label: 'Chain', placeholder: 'input, forward, output' },
    { key: 'action', label: 'Action', placeholder: 'accept, drop, reject, log, jump' },
    { key: 'src-address', label: 'Src Address', placeholder: '192.168.88.0/24' },
    { key: 'dst-address', label: 'Dst Address', placeholder: '0.0.0.0/0' },
    { key: 'protocol', label: 'Protocol', placeholder: 'tcp, udp, icmp' },
    { key: 'dst-port', label: 'Dst Port', placeholder: '80,443' },
    { key: 'in-interface', label: 'In Interface', placeholder: 'ether1, bridge' },
    { key: 'out-interface', label: 'Out Interface', placeholder: 'ether1, bridge' },
    { key: 'connection-state', label: 'Connection State', placeholder: 'established,related,new' },
    { key: 'src-address-list', label: 'Src Address List', placeholder: '' },
    { key: 'dst-address-list', label: 'Dst Address List', placeholder: '' },
    { key: 'comment', label: 'Comment', placeholder: '' },
  ],
  nat: [
    { key: 'chain', label: 'Chain', placeholder: 'srcnat, dstnat' },
    { key: 'action', label: 'Action', placeholder: 'masquerade, dst-nat, src-nat, redirect' },
    { key: 'src-address', label: 'Src Address', placeholder: '' },
    { key: 'dst-address', label: 'Dst Address', placeholder: '' },
    { key: 'protocol', label: 'Protocol', placeholder: 'tcp, udp' },
    { key: 'dst-port', label: 'Dst Port', placeholder: '80,443' },
    { key: 'to-addresses', label: 'To Addresses', placeholder: '192.168.88.100' },
    { key: 'to-ports', label: 'To Ports', placeholder: '8080' },
    { key: 'in-interface', label: 'In Interface', placeholder: '' },
    { key: 'out-interface', label: 'Out Interface', placeholder: '' },
    { key: 'comment', label: 'Comment', placeholder: '' },
  ],
  mangle: [
    { key: 'chain', label: 'Chain', placeholder: 'prerouting, input, forward, output, postrouting' },
    { key: 'action', label: 'Action', placeholder: 'mark-connection, mark-packet, mark-routing, passthrough' },
    { key: 'new-connection-mark', label: 'New Conn Mark', placeholder: '' },
    { key: 'new-packet-mark', label: 'New Packet Mark', placeholder: '' },
    { key: 'new-routing-mark', label: 'New Routing Mark', placeholder: '' },
    { key: 'src-address', label: 'Src Address', placeholder: '' },
    { key: 'dst-address', label: 'Dst Address', placeholder: '' },
    { key: 'protocol', label: 'Protocol', placeholder: '' },
    { key: 'in-interface', label: 'In Interface', placeholder: '' },
    { key: 'out-interface', label: 'Out Interface', placeholder: '' },
    { key: 'passthrough', label: 'Passthrough', placeholder: 'yes, no' },
    { key: 'comment', label: 'Comment', placeholder: '' },
  ],
  raw: [
    { key: 'chain', label: 'Chain', placeholder: 'prerouting, output' },
    { key: 'action', label: 'Action', placeholder: 'accept, drop, notrack' },
    { key: 'src-address', label: 'Src Address', placeholder: '' },
    { key: 'dst-address', label: 'Dst Address', placeholder: '' },
    { key: 'protocol', label: 'Protocol', placeholder: '' },
    { key: 'dst-port', label: 'Dst Port', placeholder: '' },
    { key: 'comment', label: 'Comment', placeholder: '' },
  ],
  'address-list': [
    { key: 'list', label: 'List', placeholder: '' },
    { key: 'address', label: 'Address', placeholder: '192.168.88.0/24' },
    { key: 'comment', label: 'Comment', placeholder: '' },
  ],
};

export default function FirewallPage() {
  const { identity } = useRouterData();
  const [filterRules, setFilterRules] = useState([]);
  const [natRules, setNatRules] = useState([]);
  const [mangleRules, setMangleRules] = useState([]);
  const [rawRules, setRawRules] = useState([]);
  const [addressLists, setAddressLists] = useState([]);
  const [interfaces, setInterfaces] = useState([]);
  const [ipAddresses, setIpAddresses] = useState([]);
  const [dhcpClients, setDhcpClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, showMsg] = useMessage();
  const [activeTab, setActiveTab] = useState('filter');
  const [expandedRule, setExpandedRule] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState({});
  const [visibleLayers, setVisibleLayers] = useState({ filter: true, nat: true, mangle: false, raw: false });

  const containerRef = useRef(null);
  const [containerW, setContainerW] = useState(0);
  const [positions, setPositions] = useState({});
  const [dragInfo, setDragInfo] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [f, n, m, r, al, ifaces, addrs, dhcp] = await Promise.all([
        apiList('GET', '/ip/firewall/filter'),
        apiList('GET', '/ip/firewall/nat'),
        apiList('GET', '/ip/firewall/mangle'),
        apiList('GET', '/ip/firewall/raw'),
        apiList('GET', '/ip/firewall/address-list'),
        apiList('GET', '/interface'),
        apiList('GET', '/ip/address'),
        apiList('GET', '/ip/dhcp-client'),
      ]);
      setFilterRules(f);
      setNatRules(n);
      setMangleRules(m);
      setRawRules(r);
      setAddressLists(al);
      setInterfaces(ifaces);
      setIpAddresses(addrs);
      setDhcpClients(dhcp);
    } catch (e) { console.error('Firewall fetch:', e); }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 10000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const currentRules = useMemo(() => {
    if (activeTab === 'filter') return filterRules;
    if (activeTab === 'nat') return natRules;
    if (activeTab === 'mangle') return mangleRules;
    if (activeTab === 'raw') return rawRules;
    if (activeTab === 'address-list') return addressLists;
    return [];
  }, [activeTab, filterRules, natRules, mangleRules, rawRules, addressLists]);

  const currentTab = TABS.find(t => t.key === activeTab);

  const wanIfaces = useMemo(() =>
    dhcpClients.filter(c => c.disabled !== 'true').map(c => c.interface),
  [dhcpClients]);

  const chainStats = useMemo(() => {
    const stats = {};
    const count = (rules, type) => {
      rules.forEach(r => {
        if (r.disabled === 'true') return;
        const chain = r.chain;
        if (!chain) return;
        const key = `${type}:${chain}`;
        if (!stats[key]) stats[key] = { type, chain, total: 0, accept: 0, drop: 0, mark: 0, nat: 0, other: 0 };
        stats[key].total++;
        const a = (r.action || '').toLowerCase();
        if (a === 'accept') stats[key].accept++;
        else if (a === 'drop' || a === 'reject') stats[key].drop++;
        else if (a.startsWith('mark-') || a === 'passthrough') stats[key].mark++;
        else if (a === 'masquerade' || a === 'dst-nat' || a === 'src-nat' || a === 'redirect') stats[key].nat++;
        else stats[key].other++;
      });
    };
    count(filterRules, 'filter');
    count(natRules, 'nat');
    count(mangleRules, 'mangle');
    count(rawRules, 'raw');
    return stats;
  }, [filterRules, natRules, mangleRules, rawRules]);

  const nodes = useMemo(() => {
    const list = [];

    list.push({
      id: 'internet',
      type: 'endpoint',
      label: 'Internet',
      detail: '0.0.0.0/0',
      sub: '',
      color: '#8b5cf6',
    });

    dhcpClients.filter(c => c.disabled !== 'true').forEach(c => {
      list.push({
        id: `wan-${c.interface}`,
        type: 'endpoint',
        label: ispLabel(c.interface, dhcpClients),
        detail: c.gateway || '',
        sub: c.interface,
        color: '#22c55e',
      });
    });

    const chainSet = new Set();

    if (visibleLayers.raw) {
      rawRules.filter(r => r.disabled !== 'true' && r.chain).forEach(r => chainSet.add(`raw:${r.chain}`));
    }
    if (visibleLayers.mangle) {
      mangleRules.filter(r => r.disabled !== 'true' && r.chain).forEach(r => chainSet.add(`mangle:${r.chain}`));
    }
    if (visibleLayers.nat) {
      natRules.filter(r => r.disabled !== 'true' && r.chain).forEach(r => chainSet.add(`nat:${r.chain}`));
    }
    if (visibleLayers.filter) {
      filterRules.filter(r => r.disabled !== 'true' && r.chain).forEach(r => chainSet.add(`filter:${r.chain}`));
    }

    const chainOrder = ['prerouting', 'input', 'forward', 'output', 'postrouting', 'srcnat', 'dstnat'];
    const sorted = [...chainSet].sort((a, b) => {
      const ca = a.split(':')[1], cb = b.split(':')[1];
      const ia = chainOrder.indexOf(ca), ib = chainOrder.indexOf(cb);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    sorted.forEach(key => {
      const [type, chain] = key.split(':');
      const layer = LAYERS.find(l => l.key === type);
      const st = chainStats[key] || { total: 0, accept: 0, drop: 0, mark: 0, nat: 0 };
      let detailParts = [];
      if (st.accept > 0) detailParts.push(`${st.accept} accept`);
      if (st.drop > 0) detailParts.push(`${st.drop} drop`);
      if (st.mark > 0) detailParts.push(`${st.mark} mark`);
      if (st.nat > 0) detailParts.push(`${st.nat} nat`);
      list.push({
        id: key,
        type: 'chain',
        chainType: type,
        chainName: chain,
        label: chain,
        detail: detailParts.join(', ') || `${st.total} rules`,
        sub: type,
        color: layer?.color || '#636b7e',
        stats: st,
      });
    });

    ipAddresses
      .filter(a => !wanIfaces.includes(a.interface))
      .forEach(a => {
        const isWg = /^(wireguard|wg)/i.test(a.interface);
        list.push({
          id: `lan-${a.interface}`,
          type: 'endpoint',
          label: /^bridge/i.test(a.interface) ? 'Home LAN' : isWg ? 'VPN' : a.interface,
          detail: a.address,
          sub: a.interface,
          color: isWg ? '#f59e0b' : '#3b82f6',
        });
      });

    list.push({
      id: 'local-process',
      type: 'endpoint',
      label: 'Services',
      detail: 'API · WebFig · SSH',
      sub: '',
      color: '#636b7e',
    });

    return list;
  }, [filterRules, natRules, mangleRules, rawRules, ipAddresses, wanIfaces, dhcpClients, identity, visibleLayers, chainStats]);

  const edges = useMemo(() => {
    const list = [];
    const chainNodes = nodes.filter(n => n.type === 'chain');
    const wanNodes = nodes.filter(n => n.type === 'endpoint' && n.id.startsWith('wan-'));
    const lanNodes = nodes.filter(n => n.type === 'endpoint' && n.id.startsWith('lan-'));
    const hasInternet = !!nodes.find(n => n.id === 'internet');
    const hasLocal = !!nodes.find(n => n.id === 'local-process');

    if (hasInternet) {
      wanNodes.forEach(wan => {
        list.push({
          id: `internet>${wan.id}`,
          from: 'internet', to: wan.id,
          color: '#8b5cf6', active: true, label: '',
        });
      });
    }

    const preroutingChains = chainNodes.filter(n => n.chainName === 'prerouting');
    const inputChains = chainNodes.filter(n => n.chainName === 'input');
    const forwardChains = chainNodes.filter(n => n.chainName === 'forward');
    const outputChains = chainNodes.filter(n => n.chainName === 'output');
    const postroutingChains = chainNodes.filter(n => n.chainName === 'postrouting');
    const srcnatChains = chainNodes.filter(n => n.chainName === 'srcnat');
    const dstnatChains = chainNodes.filter(n => n.chainName === 'dstnat');

    const allIncoming = [...preroutingChains, ...dstnatChains];
    const allOutgoing = [...postroutingChains, ...srcnatChains];

    if (allIncoming.length > 0) {
      wanNodes.forEach(wan => {
        allIncoming.forEach(ch => {
          list.push({
            id: `${wan.id}>${ch.id}`,
            from: wan.id, to: ch.id,
            color: ch.color, active: true,
            label: ch.stats?.total > 0 ? `×${ch.stats.total}` : '',
          });
        });
      });
    } else {
      wanNodes.forEach(wan => {
        inputChains.forEach(ch => {
          list.push({
            id: `${wan.id}>${ch.id}`,
            from: wan.id, to: ch.id,
            color: ch.color, active: true,
            label: ch.stats?.total > 0 ? `×${ch.stats.total}` : '',
          });
        });
        forwardChains.forEach(ch => {
          list.push({
            id: `${wan.id}>${ch.id}`,
            from: wan.id, to: ch.id,
            color: ch.color, active: true,
            label: ch.stats?.total > 0 ? `×${ch.stats.total}` : '',
          });
        });
      });
    }

    if (allIncoming.length > 0) {
      allIncoming.forEach(pre => {
        inputChains.forEach(inp => {
          list.push({
            id: `${pre.id}>${inp.id}`,
            from: pre.id, to: inp.id,
            color: inp.color, active: true,
            label: inp.stats?.drop > 0 ? `${inp.stats.drop} drop` : '',
          });
        });
        forwardChains.forEach(fwd => {
          list.push({
            id: `${pre.id}>${fwd.id}`,
            from: pre.id, to: fwd.id,
            color: fwd.color, active: true,
            label: fwd.stats?.drop > 0 ? `${fwd.stats.drop} drop` : '',
          });
        });
      });
    }

    inputChains.forEach(inp => {
      if (hasLocal) {
        list.push({
          id: `${inp.id}>local-process`,
          from: inp.id, to: 'local-process',
          color: inp.stats?.drop > 0 ? '#ef4444' : '#22c55e',
          active: true,
          label: inp.stats ? `${inp.stats.accept}↑ ${inp.stats.drop}↓` : '',
        });
      }
    });

    if (hasLocal) {
      outputChains.forEach(out => {
        list.push({
          id: `local-process>${out.id}`,
          from: 'local-process', to: out.id,
          color: out.color, active: true,
          label: out.stats?.total > 0 ? `×${out.stats.total}` : '',
        });
      });
    }

    forwardChains.forEach(fwd => {
      if (allOutgoing.length > 0) {
        allOutgoing.forEach(post => {
          list.push({
            id: `${fwd.id}>${post.id}`,
            from: fwd.id, to: post.id,
            color: post.color, active: true,
            label: post.stats?.total > 0 ? `×${post.stats.total}` : '',
          });
        });
      } else {
        lanNodes.forEach(lan => {
          list.push({
            id: `${fwd.id}>${lan.id}`,
            from: fwd.id, to: lan.id,
            color: fwd.stats?.drop > 0 ? '#ef4444' : '#22c55e',
            active: true,
            label: fwd.stats ? `${fwd.stats.accept}↑ ${fwd.stats.drop}↓` : '',
          });
        });
      }
    });

    outputChains.forEach(out => {
      if (allOutgoing.length > 0) {
        allOutgoing.forEach(post => {
          list.push({
            id: `${out.id}>${post.id}`,
            from: out.id, to: post.id,
            color: post.color, active: true,
            label: '',
          });
        });
      } else {
        wanNodes.forEach(wan => {
          list.push({
            id: `${out.id}>${wan.id}`,
            from: out.id, to: wan.id,
            color: out.color, active: true,
            label: '',
          });
        });
      }
    });

    if (allOutgoing.length > 0) {
      allOutgoing.forEach(post => {
        wanNodes.forEach(wan => {
          list.push({
            id: `${post.id}>${wan.id}`,
            from: post.id, to: wan.id,
            color: post.color, active: true,
            label: post.stats?.nat > 0 ? `${post.stats.nat} masq` : '',
          });
        });
        lanNodes.forEach(lan => {
          list.push({
            id: `${post.id}>${lan.id}`,
            from: post.id, to: lan.id,
            color: post.color, active: true,
            label: '',
          });
        });
      });
    }

    if (dstnatChains.length > 0) {
      dstnatChains.forEach(dn => {
        lanNodes.forEach(lan => {
          list.push({
            id: `${dn.id}>${lan.id}`,
            from: dn.id, to: lan.id,
            color: '#22c55e', active: true,
            label: dn.stats?.nat > 0 ? `${dn.stats.nat} dst-nat` : '',
          });
        });
      });
    }

    if (chainNodes.length === 0) {
      wanNodes.forEach(wan => {
        lanNodes.forEach(lan => {
          list.push({
            id: `${wan.id}>${lan.id}:direct`,
            from: wan.id, to: lan.id,
            color: '#636b7e', active: true, label: '',
          });
        });
        if (hasLocal) {
          list.push({
            id: `${wan.id}>local-process:direct`,
            from: wan.id, to: 'local-process',
            color: '#636b7e', active: true, label: '',
          });
        }
      });
    }

    return list;
  }, [nodes]);

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
    const hasMissing = nodes.some(n => !positions[n.id]);
    if (!hasMissing) return;

    const endpoints = nodes.filter(n => n.type === 'endpoint');
    const chains = nodes.filter(n => n.type === 'chain');

    const leftEndpoints = endpoints.filter(n => n.id === 'internet' || n.id.startsWith('wan-'));
    const rightEndpoints = endpoints.filter(n => n.id.startsWith('lan-') || n.id === 'local-process');

    const chainOrder = ['prerouting', 'dstnat', 'input', 'forward', 'output', 'srcnat', 'postrouting'];
    const sortedChains = [...chains].sort((a, b) => {
      const ia = chainOrder.indexOf(a.chainName), ib = chainOrder.indexOf(b.chainName);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const chainCols = [];
    let currentCol = [];
    let lastOrder = -1;
    sortedChains.forEach(ch => {
      const order = chainOrder.indexOf(ch.chainName);
      if (currentCol.length > 0 && order !== lastOrder) {
        chainCols.push(currentCol);
        currentCol = [];
      }
      currentCol.push(ch);
      lastOrder = order;
    });
    if (currentCol.length > 0) chainCols.push(currentCol);

    const totalCols = 2 + chainCols.length;
    const gap = Math.max(Math.round((containerW - totalCols * NW) / (totalCols + 1)), 12);
    const colX = (col) => gap + col * (NW + gap);

    const maxRows = Math.max(leftEndpoints.length, rightEndpoints.length, ...chainCols.map(c => c.length), 1);
    const totalH = maxRows * (NH + 30);
    const pos = { ...positions };

    leftEndpoints.forEach((n, i) => {
      if (pos[n.id]) return;
      const off = (totalH - leftEndpoints.length * (NH + 30)) / 2;
      pos[n.id] = { x: colX(0), y: 20 + off + i * (NH + 30) };
    });

    chainCols.forEach((col, ci) => {
      col.forEach((n, i) => {
        if (pos[n.id]) return;
        const off = (totalH - col.length * (NH + 30)) / 2;
        pos[n.id] = { x: colX(1 + ci), y: 20 + off + i * (NH + 30) };
      });
    });

    rightEndpoints.forEach((n, i) => {
      if (pos[n.id]) return;
      const off = (totalH - rightEndpoints.length * (NH + 30)) / 2;
      pos[n.id] = { x: colX(1 + chainCols.length), y: 20 + off + i * (NH + 30) };
    });

    setPositions(pos);
  }, [nodes, containerW, positions]);

  const canvasH = useMemo(() => {
    let max = 0;
    Object.values(positions).forEach(p => {
      if (p.y + NH + 30 > max) max = p.y + NH + 30;
    });
    return Math.max(max, 200);
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

  const toggleLayer = (key) => {
    setVisibleLayers(prev => {
      const next = { ...prev, [key]: !prev[key] };
      setPositions({});
      return next;
    });
  };

  const handleToggle = async (id) => {
    const rules = currentRules;
    const rule = rules.find(r => r['.id'] === id);
    if (!rule) return;
    setLoading(true);
    try {
      await api('PATCH', `${currentTab.path}/${id}`, { disabled: rule.disabled === 'true' ? 'false' : 'true' });
      showMsg(rule.disabled === 'true' ? 'Rule enabled' : 'Rule disabled');
      await fetchAll();
    } catch (e) { showMsg('Toggle failed'); }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    setLoading(true);
    try {
      await api('DELETE', `${currentTab.path}/${id}`);
      showMsg('Rule deleted');
      if (expandedRule === id) setExpandedRule(null);
      await fetchAll();
    } catch (e) { showMsg('Delete failed'); }
    setLoading(false);
  };

  const handleAdd = async () => {
    const body = {};
    Object.entries(newRule).forEach(([k, v]) => {
      if (v && v.trim()) body[k] = v.trim();
    });
    if (Object.keys(body).length === 0) return;
    if (activeTab !== 'address-list' && (!body.chain || !body.action)) {
      showMsg('Chain and Action are required');
      return;
    }
    if (activeTab === 'address-list' && (!body.list || !body.address)) {
      showMsg('List and Address are required');
      return;
    }
    setLoading(true);
    try {
      await api('PUT', currentTab.path, body);
      showMsg('Rule added');
      setShowAdd(false);
      setNewRule({});
      await fetchAll();
    } catch (e) { showMsg('Add failed'); }
    setLoading(false);
  };

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
    const isChain = node.type === 'chain';

    return (
      <div
        key={node.id}
        onPointerDown={e => handlePointerDown(e, node.id)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'absolute', left: pos.x, top: pos.y, width: NW, minHeight: NH, boxSizing: 'border-box',
          background: isSelected ? `${node.color}08` : '#12151c', borderRadius: 10,
          border: `1px solid ${isSelected ? `${node.color}60` : `${node.color}25`}`, padding: '8px 10px',
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none', userSelect: 'none',
          zIndex: isDragging ? 20 : 10,
          boxShadow: isSelected ? `0 0 16px ${node.color}20` : isDragging ? `0 8px 24px ${node.color}15` : 'none',
          transition: isDragging ? 'none' : 'all 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#eef0f4', fontFamily: "'Outfit', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {node.label}
          </span>
          {isChain && (
            <span style={{
              fontSize: 7, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginLeft: 4,
              padding: '1px 5px', borderRadius: 3,
              background: `${node.color}12`, color: node.color, border: `1px solid ${node.color}25`,
            }}>{node.sub}</span>
          )}
        </div>
        {isChain && node.stats && (
          <div style={{ display: 'flex', gap: 3, marginBottom: 2 }}>
            {node.stats.accept > 0 && (
              <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: '#22c55e' }}>{node.stats.accept}↑</span>
            )}
            {node.stats.drop > 0 && (
              <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: '#ef4444' }}>{node.stats.drop}↓</span>
            )}
            {node.stats.mark > 0 && (
              <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: '#8b5cf6' }}>{node.stats.mark}m</span>
            )}
            {node.stats.nat > 0 && (
              <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: '#3b82f6' }}>{node.stats.nat}n</span>
            )}
          </div>
        )}
        {!isChain && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: node.color, boxShadow: `0 0 6px ${node.color}50`, flexShrink: 0 }} />
            <span style={{ ...S.mono, fontSize: 9, color: '#636b7e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.detail}
            </span>
          </div>
        )}
        {node.sub && !isChain && (
          <div style={{ ...S.mono, fontSize: 8, color: '#636b7e50', marginTop: 1 }}>{node.sub}</div>
        )}
      </div>
    );
  };

  const groupedRules = useMemo(() => {
    if (activeTab === 'address-list') {
      const groups = {};
      currentRules.forEach(r => {
        const key = r.list || 'unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });
      return groups;
    }
    const groups = {};
    currentRules.forEach(r => {
      const key = r.chain || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [currentRules, activeTab]);

  const ruleMatchesNode = useCallback((rule) => {
    if (!selectedNode) return null;
    const node = nodes.find(n => n.id === selectedNode);
    if (!node) return null;

    if (node.type === 'chain') {
      const ruleType = activeTab;
      if (node.chainType === ruleType && rule.chain === node.chainName) return node.color;
      return null;
    }

    if (node.id === 'internet') {
      if (rule['src-address'] === '0.0.0.0/0' || rule['dst-address'] === '0.0.0.0/0') return node.color;
      return null;
    }
    if (node.id.startsWith('wan-')) {
      const iface = node.sub;
      if (rule['in-interface'] === iface || rule['out-interface'] === iface) return node.color;
      return null;
    }
    if (node.id.startsWith('lan-')) {
      const iface = node.sub;
      if (rule['in-interface'] === iface || rule['out-interface'] === iface) return node.color;
      const addr = node.detail?.split('/')[0];
      if (addr && (rule['src-address']?.startsWith(addr.split('.').slice(0, -1).join('.')) || rule['dst-address']?.startsWith(addr.split('.').slice(0, -1).join('.')))) return node.color;
      return null;
    }
    if (node.id === 'local-process') {
      if (rule.chain === 'input' || rule.chain === 'output') return node.color;
      return null;
    }
    return null;
  }, [selectedNode, nodes, activeTab]);

  return (
    <>
      <MessageBar message={message} />
      <style>{`
        @keyframes dashFlow { to { stroke-dashoffset: -16; } }
        @keyframes dashFlowBack { to { stroke-dashoffset: 16; } }
      `}</style>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ ...S.lbl, marginRight: 4 }}>Layers</span>
        {LAYERS.map(layer => (
          <button
            key={layer.key}
            onClick={() => toggleLayer(layer.key)}
            style={{
              padding: '4px 10px',
              fontSize: 9,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderRadius: 6,
              cursor: 'pointer',
              background: visibleLayers[layer.key] ? `${layer.color}15` : '#12151c',
              color: visibleLayers[layer.key] ? layer.color : '#636b7e40',
              border: `1px solid ${visibleLayers[layer.key] ? `${layer.color}40` : '#1a1f2e'}`,
              transition: 'all 0.2s ease',
            }}
          >
            {layer.label}
            {visibleLayers[layer.key] && (
              <span style={{ marginLeft: 4, fontSize: 8, opacity: 0.7 }}>
                {layer.key === 'filter' ? filterRules.filter(r => r.disabled !== 'true').length :
                 layer.key === 'nat' ? natRules.filter(r => r.disabled !== 'true').length :
                 layer.key === 'mangle' ? mangleRules.filter(r => r.disabled !== 'true').length :
                 rawRules.filter(r => r.disabled !== 'true').length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div ref={containerRef} style={{ position: 'relative', minHeight: canvasH, marginBottom: 24 }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
          {(() => {
            const portCounts = {};
            const portEdges = {};
            edges.forEach(edge => {
              const fp = positions[edge.from], tp = positions[edge.to];
              if (!fp || !tp) return;
              const [s1, s2] = getNodeSide(fp, tp);
              const k1 = `${edge.from}:${s1}`, k2 = `${edge.to}:${s2}`;
              portCounts[k1] = (portCounts[k1] || 0) + 1;
              portCounts[k2] = (portCounts[k2] || 0) + 1;
              if (!portEdges[k1]) portEdges[k1] = [];
              if (!portEdges[k2]) portEdges[k2] = [];
              portEdges[k1].push({ edge, otherPos: tp });
              portEdges[k2].push({ edge, otherPos: fp });
            });
            Object.keys(portEdges).forEach(k => {
              const side = k.split(':')[1];
              const isHoriz = side === 'left' || side === 'right';
              portEdges[k].sort((a, b) => isHoriz ? a.otherPos.y - b.otherPos.y : a.otherPos.x - b.otherPos.x);
            });
            const portAssign = {};
            Object.entries(portEdges).forEach(([k, items]) => {
              items.forEach((item, i) => {
                const eid = item.edge.id;
                if (!portAssign[eid]) portAssign[eid] = {};
                portAssign[eid][k] = i;
              });
            });
            return edges.map(edge => {
              const from = positions[edge.from];
              const to = positions[edge.to];
              if (!from || !to) return null;
              const [s1, s2] = getNodeSide(from, to);
              const k1 = `${edge.from}:${s1}`, k2 = `${edge.to}:${s2}`;
              const idx1 = portAssign[edge.id]?.[k1] ?? 0;
              const idx2 = portAssign[edge.id]?.[k2] ?? 0;
              const cnt1 = portCounts[k1], cnt2 = portCounts[k2];
              const spread = 16;
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

      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setExpandedRule(null); setShowAdd(false); setNewRule({}); }}
            style={{
              padding: '8px 16px',
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderRadius: 8,
              cursor: 'pointer',
              background: activeTab === tab.key ? `${tab.color}15` : '#12151c',
              color: activeTab === tab.key ? tab.color : '#636b7e',
              border: `1px solid ${activeTab === tab.key ? `${tab.color}40` : '#1a1f2e'}`,
              transition: 'all 0.2s ease',
            }}
          >
            {tab.label}
            <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.7 }}>
              {tab.key === 'filter' ? filterRules.length :
               tab.key === 'nat' ? natRules.length :
               tab.key === 'mangle' ? mangleRules.length :
               tab.key === 'raw' ? rawRules.length :
               addressLists.length}
            </span>
          </button>
        ))}
      </div>

      <div style={{ ...S.card, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showAdd ? 12 : 0 }}>
          <div style={{ ...S.lbl, color: currentTab.color }}>
            {currentTab.label}
            {selectedNode && (() => {
              const sn = nodes.find(n => n.id === selectedNode);
              return sn ? <span style={{ color: sn.color, marginLeft: 6 }}>· {sn.label}{sn.sub && sn.type === 'chain' ? ` (${sn.sub})` : ''}</span> : null;
            })()}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {selectedNode && (
              <button onClick={() => setSelectedNode(null)} style={S.btn('#636b7e', true)}>Reset</button>
            )}
            <button onClick={() => { setShowAdd(!showAdd); setNewRule({}); }} style={S.btn(currentTab.color, true)}>
              {showAdd ? 'Cancel' : '+'}
            </button>
          </div>
        </div>
        {showAdd && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
              {(FORM_FIELDS[activeTab] || []).map(field => (
                <div key={field.key}>
                  <div style={{ ...S.lbl, marginBottom: 4 }}>{field.label}</div>
                  <input
                    value={newRule[field.key] || ''}
                    onChange={e => setNewRule({ ...newRule, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    style={S.input}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleAdd}
              disabled={loading}
              style={{ ...S.btn(currentTab.color, false), opacity: loading ? 0.5 : 1 }}
            >Add {currentTab.label} Rule</button>
          </div>
        )}
      </div>

      <div style={{ ...S.card }}>
        {Object.keys(groupedRules).length === 0 && (
          <div style={{ ...S.mono, fontSize: 11, color: '#636b7e', padding: '8px 0' }}>No rules</div>
        )}
        {Object.entries(groupedRules).map(([group, rules]) => (
          <div key={group} style={{ marginBottom: 16 }}>
            <div style={{ ...S.lbl, color: currentTab.color, marginBottom: 8 }}>
              {activeTab === 'address-list' ? `List: ${group}` : `Chain: ${group}`}
              <span style={{ marginLeft: 6, color: '#636b7e' }}>({rules.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rules.map((r, idx) => {
                const matchColor = ruleMatchesNode(r);
                const dimmed = selectedNode && !matchColor;
                const isDisabled = r.disabled === 'true';
                const isExpanded = expandedRule === r['.id'];
                const ac = actionColor(r.action);
                const skipKeys = new Set(['.id', '.nextid', '.dead', 'dynamic', 'disabled', 'invalid', 'bytes', 'packets']);
                return (
                  <div key={r['.id']} style={{
                    borderRadius: 8,
                    background: matchColor ? `${matchColor}08` : isExpanded ? '#0d101708' : '#0d1017',
                    border: `1px solid ${matchColor ? `${matchColor}30` : isExpanded ? `${currentTab.color}30` : '#1a1f2e'}`,
                    opacity: dimmed ? 0.3 : isDisabled ? 0.5 : 1,
                    transition: 'all 0.2s ease',
                  }}>
                    <div
                      onClick={() => setExpandedRule(isExpanded ? null : r['.id'])}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#636b7e', width: 20, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: isDisabled ? '#636b7e' : ac,
                        boxShadow: isDisabled ? 'none' : `0 0 6px ${ac}50`,
                      }} />
                      {r.action && (
                        <span style={{
                          fontSize: 8, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          padding: '2px 6px', borderRadius: 3, flexShrink: 0,
                          background: `${ac}12`, color: ac, border: `1px solid ${ac}25`,
                        }}>{r.action}</span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {activeTab === 'address-list' ? (
                            <span style={{ ...S.mono, fontSize: 11, fontWeight: 600 }}>{r.address}</span>
                          ) : (
                            <>
                              {(r['src-address'] || r['src-address-list']) && (
                                <span style={{ ...S.mono, fontSize: 10 }}>{r['src-address'] || `@${r['src-address-list']}`}</span>
                              )}
                              {(r['src-address'] || r['src-address-list'] || r['dst-address'] || r['dst-address-list']) && (
                                <span style={{ ...S.mono, fontSize: 9, color: '#636b7e' }}>→</span>
                              )}
                              {(r['dst-address'] || r['dst-address-list']) && (
                                <span style={{ ...S.mono, fontSize: 10 }}>{r['dst-address'] || `@${r['dst-address-list']}`}</span>
                              )}
                              {r.protocol && (
                                <span style={{
                                  fontSize: 8, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                                  padding: '1px 5px', borderRadius: 3,
                                  background: '#636b7e12', color: '#636b7e', border: '1px solid #636b7e25',
                                }}>{r.protocol}{r['dst-port'] ? `:${r['dst-port']}` : ''}{r['src-port'] ? ` src:${r['src-port']}` : ''}</span>
                              )}
                              {r['to-addresses'] && (
                                <span style={{
                                  fontSize: 8, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                                  padding: '1px 5px', borderRadius: 3,
                                  background: '#22c55e12', color: '#22c55e', border: '1px solid #22c55e25',
                                }}>→ {r['to-addresses']}{r['to-ports'] ? `:${r['to-ports']}` : ''}</span>
                              )}
                              {(r['new-connection-mark'] || r['new-packet-mark'] || r['new-routing-mark']) && (
                                <span style={{
                                  fontSize: 8, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                                  padding: '1px 5px', borderRadius: 3,
                                  background: '#8b5cf612', color: '#8b5cf6', border: '1px solid #8b5cf625',
                                }}>{r['new-connection-mark'] || r['new-packet-mark'] || r['new-routing-mark']}</span>
                              )}
                              {(r['in-interface'] || r['in-interface-list']) && (
                                <span style={{
                                  fontSize: 8, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                                  padding: '1px 5px', borderRadius: 3,
                                  background: '#f59e0b12', color: '#f59e0b', border: '1px solid #f59e0b25',
                                }}>in:{r['in-interface'] || r['in-interface-list']}</span>
                              )}
                              {(r['out-interface'] || r['out-interface-list']) && (
                                <span style={{
                                  fontSize: 8, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                                  padding: '1px 5px', borderRadius: 3,
                                  background: '#f59e0b12', color: '#f59e0b', border: '1px solid #f59e0b25',
                                }}>out:{r['out-interface'] || r['out-interface-list']}</span>
                              )}
                              {r['connection-state'] && (
                                <span style={{
                                  fontSize: 8, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                                  padding: '1px 5px', borderRadius: 3,
                                  background: '#3b82f612', color: '#3b82f6', border: '1px solid #3b82f625',
                                }}>{r['connection-state']}</span>
                              )}
                            </>
                          )}
                          {r.comment && (
                            <span style={{ fontSize: 9, fontFamily: "'Outfit', sans-serif", color: '#636b7e', fontStyle: 'italic' }}>{r.comment}</span>
                          )}
                        </div>
                      </div>
                      {(r.bytes && r.bytes !== '0') && (
                        <span style={{ ...S.mono, fontSize: 9, color: '#636b7e', flexShrink: 0 }}>{r.bytes}B</span>
                      )}
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggle(r['.id'])}
                          disabled={loading}
                          style={{ ...S.btn(isDisabled ? '#22c55e' : '#f59e0b', true), padding: '2px 6px', fontSize: 8 }}
                        >{isDisabled ? '▶' : '⏸'}</button>
                        <button
                          onClick={() => handleDelete(r['.id'])}
                          disabled={loading}
                          style={{ ...S.btn('#ef4444', true), padding: '2px 6px', fontSize: 8 }}
                        >✕</button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1a1f2e' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, paddingTop: 10 }}>
                          {Object.entries(r).filter(([k]) => !skipKeys.has(k) && r[k]).map(([k, v]) => (
                            <div key={k}>
                              <div style={{ ...S.lbl, marginBottom: 2 }}>{k}</div>
                              <div style={{ ...S.mono, fontSize: 10, color: '#c8ccd4', wordBreak: 'break-all' }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {(r.bytes || r.packets) && (
                          <div style={{ display: 'flex', gap: 16, marginTop: 8, paddingTop: 8, borderTop: '1px solid #1a1f2e' }}>
                            <div>
                              <div style={{ ...S.lbl, marginBottom: 2 }}>Bytes</div>
                              <div style={{ ...S.mono, fontSize: 10, color: '#c8ccd4' }}>{r.bytes || '0'}</div>
                            </div>
                            <div>
                              <div style={{ ...S.lbl, marginBottom: 2 }}>Packets</div>
                              <div style={{ ...S.mono, fontSize: 10, color: '#c8ccd4' }}>{r.packets || '0'}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
