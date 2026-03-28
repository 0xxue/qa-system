import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import ChatPage from './pages/Chat';
import KnowledgeBasePage from './pages/KnowledgeBase';
import DashboardPage from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import LoginPage from './pages/Login';
import AdminPage from './pages/Admin';
import BotManagePage from './pages/BotManage';
import { ToastContainer } from './components/ui/Toast';
import { BotContainer } from './components/bot/BotContainer';
import { GeoLines, DustCanvas } from './components/layout/Background';
import { MessageSquare, Database, BarChart3, Settings, Shield, LogOut, User, Bot } from 'lucide-react';

/* ══════════════════════════════════════
   Auth Guard
══════════════════════════════════════ */

function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = localStorage.getItem('token');
  const isDemo = localStorage.getItem('demo_mode') === '1';

  if (!token && !isDemo) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/** Silent auth guard — renders nothing when not authed (no redirect). Used for global overlays like Bot. */
function AuthGuardSilent({ children }: { children: React.ReactNode }) {
  useLocation(); // Re-render on navigation (login → chat triggers this)
  const token = localStorage.getItem('token');
  const isDemo = localStorage.getItem('demo_mode') === '1';
  if (!token && !isDemo) return null;
  return <>{children}</>;
}

/* ══════════════════════════════════════
   NEXUS Sidebar
══════════════════════════════════════ */

function Sidebar() {
  const links = [
    { to: '/chat', icon: MessageSquare, label: 'Chat' },
    { to: '/kb', icon: Database, label: 'Know' },
    { to: '/dashboard', icon: BarChart3, label: 'Dash' },
    { to: '/settings', icon: Settings, label: 'Set' },
    { to: '/bot-manage', icon: Bot, label: 'Bot' },
    { to: '/admin', icon: Shield, label: 'Admin' },
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="sidebar-desktop" style={{
        width: 80, height: '100%', borderRight: '2px solid var(--ink)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '24px 0', background: 'var(--cream)', position: 'relative',
      }}>
        {/* Vertical title */}
        <div className="font-display" style={{
          writingMode: 'vertical-rl', textOrientation: 'mixed',
          transform: 'rotate(180deg)', fontSize: 52, letterSpacing: 6,
          color: 'var(--orange)', lineHeight: 1,
          position: 'absolute', top: 80,
          filter: 'drop-shadow(2px 2px 0 var(--rust))',
        }}>
          NEXUS
        </div>

        {/* Nav items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto', paddingBottom: 8 }}>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              style={({ isActive }) => ({
                width: 56, height: 56, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                border: '2px solid transparent', borderRadius: 4, cursor: 'pointer',
                transition: 'all 0.2s', color: isActive ? 'var(--orange)' : 'var(--mid)',
                borderColor: isActive ? 'var(--orange)' : 'transparent',
                background: isActive ? 'rgba(212, 82, 26, 0.08)' : 'transparent',
                textDecoration: 'none',
              })}
            >
              <link.icon size={22} />
              <span className="font-mono" style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>
                {link.label}
              </span>
            </NavLink>
          ))}
        </div>

      </nav>

      {/* Mobile bottom bar */}
      <nav className="sidebar-mobile" style={{
        width: '100%', height: 56, borderTop: '2px solid var(--ink)',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
        padding: '0 8px', background: 'var(--cream)', order: 1,
      }}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            style={({ isActive }) => ({
              width: 44, height: 44, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              border: '2px solid transparent', borderRadius: 4,
              color: isActive ? 'var(--orange)' : 'var(--mid)',
              borderColor: isActive ? 'var(--orange)' : 'transparent',
              textDecoration: 'none',
            })}
          >
            <link.icon size={18} />
            <span className="font-mono" style={{ fontSize: 8 }}>{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}

/* ══════════════════════════════════════
   Top Strip
══════════════════════════════════════ */

function TopStrip() {
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const token = localStorage.getItem('token');
  const isDemo = localStorage.getItem('demo_mode') === '1';
  const isLoggedIn = !!token;

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('demo_mode');
    window.location.href = '/login';
  };

  return (
    <div style={{
      height: 56, borderBottom: '2px solid var(--ink)', display: 'flex',
      alignItems: 'center', padding: '0 28px', gap: 20, background: 'var(--cream)',
      flexShrink: 0,
    }}>
      <div>
        <div className="font-mono top-strip-label" style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--dim)' }}>
          Mission Control
        </div>
        <div className="font-display top-strip-title" style={{ fontSize: 26, letterSpacing: 4, color: 'var(--ink)' }}>
          NexusAI · Intelligence System
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div className="font-mono" style={{ fontSize: 10, color: 'var(--mid)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%', background: 'var(--orange)',
          animation: 'pulse 2s step-end infinite',
        }} />
        <span>{time}</span>
      </div>
      <div className="font-mono top-strip-status" style={{
        padding: '4px 12px', border: '1.5px solid var(--orange)',
        fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
        color: 'var(--orange)', background: 'rgba(212, 82, 26, 0.05)',
      }}>
        ● {isLoggedIn ? 'ONLINE' : isDemo ? 'DEMO' : 'OFFLINE'}
      </div>
      {isLoggedIn || isDemo ? (
        <button onClick={handleLogout} title={isDemo ? 'Exit Demo' : 'Logout'}
          style={{ background: 'none', border: '1.5px solid var(--line)', padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--orange)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
        >
          <LogOut size={12} color="var(--mid)" />
          <span className="font-mono" style={{ fontSize: 9, color: 'var(--mid)', letterSpacing: 1 }}>{isDemo ? 'LOGIN' : 'LOGOUT'}</span>
        </button>
      ) : (
        <a href="/login" style={{ textDecoration: 'none', border: '1.5px solid var(--orange)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <User size={12} color="var(--orange)" />
          <span className="font-mono" style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: 1 }}>LOGIN</span>
        </a>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   App Root
══════════════════════════════════════ */

export default function App() {
  return (
    <BrowserRouter>
      {/* Background decorations */}
      <DustCanvas />
      <GeoLines />

      {/* App shell — desktop: row (sidebar | content), mobile: column (topstrip | content | bottombar) */}
      <div className="app-shell" style={{ position: 'fixed', inset: 0, zIndex: 2, display: 'flex' }}>
        <AuthGuardSilent><Sidebar /></AuthGuardSilent>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <AuthGuardSilent><TopStrip /></AuthGuardSilent>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Routes>
              <Route path="/" element={<AuthGuard><Navigate to="/chat" replace /></AuthGuard>} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/chat" element={<AuthGuard><ChatPage /></AuthGuard>} />
              <Route path="/kb" element={<AuthGuard><KnowledgeBasePage /></AuthGuard>} />
              <Route path="/dashboard" element={<AuthGuard><DashboardPage /></AuthGuard>} />
              <Route path="/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
              <Route path="/bot-manage" element={<AuthGuard><BotManagePage /></AuthGuard>} />
              <Route path="/admin" element={<AuthGuard><AdminPage /></AuthGuard>} />
            </Routes>
          </div>
        </div>
      </div>
      <AuthGuardSilent><BotContainer /></AuthGuardSilent>
      <ToastContainer />
    </BrowserRouter>
  );
}
