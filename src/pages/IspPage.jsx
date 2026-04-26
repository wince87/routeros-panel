import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { formatSpeedNum } from '../utils/format';
import { activatePCC, deactivatePCC, applyPCCRatio, fetchPCCState, fetchPCCCounters, syncExclusions, fetchExclusions } from '../utils/pcc';
import { getWanName } from '../utils/isp';
import { ProviderCard } from '../components/ProviderCard';
import { TrafficGauge } from '../components/TrafficGauge';
import { useMessage } from '../hooks/useMessage';
import { MessageBar } from '../components/MessageBar';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];

export default function IspPage() {
  const navigate = useNavigate();
  const [wanInterfaces, setWanInterfaces] = useState(null);
  const [dhcpClients, setDhcpClients] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, showMsg] = useMessage();
  const [mode, setMode] = useState('single');
  const [pccUkrPercent, setPccUkrPercent] = useState(70);
  const [sliderValue, setSliderValue] = useState(70);
  const [exclusions, setExclusions] = useState([]);
  const [exclusionInput, setExclusionInput] = useState('');
  const [pccRate, setPccRate] = useState(null);
  const pccCountersRef = useRef(null);
  const modeRef = useRef(mode);

  const detectWanInterfaces = useCallback(async () => {
    try {
      const dhcp = await api('GET', '/ip/dhcp-client');
      const wans = (dhcp || []).filter(c => c.disabled !== 'true');
      setWanInterfaces(wans);
      setDhcpClients(dhcp);
      return wans;
    } catch {
      setWanInterfaces([]);
      return [];
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const [dhcp, rts] = await Promise.all([
        api('GET', '/ip/dhcp-client'),
        api('GET', '/ip/route?dst-address=0.0.0.0/0'),
      ]);
      setDhcpClients([...dhcp]);
      setRoutes([...rts]);
      const wans = (dhcp || []).filter(c => c.disabled !== 'true');
      setWanInterfaces(wans);
    } catch {
      showMsg('Connection error');
    }
  }, [showMsg]);

  const fetchStats = useCallback(async () => {
    if (!wanInterfaces || wanInterfaces.length === 0) return;
    try {
      const results = await Promise.all(
        wanInterfaces.map(w =>
          api('POST', '/interface/monitor-traffic', { interface: w.interface, once: '' })
        )
      );
      const newStats = {};
      wanInterfaces.forEach((w, i) => {
        const r = results[i];
        newStats[w.interface] = Array.isArray(r) ? r[0] : r;
      });
      setStats(newStats);
    } catch (e) { console.error('ISP stats fetch:', e); }
  }, [wanInterfaces]);

  const fetchPCCTraffic = useCallback(async () => {
    const counters = await fetchPCCCounters();
    if (!counters) { setPccRate(null); return; }
    const now = Date.now();
    const prev = pccCountersRef.current;
    if (prev) {
      const dt = (now - prev.t) / 1000;
      if (dt > 0) {
        const isp1Bps = ((counters.isp1.bytes - prev.isp1.bytes) * 8) / dt;
        const isp2Bps = ((counters.isp2.bytes - prev.isp2.bytes) * 8) / dt;
        setPccRate({ isp1: Math.max(0, isp1Bps), isp2: Math.max(0, isp2Bps) });
      }
    }
    pccCountersRef.current = { ...counters, t: now };
  }, []);

  const detectMode = useCallback(async () => {
    const pccState = await fetchPCCState();
    if (pccState !== null) {
      setMode('pcc');
      setPccUkrPercent(pccState);
      setSliderValue(pccState);
      const excl = await fetchExclusions();
      setExclusions(excl);
    } else {
      setMode('single');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const wans = await detectWanInterfaces();
      if (wans.length >= 2) {
        await detectMode();
      }
    };
    init();
  }, [detectWanInterfaces, detectMode]);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (wanInterfaces === null) return;
    if (wanInterfaces.length === 0) return;
    fetchStatus();
    fetchStats();
    const statusInterval = setInterval(fetchStatus, 5000);
    const statsInterval = setInterval(fetchStats, 2000);
    const pccInterval = setInterval(() => { if (modeRef.current === 'pcc') fetchPCCTraffic(); }, 2000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(statsInterval);
      clearInterval(pccInterval);
    };
  }, [wanInterfaces, fetchStatus, fetchStats, fetchPCCTraffic]);

  const findDhcpByInterface = (iface) => dhcpClients?.find(c => c.interface === iface) || null;

  const switchProvider = async (iface) => {
    if (!wanInterfaces || wanInterfaces.length < 2) return;
    setLoading(true);
    try {
      for (const w of wanInterfaces) {
        const dist = w.interface === iface ? '1' : '10';
        await api('PATCH', `/ip/dhcp-client/${w['.id']}`, { 'default-route-distance': dist });
      }
      showMsg('Provider switched');
      await new Promise(r => setTimeout(r, 1000));
      await fetchStatus();
    } catch (e) {
      showMsg('Switch failed');
    }
    setLoading(false);
  };

  const handleActivatePCC = async () => {
    setLoading(true);
    try {
      await activatePCC(sliderValue, exclusions, wanInterfaces.map(w => w.interface));
      setMode('pcc');
      setPccUkrPercent(sliderValue);
      showMsg(`PCC activated: ${sliderValue}% / ${100 - sliderValue}%`);
      await fetchStatus();
    } catch (e) {
      showMsg('PCC activation failed');
    }
    setLoading(false);
  };

  const addExclusion = (val) => {
    const addr = val.trim();
    if (!addr || exclusions.includes(addr)) return;
    setExclusions([...exclusions, addr]);
  };

  const removeExclusion = (addr) => {
    setExclusions(exclusions.filter(e => e !== addr));
  };

  const handleExclusionKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addExclusion(exclusionInput);
      setExclusionInput('');
    }
    if (e.key === 'Backspace' && exclusionInput === '' && exclusions.length > 0) {
      setExclusions(exclusions.slice(0, -1));
    }
  };

  const handleSyncExclusions = async () => {
    setLoading(true);
    try {
      await syncExclusions(exclusions);
      showMsg(`Exclusions updated: ${exclusions.length} addresses`);
    } catch (e) {
      showMsg('Exclusions sync failed');
    }
    setLoading(false);
  };

  const handleDeactivatePCC = async () => {
    setLoading(true);
    try {
      await deactivatePCC();
      setMode('single');
      showMsg('PCC deactivated, Single ISP mode');
    } catch (e) {
      if (e?.name === 'PCCDeactivateError') {
        setMode('single');
        showMsg(`PCC partially deactivated (${e.errors.length} errors), check Firewall`);
      } else {
        showMsg('PCC deactivation failed');
      }
    }
    await new Promise(r => setTimeout(r, 1000));
    await fetchStatus();
    setLoading(false);
  };

  const handleApplyRatio = async () => {
    setLoading(true);
    try {
      await applyPCCRatio(sliderValue);
      setPccUkrPercent(sliderValue);
      showMsg(`Ratio updated: ${sliderValue}% / ${100 - sliderValue}%`);
    } catch (e) {
      showMsg('Ratio update failed');
    }
    setLoading(false);
  };


  const getRouteForInterface = (iface) => routes?.find(r => r['vrf-interface'] === iface) || null;

  const getActiveProvider = () => {
    if (!routes) return null;
    const activeRoute = routes.find(r => r.active === 'true');
    return activeRoute?.['vrf-interface'] || null;
  };


  if (wanInterfaces === null) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 300,
      }}>
        <div style={{
          fontSize: 13,
          color: '#636b7e',
          fontFamily: "'JetBrains Mono', monospace",
        }}>Loading...</div>
      </div>
    );
  }

  if (wanInterfaces.length === 0) {
    return (
      <>
        <MessageBar message={message} />
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 16,
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: '#12151c',
            border: '1px solid #1a1f2e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            color: '#636b7e',
          }}>⇄</div>
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: '#eef0f4',
            fontFamily: "'Outfit', sans-serif",
          }}>No WAN connections configured</div>
          <div style={{
            fontSize: 12,
            color: '#636b7e',
            textAlign: 'center',
            maxWidth: 320,
            lineHeight: 1.5,
          }}>Configure internet connections through the Setup page to manage ISP switching and load balancing.</div>
          <button
            onClick={() => navigate('/setup')}
            style={{
              marginTop: 8,
              padding: '10px 24px',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              borderRadius: 8,
              cursor: 'pointer',
              background: '#22c55e18',
              color: '#22c55e',
              border: '1px solid #22c55e30',
              transition: 'all 0.2s ease',
            }}
          >Go to Setup</button>
        </div>

      </>
    );
  }

  const isPCC = mode === 'pcc';
  const hasTwoWan = wanInterfaces.length >= 2;

  const wan0 = wanInterfaces[0];
  const wan1 = wanInterfaces[1];
  const wan0Data = findDhcpByInterface(wan0?.interface);
  const wan1Data = wan1 ? findDhcpByInterface(wan1.interface) : null;
  const wan0Route = wan0 ? getRouteForInterface(wan0.interface) : null;
  const wan1Route = wan1 ? getRouteForInterface(wan1.interface) : null;
  const activeIface = getActiveProvider();

  const wan0Name = getWanName(wan0Data);
  const wan1Name = wan1Data ? getWanName(wan1Data) : null;

  const wan0Active = isPCC ? true : activeIface === wan0?.interface;
  const wan1Active = isPCC ? true : activeIface === wan1?.interface;

  const wan0Color = COLORS[0];
  const wan1Color = COLORS[1];

  const modeBtn = (label, value, color) => (
    <button
      onClick={async () => {
        if (value === mode) return;
        if (value === 'pcc') await handleActivatePCC();
        else await handleDeactivatePCC();
      }}
      disabled={loading}
      style={{
        flex: 1,
        padding: '10px 0',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "'Outfit', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        borderRadius: 8,
        cursor: loading ? 'default' : 'pointer',
        background: mode === value ? color + '18' : '#0d1017',
        color: mode === value ? color : '#636b7e',
        border: `1px solid ${mode === value ? color + '40' : '#1a1f2e'}`,
        transition: 'all 0.2s ease',
        opacity: loading ? 0.5 : 1,
      }}
    >{label}</button>
  );

  if (!hasTwoWan) {
    return (
      <>
        <MessageBar message={message} />

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
          marginBottom: 14,
        }}>
          <ProviderCard
            data={wan0Data}
            route={wan0Route}
            iface={wan0.interface}
            providerKey={wan0.interface}
            isActive={true}
            accentColor={wan0Color}
            loading={loading}
            onSwitch={() => {}}
            mode="single-only"
            pccPercent={0}
          />
          <div style={{
            background: '#12151c',
            borderRadius: 12,
            border: `1px solid ${wan0Color}40`,
            padding: 12,
            transition: 'border-color 0.3s ease',
          }}>
            <div style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#636b7e',
              marginBottom: 4,
              fontFamily: "'Outfit', sans-serif",
            }}>{wan0Name} Traffic</div>
            <TrafficGauge
              rx={stats[wan0.interface]?.['rx-bits-per-second']}
              tx={stats[wan0.interface]?.['tx-bits-per-second']}
              color={wan0Color}
              compact
            />
          </div>
        </div>

      </>
    );
  }

  return (
    <>
      <MessageBar message={message} />

      <div style={{
        background: '#12151c',
        borderRadius: 12,
        border: '1px solid #1a1f2e',
        padding: isPCC ? '10px 16px' : 16,
        marginBottom: isPCC ? 14 : 24,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {!isPCC && <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#636b7e',
            fontFamily: "'Outfit', sans-serif",
            flexShrink: 0,
          }}>Mode</div>}
          <div style={{ display: 'flex', gap: 10, flex: 1 }}>
            {modeBtn('Single ISP', 'single', '#f59e0b')}
            {modeBtn('PCC Balance', 'pcc', '#8b5cf6')}
          </div>
        </div>
      </div>

      {isPCC && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.3fr 1fr',
          gap: 14,
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProviderCard data={wan0Data} route={wan0Route} iface={wan0.interface} providerKey={wan0.interface} isActive={true} accentColor={wan0Color} loading={loading} onSwitch={switchProvider} mode={mode} pccPercent={pccUkrPercent} />
            <ProviderCard data={wan1Data} route={wan1Route} iface={wan1.interface} providerKey={wan1.interface} isActive={true} accentColor={wan1Color} loading={loading} onSwitch={switchProvider} mode={mode} pccPercent={100 - pccUkrPercent} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: '#12151c',
              borderRadius: 12,
              border: '1px solid #8b5cf640',
              padding: 16,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#eef0f4',
                  letterSpacing: '-0.01em',
                }}>Load Distribution</span>
                <span style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#8b5cf6',
                }}>
                  <span style={{ color: wan0Color }}>{sliderValue}%</span>
                  {' / '}
                  <span style={{ color: wan1Color }}>{100 - sliderValue}%</span>
                </span>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
              }}>
                <span style={{ fontSize: 10, color: wan0Color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{wan0Name?.substring(0, 5)}</span>
                <div style={{ flex: 1, position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: 4,
                    borderRadius: 2,
                    transform: 'translateY(-50%)',
                    background: `linear-gradient(to right, ${wan0Color} ${sliderValue}%, ${wan1Color} ${sliderValue}%)`,
                    pointerEvents: 'none',
                  }} />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={sliderValue}
                    onChange={e => setSliderValue(parseInt(e.target.value))}
                    style={{
                      width: '100%',
                      height: 20,
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  />
                </div>
                <span style={{ fontSize: 10, color: wan1Color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{wan1Name?.substring(0, 5)}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 10,
                padding: '0 28px',
              }}>
                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                  <span key={v} style={{
                    fontSize: 9,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: v === sliderValue ? '#eef0f4' : '#636b7e40',
                  }}>{v}</span>
                ))}
              </div>

              {sliderValue !== pccUkrPercent && (
                <button
                  onClick={handleApplyRatio}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '8px 0',
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    borderRadius: 8,
                    cursor: loading ? 'default' : 'pointer',
                    background: '#8b5cf618',
                    color: '#8b5cf6',
                    border: '1px solid #8b5cf630',
                    transition: 'all 0.2s ease',
                    opacity: loading ? 0.5 : 1,
                    marginBottom: 10,
                  }}
                >
                  Apply {sliderValue}% / {100 - sliderValue}%
                </button>
              )}

              <div style={{ borderTop: '1px solid #1a1f2e', paddingTop: 12, marginTop: 'auto' }}>
                <div style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#636b7e',
                  marginBottom: 6,
                  fontFamily: "'Outfit', sans-serif",
                }}>Exclusions (force ISP1)</div>
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  padding: '6px 8px',
                  background: '#0d1017',
                  borderRadius: 6,
                  border: '1px solid #1a1f2e',
                  minHeight: 32,
                  alignItems: 'center',
                }}>
                  {exclusions.map(addr => (
                    <span key={addr} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: '#f59e0b',
                      background: '#f59e0b12',
                      padding: '2px 5px 2px 7px',
                      borderRadius: 4,
                      border: '1px solid #f59e0b25',
                    }}>
                      {addr}
                      <span
                        onClick={() => removeExclusion(addr)}
                        style={{ cursor: 'pointer', color: '#636b7e', fontSize: 12, lineHeight: 1, padding: '0 1px' }}
                      >×</span>
                    </span>
                  ))}
                  <input
                    value={exclusionInput}
                    onChange={e => setExclusionInput(e.target.value)}
                    onKeyDown={handleExclusionKeyDown}
                    placeholder={exclusions.length === 0 ? 'IP/CIDR, Enter' : ''}
                    style={{
                      flex: 1,
                      minWidth: 80,
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: '#c8ccd4',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: '2px 0',
                    }}
                  />
                </div>
                <button
                  onClick={handleSyncExclusions}
                  disabled={loading}
                  style={{
                    marginTop: 6,
                    width: '100%',
                    padding: '6px 0',
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    borderRadius: 6,
                    cursor: loading ? 'default' : 'pointer',
                    background: '#f59e0b12',
                    color: '#f59e0b',
                    border: '1px solid #f59e0b25',
                    transition: 'all 0.2s ease',
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  Sync Exclusions
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: '#12151c',
              borderRadius: 12,
              border: `1px solid ${wan0Color}40`,
              padding: 12,
              transition: 'border-color 0.3s ease',
            }}>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#636b7e',
                marginBottom: 4,
                fontFamily: "'Outfit', sans-serif",
              }}>{wan0Name} Traffic</div>
              <TrafficGauge
                rx={stats[wan0.interface]?.['rx-bits-per-second']}
                tx={stats[wan0.interface]?.['tx-bits-per-second']}
                color={wan0Color}
                compact
              />
            </div>
            <div style={{
              background: '#12151c',
              borderRadius: 12,
              border: `1px solid ${wan1Color}40`,
              padding: 12,
              transition: 'border-color 0.3s ease',
            }}>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#636b7e',
                marginBottom: 4,
                fontFamily: "'Outfit', sans-serif",
              }}>{wan1Name} Traffic</div>
              <TrafficGauge
                rx={stats[wan1.interface]?.['rx-bits-per-second']}
                tx={stats[wan1.interface]?.['tx-bits-per-second']}
                color={wan1Color}
                compact
              />
            </div>

            {pccRate && (() => {
              const total = pccRate.isp1 + pccRate.isp2;
              const isp1Pct = total > 0 ? Math.round((pccRate.isp1 / total) * 100) : 0;
              const isp2Pct = total > 0 ? 100 - isp1Pct : 0;
              const isp1Fmt = formatSpeedNum(pccRate.isp1);
              const isp2Fmt = formatSpeedNum(pccRate.isp2);
              return (
                <div style={{
                  background: '#12151c',
                  borderRadius: 12,
                  border: '1px solid #8b5cf640',
                  padding: 12,
                  flex: 1,
                }}>
                  <div style={{
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: '#636b7e',
                    marginBottom: 8,
                    fontFamily: "'Outfit', sans-serif",
                  }}>PCC Distribution</div>
                  <div style={{
                    height: 4,
                    borderRadius: 2,
                    background: '#0d1017',
                    overflow: 'hidden',
                    marginBottom: 10,
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${isp1Pct}%`,
                      background: `linear-gradient(90deg, ${wan0Color}, ${wan0Color}cc)`,
                      borderRadius: 2,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      background: '#0d1017',
                      borderRadius: 6,
                      padding: '8px 10px',
                      border: `1px solid ${wan0Color}20`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: '#636b7e', fontFamily: "'Outfit', sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{wan0Name?.substring(0, 5)}</span>
                        <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: wan0Color, fontWeight: 600 }}>{isp1Pct}%</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: wan0Color, lineHeight: 1 }}>{isp1Fmt.val}</span>
                        <span style={{ fontSize: 9, fontWeight: 500, color: '#636b7e', fontFamily: "'JetBrains Mono', monospace" }}>{isp1Fmt.unit}</span>
                      </div>
                    </div>
                    <div style={{
                      background: '#0d1017',
                      borderRadius: 6,
                      padding: '8px 10px',
                      border: `1px solid ${wan1Color}20`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: '#636b7e', fontFamily: "'Outfit', sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{wan1Name?.substring(0, 5)}</span>
                        <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: wan1Color, fontWeight: 600 }}>{isp2Pct}%</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: wan1Color, lineHeight: 1 }}>{isp2Fmt.val}</span>
                        <span style={{ fontSize: 9, fontWeight: 500, color: '#636b7e', fontFamily: "'JetBrains Mono', monospace" }}>{isp2Fmt.unit}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {!isPCC && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProviderCard data={wan0Data} route={wan0Route} iface={wan0.interface} providerKey={wan0.interface} isActive={wan0Active} accentColor={wan0Color} loading={loading} onSwitch={() => switchProvider(wan0.interface)} mode={mode} pccPercent={0} />
            <div style={{
              background: '#12151c',
              borderRadius: 12,
              border: `1px solid ${wan0Active ? wan0Color + '40' : '#1a1f2e'}`,
              padding: 12,
              transition: 'border-color 0.3s ease',
            }}>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#636b7e',
                marginBottom: 4,
                fontFamily: "'Outfit', sans-serif",
              }}>{wan0Name} Traffic</div>
              <TrafficGauge
                rx={stats[wan0.interface]?.['rx-bits-per-second']}
                tx={stats[wan0.interface]?.['tx-bits-per-second']}
                color={wan0Active ? wan0Color : '#636b7e'}
                compact
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProviderCard data={wan1Data} route={wan1Route} iface={wan1.interface} providerKey={wan1.interface} isActive={wan1Active} accentColor={wan1Color} loading={loading} onSwitch={() => switchProvider(wan1.interface)} mode={mode} pccPercent={0} />
            <div style={{
              background: '#12151c',
              borderRadius: 12,
              border: `1px solid ${wan1Active ? wan1Color + '40' : '#1a1f2e'}`,
              padding: 12,
              transition: 'border-color 0.3s ease',
            }}>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#636b7e',
                marginBottom: 4,
                fontFamily: "'Outfit', sans-serif",
              }}>{wan1Name} Traffic</div>
              <TrafficGauge
                rx={stats[wan1.interface]?.['rx-bits-per-second']}
                tx={stats[wan1.interface]?.['tx-bits-per-second']}
                color={wan1Active ? wan1Color : '#636b7e'}
                compact
              />
            </div>
          </div>
        </div>
      )}

    </>
  );
}
