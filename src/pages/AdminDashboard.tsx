import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { RefreshCw, Users, Clock, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const AdminDashboard = () => {
  const [qrToken, setQrToken] = useState("");
  const [timeLeft, setTimeLeft] = useState(15);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const navigate = useNavigate();

  const generateToken = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke("generate-qr-token", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw new Error(response.error.message);
      const data = response.data;
      setQrToken(data.token);
      setTimeLeft(15);
    } catch (err: any) {
      toast.error("Failed to generate QR: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh QR code every 15 seconds
  useEffect(() => {
    generateToken();
    const interval = setInterval(generateToken, 15000);
    return () => clearInterval(interval);
  }, [generateToken]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 15 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch recent attendance logs
  useEffect(() => {
    const fetchLogs = async () => {
      const { data } = await supabase
        .from("attendance_logs")
        .select("*, profiles!attendance_logs_user_id_fkey(full_name)")
        .order("scanned_at", { ascending: false })
        .limit(20);
      if (data) setLogs(data);
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground font-display">Admin Dashboard</h1>
              <p className="text-xs text-muted-foreground">AttendQR Management</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* QR Code Section */}
          <div className="bg-card rounded-2xl shadow-elevated p-8 text-center">
            <h2 className="text-xl font-bold text-foreground mb-2 font-display">Live QR Code</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Display this on a screen for workers to scan
            </p>

            <div className="inline-block p-6 bg-background rounded-2xl border mb-6">
              {qrToken ? (
                <QRCodeSVG
                  value={qrToken}
                  size={240}
                  level="H"
                  bgColor="transparent"
                  fgColor="hsl(220, 25%, 10%)"
                />
              ) : (
                <div className="w-60 h-60 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
                </div>
              )}
            </div>

            {/* Timer */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div className="w-48 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full gradient-primary rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${(timeLeft / 15) * 100}%` }}
                />
              </div>
              <span className="text-sm font-mono font-medium text-foreground w-6 text-right">
                {timeLeft}s
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Code auto-refreshes every 15 seconds for security
            </p>
          </div>

          {/* Recent Activity */}
          <div className="bg-card rounded-2xl shadow-elevated p-8">
            <div className="flex items-center gap-2 mb-6">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground font-display">Recent Activity</h2>
            </div>

            {logs.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">
                No attendance records yet. Workers will appear here after scanning.
              </p>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-background border"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          log.action === "arrival" ? "bg-success" : "bg-destructive"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {(log as any).profiles?.full_name || "Worker"}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">{log.action}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(log.scanned_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
