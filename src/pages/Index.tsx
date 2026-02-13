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
import { 
  LogOut, 
  RefreshCw, 
  Download, 
  LogIn, 
  LogOut as LogOutIcon, 
  Banknote, 
  Users,
  Trash2,
  Calendar,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  DollarSign
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Worker {
  user_id: string;
  user_name: string;
  email: string;
}

interface Advance {
  id: string;
  user_id: string;
  user_name: string;
  amount: number;
  created_at: string;
}

interface AttendanceStats {
  totalDays: number;
  totalHours: number;
  avgHoursPerDay: number;
  daysPresent: number;
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
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [filteredAdvances, setFilteredAdvances] = useState<Advance[]>([]);
  const [selectedAdvanceWorker, setSelectedAdvanceWorker] = useState<string>("all");

  // Excel download worker selection
  const [selectedWorkerForExcel, setSelectedWorkerForExcel] = useState<string>("all");
  const [showExcelDialog, setShowExcelDialog] = useState(false);
  
  // Date range for Excel
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Delete advance dialog
  const [advanceToDelete, setAdvanceToDelete] = useState<string | null>(null);

  // Stats
  const [workerStats, setWorkerStats] = useState<Record<string, AttendanceStats>>({});
  const [totalAdvancesByWorker, setTotalAdvancesByWorker] = useState<Record<string, number>>({});

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);

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
    
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
  }, [navigate]);

  useEffect(() => {
    // Filter scans based on selected worker
    if (selectedWorker === "all") {
      setFilteredScans(scans);
    } else {
      setFilteredScans(scans.filter(scan => scan.user_id === selectedWorker));
    }
  }, [selectedWorker, scans]);

  useEffect(() => {
    // Filter advances based on selected worker
    if (selectedAdvanceWorker === "all") {
      setFilteredAdvances(advances);
    } else {
      setFilteredAdvances(advances.filter(adv => adv.user_id === selectedAdvanceWorker));
    }
  }, [selectedAdvanceWorker, advances]);

  useEffect(() => {
    // Calculate total advances per worker
    const totals: Record<string, number> = {};
    advances.forEach(advance => {
      if (!totals[advance.user_id]) {
        totals[advance.user_id] = 0;
      }
      totals[advance.user_id] += advance.amount;
    });
    setTotalAdvancesByWorker(totals);
  }, [advances]);

  useEffect(() => {
    // Auto-refresh every 30 seconds
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchScans();
      fetchAdvances();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    calculateWorkerStats();
  }, [scans]);

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
      .limit(100);
      
    if (error) {
      console.error("Error fetching scans:", error);
      return;
    }
    if (data) setScans(data);
  };

  const fetchWorkers = async () => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "worker");

      if (error) {
        console.error("Error fetching workers from user_roles:", error);
        await fetchWorkersFromAttendance();
        return;
      }

      if (data && data.length > 0) {
        const userIds = data.map(item => item.user_id);
        
        const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
        
        if (usersError) {
          console.error("Error fetching user details:", usersError);
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

        workersList.sort((a, b) => a.user_name.localeCompare(b.user_name, 'ar'));
        setWorkers(workersList);
        console.log("Workers loaded from user_roles:", workersList.length);
      } else {
        setWorkers([]);
      }
    } catch (err) {
      console.error("Exception in fetchWorkers:", err);
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

  const calculateWorkerStats = () => {
    const stats: Record<string, AttendanceStats> = {};

    scans.forEach(scan => {
      if (!stats[scan.user_id]) {
        stats[scan.user_id] = {
          totalDays: 0,
          totalHours: 0,
          avgHoursPerDay: 0,
          daysPresent: 0
        };
      }
    });

    // Group by date
    const scansByDate: Record<string, any[]> = {};
    scans.forEach(scan => {
      const dateKey = new Date(scan.scanned_at).toLocaleDateString('en-CA');
      const groupKey = `${scan.user_id}_${dateKey}`;
      if (!scansByDate[groupKey]) {
        scansByDate[groupKey] = [];
      }
      scansByDate[groupKey].push(scan);
    });

    // Calculate hours
    Object.entries(scansByDate).forEach(([key, dayScans]) => {
      const userId = key.split('_')[0];
      const checkIns = dayScans.filter(s => s.qr_data.includes("حضور"));
      const checkOuts = dayScans.filter(s => s.qr_data.includes("انصراف"));

      if (checkIns.length > 0 && checkOuts.length > 0) {
        const firstCheckIn = new Date(checkIns[0].scanned_at);
        const lastCheckOut = new Date(checkOuts[checkOuts.length - 1].scanned_at);
        const hours = (lastCheckOut.getTime() - firstCheckIn.getTime()) / (1000 * 60 * 60);
        
        if (hours > 0) {
          stats[userId].totalHours += hours;
          stats[userId].daysPresent += 1;
        }
      }
    });

    // Calculate averages
    Object.keys(stats).forEach(userId => {
      if (stats[userId].daysPresent > 0) {
        stats[userId].avgHoursPerDay = stats[userId].totalHours / stats[userId].daysPresent;
      }
    });

    setWorkerStats(stats);
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

  const handleDeleteAdvance = async () => {
    if (!advanceToDelete) return;

    const { error } = await supabase
      .from("advances")
      .delete()
      .eq("id", advanceToDelete);

    if (error) {
      toast.error("حدث خطأ أثناء حذف السلفة");
      console.error(error);
      return;
    }

    toast.success("تم حذف السلفة بنجاح");
    setAdvanceToDelete(null);
    fetchAdvances();
  };

  const handleDownloadExcel = () => {
    setShowExcelDialog(true);
  };

  const downloadExcel = async () => {
    const workerIdToDownload = selectedWorkerForExcel;
    
    let query = supabase
      .from("attendance")
      .select("*")
      .order("scanned_at", { ascending: true });

    if (workerIdToDownload !== "all") {
      query = query.eq("user_id", workerIdToDownload);
    }

    // Apply date filter
    if (startDate) {
      query = query.gte("scanned_at", new Date(startDate).toISOString());
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59);
      query = query.lte("scanned_at", endDateTime.toISOString());
    }

    const { data, error } = await query;

    if (error || !data) {
      toast.error("حدث خطأ أثناء تحميل البيانات");
      return;
    }

    let advancesQuery = supabase
      .from("advances")
      .select("*")
      .order("created_at", { ascending: true });
    
    if (workerIdToDownload !== "all") {
      advancesQuery = advancesQuery.eq("user_id", workerIdToDownload);
    }

    if (startDate) {
      advancesQuery = advancesQuery.gte("created_at", new Date(startDate).toISOString());
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59);
      advancesQuery = advancesQuery.lte("created_at", endDateTime.toISOString());
    }

    const { data: advancesData } = await advancesQuery;

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

    excelData.reverse();

    // Calculate totals
    const totalHours = excelData.reduce((sum, row) => {
      return sum + parseFloat(row["ساعات العمل"] || "0");
    }, 0);

    // Add summary row
    excelData.push({
      "اسم الموظف": "الإجمالي",
      "التاريخ": "",
      "اليوم": "",
      "وقت الحضور": "",
      "وقت الانصراف": "",
      "ساعات العمل": totalHours.toFixed(2),
    });

    const workbook = XLSX.utils.book_new();
    
    const attendanceSheet = XLSX.utils.json_to_sheet(excelData);
    if (!attendanceSheet['!views']) attendanceSheet['!views'] = [];
    attendanceSheet['!views'].push({ rightToLeft: true });
    XLSX.utils.book_append_sheet(workbook, attendanceSheet, "تقرير الحضور");

    if (advancesData && advancesData.length > 0) {
      const advancesExcelData = advancesData.map(advance => ({
        "اسم الموظف": advance.user_name,
        "المبلغ (جنيه)": advance.amount.toFixed(2),
        "التاريخ": new Date(advance.created_at).toLocaleDateString('ar-EG'),
        "الوقت": new Date(advance.created_at).toLocaleTimeString('ar-EG'),
      }));

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

    // Add summary sheet
    const summaryData = [];
    if (workerIdToDownload === "all") {
      workers.forEach(worker => {
        const workerHours = workerStats[worker.user_id]?.totalHours || 0;
        const workerDays = workerStats[worker.user_id]?.daysPresent || 0;
        const workerAvg = workerStats[worker.user_id]?.avgHoursPerDay || 0;
        const workerAdvances = totalAdvancesByWorker[worker.user_id] || 0;

        summaryData.push({
          "الموظف": worker.user_name,
          "إجمالي الساعات": workerHours.toFixed(2),
          "عدد الأيام": workerDays,
          "متوسط الساعات/يوم": workerAvg.toFixed(2),
          "إجمالي السلف (جنيه)": workerAdvances.toFixed(2),
        });
      });
    } else {
      const worker = workers.find(w => w.user_id === workerIdToDownload);
      if (worker) {
        summaryData.push({
          "الموظف": worker.user_name,
          "إجمالي الساعات": (workerStats[worker.user_id]?.totalHours || 0).toFixed(2),
          "عدد الأيام": workerStats[worker.user_id]?.daysPresent || 0,
          "متوسط الساعات/يوم": (workerStats[worker.user_id]?.avgHoursPerDay || 0).toFixed(2),
          "إجمالي السلف (جنيه)": (totalAdvancesByWorker[worker.user_id] || 0).toFixed(2),
        });
      }
    }

    if (summaryData.length > 0) {
      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      if (!summarySheet['!views']) summarySheet['!views'] = [];
      summarySheet['!views'].push({ rightToLeft: true });
      XLSX.utils.book_append_sheet(workbook, summarySheet, "الملخص");
    }
    
    const workerName = workerIdToDownload === "all" 
      ? "جميع_الموظفين"
      : workers.find(w => w.user_id === workerIdToDownload)?.user_name || "موظف";
    
    const dateRange = startDate && endDate 
      ? `_${startDate}_الى_${endDate}`
      : `_${new Date().toLocaleDateString('en-CA')}`;
    
    const fileName = `تقرير_${workerName}${dateRange}.xlsx`;
    
    XLSX.writeFile(workbook, fileName);
    toast.success("تم تحميل التقرير بنجاح!");
    setShowExcelDialog(false);
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
            <Button 
              variant={autoRefresh ? "default" : "outline"} 
              size="icon"
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh ? "إيقاف التحديث التلقائي" : "تفعيل التحديث التلقائي"}
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            </Button>
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">عدد الموظفين</p>
                <p className="text-2xl font-bold">{workers.length}</p>
              </div>
              <Users className="w-8 h-8 text-primary" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">سجلات اليوم</p>
                <p className="text-2xl font-bold">
                  {scans.filter(s => {
                    const today = new Date().toLocaleDateString('en-CA');
                    return new Date(s.scanned_at).toLocaleDateString('en-CA') === today;
                  }).length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-blue-500" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي السلف</p>
                <p className="text-2xl font-bold">
                  {advances.reduce((sum, adv) => sum + adv.amount, 0).toFixed(0)} جنيه
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">آخر تحديث</p>
                <p className="text-sm font-medium">
                  {new Date().toLocaleTimeString('ar-EG')}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-500" />
            </div>
          </Card>
        </div>

        {/* Excel Download Dialog */}
        {showExcelDialog && (
          <Card className="p-6 mb-8 border-2 border-primary">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <FileSpreadsheet className="w-5 h-5 ml-2" />
              إعدادات تصدير التقرير
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div>
                  <Label htmlFor="start-date">من تاريخ</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">إلى تاريخ</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-2"
                  />
                </div>
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
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>💡 سيتضمن التقرير 3 أوراق:</strong>
                </p>
                <ul className="text-xs text-blue-700 mt-2 mr-4 space-y-1">
                  <li>• تقرير الحضور والانصراف مع إجمالي الساعات</li>
                  <li>• سجل السلف مع المجموع الكلي</li>
                  <li>• ملخص إحصائي شامل</li>
                </ul>
              </div>
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
                  <h2 className="text-xl font-semibold">أحدث السجلات</h2>
                  <Button variant="ghost" size="icon" onClick={fetchScans} title="تحديث">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

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
                      <SelectItem value="all">جميع الموظفين ({scans.length})</SelectItem>
                      {workers.map((worker) => {
                        const workerScansCount = scans.filter(s => s.user_id === worker.user_id).length;
                        return (
                          <SelectItem key={worker.user_id} value={worker.user_id}>
                            {worker.user_name} ({workerScansCount})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-4 overflow-y-auto max-h-[400px] pr-2">
                  {filteredScans.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">لا توجد سجلات بعد...</p>
                  ) : (
                    filteredScans.map((scan) => (
                      <div key={scan.id} className="flex flex-col p-3 border rounded-lg bg-card hover:bg-accent transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-sm font-bold ${scan.qr_data.includes("حضور") ? "text-primary" : "text-red-500"}`}>
                            {scan.qr_data.includes("حضور") ? "✓ تسجيل حضور" : "✗ تسجيل انصراف"}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            <div dir="ltr">{new Date(scan.scanned_at).toLocaleTimeString('ar-EG')}</div>
                            <div className="text-right">{new Date(scan.scanned_at).toLocaleDateString('ar-EG')}</div>
                          </div>
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
                          workers.map((worker) => {
                            const totalAdvances = totalAdvancesByWorker[worker.user_id] || 0;
                            return (
                              <SelectItem key={worker.user_id} value={worker.user_id}>
                                {worker.user_name} {totalAdvances > 0 ? `(${totalAdvances.toFixed(0)} جنيه)` : ''}
                              </SelectItem>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>
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

              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">سجل السلف</h2>
                  <Button variant="ghost" size="icon" onClick={fetchAdvances} title="تحديث">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

                <div className="mb-4">
                  <Select value={selectedAdvanceWorker} onValueChange={setSelectedAdvanceWorker}>
                    <SelectTrigger>
                      <SelectValue placeholder="تصفية حسب الموظف" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الموظفين ({advances.length})</SelectItem>
                      {workers.map((worker) => {
                        const workerAdvances = advances.filter(a => a.user_id === worker.user_id);
                        return workerAdvances.length > 0 ? (
                          <SelectItem key={worker.user_id} value={worker.user_id}>
                            {worker.user_name} ({workerAdvances.length})
                          </SelectItem>
                        ) : null;
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 overflow-y-auto max-h-[400px] pr-2">
                  {filteredAdvances.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">لا توجد سلف مسجلة بعد...</p>
                  ) : (
                    <>
                      {filteredAdvances.map((advance) => (
                        <div key={advance.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent transition-colors group">
                          <div className="flex-1">
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
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(advance.created_at).toLocaleTimeString('ar-EG')}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setAdvanceToDelete(advance.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      {filteredAdvances.length > 0 && (
                        <div className="p-4 border-2 border-primary rounded-lg bg-primary/5">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">المجموع الكلي:</span>
                            <span className="text-xl font-bold text-primary">
                              {filteredAdvances.reduce((sum, adv) => sum + adv.amount, 0).toFixed(2)} جنيه
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

      </div>

      {/* Delete Advance Dialog */}
      <AlertDialog open={!!advanceToDelete} onOpenChange={() => setAdvanceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف السلفة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذه السلفة؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAdvance} className="bg-red-500 hover:bg-red-600">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;