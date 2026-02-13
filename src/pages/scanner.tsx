import { useEffect, useState, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { LogOut, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Scanner = () => {
  const [scanning, setScanning] = useState(true);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is authenticated and has worker role
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Please log in to access the scanner");
        navigate("/auth");
        return;
      }

      const userRole = user.user_metadata?.role;
      if (userRole !== "worker") {
        toast.error("Access denied. This page is for workers only.");
        navigate("/");
        return;
      }
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (scanning) {
      // Initialize QR scanner
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        false
      );

      scanner.render(onScanSuccess, onScanError);
      scannerRef.current = scanner;

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [scanning]);

  const onScanSuccess = async (decodedText: string) => {
    setLastScan(decodedText);
    setScanning(false);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("User not authenticated");
        return;
      }

      // Record attendance in Supabase
      // You'll need to create an 'attendance' table in Supabase with columns:
      // - id (uuid, primary key)
      // - user_id (uuid, references auth.users)
      // - qr_data (text)
      // - scanned_at (timestamp with time zone)
      // - created_at (timestamp with time zone)
      
      const { error } = await supabase
        .from("attendance")
        .insert({
          user_id: user.id,
          qr_data: decodedText,
          scanned_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast.success("Attendance recorded successfully!", {
        icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
      });
    } catch (error: any) {
      console.error("Error recording attendance:", error);
      toast.error(error.message || "Failed to record attendance", {
        icon: <XCircle className="w-5 h-5 text-red-500" />,
      });
    }
  };

  const onScanError = (errorMessage: string) => {
    // Silent error handling - no need to show every scan attempt error
    console.debug("QR Scan error:", errorMessage);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error logging out");
    } else {
      toast.success("Logged out successfully");
      navigate("/auth");
    }
  };

  const handleRescan = () => {
    setLastScan(null);
    setScanning(true);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">
              QR Scanner
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Scan QR code to mark attendance
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        {/* Scanner Area */}
        <Card className="p-6 mb-4">
          {scanning ? (
            <div>
              <div id="qr-reader" className="w-full"></div>
              <p className="text-center text-sm text-muted-foreground mt-4">
                Position the QR code within the frame
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Scan Complete!</h3>
              <p className="text-sm text-muted-foreground mb-4">
                QR Code Data: <span className="font-mono">{lastScan}</span>
              </p>
              <Button onClick={handleRescan} className="w-full">
                Scan Another QR Code
              </Button>
            </div>
          )}
        </Card>

        {/* Instructions */}
        <Card className="p-4 bg-muted/50">
          <h4 className="font-semibold text-sm mb-2">Instructions:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Hold your device steady</li>
            <li>• Ensure good lighting</li>
            <li>• Center the QR code in the frame</li>
            <li>• Wait for automatic detection</li>
          </ul>
        </Card>
      </div>
    </div>
  );
};

export default Scanner;