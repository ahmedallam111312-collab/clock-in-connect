import { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { LogOut, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const WorkerScan = () => {
  const [scanning, setScanning] = useState(true);
  const [lastScan, setLastScan] = useState<string | null>(null);
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

  useEffect(() => {
    if (!scanning) return;

    // استخدام المحرك الأساسي لفتح الكاميرا الخلفية فوراً
    const html5QrCode = new Html5Qrcode("qr-reader");

    html5QrCode.start(
      { facingMode: "environment" }, // إجبار المتصفح على الكاميرا الخلفية
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      },
      onScanSuccess,
      (errorMessage) => {
        // إخفاء أخطاء البحث المستمرة عن الـ QR
      }
    ).catch((err) => {
      console.error("Camera failed to start:", err);
      toast.error("الرجاء السماح للكاميرا بالعمل في متصفحك.");
    });

    return () => {
      if (html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [scanning]);

  const onScanSuccess = async (decodedText: string) => {
    setLastScan(decodedText);
    setScanning(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // إرسال البيانات بما فيها اسم الموظف إلى قاعدة البيانات
      const { error } = await supabase.from("attendance").insert({
        user_id: user.id,
        user_name: user.user_metadata?.full_name || user.email, // <--- تم إضافة هذا السطر
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
          {scanning ? (
            <div>
              {/* هنا سيتم عرض الكاميرا */}
              <div id="qr-reader" className="w-full rounded-lg overflow-hidden"></div>
              <p className="text-center text-sm text-muted-foreground mt-4">
                قم بتوجيه الكاميرا نحو رمز الاستجابة السريعة (QR)
              </p>
            </div>
          ) : (
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
      </div>
    </div>
  );
};

export default WorkerScan;