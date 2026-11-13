'use client';
import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  Users, Clock, DollarSign, Download, Calendar, Save, X, Upload, Settings, Cpu,
  ChevronRight, ChevronLeft, UserPlus, Pencil, Search, Eye, Printer, Trash2, RotateCcw
} from 'lucide-react';
import { supabase } from '@/supabaseClient';

interface Employee {
  id: number;
  machineId: string;
  name: string;
  designation: string;
  dept: string;
  mobile: string;
  salaryType: 'Monthly' | 'Weekly';
  salary: string;
  status: 'Active' | 'Resigned';
}

interface DailyPunch {
  inTime: string;
  outTime: string;
  status: 'P' | 'A' | 'H' | 'L';
  overtimeHours: number;
  totalHours: number;
  shift: string;
  lateMinutes: number;
  note?: string;
}

interface MonthlyData {
  attendance: { [machineId: string]: { [date: string]: DailyPunch } };
  paidStatus: { [machineId: string]: boolean };
}

const hasCompletePunches = (punch: Pick<DailyPunch, 'inTime' | 'outTime'>) =>
  punch.inTime !== '--:--' && punch.outTime !== '--:--' && punch.inTime !== punch.outTime;

const loadEmployees = async (): Promise<Employee[] | null> => {
  if (!supabase) return null;

  const { data, error } = await supabase.from('employees').select('*');
  if (error) {
    console.error('Error loading employees:', error.message);
    return null;
  }

  return (data as Array<Record<string, unknown>>).map((employee) => ({
    id: Number(employee.id),
    machineId: String(employee.machine_id ?? '').trim(),
    name: String(employee.name ?? ''),
    designation: String(employee.designation ?? ''),
    dept: String(employee.dept ?? 'Production'),
    mobile: String(employee.mobile ?? ''),
    salaryType: employee.salary_type === 'Weekly' ? 'Weekly' : 'Monthly',
    salary: String(employee.salary ?? '0'),
    status: employee.status === 'Resigned' ? 'Resigned' : 'Active'
  }));
};

const SHIFT_SETTINGS_KEY = 'salary-system-shift-settings';
const ATTENDANCE_STORAGE_KEY = 'salary-system-monthly-records';
const STANDARD_WORK_HOURS = 8;
const EMPLOYEES_PER_PAGE = 25;

function BiometricSyncButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSync = async () => {
    setLoading(true);
    setMessage('بائیومیٹرک مشین سے ڈیٹا سنک ہو رہا ہے...');

    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      const data = await response.json() as { success?: boolean; message?: string; error?: string };

      if (response.ok && data.success) {
        setMessage(data.message || 'ڈیٹا کامیابی سے سنک ہو گیا۔');
      } else {
        setMessage(`ایرر: ${data.error || 'ڈیٹا سنک نہیں ہو سکا۔'}`);
      }
    } catch {
      setMessage('سرور سے رابطہ کرنے میں خرابی پیش آئی۔');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-4 flex flex-col items-start gap-3 rounded-lg border border-slate-700 bg-slate-800/60 p-4 shadow">
      <h3 className="font-bold text-white">بائیومیٹرک اٹینڈنس سنک</h3>
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-600"
      >
        {loading ? 'سنکنگ جاری ہے...' : '🔄 Sync Now (مشین سے ڈیٹا لیں)'}
      </button>
      {message && <p role="status" className="text-sm font-medium text-slate-300">{message}</p>}
    </div>
  );
}

export default function SalarySystem() {
  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'payroll'>('attendance');
  const [payrollPaymentFilter, setPayrollPaymentFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [shiftStartTime, setShiftStartTime] = useState<string>('08:00');
  const [shiftEndTime, setShiftEndTime] = useState<string>('17:00');
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState<number>(15);
  const [shiftSettingsSaved, setShiftSettingsSaved] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [employeePage, setEmployeePage] = useState(1);
  const [attendancePage, setAttendancePage] = useState(1);
  const [payrollPage, setPayrollPage] = useState(1);
  const [printingSelectedEmployees, setPrintingSelectedEmployees] = useState(false);

  // Initialize with completely empty records so unuploaded months show no fake data
  const [monthlyRecords, setMonthlyRecords] = useState<{ [monthKey: string]: MonthlyData }>({});
  const [monthlyRecordsLoaded, setMonthlyRecordsLoaded] = useState(false);

  const [selectedEmpForEdit, setSelectedEmpForEdit] = useState<Employee | null>(null);
  const [selectedEmpForView, setSelectedEmpForView] = useState<Employee | null>(null);
  const [selectedEmpForPayroll, setSelectedEmpForPayroll] = useState<Employee | null>(null);
  const [tempEmpAttendance, setTempEmpAttendance] = useState<{ [date: string]: DailyPunch }>({});
  const [totalWorkingDays] = useState<number>(30);
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [allLogsPreview, setAllLogsPreview] = useState<Array<{machineId: string, timestamp: string, inTime: string, outTime: string}>>([]);

  const [newEmployee, setNewEmployee] = useState({
    machineId: '',
    name: '',
    designation: '',
    dept: 'Production',
    mobile: '',
    salaryType: 'Monthly' as Employee['salaryType'],
    salary: '',
    status: 'Active' as Employee['status']
  });

  const fetchEmployees = async () => {
    setLoading(true);
    const formatted = await loadEmployees();
    if (formatted) setEmployees(formatted);
    setLoading(false);
  };

  useEffect(() => {
    let isActive = true;
    const loadInitialEmployees = async () => {
      const formatted = await loadEmployees();
      if (isActive && formatted) setEmployees(formatted);
    };

    void loadInitialEmployees();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!printingSelectedEmployees) return;

    const root = document.documentElement;
    const clearSelectedPrint = () => {
      delete root.dataset.printSelectedOnly;
      setPrintingSelectedEmployees(false);
    };

    root.dataset.printSelectedOnly = 'true';
    window.addEventListener('afterprint', clearSelectedPrint, { once: true });
    window.print();

    return () => {
      window.removeEventListener('afterprint', clearSelectedPrint);
      delete root.dataset.printSelectedOnly;
    };
  }, [printingSelectedEmployees]);

  useEffect(() => {
    let isActive = true;
    const loadMonthlyRecords = async () => {
      const storedRecords = await Promise.resolve(window.localStorage.getItem(ATTENDANCE_STORAGE_KEY));
      if (!isActive) return;

      if (storedRecords) {
        try {
          const records: unknown = JSON.parse(storedRecords);
          if (records && typeof records === 'object' && !Array.isArray(records)) {
            setMonthlyRecords(records as { [monthKey: string]: MonthlyData });
          }
        } catch (error) {
          console.error('Unable to load saved attendance:', error);
        }
      }

      setMonthlyRecordsLoaded(true);
    };

    void loadMonthlyRecords();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!monthlyRecordsLoaded) return;

    try {
      window.localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(monthlyRecords));
    } catch (error) {
      console.error('Unable to save attendance:', error);
    }
  }, [monthlyRecords, monthlyRecordsLoaded]);

  useEffect(() => {
    let isActive = true;
    const loadShiftSettings = async () => {
      const storedSettings = await Promise.resolve(window.localStorage.getItem(SHIFT_SETTINGS_KEY));
      if (!isActive || !storedSettings) return;

      try {
        const settings = JSON.parse(storedSettings) as Record<string, unknown>;
        if (typeof settings.shiftStartTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.shiftStartTime)) {
          setShiftStartTime(settings.shiftStartTime);
        }
        if (typeof settings.shiftEndTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.shiftEndTime)) {
          setShiftEndTime(settings.shiftEndTime);
        }
        if (typeof settings.gracePeriodMinutes === 'number' && Number.isFinite(settings.gracePeriodMinutes) && settings.gracePeriodMinutes >= 0) {
          setGracePeriodMinutes(settings.gracePeriodMinutes);
        }
        setShiftSettingsSaved(true);
      } catch (error) {
        console.error('Unable to load saved shift settings:', error);
      }
    };

    void loadShiftSettings();
    return () => {
      isActive = false;
    };
  }, []);

  const saveShiftSettings = () => {
    try {
      window.localStorage.setItem(SHIFT_SETTINGS_KEY, JSON.stringify({
        shiftStartTime,
        shiftEndTime,
        gracePeriodMinutes
      }));
      setShiftSettingsSaved(true);
    } catch (error) {
      console.error('Unable to save shift settings:', error);
      alert('Unable to save shift settings in this browser.');
    }
  };

  const resetEmployeeForm = () => {
    setEditingEmployeeId(null);
    setNewEmployee({
      machineId: '',
      name: '',
      designation: '',
      dept: 'Production',
      mobile: '',
      salaryType: 'Monthly',
      salary: '',
      status: 'Active'
    });
  };

  const saveEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) return;

    const machineId = newEmployee.machineId.trim();
    const name = newEmployee.name.trim();
    const salary = newEmployee.salary.trim();

    if (!machineId || !name || !salary) {
      alert('Machine Code, Name and Salary are required.');
      return;
    }

    const payload = {
      machine_id: machineId,
      name,
      designation: newEmployee.designation.trim(),
      dept: newEmployee.dept.trim() || 'Production',
      mobile: newEmployee.mobile.trim(),
      salary_type: newEmployee.salaryType,
      salary,
      status: newEmployee.status
    };

    if (editingEmployeeId !== null) {
      const { error } = await supabase.from('employees').update(payload).eq('id', editingEmployeeId);
      if (error) {
        alert('Error updating employee: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('employees').insert([payload]);
      if (error) {
        alert('Error saving employee: ' + error.message);
        return;
      }
    }

    await fetchEmployees();
    resetEmployeeForm();
    alert('Employee saved successfully!');
  };

  const editEmployee = (employee: Employee) => {
    setEditingEmployeeId(employee.id);
    setNewEmployee({
      machineId: employee.machineId,
      name: employee.name,
      designation: employee.designation,
      dept: employee.dept,
      mobile: employee.mobile,
      salaryType: employee.salaryType,
      salary: employee.salary,
      status: employee.status
    });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedEmployeeIds(employees.map(emp => emp.id));
    } else {
      setSelectedEmployeeIds([]);
    }
  };

  const handleSelectRow = (id: number) => {
    if (selectedEmployeeIds.includes(id)) {
      setSelectedEmployeeIds(selectedEmployeeIds.filter(item => item !== id));
    } else {
      setSelectedEmployeeIds([...selectedEmployeeIds, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedEmployeeIds.length === 0) return;
    if (!confirm(`Kya aap waqai ${selectedEmployeeIds.length} employees ko delete karna chahte hain?`)) return;
    if (!supabase) return;

    const { error } = await supabase.from('employees').delete().in('id', selectedEmployeeIds);
    if (error) {
      alert('Error deleting employees: ' + error.message);
    } else {
      alert('Selected employees successfully delete ho gaye hain!');
      setSelectedEmployeeIds([]);
      await fetchEmployees();
    }
  };

  const calculateLateMinutes = (inTime24: string) => {
    if (!inTime24 || inTime24 === '--:--') return 0;
    const [inH, inM] = inTime24.split(':').map(Number);
    const inTotalMins = inH * 60 + inM;

    const [startH, startM] = shiftStartTime.split(':').map(Number);
    const expectedMins = startH * 60 + startM;

    if (inTotalMins > expectedMins + gracePeriodMinutes) {
      return inTotalMins - expectedMins - gracePeriodMinutes;
    }
    return 0;
  };

  const calculateWorkedHours = (inTime: string, outTime: string) => {
    if (!hasCompletePunches({ inTime, outTime })) return 0;

    const [inHour, inMinute] = inTime.split(':').map(Number);
    const [outHour, outMinute] = outTime.split(':').map(Number);
    const [startHour, startMinute] = shiftStartTime.split(':').map(Number);
    const [endHour, endMinute] = shiftEndTime.split(':').map(Number);
    const inMinutes = inHour * 60 + inMinute;
    const outMinutes = outHour * 60 + outMinute;
    const startMinutes = startHour * 60 + startMinute;
    let elapsedMinutes = outMinutes - inMinutes;
    let scheduledMinutes = endHour * 60 + endMinute - startMinutes;

    if (elapsedMinutes < 0) elapsedMinutes += 24 * 60;
    if (scheduledMinutes <= 0) scheduledMinutes += 24 * 60;

    const unpaidBreakMinutes = Math.max(0, scheduledMinutes - STANDARD_WORK_HOURS * 60);
    return Math.max(0, Number(((elapsedMinutes - unpaidBreakMinutes) / 60).toFixed(2)));
  };

  const getGraceCreditHours = (inTime: string) => {
    if (!inTime || inTime === '--:--') return 0;
    const [inHour, inMinute] = inTime.split(':').map(Number);
    const [startHour, startMinute] = shiftStartTime.split(':').map(Number);
    const lateMinutes = Math.max(0, inHour * 60 + inMinute - (startHour * 60 + startMinute));
    return Math.min(lateMinutes, gracePeriodMinutes) / 60;
  };

  const handleRawBiometricUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      const punchLogs: { [machineId: string]: { [date: string]: string[] } } = {};
      const parsedPreview: Array<{machineId: string, timestamp: string, inTime: string, outTime: string}> = [];
      
      const affectedMonths = new Set<string>();

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const mId = String(parts[0]).trim();
          let dateStr = '';
          let timeStr = '00:00:00';

          if (parts[1].includes('-') || parts[1].includes('/')) {
            dateStr = parts[1].replace(/\//g, '-');
            timeStr = parts[2] || '00:00:00';
          } else if (parts.length >= 3) {
            dateStr = parts[1];
            timeStr = parts[2];
          }

          if (dateStr && mId) {
            const monthKey = dateStr.substring(0, 7);
            affectedMonths.add(monthKey);

            if (!punchLogs[mId]) punchLogs[mId] = {};
            if (!punchLogs[mId][dateStr]) punchLogs[mId][dateStr] = [];
            punchLogs[mId][dateStr].push(timeStr);
          }
        }
      });

      const updatedMonthlyRecords = { ...monthlyRecords };

      affectedMonths.forEach(mKey => {
        if (!updatedMonthlyRecords[mKey]) {
          updatedMonthlyRecords[mKey] = { attendance: {}, paidStatus: {} };
        }
        const currentAtt = { ...updatedMonthlyRecords[mKey].attendance };

        Object.keys(punchLogs).forEach((mId) => {
          if (!currentAtt[mId]) currentAtt[mId] = {};

          Object.keys(punchLogs[mId]).forEach((dateStr) => {
            if (!dateStr.startsWith(mKey)) return;

            const times = punchLogs[mId][dateStr].sort();
            const rawIn = times[0];
            const lastPunch = times[times.length - 1];
            const rawOut = times.length > 1 && lastPunch !== rawIn ? lastPunch : '';

            const totalHours = calculateWorkedHours(rawIn, rawOut);

            const otHours = totalHours > STANDARD_WORK_HOURS
              ? parseFloat((totalHours - STANDARD_WORK_HOURS).toFixed(1))
              : 0;
            const lateMins = calculateLateMinutes(rawIn);

            const existingRecord = currentAtt[mId]?.[dateStr];
            const status = existingRecord?.status === 'L' || existingRecord?.status === 'H'
              ? existingRecord.status
              : rawIn && rawOut ? 'P' : 'A';

            currentAtt[mId][dateStr] = {
              inTime: rawIn ? rawIn.substring(0, 5) : '--:--',
              outTime: rawOut ? rawOut.substring(0, 5) : '--:--',
              status,
              overtimeHours: otHours,
              totalHours,
              shift: 'Morning',
              lateMinutes: lateMins,
              note: existingRecord?.note || (lateMins > 0 ? `Late ${lateMins}m` : '')
            };

            parsedPreview.push({
              machineId: mId,
              timestamp: dateStr,
              inTime: rawIn ? rawIn.substring(0, 5) : '--:--',
              outTime: rawOut ? rawOut.substring(0, 5) : '--:--'
            });
          });
        });

        updatedMonthlyRecords[mKey].attendance = currentAtt;
      });

      setMonthlyRecords(updatedMonthlyRecords);
      setAllLogsPreview(parsedPreview);

      const firstMonth = Array.from(affectedMonths)[0];
      if (firstMonth) {
        setSelectedMonth(firstMonth);
      }

      alert(`Biometric Machine Logs Processed Successfully for month(s): ${Array.from(affectedMonths).join(', ')}!`);
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExcelEmployeeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = evt.target?.result;
      if (!data) return;

      const workbook = XLSX.read(data, { type: 'binary' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet);

      const importedEmployeesPayload = jsonData.map((row, index) => ({
        machine_id: String(row['Code'] || row['code'] || row['Machine ID'] || row['ID'] || '').trim() || `${1000 + index}`,
        name: String(row['Employee Name'] || row['Name'] || '').trim() || 'Unnamed',
        designation: String(row['Designation'] || '').trim(),
        dept: String(row['Department'] || 'Production').trim(),
        mobile: String(row['Mobile'] || '').trim(),
        salary_type: String(row['Type'] || 'Monthly').toLowerCase().includes('week') ? 'Weekly' : 'Monthly',
        salary: String(row['Salary'] || '0').trim(),
        status: String(row['Status'] || 'Active').toLowerCase().includes('resign') ? 'Resigned' : 'Active'
      }));

      if (importedEmployeesPayload.length > 0 && supabase) {
        const { error } = await supabase.from('employees').insert(importedEmployeesPayload);
        if (error) {
          alert('Error importing Excel: ' + error.message);
        } else {
          alert('Employees Imported Successfully!');
          await fetchEmployees();
        }
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const openEmpCalendar = (emp: Employee) => {
    setSelectedEmpForEdit(emp);
    const monthData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };
    const empAtt = monthData.attendance?.[emp.machineId] || {};
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const fullMonthDates: { [date: string]: DailyPunch } = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      const existing = empAtt[dateKey];

      if (existing) {
        const hasBothPunches = hasCompletePunches(existing);
        fullMonthDates[dateKey] = {
          ...existing,
          status: existing.status === 'L' || existing.status === 'H'
            ? existing.status
            : hasBothPunches ? 'P' : 'A'
        };
      } else {
        fullMonthDates[dateKey] = {
          inTime: '--:--',
          outTime: '--:--',
          status: 'A',
          overtimeHours: 0,
          totalHours: 0,
          shift: 'Morning',
          lateMinutes: 0,
          note: ''
        };
      }
    }

    setTempEmpAttendance(fullMonthDates);
  };

  const getEmployeeAttendanceRecords = (emp: Employee) =>
    Object.entries(monthlyRecords[selectedMonth]?.attendance?.[emp.machineId] || {})
      .map(([date, punch]) => {
        const totalHours = calculateWorkedHours(punch.inTime, punch.outTime);
        const overtimeHours = Math.max(0, Number((totalHours - STANDARD_WORK_HOURS).toFixed(1)));
        return [date, { ...punch, totalHours, overtimeHours }] as [string, DailyPunch];
      })
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate));

  const printEmployeeAttendance = (emp: Employee) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Allow pop-ups to print attendance reports.');
      return;
    }

    const printDocument = printWindow.document;
    printDocument.title = `Attendance_${emp.machineId}_${selectedMonth}`;

    const style = printDocument.createElement('style');
    style.textContent = `
      @page { size: A4 portrait; margin: 12mm; }
      body { color: #111; font: 12px Arial, sans-serif; }
      h1 { font-size: 20px; margin: 0 0 6px; }
      p { color: #444; margin: 0 0 16px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #999; padding: 6px; text-align: left; }
      th { background: #eee; }
    `;

    const heading = printDocument.createElement('h1');
    heading.textContent = `Attendance Report: ${emp.name}`;
    const subtitle = printDocument.createElement('p');
    subtitle.textContent = `Machine Code: ${emp.machineId} | Department: ${emp.dept} | Month: ${selectedMonth}`;
    const table = printDocument.createElement('table');
    const tableHead = printDocument.createElement('thead');
    const headerRow = printDocument.createElement('tr');
    ['Date', 'Status', 'In Time', 'Out Time', 'Hours', 'Overtime', 'Late Minutes'].forEach((label) => {
      const cell = printDocument.createElement('th');
      cell.textContent = label;
      headerRow.appendChild(cell);
    });
    tableHead.appendChild(headerRow);
    table.appendChild(tableHead);

    const tableBody = printDocument.createElement('tbody');
    const records = getEmployeeAttendanceRecords(emp);
    records.forEach(([date, punch]) => {
      const row = printDocument.createElement('tr');
      [date, punch.status, punch.inTime, punch.outTime, String(punch.totalHours), String(punch.overtimeHours), String(punch.lateMinutes)].forEach((value) => {
        const cell = printDocument.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      tableBody.appendChild(row);
    });

    if (records.length === 0) {
      const row = printDocument.createElement('tr');
      const cell = printDocument.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'No attendance records for this month.';
      row.appendChild(cell);
      tableBody.appendChild(row);
    }

    table.appendChild(tableBody);
    printDocument.head.replaceChildren(style);
    printDocument.body.replaceChildren(heading, subtitle, table);
    printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
    printWindow.focus();
    printWindow.print();
  };

  const handleBlankFill = () => {
    const updated = { ...tempEmpAttendance };
    Object.keys(updated).forEach(dateKey => {
      const punch = updated[dateKey];
      if (!punch.inTime || punch.inTime === '--:--') punch.inTime = shiftStartTime;
      if (!punch.outTime || punch.outTime === '--:--') punch.outTime = shiftEndTime;
      if (!punch.status || punch.status === 'A') punch.status = 'P';
      punch.totalHours = calculateWorkedHours(punch.inTime, punch.outTime);
      punch.overtimeHours = Math.max(0, Number((punch.totalHours - STANDARD_WORK_HOURS).toFixed(1)));
      punch.lateMinutes = calculateLateMinutes(punch.inTime);
    });
    setTempEmpAttendance(updated);
  };

  const updatePunchTime = (dateKey: string, field: 'inTime' | 'outTime', value: string) => {
    const punch = tempEmpAttendance[dateKey];
    const updatedPunch: DailyPunch = { ...punch, [field]: value || '--:--' };
    const totalHours = calculateWorkedHours(updatedPunch.inTime, updatedPunch.outTime);
    const hasBothPunches = hasCompletePunches(updatedPunch);
    const status = updatedPunch.status === 'L' || updatedPunch.status === 'H'
      ? updatedPunch.status
      : hasBothPunches ? 'P' : 'A';

    setTempEmpAttendance({
      ...tempEmpAttendance,
      [dateKey]: {
        ...updatedPunch,
        status,
        totalHours,
        overtimeHours: totalHours > STANDARD_WORK_HOURS
          ? parseFloat((totalHours - STANDARD_WORK_HOURS).toFixed(1))
          : 0,
        lateMinutes: calculateLateMinutes(updatedPunch.inTime)
      }
    });
  };

  const saveEmpAttendance = () => {
    if (!selectedEmpForEdit) return;
    const currentData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };
    setMonthlyRecords({
      ...monthlyRecords,
      [selectedMonth]: {
        ...currentData,
        attendance: {
          ...currentData.attendance,
          [selectedEmpForEdit.machineId]: tempEmpAttendance
        }
      }
    });
    setSelectedEmpForEdit(null);
  };

  const clearAllEmpAttendance = () => {
    if (!selectedEmpForEdit) return;
    if (!confirm(`Clear all attendance for ${selectedEmpForEdit.name} in ${selectedMonth}? Save Changes to apply.`)) return;

    const clearedAttendance = Object.fromEntries(
      Object.keys(tempEmpAttendance).map((dateKey) => [dateKey, {
        ...tempEmpAttendance[dateKey],
        inTime: '--:--',
        outTime: '--:--',
        status: 'A' as const,
        overtimeHours: 0,
        totalHours: 0,
        lateMinutes: 0,
        note: ''
      }])
    );
    setTempEmpAttendance(clearedAttendance);
  };

  const togglePaidStatus = (machineId: string) => {
    const currentData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };
    const currentStatus = currentData.paidStatus?.[machineId] || false;
    setMonthlyRecords({
      ...monthlyRecords,
      [selectedMonth]: {
        ...currentData,
        paidStatus: { ...currentData.paidStatus, [machineId]: !currentStatus }
      }
    });
  };

  const reversePayrollPayment = (machineId: string, employeeName: string) => {
    if (!confirm(`Reverse the paid status for ${employeeName} in ${selectedMonth}? The employee will return to Unpaid.`)) return;

    const currentData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };
    setMonthlyRecords({
      ...monthlyRecords,
      [selectedMonth]: {
        ...currentData,
        paidStatus: { ...currentData.paidStatus, [machineId]: false }
      }
    });
    setPayrollPaymentFilter('unpaid');
  };

  const getFilteredEmployees = () => {
    if (!searchTerm.trim()) return employees;
    const term = searchTerm.toLowerCase();
    return employees.filter(e => e.machineId.toLowerCase().includes(term) || e.name.toLowerCase().includes(term));
  };

  const printSelectedEmployees = () => setPrintingSelectedEmployees(true);

  const calculateEmployeePayroll = (emp: Employee) => {
    const monthData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };
    const empAtt = monthData.attendance?.[emp.machineId] || {};
    const attendance = Object.values(empAtt);
    const presentDays = attendance.filter(record => record.status === 'P').length;
    const leaveDays = attendance.filter(record => record.status === 'L').length;
    const holidayDays = attendance.filter(record => record.status === 'H').length;
    const totalOT = attendance.reduce((sum, record) => {
      const hoursWorked = calculateWorkedHours(record.inTime, record.outTime);
      return sum + Math.max(0, hoursWorked - STANDARD_WORK_HOURS);
    }, 0);
    const workedHours = attendance.reduce((sum, record) =>
      sum + (record.status === 'P' ? calculateWorkedHours(record.inTime, record.outTime) : 0), 0);

    const lateMinutesByRecord = attendance.map(record => calculateLateMinutes(record.inTime));
    const totalLateCount = lateMinutesByRecord.filter(minutes => minutes > 0).length;
    const totalLateMinutes = lateMinutesByRecord.reduce((sum, minutes) => sum + minutes, 0);

    const workingDays = emp.salaryType === 'Weekly' ? 6 : totalWorkingDays;
    const paidDaysCount = presentDays + leaveDays + holidayDays;
    const absentDays = Math.max(0, workingDays - paidDaysCount);
    const basic = parseFloat(emp.salary) || 0;
    const shortHours = attendance.reduce((sum, record) => {
      if (record.status !== 'P') return sum;
      const hoursWorked = calculateWorkedHours(record.inTime, record.outTime);
      return sum + Math.max(0, STANDARD_WORK_HOURS - hoursWorked - getGraceCreditHours(record.inTime));
    }, 0);
    const deductionHours = Math.min(
      workingDays * STANDARD_WORK_HOURS,
      absentDays * STANDARD_WORK_HOURS + shortHours
    );
    const hourlyRate = basic / (workingDays * STANDARD_WORK_HOURS);
    const deduction = hourlyRate * deductionHours;
    const overtimePay = totalOT * 200;
    const netSalary = Math.max(0, basic - deduction + overtimePay);

    return {
      machineId: emp.machineId,
      name: emp.name,
      dept: emp.dept,
      designation: emp.designation,
      basicSalary: basic,
      workingDays,
      totalPresentDays: presentDays,
      totalLeaves: leaveDays,
      totalHolidays: holidayDays,
      totalAbsentDays: absentDays,
      workedHours,
      shortHours,
      deductionHours,
      hourlyRate,
      totalLateCount,
      totalLateMinutes,
      overtimeHours: totalOT,
      overtimePay,
      deduction,
      netSalary,
      isPaid: monthData.paidStatus?.[emp.machineId] || false
    };
  };

  const getPayrollSummary = () =>
    getFilteredEmployees()
      .filter(employee => employee.status === 'Active')
      .map(calculateEmployeePayroll);

  const openPayrollCalculation = (emp: Employee) => {
    setSelectedEmpForPayroll(emp);
  };

  const openPayrollCalculationByMachineId = (machineId: string) => {
    const employee = employees.find(item => item.machineId === machineId);
    if (employee) openPayrollCalculation(employee);
  };

  const selectedPayrollCalculation = selectedEmpForPayroll
    ? calculateEmployeePayroll(selectedEmpForPayroll)
    : null;

  const payrollSummary = getPayrollSummary();
  const visiblePayrollSummary = payrollSummary.filter(item =>
    payrollPaymentFilter === 'all' || (payrollPaymentFilter === 'paid' ? item.isPaid : !item.isPaid)
  );
  const payrollTotals = visiblePayrollSummary.reduce((totals, item) => ({
    basicSalary: totals.basicSalary + item.basicSalary,
    deduction: totals.deduction + item.deduction,
    netSalary: totals.netSalary + item.netSalary
  }), { basicSalary: 0, deduction: 0, netSalary: 0 });
  const attendanceEmployees = getFilteredEmployees().filter(employee => employee.status === 'Active');
  const attendancePageCount = Math.max(1, Math.ceil(attendanceEmployees.length / EMPLOYEES_PER_PAGE));
  const currentAttendancePage = Math.min(attendancePage, attendancePageCount);
  const attendancePageStart = (currentAttendancePage - 1) * EMPLOYEES_PER_PAGE;
  const paginatedAttendanceEmployees = attendanceEmployees.slice(attendancePageStart, attendancePageStart + EMPLOYEES_PER_PAGE);
  const payrollPageCount = Math.max(1, Math.ceil(visiblePayrollSummary.length / EMPLOYEES_PER_PAGE));
  const currentPayrollPage = Math.min(payrollPage, payrollPageCount);
  const payrollPageStart = (currentPayrollPage - 1) * EMPLOYEES_PER_PAGE;
  const paginatedPayrollSummary = visiblePayrollSummary.slice(payrollPageStart, payrollPageStart + EMPLOYEES_PER_PAGE);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Payroll & Attendance Report - ${selectedMonth}`, 14, 15);

    const summary = getPayrollSummary();
    const tableRows = summary.map((item) => [
      item.machineId,
      item.name,
      `Rs. ${item.basicSalary.toLocaleString()}`,
      `${item.totalPresentDays}P / ${item.totalLeaves}L / ${item.totalHolidays}H`,
      `${item.totalLateCount} Days (${item.totalLateMinutes} Mins)`,
      `Rs. ${Math.round(item.deduction).toLocaleString()}`,
      `Rs. ${Math.round(item.netSalary).toLocaleString()}`,
      item.isPaid ? 'PAID' : 'UNPAID'
    ]);

    autoTable(doc, {
      head: [['Code', 'Name', 'Basic', 'P / L / H', 'Late Days & Mins', 'Deduction', 'Net Salary', 'Status']],
      body: tableRows,
      startY: 25,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`Payroll_${selectedMonth}.pdf`);
  };

  const filteredEmployees = getFilteredEmployees();
  const employeePageCount = Math.max(1, Math.ceil(filteredEmployees.length / EMPLOYEES_PER_PAGE));
  const currentEmployeePage = Math.min(employeePage, employeePageCount);
  const employeePageStart = (currentEmployeePage - 1) * EMPLOYEES_PER_PAGE;
  const directoryEmployees = printingSelectedEmployees
    ? employees.filter(emp => selectedEmployeeIds.includes(emp.id))
    : filteredEmployees.slice(employeePageStart, employeePageStart + EMPLOYEES_PER_PAGE);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800/85 backdrop-blur border border-slate-700/60 p-5 rounded-2xl gap-4 shadow-xl">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-500 to-blue-500 text-white rounded-xl shadow-inner">
              <Cpu size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Attendance & Payroll System</h1>
              <p className="text-xs text-slate-400">Automated Machine Time Detection Engine</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 bg-slate-900/60 px-3.5 py-1.5 rounded-xl border border-slate-700/80">
            <Calendar className="text-indigo-400" size={15} />
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Salary Month:</span>
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Global Search Bar shared across all tabs */}
        <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl flex items-center space-x-3 shadow-md">
          <Search className="text-slate-400 ml-2" size={18} />
          <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setEmployeePage(1);
              setAttendancePage(1);
              setPayrollPage(1);
            }}
            placeholder="Search employee by name or machine code..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          {searchTerm && (
            <button onClick={() => {
              setSearchTerm('');
              setEmployeePage(1);
              setAttendancePage(1);
              setPayrollPage(1);
            }} className="text-xs text-slate-400 hover:text-white px-2 py-1">Clear</button>
          )}
        </div>

        <div className="flex flex-col md:flex-row items-stretch gap-5">
          <aside className={`${sidebarOpen ? 'w-full md:w-52' : 'w-full md:w-14'} shrink-0 bg-slate-800/60 p-2 rounded-xl border border-slate-700/50 transition-all duration-200`}>
            <div className={`flex items-center ${sidebarOpen ? 'justify-between px-2' : 'justify-center'} pb-2 border-b border-slate-700/50`}>
              {sidebarOpen && <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Navigation</span>}
              <button onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? 'Hide' : 'Show'} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700/60 transition-colors">
                {sidebarOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
              </button>
            </div>
            <nav className="flex md:flex-col gap-1 mt-2">
              <button onClick={() => setActiveTab('employees')} className={`flex items-center ${sidebarOpen ? 'justify-start' : 'justify-center'} gap-2 w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'employees' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
                <Users size={14} />{sidebarOpen && <span>Employees</span>}
              </button>
              <button onClick={() => setActiveTab('attendance')} className={`flex items-center ${sidebarOpen ? 'justify-start' : 'justify-center'} gap-2 w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'attendance' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
                <Clock size={14} />{sidebarOpen && <span>Attendance Log</span>}
              </button>
              <button onClick={() => setActiveTab('payroll')} className={`flex items-center ${sidebarOpen ? 'justify-start' : 'justify-center'} gap-2 w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'payroll' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
                <DollarSign size={14} />{sidebarOpen && <span>Payroll</span>}
              </button>
            </nav>
          </aside>

          <main className="min-w-0 flex-1">

            {/* EMPLOYEES TAB */}
            {activeTab === 'employees' && (
              <div className="space-y-6">
                <form onSubmit={saveEmployee} className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <UserPlus className="text-indigo-400" size={18} />
                      <div>
                        <h2 className="text-xs font-bold text-white uppercase tracking-wider">{editingEmployeeId === null ? 'Add Employee Manually' : 'Update Employee'}</h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">Enter machine code and details.</p>
                      </div>
                    </div>
                    
                    <label className="cursor-pointer inline-flex items-center space-x-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-600 transition-colors">
                      <Upload size={14} />
                      <span>Import Excel</span>
                      <input type="file" accept=".xlsx, .xls" onChange={handleExcelEmployeeUpload} className="hidden" />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Machine Code *</label>
                      <input type="text" value={newEmployee.machineId} onChange={e => setNewEmployee({...newEmployee, machineId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. 8383" />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Full Name *</label>
                      <input type="text" value={newEmployee.name} onChange={e => setNewEmployee({...newEmployee, name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Ansar Masih" />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Designation</label>
                      <input type="text" value={newEmployee.designation} onChange={e => setNewEmployee({...newEmployee, designation: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Operator" />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Department</label>
                      <input type="text" value={newEmployee.dept} onChange={e => setNewEmployee({...newEmployee, dept: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Production" />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Mobile No.</label>
                      <input type="text" value={newEmployee.mobile} onChange={e => setNewEmployee({...newEmployee, mobile: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500" placeholder="03001234567" />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Salary Type</label>
                      <select value={newEmployee.salaryType} onChange={e => setNewEmployee({...newEmployee, salaryType: e.target.value as Employee['salaryType']})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500">
                        <option value="Monthly">Monthly</option>
                        <option value="Weekly">Weekly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Salary (PKR) *</label>
                      <input type="number" value={newEmployee.salary} onChange={e => setNewEmployee({...newEmployee, salary: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500" placeholder="50000" />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Status</label>
                      <select value={newEmployee.status} onChange={e => setNewEmployee({...newEmployee, status: e.target.value as Employee['status']})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500">
                        <option value="Active">Active</option>
                        <option value="Resigned">Resigned</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-2">
                    {editingEmployeeId !== null && (
                      <button type="button" onClick={resetEmployeeForm} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-lg text-xs font-semibold">
                        Cancel
                      </button>
                    )}
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-xs font-semibold shadow-md flex items-center space-x-1.5">
                      <Save size={14} />
                      <span>{editingEmployeeId === null ? 'Save Employee' : 'Update Employee'}</span>
                    </button>
                  </div>
                </form>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 shadow-xl overflow-x-auto printable-employee-list">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Employee Directory</h3>
                    <div className="no-print flex items-center gap-2">
                      {selectedEmployeeIds.length > 0 && (
                        <>
                          <button type="button" onClick={printSelectedEmployees} disabled={loading || !employees.some(emp => selectedEmployeeIds.includes(emp.id))} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
                            <Printer size={14} />
                            <span>Print Selected ({selectedEmployeeIds.length})</span>
                          </button>
                          <button onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md">
                            <span>Delete Selected ({selectedEmployeeIds.length})</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {loading ? (
                    <div className="text-center py-6 text-slate-400 text-xs">Loading employees...</div>
                  ) : filteredEmployees.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">No employees found.</div>
                  ) : (
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                        <tr>
                          <th className="no-print p-2.5 w-10">
                            <input 
                              type="checkbox" 
                              onChange={handleSelectAll}
                              checked={employees.length > 0 && selectedEmployeeIds.length === employees.length}
                              className="rounded bg-slate-800 border-slate-700 text-indigo-600 cursor-pointer"
                            />
                          </th>
                          <th className="p-2.5">Machine Code</th>
                          <th className="p-2.5">Name</th>
                          <th className="p-2.5">Designation</th>
                          <th className="p-2.5">Dept</th>
                          <th className="p-2.5">Mobile</th>
                          <th className="p-2.5">Type</th>
                          <th className="p-2.5">Salary</th>
                          <th className="p-2.5">Status</th>
                          <th className="no-print p-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {directoryEmployees.map((emp) => (
                          <tr key={emp.id} data-selected-for-print={selectedEmployeeIds.includes(emp.id) ? 'true' : 'false'} className="hover:bg-slate-700/30">
                            <td className="no-print p-2.5">
                              <input 
                                type="checkbox" 
                                checked={selectedEmployeeIds.includes(emp.id)}
                                onChange={() => handleSelectRow(emp.id)}
                                className="rounded bg-slate-800 border-slate-700 text-indigo-600 cursor-pointer"
                              />
                            </td>
                            <td className="p-2.5 font-bold text-indigo-400">{emp.machineId}</td>
                            <td className="p-2.5 font-medium text-white">{emp.name}</td>
                            <td className="p-2.5">{emp.designation || '-'}</td>
                            <td className="p-2.5">{emp.dept}</td>
                            <td className="p-2.5">{emp.mobile || '-'}</td>
                            <td className="p-2.5">{emp.salaryType}</td>
                            <td className="p-2.5 font-semibold">Rs. {Number(emp.salary || 0).toLocaleString()}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 text-[10px] rounded-full font-semibold ${emp.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                {emp.status}
                              </span>
                            </td>
                            <td className="no-print p-2.5 text-right">
                              <button onClick={() => editEmployee(emp)} className="text-slate-400 hover:text-indigo-400 p-1" title="Edit">
                                <Pencil size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {!loading && filteredEmployees.length > 0 && (
                    <div className="no-print mt-4 flex flex-col gap-3 border-t border-slate-700/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-slate-400">
                        Showing {employeePageStart + 1}-{Math.min(employeePageStart + EMPLOYEES_PER_PAGE, filteredEmployees.length)} of {filteredEmployees.length} employees
                      </span>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <button type="button" onClick={() => setEmployeePage(currentEmployeePage - 1)} disabled={currentEmployeePage === 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
                          <ChevronLeft size={14} />
                          <span>Previous</span>
                        </button>
                        <span className="whitespace-nowrap text-xs text-slate-400">Page {currentEmployeePage} of {employeePageCount}</span>
                        <button type="button" onClick={() => setEmployeePage(currentEmployeePage + 1)} disabled={currentEmployeePage === employeePageCount} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
                          <span>Next</span>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ATTENDANCE LOG TAB */}
            {activeTab === 'attendance' && (
              <div className="space-y-6">
                <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider">Biometric Logs & Shift Rules</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Upload .dat/.txt machine log file to populate punch times for {selectedMonth}.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg">
                      <Settings size={14} className="text-slate-400" />
                      <span className="text-slate-400">Start:</span>
                      <input type="time" value={shiftStartTime} onChange={e => { setShiftStartTime(e.target.value); setShiftSettingsSaved(false); }} className="bg-transparent text-white font-semibold focus:outline-none" />
                      <span className="text-slate-400">End:</span>
                      <input type="time" value={shiftEndTime} onChange={e => { setShiftEndTime(e.target.value); setShiftSettingsSaved(false); }} className="bg-transparent text-white font-semibold focus:outline-none" />
                      <span className="text-slate-400">Grace(m):</span>
                      <input type="number" min="0" value={gracePeriodMinutes} onChange={e => { setGracePeriodMinutes(Number(e.target.value)); setShiftSettingsSaved(false); }} className="w-12 bg-transparent text-white font-semibold focus:outline-none" />
                      <button type="button" onClick={saveShiftSettings} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 font-semibold text-white transition-colors hover:bg-indigo-500" aria-live="polite">
                        <Save size={14} />
                        <span>{shiftSettingsSaved ? 'Saved' : 'Save / Update'}</span>
                      </button>
                    </div>

                    <label className="cursor-pointer inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg font-semibold shadow-md transition-colors">
                      <Upload size={14} />
                      <span>Upload Biometric (.dat / .txt)</span>
                      <input type="file" accept=".txt,.dat,.csv" onChange={handleRawBiometricUpload} className="hidden" />
                    </label>
                  </div>
                </div>

                <BiometricSyncButton />

                {/* Uploaded Punch Logs Live Preview Section */}
                {allLogsPreview.length > 0 && (
                  <div className="bg-slate-800/60 border border-indigo-500/40 rounded-2xl p-4 shadow-xl overflow-x-auto">
                    <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2">Recently Uploaded Punch Logs Preview</h3>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-900 text-slate-400 sticky top-0">
                          <tr>
                            <th className="p-2">Machine ID</th>
                            <th className="p-2">Date</th>
                            <th className="p-2">In Time</th>
                            <th className="p-2">Out Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                          {allLogsPreview.slice(0, 50).map((log, idx) => (
                            <tr key={idx} className="hover:bg-slate-700/30">
                              <td className="p-2 font-bold text-indigo-400">{log.machineId}</td>
                              <td className="p-2">{log.timestamp}</td>
                              <td className="p-2 text-emerald-400 font-semibold">{log.inTime}</td>
                              <td className="p-2 text-amber-400 font-semibold">{log.outTime}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 shadow-xl overflow-x-auto">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Attendance Dashboard ({selectedMonth})</h3>
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                      <tr>
                        <th className="p-2.5">Machine Code</th>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Dept</th>
                        <th className="p-2.5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {paginatedAttendanceEmployees.map((emp) => (
                        <tr key={emp.id} className="hover:bg-slate-700/30">
                          <td className="p-2.5 font-bold text-indigo-400">{emp.machineId}</td>
                          <td className="p-2.5 font-medium text-white">{emp.name}</td>
                          <td className="p-2.5">{emp.dept}</td>
                          <td className="p-2.5 text-center">
                            <div className="inline-flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedEmpForView(emp)}
                                title="View attendance"
                                aria-label={`View attendance for ${emp.name}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition-colors hover:bg-slate-700 hover:text-indigo-300"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => printEmployeeAttendance(emp)}
                                title="Print attendance"
                                aria-label={`Print attendance for ${emp.name}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition-colors hover:bg-slate-700 hover:text-emerald-300"
                              >
                                <Printer size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEmpCalendar(emp)}
                                title="Edit attendance"
                                aria-label={`Edit attendance for ${emp.name}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition-colors hover:bg-slate-700 hover:text-amber-300"
                              >
                                <Pencil size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {attendanceEmployees.length > 0 && (
                    <div className="no-print mt-4 flex flex-col gap-3 border-t border-slate-700/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-slate-400">
                        Showing {attendancePageStart + 1}-{Math.min(attendancePageStart + EMPLOYEES_PER_PAGE, attendanceEmployees.length)} of {attendanceEmployees.length} employees
                      </span>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <button type="button" onClick={() => setAttendancePage(currentAttendancePage - 1)} disabled={currentAttendancePage === 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
                          <ChevronLeft size={14} />
                          <span>Previous</span>
                        </button>
                        <span className="whitespace-nowrap text-xs text-slate-400">Page {currentAttendancePage} of {attendancePageCount}</span>
                        <button type="button" onClick={() => setAttendancePage(currentAttendancePage + 1)} disabled={currentAttendancePage === attendancePageCount} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
                          <span>Next</span>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PAYROLL TAB */}
            {activeTab === 'payroll' && (
              <div className="space-y-6">
                <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-xl flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider">Payroll Report for {selectedMonth}</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Calculated net salaries mapped strictly to the selected month.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div role="tablist" aria-label="Payroll payment status" className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={payrollPaymentFilter === 'all'}
                        onClick={() => { setPayrollPaymentFilter('all'); setPayrollPage(1); }}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${payrollPaymentFilter === 'all' ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:text-white'}`}
                      >
                        All ({payrollSummary.length})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={payrollPaymentFilter === 'unpaid'}
                        onClick={() => { setPayrollPaymentFilter('unpaid'); setPayrollPage(1); }}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${payrollPaymentFilter === 'unpaid' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'}`}
                      >
                        Unpaid ({payrollSummary.filter(item => !item.isPaid).length})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={payrollPaymentFilter === 'paid'}
                        onClick={() => { setPayrollPaymentFilter('paid'); setPayrollPage(1); }}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${payrollPaymentFilter === 'paid' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-white'}`}
                      >
                        Paid ({payrollSummary.filter(item => item.isPaid).length})
                      </button>
                    </div>
                    <button onClick={exportPDF} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-md flex items-center space-x-1.5 transition-colors">
                      <Download size={14} />
                      <span>Export Printable PDF</span>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 shadow-xl overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                      <tr>
                        <th className="p-2.5">Machine Code</th>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Basic</th>
                        <th className="p-2.5">P / L / H</th>
                        <th className="p-2.5">Late Days & Mins</th>
                        <th className="p-2.5">Deduction</th>
                        <th className="p-2.5">Net Salary</th>
                        <th className="p-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {paginatedPayrollSummary.map((item) => (
                        <tr key={item.machineId} className="hover:bg-slate-700/30">
                          <td className="p-2.5">
                            <button type="button" onClick={() => openPayrollCalculationByMachineId(item.machineId)} title="View salary calculation" className="font-bold text-indigo-400 hover:text-indigo-300 hover:underline">
                              {item.machineId}
                            </button>
                          </td>
                          <td className="p-2.5">
                            <button type="button" onClick={() => openPayrollCalculationByMachineId(item.machineId)} title="View salary calculation" className="text-left font-medium text-white hover:text-indigo-300 hover:underline">
                              {item.name}
                            </button>
                          </td>
                          <td className="p-2.5">Rs. {item.basicSalary.toLocaleString()}</td>
                          <td className="p-2.5">{item.totalPresentDays}P / {item.totalLeaves}L / {item.totalHolidays}H</td>
                          <td className="p-2.5 font-medium text-amber-400">{item.totalLateCount} Days ({item.totalLateMinutes} Mins)</td>
                          <td className="p-2.5 text-rose-400 font-medium">Rs. {Math.round(item.deduction).toLocaleString()}</td>
                          <td className="p-2.5 text-emerald-400 font-bold">Rs. {Math.round(item.netSalary).toLocaleString()}</td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => item.isPaid
                                ? reversePayrollPayment(item.machineId, item.name)
                                : togglePaidStatus(item.machineId)}
                              title={item.isPaid ? 'Reverse payment and return to Unpaid' : 'Mark salary as paid'}
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all ${item.isPaid ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}
                            >
                              {item.isPaid && <RotateCcw size={12} />}
                              {item.isPaid ? 'Reverse' : 'Mark Paid'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-indigo-500/50 bg-slate-900/90 font-bold text-white">
                      <tr>
                        <td colSpan={2} className="p-2.5">Total ({visiblePayrollSummary.length})</td>
                        <td className="p-2.5">Rs. {Math.round(payrollTotals.basicSalary).toLocaleString()}</td>
                        <td className="p-2.5"></td>
                        <td className="p-2.5"></td>
                        <td className="p-2.5 text-rose-400">Rs. {Math.round(payrollTotals.deduction).toLocaleString()}</td>
                        <td className="p-2.5 text-emerald-400">Rs. {Math.round(payrollTotals.netSalary).toLocaleString()}</td>
                        <td className="p-2.5"></td>
                      </tr>
                    </tfoot>
                  </table>
                  {visiblePayrollSummary.length > 0 && (
                    <div className="no-print mt-4 flex flex-col gap-3 border-t border-slate-700/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-slate-400">
                        Showing {payrollPageStart + 1}-{Math.min(payrollPageStart + EMPLOYEES_PER_PAGE, visiblePayrollSummary.length)} of {visiblePayrollSummary.length} employees
                      </span>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <button type="button" onClick={() => setPayrollPage(currentPayrollPage - 1)} disabled={currentPayrollPage === 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
                          <ChevronLeft size={14} />
                          <span>Previous</span>
                        </button>
                        <span className="whitespace-nowrap text-xs text-slate-400">Page {currentPayrollPage} of {payrollPageCount}</span>
                        <button type="button" onClick={() => setPayrollPage(currentPayrollPage + 1)} disabled={currentPayrollPage === payrollPageCount} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
                          <span>Next</span>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </main>
        </div>
      </div>

      {/* ATTENDANCE MODAL */}
      {selectedEmpForEdit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-2xl rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Monthly Attendance - {selectedEmpForEdit.name} (Code: {selectedEmpForEdit.machineId})</h3>
                <p className="text-[11px] text-slate-400">Month: {selectedMonth}</p>
              </div>
              
              <div className="flex items-center space-x-2">
                <button onClick={handleBlankFill} className="bg-indigo-600/80 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition-colors">
                  Blank Fill (Auto)
                </button>
                <button onClick={() => setSelectedEmpForEdit(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {Object.keys(tempEmpAttendance).sort().map((dateKey) => {
                const punch = tempEmpAttendance[dateKey];
                const lateMins = calculateLateMinutes(punch.inTime);
                return (
                  <div key={dateKey} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 text-xs gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-slate-300 w-24">{dateKey}</span>
                      {lateMins > 0 && (
                        <span className="text-[10px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/20 font-semibold">
                          Late: {lateMins}m
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <select 
                        value={punch.status} 
                        onChange={(e) => {
                          const requestedStatus = e.target.value as DailyPunch['status'];
                          const hasBothPunches = hasCompletePunches(punch);
                          const status = requestedStatus === 'L' || requestedStatus === 'H'
                            ? requestedStatus
                            : hasBothPunches ? 'P' : 'A';
                          setTempEmpAttendance({
                            ...tempEmpAttendance,
                            [dateKey]: { ...punch, status }
                          });
                        }}
                        className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 focus:outline-none"
                      >
                        <option value="P" disabled={!hasCompletePunches(punch)}>Present (P)</option>
                        <option value="A" disabled={hasCompletePunches(punch)}>Absent (A)</option>
                        <option value="L">Leave (L)</option>
                        <option value="H">Holiday (H)</option>
                      </select>
                      
                      <input 
                        type="time" 
                        value={punch.inTime !== '--:--' ? punch.inTime : ''} 
                        onChange={(e) => updatePunchTime(dateKey, 'inTime', e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 focus:outline-none" 
                      />

                      <input 
                        type="time" 
                        value={punch.outTime !== '--:--' ? punch.outTime : ''} 
                        onChange={(e) => updatePunchTime(dateKey, 'outTime', e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 focus:outline-none" 
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700">
              <button type="button" onClick={clearAllEmpAttendance} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600/90 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500">
                <Trash2 size={14} />
                <span>Clear All</span>
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedEmpForEdit(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-1.5 rounded-lg text-xs font-semibold">
                  Cancel
                </button>
                <button onClick={saveEmpAttendance} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-md">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEmpForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label={`Attendance for ${selectedEmpForView.name}`} className="flex max-h-[90vh] w-full max-w-4xl flex-col space-y-4 rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Monthly Attendance - {selectedEmpForView.name}</h3>
                <p className="text-[11px] text-slate-400">Code: {selectedEmpForView.machineId} | Month: {selectedMonth}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmpForView(null)}
                title="Close attendance view"
                aria-label="Close attendance view"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="sticky top-0 bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">In</th>
                    <th className="p-2.5">Out</th>
                    <th className="p-2.5">Hours</th>
                    <th className="p-2.5">Overtime</th>
                    <th className="p-2.5">Late (min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {getEmployeeAttendanceRecords(selectedEmpForView).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">No attendance records for this month.</td>
                    </tr>
                  ) : getEmployeeAttendanceRecords(selectedEmpForView).map(([date, punch]) => (
                    <tr key={date}>
                      <td className="p-2.5">{date}</td>
                      <td className="p-2.5">{punch.status}</td>
                      <td className="p-2.5">{punch.inTime}</td>
                      <td className="p-2.5">{punch.outTime}</td>
                      <td className="p-2.5">{punch.totalHours}</td>
                      <td className="p-2.5">{punch.overtimeHours}</td>
                      <td className="p-2.5">{punch.lateMinutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedEmpForPayroll && selectedPayrollCalculation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label={`Salary calculation for ${selectedEmpForPayroll.name}`} className="flex max-h-[90vh] w-full max-w-2xl flex-col space-y-4 rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Salary Calculation Record</h3>
                <p className="text-[11px] text-slate-400">{selectedEmpForPayroll.name} | Code: {selectedEmpForPayroll.machineId} | Month: {selectedMonth}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmpForPayroll(null)}
                title="Close salary calculation"
                aria-label="Close salary calculation"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <tbody className="divide-y divide-slate-700/60">
                  <tr><th className="p-2.5 font-medium text-slate-400">Basic salary</th><td className="p-2.5 text-right">Rs. {selectedPayrollCalculation.basicSalary.toLocaleString()}</td></tr>
                  <tr><th className="p-2.5 font-medium text-slate-400">Salary basis / working days</th><td className="p-2.5 text-right">{selectedEmpForPayroll.salaryType} / {selectedPayrollCalculation.workingDays} days</td></tr>
                  <tr><th className="p-2.5 font-medium text-slate-400">Attendance (P / L / H / A)</th><td className="p-2.5 text-right">{selectedPayrollCalculation.totalPresentDays} / {selectedPayrollCalculation.totalLeaves} / {selectedPayrollCalculation.totalHolidays} / {selectedPayrollCalculation.totalAbsentDays}</td></tr>
                  <tr><th className="p-2.5 font-medium text-slate-400">Hours worked</th><td className="p-2.5 text-right">{selectedPayrollCalculation.workedHours.toFixed(2)} h</td></tr>
                  <tr><th className="p-2.5 font-medium text-slate-400">Hourly rate</th><td className="p-2.5 text-right">Rs. {selectedPayrollCalculation.hourlyRate.toFixed(2)} / h</td></tr>
                  <tr><th className="p-2.5 font-medium text-slate-400">Deduction hours</th><td className="p-2.5 text-right">{selectedPayrollCalculation.deductionHours.toFixed(2)} h (including {selectedPayrollCalculation.shortHours.toFixed(2)} short hours)</td></tr>
                  <tr><th className="p-2.5 font-medium text-slate-400">Deduction calculation</th><td className="p-2.5 text-right">{selectedPayrollCalculation.deductionHours.toFixed(2)} h × Rs. {selectedPayrollCalculation.hourlyRate.toFixed(2)} = Rs. {Math.round(selectedPayrollCalculation.deduction).toLocaleString()}</td></tr>
                  <tr><th className="p-2.5 font-medium text-slate-400">Overtime</th><td className="p-2.5 text-right">{selectedPayrollCalculation.overtimeHours.toFixed(2)} h = Rs. {Math.round(selectedPayrollCalculation.overtimePay).toLocaleString()}</td></tr>
                  <tr><th className="p-2.5 font-semibold text-white">Net salary</th><td className="p-2.5 text-right font-bold text-emerald-400">Rs. {Math.round(selectedPayrollCalculation.netSalary).toLocaleString()}</td></tr>
                  <tr><th className="p-2.5 font-medium text-slate-400">Payment status</th><td className="p-2.5 text-right">{selectedPayrollCalculation.isPaid ? 'PAID' : 'UNPAID'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
