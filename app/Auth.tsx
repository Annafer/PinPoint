'use client';
import { useState } from 'react';
import { supabase } from './lib/supabase';

export default function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setMsg('');
    const { error } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) setMsg(error.message);
    else !isLogin ? setMsg('Проверьте email') : onSuccess();
  };

  return (
    <div className="flex items-center justify-center h-screen px-4">
      <div className="w-full max-w-sm">
        <form onSubmit={handle} className="space-y-4">
          <h1 className="text-2xl font-semibold text-center">{isLogin ? 'Вход' : 'Регистрация'}</h1>
          <input type="email" required placeholder="email" className="w-full p-3 border rounded-md text-sm" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" required placeholder="пароль" className="w-full p-3 border rounded-md text-sm" value={password} onChange={e => setPassword(e.target.value)} />
          {msg && <p className="text-sm text-center">{msg}</p>}
          <button disabled={loading} className="w-full bg-blue-500 text-white py-3 rounded-md text-sm disabled:opacity-50">
            {loading ? '…' : isLogin ? 'Войти' : 'Создать'}
          </button>
          <button type="button" className="w-full text-sm text-blue-500" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
          </button>
        </form>
      </div>
    </div>
  );
}