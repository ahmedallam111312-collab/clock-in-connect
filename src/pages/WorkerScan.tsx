import { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { LogOut, CheckCircle2, Camera, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const WorkerScan = () => {
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] = useState<"pending" | "granted" | "denied">("pending");
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("الرجاء تسجيل الدخول للوصول إلى الماسح الضوئي");
        navigate("/auth");
        return;
      }
      if (user.user_metadata?.role !== "worker") {
        toast.error("تم الرفض. هذه الصفحة مخصصة للموظفين فقط.");
        navigate("/");
      }
    };
    checkAuth();
  }, [navigate]);

  // Request camera permission immediately
  useEffect(() => {
    requestCameraPermission();
  }, []);

  const requestCameraPermission = async () => {
    try {
      // Try to get camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      
      // Permission granted
      setCameraPermission("granted");
      
      // Stop the stream immediately (we just needed permission)
      stream.getTracks().forEach(track => track.stop());
      
      // Start scanning automatically
      setScanning(true);
      
      toast.success("تم السماح للكاميرا بنجاح!");
    } catch (error) {
      console.error("Camera permission error:", error);
      setCameraPermission("denied");
      toast.error("الرجاء السماح للكاميرا بالعمل من إعدادات المتصفح");
    }
  };

  useEffect(() => {
    if (!scanning || cameraPermission !== "granted") return;

    const html5QrCode = new Html5Qrcode("qr-reader");

    html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      },
      onScanSuccess,
      (errorMessage) => {
        // Ignore continuous QR search errors
      }
    ).catch((err) => {
      console.error("Camera failed to start:", err);
      toast.error("فشل في تشغيل الكاميرا. الرجاء المحاولة مرة أخرى.");
      setCameraPermission("denied");
    });

    return () => {
      if (html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [scanning, cameraPermission]);

  const onScanSuccess = async (decodedText: string) => {
    setLastScan(decodedText);
    setScanning(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("attendance").insert({
        user_id: user.id,
        user_name: user.user_metadata?.full_name || user.email,
        qr_data: decodedText,
        scanned_at: new Date().toISOString(),
      });

      if (error) throw error;

      toast.success("تم تسجيل العملية بنجاح!", {
        icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
      });
    } catch (error: any) {
      toast.error(error.message || "فشل في تسجيل البيانات");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleRescan = () => {
    setLastScan(null);
    setScanning(true);
  };

  const handleRetryCamera = () => {
    setCameraPermission("pending");
    requestCameraPermission();
  };

  return (
    <div className="min-h-screen bg-background p-4" dir="rtl">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">
              ماسح الحضور والانصراف
            </h1>
          </div>
          <Button variant="outline" size="icon" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        <Card className="p-6 mb-4 overflow-hidden">
          {cameraPermission === "pending" && (
            <div className="text-center py-8">
              <Camera className="w-16 h-16 text-primary mx-auto mb-4 animate-pulse" />
              <h3 className="text-lg font-semibold mb-2">جاري طلب إذن الكاميرا...</h3>
              <p className="text-sm text-muted-foreground">
                الرجاء السماح للكاميرا عند ظهور النافذة المنبثقة
              </p>
            </div>
          )}

          {cameraPermission === "denied" && (
            <div className="text-center py-8">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-red-600">تم رفض إذن الكاميرا</h3>
              <p className="text-sm text-muted-foreground mb-4">
                يرجى السماح للكاميرا من إعدادات المتصفح:
              </p>
              <ul className="text-xs text-right text-muted-foreground mb-4 space-y-1">
                <li>• اذهب إلى إعدادات المتصفح</li>
                <li>• ابحث عن "أذونات المواقع" أو "Site Settings"</li>
                <li>• اسمح بالوصول للكاميرا لهذا الموقع</li>
                <li>• أعد تحميل الصفحة</li>
              </ul>
              <Button onClick={handleRetryCamera} className="w-full">
                <Camera className="w-4 h-4 ml-2" />
                إعادة المحاولة
              </Button>
            </div>
          )}

          {cameraPermission === "granted" && scanning && (
            <div>
              <div id="qr-reader" className="w-full rounded-lg overflow-hidden"></div>
              <p className="text-center text-sm text-muted-foreground mt-4">
                قم بتوجيه الكاميرا نحو رمز الاستجابة السريعة (QR)
              </p>
            </div>
          )}

          {cameraPermission === "granted" && !scanning && lastScan && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">تم المسح بنجاح!</h3>
              <p className="text-sm text-muted-foreground mb-4">
                الرمز: <span className="font-mono inline-block text-left" dir="ltr">{lastScan}</span>
              </p>
              <Button onClick={handleRescan} className="w-full">
                مسح رمز آخر
              </Button>
            </div>
          )}
        </Card>

        {/* Camera permission instructions card */}
        {cameraPermission === "denied" && (
          <Card className="p-4 bg-amber-50 border-amber-200">
            <h4 className="text-sm font-semibold text-amber-900 mb-2">
              💡 نصيحة للهواتف القديمة:
            </h4>
            <p className="text-xs text-amber-800">
              إذا لم تظهر نافذة طلب الإذن، قد تحتاج إلى السماح يدوياً من إعدادات المتصفح أو إعدادات النظام.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default WorkerScan;