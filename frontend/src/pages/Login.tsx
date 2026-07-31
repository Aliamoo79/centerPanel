import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../lib/api";
import { Button, Input, Card } from "../components/ui";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await api.login(username, password);
      setToken(token);
      navigate("/");
    } catch (err: any) {
      setError(err.message ?? "ورود ناموفق بود");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-4">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-lg bg-signal/15 border border-signal/30 flex items-center justify-center">
            <div className="h-2.5 w-2.5 rounded-full bg-signal" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">مرکز کنترل VPN</p>
            <p className="text-xs text-muted mt-1">ورود ادمین</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">نام کاربری</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">رمز عبور</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "در حال ورود..." : "ورود"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
