import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogOut, RefreshCw, Download, LogIn, LogOut as LogOutIcon, Banknote, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Worker {
  user_id: string;
  user_name: string;
  email: string;
}

const Index = () => {
  const navigate = useNavigate();
  const [qrToken, setQrToken] = useState<string>("");
  const [scanType, setScanType] = useState<"حضور" | "انصراف">("حضور");
  const [scans, setScans] = useState<any[]>([]);
  
  // Worker filtering state
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<string>("all");
  const [filteredScans, setFilteredScans] = useState<any[]>([]);

  // Advances management state
  const [selectedWorkerForAdvance, setSelectedWorkerForAdvance] = useState<string>("");
  const [advanceAmount, setAdvanceAmount] = useState<string>("");
  const [advances, setAdvances] = useState<any[]>([]);

  // Excel download worker selection
  const [selectedWorkerForExcel, setSelectedWorkerForExcel] = useState<string>("all");
  const [showExcelDialog, setShowExcelDialog] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      if (user.user_metadata?.role === "worker") {
        navigate("/scan");
      }
    };
    
    checkAuth();
    generateNewToken("حضور");
    fetchScans();
    fetchWorkers();
    fetchAdvances();
  }, [navigate]);

  useEffect(() => {
    // Filter scans based on selected worker
    if (selectedWorker === "all") {
      setFilteredScans(scans);
    } else {
      setFilteredScans(scans.filter(scan => scan.user_id === selectedWorker));
    }
  }, [selectedWorker, scans]);

  const generateNewToken = (type: "حضور" | "انصراف") => {
    setScanType(type);
    const randomString = Math.random().toString(36).substring(2, 10);
    setQrToken(`${type}-${randomString}`);
  };

  const fetchScans = async () => {
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .order("scanned_at", { ascending: false })
      .limit(50);
      
    if (error) {
      console.error("Error fetching scans:", error);
      return;
    }
    if (data) setScans(data);
  };

  const fetchWorkers = async () => {
    try {
      // Get ALL users with worker role from user_roles and auth.users
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "worker");

      if (error) {
        console.error("Error fetching workers from user_roles:", error);
        toast.error("حدث خطأ في تحميل قائمة الموظفين");
        return;
      }

      if (data && data.length > 0) {
        // Get user details from auth.users
        const userIds = data.map(item => item.user_id);
        
        const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
        
        if (usersError) {
          console.error("Error fetching user details:", usersError);
          // Fallback: try to get from attendance table
          await fetchWorkersFromAttendance();
          return;
        }

        const workersList: Worker[] = usersData.users
          .filter(user => userIds.includes(user.id))
          .map(user => ({
            user_id: user.id,
            user_name: user.user_metadata?.full_name || user.email?.split('@')[0] || user.email || "موظف",
            email: user.email || ""
          }));

        // Sort by name
        workersList.sort((a, b) => a.user_name.localeCompare(b.user_name, 'ar'));
        
        setWorkers(workersList);
        console.log("Workers loaded from user_roles:", workersList.length);
      } else {
        console.log("No workers found in user_roles table");
        setWorkers([]);
      }
    } catch (err) {
      console.error("Exception in fetchWorkers:", err);
      // Fallback to attendance table method
      await fetchWorkersFromAttendance();
    }
  };

  const fetchWorkersFromAttendance = async () => {
    try {
      const { data, error } = await supabase
        .from("attendance")
        .select("user_id, user_name");

      if (error) {
        console.error("Error fetching workers from attendance:", error);
        return;
      }

      if (data && data.length > 0) {
        const uniqueWorkers = Array.from(
          new Map(
            data
              .filter(item => item.user_name && item.user_name.trim() !== "")
              .map(item => [item.user_id, { 
                user_id: item.user_id, 
                user_name: item.user_name,
                email: ""
              }])
          ).values()
        );
        
        uniqueWorkers.sort((a, b) => a.user_name.localeCompare(b.user_name, 'ar'));
        setWorkers(uniqueWorkers as Worker[]);
        console.log("Workers loaded from attendance (fallback):", uniqueWorkers.length);
      }
    } catch (err) {
      console.error("Exception in fetchWorkersFromAttendance:", err);
    }
  };

  const fetchAdvances = async () => {
    const { data, error } = await supabase
      .from("advances")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching advances:", error);
      return;
    }
    if (data) setAdvances(data);
  };

  const handleSaveAdvance = async () => {
    if (!selectedWorkerForAdvance || !advanceAmount) {
      toast.error("الرجاء اختيار الموظف وإدخال المبلغ");
      return;
    }

    const worker = workers.find(w => w.user_id === selectedWorkerForAdvance);
    if (!worker) {
      toast.error("الموظف غير موجود");
      return;
    }

    const amount = parseFloat(advanceAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("الرجاء إدخال مبلغ صحيح");
      return;
    }

    const { error } = await supabase.from("advances").insert({
      user_id: worker.user_id,
      user_name: worker.user_name,
      amount: amount,
    });

    if (error) {
      toast.error("حدث خطأ أثناء حفظ السلفة");
      console.error(error);
      return;
    }

    toast.success("تم حفظ السلفة بنجاح!");
    setAdvanceAmount("");
    setSelectedWorkerForAdvance("");
    fetchAdvances();
  };

  const handleDownloadExcel = () => {
    setShowExcelDialog(true);
  };

  const downloadExcel = async () => {
    const workerIdToDownload = selectedWorkerForExcel;
    
    // جلب كافة البيانات من الأقدم للأحدث لتسهيل الحساب
    let query = supabase
      .from("attendance")
      .select("*")
      .order("scanned_at", { ascending: true });

    // Apply worker filter if selected
    if (workerIdToDownload !== "all") {
      query = query.eq("user_id", workerIdToDownload);
    }

    const { data, error } = await query;

    if (error || !data) {
      toast.error("حدث خطأ أثناء تحميل البيانات");
      return;
    }

    // Get advances for the selected worker(s)
    let advancesQuery = supabase
      .from("advances")
      .select("*")
      .order("created_at", { ascending: true });
    
    if (workerIdToDownload !== "all") {
      advancesQuery = advancesQuery.eq("user_id", workerIdToDownload);
    }

    const { data: advancesData } = await advancesQuery;

    // تجميع البيانات حسب الموظف والتاريخ
    const recordsByUserAndDate: Record<string, any> = {};

    data.forEach((scan) => {
      const dateObj = new Date(scan.scanned_at);
      const dateKey = dateObj.toLocaleDateString('en-CA'); 
      const groupKey = `${scan.user_id}_${dateKey}`;

      if (!recordsByUserAndDate[groupKey]) {
        recordsByUserAndDate[groupKey] = {
          userId: scan.user_id,
          name: scan.user_name || scan.user_id,
          dateObj: dateObj,
          checkIn: null,
          checkOut: null,
        };
      }

      if (scan.qr_data.includes("حضور")) {
        if (!recordsByUserAndDate[groupKey].checkIn || dateObj < recordsByUserAndDate[groupKey].checkIn) {
          recordsByUserAndDate[groupKey].checkIn = dateObj;
        }
      } else if (scan.qr_data.includes("انصراف")) {
        if (!recordsByUserAndDate[groupKey].checkOut || dateObj > recordsByUserAndDate[groupKey].checkOut) {
          recordsByUserAndDate[groupKey].checkOut = dateObj;
        }
      }
    });

    // تحويل البيانات المجمعة إلى الشكل النهائي للإكسيل
    const excelData = Object.values(recordsByUserAndDate).map((record) => {
      const checkInStr = record.checkIn ? record.checkIn.toLocaleTimeString('ar-EG') : "لم يسجل";
      const checkOutStr = record.checkOut ? record.checkOut.toLocaleTimeString('ar-EG') : "لم يسجل";
      
      let hoursWorked = "0.00";
      if (record.checkIn && record.checkOut) {
        const diffMs = record.checkOut.getTime() - record.checkIn.getTime();
        const diffHrs = diffMs / (1000 * 60 * 60);
        hoursWorked = diffHrs > 0 ? diffHrs.toFixed(2) : "0.00"; 
      }

      return {
        "اسم الموظف": record.name,
        "التاريخ": record.dateObj.toLocaleDateString('ar-EG'),
        "اليوم": record.dateObj.toLocaleDateString('ar-EG', { weekday: 'long' }),
        "وقت الحضور": checkInStr,
        "وقت الانصراف": checkOutStr,
        "ساعات العمل": hoursWorked,
      };
    });

    // ترتيب السجلات في ملف الإكسيل حسب التاريخ (الأحدث أولاً)
    excelData.reverse();

    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Add attendance sheet
    const attendanceSheet = XLSX.utils.json_to_sheet(excelData);
    if (!attendanceSheet['!views']) attendanceSheet['!views'] = [];
    attendanceSheet['!views'].push({ rightToLeft: true });
    XLSX.utils.book_append_sheet(workbook, attendanceSheet, "تقرير الحضور");

    // Add advances sheet if there are any
    if (advancesData && advancesData.length > 0) {
      const advancesExcelData = advancesData.map(advance => ({
        "اسم الموظف": advance.user_name,
        "المبلغ (جنيه)": advance.amount.toFixed(2),
        "التاريخ": new Date(advance.created_at).toLocaleDateString('ar-EG'),
        "الوقت": new Date(advance.created_at).toLocaleTimeString('ar-EG'),
      }));

      // Calculate total advances
      const totalAdvances = advancesData.reduce((sum, adv) => sum + adv.amount, 0);
      advancesExcelData.push({
        "اسم الموظف": "المجموع الكلي",
        "المبلغ (جنيه)": totalAdvances.toFixed(2),
        "التاريخ": "",
        "الوقت": "",
      });

      const advancesSheet = XLSX.utils.json_to_sheet(advancesExcelData);
      if (!advancesSheet['!views']) advancesSheet['!views'] = [];
      advancesSheet['!views'].push({ rightToLeft: true });
      XLSX.utils.book_append_sheet(workbook, advancesSheet, "السلف");
    }
    
    // Generate filename based on filter
    const workerName = workerIdToDownload === "all" 
      ? "جميع_الموظفين"
      : workers.find(w => w.user_id === workerIdToDownload)?.user_name || "موظف";
    
    const fileName = `تقرير_${workerName}_${new Date().toLocaleDateString('en-CA')}.xlsx`;
    
    XLSX.writeFile(workbook, fileName);
    toast.success("تم تحميل التقرير بنجاح!");
    setShowExcelDialog(false);
    setSelectedWorkerForExcel("all");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background p-8" dir="rtl">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">لوحة تحكم الإدارة</h1>
            <p className="text-muted-foreground mt-1">إنشاء رموز QR ومتابعة سجلات الموظفين</p>
          </div>
          <div className="flex gap-4">
            <Button variant="outline" onClick={handleDownloadExcel} className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200">
              <Download className="w-4 h-4 ml-2" />
              تصدير التقرير مفصل
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="w-4 h-4 ml-2" />
              تسجيل خروج
            </Button>
          </div>
        </div>

        {/* Excel Download Dialog */}
        {showExcelDialog && (
          <Card className="p-6 mb-8 border-2 border-primary">
            <h3 className="text-lg font-semibold mb-4">اختر الموظف لتصدير التقرير</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="excel-worker-select">اختيار الموظف</Label>
                <Select 
                  value={selectedWorkerForExcel} 
                  onValueChange={setSelectedWorkerForExcel}
                >
                  <SelectTrigger id="excel-worker-select" className="mt-2">
                    <SelectValue placeholder="اختر موظفاً" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الموظفين</SelectItem>
                    {workers.map((worker) => (
                      <SelectItem key={worker.user_id} value={worker.user_id}>
                        {worker.user_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3">
                <Button onClick={downloadExcel} className="flex-1">
                  <Download className="w-4 h-4 ml-2" />
                  تحميل التقرير
                </Button>
                <Button variant="outline" onClick={() => setShowExcelDialog(false)} className="flex-1">
                  إلغاء
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 سيتم تضمين سجلات الحضور والسلف للموظف المختار
              </p>
            </div>
          </Card>
        )}

        <Tabs defaultValue="qr" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="qr" className="text-base">
              <QRCodeSVG value="qr" size={16} className="ml-2" />
              توليد رموز QR
            </TabsTrigger>
            <TabsTrigger value="advances" className="text-base">
              <Banknote className="w-4 h-4 ml-2" />
              إدارة السلف
            </TabsTrigger>
          </TabsList>

          <TabsContent value="qr">
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="p-8 flex flex-col items-center justify-center">
                <h2 className="text-xl font-semibold mb-6">رمز الـ QR الحالي</h2>
                
                <div className="flex gap-4 mb-6 w-full">
                  <Button 
                    onClick={() => generateNewToken("حضور")} 
                    variant={scanType === "حضور" ? "default" : "outline"}
                    className="w-full"
                  >
                    <LogIn className="w-4 h-4 ml-2" />
                    توليد رمز حضور
                  </Button>
                  <Button 
                    onClick={() => generateNewToken("انصراف")} 
                    variant={scanType === "انصراف" ? "destructive" : "outline"}
                    className="w-full"
                  >
                    <LogOutIcon className="w-4 h-4 ml-2" />
                    توليد رمز انصراف
                  </Button>
                </div>
                
                <div className="bg-white p-4 rounded-xl shadow-sm mb-6">
                  {qrToken ? (
                    <QRCodeSVG value={qrToken} size={250} />
                  ) : (
                    <div className="w-[250px] h-[250px] bg-muted animate-pulse rounded-lg" />
                  )}
                </div>

                <p className="text-sm text-muted-foreground font-mono mb-2 border p-2 rounded bg-muted/50 w-full text-center">
                  {qrToken}
                </p>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${scanType === "حضور" ? "bg-primary/10 text-primary" : "bg-red-100 text-red-700"}`}>
                  نوع الرمز: {scanType}
                </span>
              </Card>

              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">أحدث السجلات (مباشر)</h2>
                  <Button variant="ghost" size="icon" onClick={fetchScans} title="تحديث">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

                {/* Worker Filter Dropdown */}
                <div className="mb-4">
                  <Label htmlFor="worker-filter" className="mb-2 block">
                    <Users className="w-4 h-4 inline ml-2" />
                    تصفية حسب الموظف
                  </Label>
                  <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                    <SelectTrigger id="worker-filter">
                      <SelectValue placeholder="اختر موظفاً" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الموظفين</SelectItem>
                      {workers.length === 0 ? (
                        <SelectItem value="none" disabled>لا يوجد موظفين</SelectItem>
                      ) : (
                        workers.map((worker) => (
                          <SelectItem key={worker.user_id} value={worker.user_id}>
                            {worker.user_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {workers.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      عدد الموظفين: {workers.length}
                    </p>
                  )}
                </div>
                
                <div className="space-y-4 overflow-y-auto max-h-[400px] pr-2">
                  {filteredScans.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">لا توجد سجلات بعد...</p>
                  ) : (
                    filteredScans.map((scan) => (
                      <div key={scan.id} className="flex flex-col p-3 border rounded-lg bg-card">
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-sm font-bold ${scan.qr_data.includes("حضور") ? "text-primary" : "text-red-500"}`}>
                            {scan.qr_data.includes("حضور") ? "تسجيل حضور" : "تسجيل انصراف"}
                          </span>
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {new Date(scan.scanned_at).toLocaleTimeString('ar-EG')}
                          </span>
                        </div>
                        <span className="text-sm font-medium mt-1">
                          الموظف: {scan.user_name || scan.user_id}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="advances">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Advances Form */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-6 flex items-center">
                  <Banknote className="w-5 h-5 ml-2" />
                  إضافة سلفة جديدة
                </h2>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="worker-select">اختيار الموظف</Label>
                    <Select 
                      value={selectedWorkerForAdvance} 
                      onValueChange={setSelectedWorkerForAdvance}
                    >
                      <SelectTrigger id="worker-select" className="mt-2">
                        <SelectValue placeholder="اختر موظفاً" />
                      </SelectTrigger>
                      <SelectContent>
                        {workers.length === 0 ? (
                          <SelectItem value="none" disabled>لا يوجد موظفين</SelectItem>
                        ) : (
                          workers.map((worker) => (
                            <SelectItem key={worker.user_id} value={worker.user_id}>
                              {worker.user_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {workers.length === 0 && (
                      <p className="text-xs text-amber-600 mt-2">
                        تنبيه: لا يوجد موظفين في قاعدة البيانات. يرجى التأكد من وجود سجلات في جدول user_roles
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="advance-amount">قيمة السلفة (جنيه)</Label>
                    <Input
                      id="advance-amount"
                      type="number"
                      placeholder="أدخل المبلغ بالجنيه"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                      className="mt-2"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <Button 
                    onClick={handleSaveAdvance} 
                    className="w-full"
                    disabled={!selectedWorkerForAdvance || !advanceAmount || workers.length === 0}
                  >
                    <Banknote className="w-4 h-4 ml-2" />
                    حفظ السلفة
                  </Button>
                </div>
              </Card>

              {/* Advances History */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">سجل السلف</h2>
                  <Button variant="ghost" size="icon" onClick={fetchAdvances} title="تحديث">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-4 overflow-y-auto max-h-[400px] pr-2">
                  {advances.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">لا توجد سلف مسجلة بعد...</p>
                  ) : (
                    advances.map((advance) => (
                      <div key={advance.id} className="flex flex-col p-4 border rounded-lg bg-card">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm font-bold text-primary">
                            {advance.user_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(advance.created_at).toLocaleDateString('ar-EG')}
                          </span>
                        </div>
                        <span className="text-lg font-semibold text-green-600">
                          {advance.amount.toFixed(2)} جنيه
                        </span>
                        <span className="text-xs text-muted-foreground mt-1">
                          {new Date(advance.created_at).toLocaleTimeString('ar-EG')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
};

export default Index;