import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../components/ui/Toast';
import client from '../../api/client';

export default function LoginPage() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);

    try {
      if (isRegister) {
        await client.post('/auth/register', { username, password, email });
        toast('Account created! Please log in.', 'success');
        setIsRegister(false);
      } else {
        const data: any = await client.post('/auth/login', { username, password });
        if (data.access_token) {
          localStorage.setItem('token', data.access_token);
          toast('Welcome back!', 'success');
          navigate('/chat');
        } else {
          toast('Invalid credentials', 'error');
        }
      }
    } catch (err: any) {
      toast(err?.response?.data?.detail || 'Failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = () => {
    localStorage.removeItem('token');
    toast('Entering demo mode', 'info');
    navigate('/chat');
  };

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--cream)',
    }}>
      <div style={{
        width: 380, padding: 32, border: '2px solid var(--ink)',
        background: 'var(--cream)', boxShadow: '8px 8px 0 var(--orange)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="font-display" style={{ fontSize: 42, letterSpacing: 6, color: 'var(--orange)' }}>
            NEXUS
          </div>
          <div className="font-mono" style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: 2, marginTop: 4 }}>
            AI INTELLIGENCE SYSTEM
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="font-mono" style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>
              Username
            </div>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" autoFocus />
          </div>

          {isRegister && (
            <div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>
                Email
              </div>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
          )}

          <div>
            <div className="font-mono" style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>
              Password
            </div>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" />
          </div>

          <Button type="submit" disabled={loading} style={{ marginTop: 8, width: '100%' }}>
            {loading ? 'PROCESSING...' : isRegister ? 'REGISTER' : 'LOGIN'}
          </Button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <button onClick={() => setIsRegister(!isRegister)}
            className="font-mono"
            style={{ background: 'none', border: 'none', color: 'var(--orange)', fontSize: 11, cursor: 'pointer' }}>
            {isRegister ? '← Back to Login' : 'Create Account →'}
          </button>
          <button onClick={handleDemo}
            className="font-mono"
            style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 11, cursor: 'pointer' }}>
            Demo Mode
          </button>
        </div>
      </div>
    </div>
  );
}
