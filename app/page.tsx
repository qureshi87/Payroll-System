'use client';
import { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  Users, Clock, DollarSign, Download, 
  Calendar, Save, X, Upload, Settings, Cpu, ChevronRight, ChevronLeft, UserPlus, Pencil, Eye, Printer, Filter
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

export default function SalarySystem() {
  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'payroll'>('attendance');
  const [payrollFilter, setPayrollFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('UNPAID');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [employeeIdSearch, setEmployeeIdSearch] = useState<string>('');
  const [employeeNameSearch, setEmployeeNameSearch] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const monthInputRef = useRef<HTMLInputElement>(null);

  const [shiftStartTime, setShiftStartTime] = useState<string>('08:00');
  const [shiftEndTime, setShiftEndTime] = useState<string>('17:00');
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState<number>(15);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);

  const [monthlyRecords, setMonthlyRecords] = useState<{ [monthKey: string]: MonthlyData }>({});

  const [selectedEmpForView, setSelectedEmpForView] = useState<Employee | null>(null);
  const [selectedEmpForEdit, setSelectedEmpForEdit] = useState<Employee | null>(null);
  const [tempEmpAttendance, setTempEmpAttendance] = useState<{ [date: string]: DailyPunch }>({});
  const [totalWorkingDays] = useState<number>(30);
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
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

  const fetchShiftRules = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('shift_rules')
      .select('*')
      .eq('month', selectedMonth)
      .single();

    if (data) {
      setShiftStartTime(data.start_time || '08:00');
      setShiftEndTime(data.end_time || '17:00');
      setGracePeriodMinutes(data.grace_period ?? 15);
    }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.from('employees').select('*');
    if (error) {
      console.error('Error loading employees:', error.message);
    } else if (data) {
      const formatted: Employee[] = (data as Array<Record<string, any>>).map((e: Record<string, any>) => ({
        id: e.id,
        machineId: String(e.machine_id || '').trim(),
        name: e.name,
        designation: e.designation || '',
        dept: e.dept || 'Production',
        mobile: e.mobile || '',
        salaryType: e.salary_type || 'Monthly',
        salary: e.salary || '0',
        status: e.status || 'Active'
      }));
      setEmployees(formatted);
    }
    setLoading(false);
  };

  const fetchAttendanceForMonth = async (monthKey: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('month', monthKey);

    if (error) {
      console.error('Error fetching attendance:', error.message);
    } else if (data) {
      const attMap: { [machineId: string]: { [date: string]: DailyPunch } } = {};
      (data as Array<Record<string, any>>).forEach((row) => {
        if (row.machine_id && row.attendance_data) {
          attMap[row.machine_id] = row.attendance_data;
        }
      });

      setMonthlyRecords((prev) => ({
        ...prev,
        [monthKey]: {
          ...(prev[monthKey] || { attendance: {}, paidStatus: {} }),
          attendance: attMap
        }
      }));
    }
    await fetchShiftRules();
  };

  useEffect(() => {
    fetchEmployees();
    fetchShiftRules();
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      fetchAttendanceForMonth(selectedMonth);
    }
  }, [selectedMonth]);

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
    const salary = String(newEmployee.salary || "").trim();

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
    setActiveTab('employees');
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
      setSelectedEmployeeIds(getFilteredEmployees().map(emp => emp.id));
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

  const getShiftHours = () => {
    const [startH, startM] = shiftStartTime.split(':').map(Number);
    const [endH, endM] = shiftEndTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;
    return (endMinutes - startMinutes) / 60;
  };

  const getPunchDurationHours = (inTime: string, outTime: string) => {
    const [inH, inM] = inTime.split(':').map(Number);
    const [outH, outM] = outTime.split(':').map(Number);
    const inMinutes = inH * 60 + inM;
    let outMinutes = outH * 60 + outM;
    if (outMinutes < inMinutes) outMinutes += 24 * 60;
    return Math.max(0, parseFloat(((outMinutes - inMinutes) / 60).toFixed(2)));
  };

  const isOvernightPunchPair = (inTime: string, outTime: string) => {
    const [inH, inM] = inTime.split(':').map(Number);
    const [outH, outM] = outTime.split(':').map(Number);
    const inMinutes = inH * 60 + inM;
    const outMinutes = outH * 60 + outM;
    const [startH, startM] = shiftStartTime.split(':').map(Number);
    const [endH, endM] = shiftEndTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return inMinutes >= endMinutes && outMinutes <= startMinutes;
  };

  const handleSaveShiftRules = async () => {
    if (!supabase) return;
    const payload = {
      month: selectedMonth,
      start_time: shiftStartTime,
      end_time: shiftEndTime,
      grace_period: gracePeriodMinutes
    };

    const { error } = await supabase
      .from('shift_rules')
      .upsert([payload], { onConflict: 'month' });

    if (error) {
      alert('Shift rules save karne mein error aa gaya: ' + error.message);
    } else {
      alert(`Shift rules successfully updated in Database!\nStart: ${shiftStartTime}, End: ${shiftEndTime}, Grace: ${gracePeriodMinutes}m`);
    }
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

      Object.values(punchLogs).forEach((employeeLogs) => {
        const dateKeys = Object.keys(employeeLogs).sort();
        for (let index = 0; index < dateKeys.length - 1; index += 1) {
          const dateKey = dateKeys[index];
          const nextDateKey = dateKeys[index + 1];
          const currentTimes = employeeLogs[dateKey];
          const nextTimes = employeeLogs[nextDateKey];

          if (currentTimes.length === 1 && nextTimes.length === 1 && isOvernightPunchPair(currentTimes[0], nextTimes[0])) {
            currentTimes.push(nextTimes[0]);
            delete employeeLogs[nextDateKey];
            dateKeys.splice(index + 1, 1);
          }
        }
      });

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
            const rawOut = times.length > 1 ? times[times.length - 1] : times[0];

            let totalHours = 0;
            if (rawIn && rawOut && rawIn !== rawOut) {
              totalHours = getPunchDurationHours(rawIn, rawOut);
            }

            const regularShiftHours = getShiftHours();
            const otHours = totalHours > regularShiftHours
              ? parseFloat((totalHours - regularShiftHours).toFixed(1))
              : 0;
            const lateMins = calculateLateMinutes(rawIn);

            const existingRecord = currentAtt[mId]?.[dateStr];
            const status = existingRecord?.status === 'L' || existingRecord?.status === 'H' ? existingRecord.status : 'P';

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

      if (supabase) {
        const attendancePayloads: Array<{ machine_id: string; month: string; attendance_data: any; updated_at: string }> = [];
        
        Object.keys(updatedMonthlyRecords).forEach((mKey) => {
          const monthAttMap = updatedMonthlyRecords[mKey].attendance;
          Object.keys(monthAttMap).forEach((mId) => {
            attendancePayloads.push({
              machine_id: mId,
              month: mKey,
              attendance_data: monthAttMap[mId],
              updated_at: new Date().toISOString(),
            });
          });
        });

        if (attendancePayloads.length > 0) {
          const { error } = await supabase
            .from('attendance')
            .upsert(attendancePayloads, { onConflict: 'machine_id,month' });

          if (error) {
            console.error('Error saving uploaded biometric logs to Supabase:', error.message);
            alert('Logs parse ho gaye hain lekin database me save karne me error aaya hai: ' + error.message);
            return;
          }
        }
      }

      const firstMonth = Array.from(affectedMonths)[0];
      if (firstMonth) {
        setSelectedMonth(firstMonth);
      }

      alert(`Biometric Machine Logs Processed and Saved Successfully for month(s): ${Array.from(affectedMonths).join(', ')}!`);
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExcelEmployeeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!supabase) {
      alert('Supabase is not configured.');
      e.target.value = '';
      return;
    }
    const configuredSupabase = supabase;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = evt.target?.result;
      if (!data) return;

      const workbook = XLSX.read(data, { type: 'array' });
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

      if (importedEmployeesPayload.length > 0) {
        const { error } = await configuredSupabase.from('employees').insert(importedEmployeesPayload);
        if (error) {
          alert('Error importing Excel: ' + error.message);
        } else {
          alert('Employees Imported Successfully!');
          await fetchEmployees();
        }
      } else {
        alert('The selected Excel file does not contain any employee rows.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const openEmpViewModal = (emp: Employee) => {
    setSelectedEmpForView(emp);
    prepareMonthAttendance(emp);
  };

  const openEmpEditModal = (emp: Employee) => {
    setSelectedEmpForEdit(emp);
    prepareMonthAttendance(emp);
  };

  const prepareMonthAttendance = (emp: Employee) => {
    const monthData: MonthlyData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };
    const empAtt: { [date: string]: DailyPunch } = monthData.attendance?.[emp.machineId] || {};
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const fullMonthDates: { [date: string]: DailyPunch } = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      const existing = empAtt[dateKey];

      if (existing) {
        fullMonthDates[dateKey] = existing;
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

  const handleBlankFill = () => {
    const updated = { ...tempEmpAttendance };
    Object.keys(updated).forEach(dateKey => {
      const punch = updated[dateKey];
      if (!punch.inTime || punch.inTime === '--:--') punch.inTime = shiftStartTime;
      if (!punch.outTime || punch.outTime === '--:--') punch.outTime = shiftEndTime;
      if (!punch.status || punch.status === 'A') {
        punch.status = 'P';
        punch.totalHours = 8;
      }
    });
    setTempEmpAttendance(updated);
  };

  const handleAllClear = () => {
    const updated = { ...tempEmpAttendance };
    Object.keys(updated).forEach(dateKey => {
      updated[dateKey] = {
        inTime: '--:--',
        outTime: '--:--',
        status: 'A',
        overtimeHours: 0,
        totalHours: 0,
        shift: 'Morning',
        lateMinutes: 0,
        note: ''
      };
    });
    setTempEmpAttendance(updated);
  };

  const handleSaveAttendance = async () => {
    if (!selectedEmpForEdit || !supabase) return;
    setIsSaving(true);
    try {
      const payload = {
        machine_id: selectedEmpForEdit.machineId,
        month: selectedMonth,
        attendance_data: tempEmpAttendance,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('attendance')
        .upsert([payload], { onConflict: 'machine_id,month' });

      if (error) {
        console.error('Error saving attendance:', error.message);
        alert(`Data save karne mein error aya hai: ${error.message}`);
      } else {
        alert('Attendance successfully save ho gayi hai!');
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
      }
    } catch (err: any) {
      console.error('Unexpected error:', err);
      alert('Aik unexpected error pesh aya hai.');
    } finally {
      setIsSaving(false);
    }
  };

  const markPayrollPaid = (machineId: string) => {
    const currentData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };
    setMonthlyRecords({
      ...monthlyRecords,
      [selectedMonth]: {
        ...currentData,
        paidStatus: { ...currentData.paidStatus, [machineId]: true }
      }
    });
  };

  const reversePayrollPayment = (machineId: string) => {
    const currentData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };
    setMonthlyRecords({
      ...monthlyRecords,
      [selectedMonth]: {
        ...currentData,
        paidStatus: { ...currentData.paidStatus, [machineId]: false }
      }
    });
  };

  const availableDepartments = Array.from(new Set(employees.map(e => e.dept).filter(Boolean))).sort();

  const getFilteredEmployees = () => {
    const idTerm = employeeIdSearch.trim().toLowerCase();
    const nameTerm = employeeNameSearch.trim().toLowerCase();
    const legacyTerm = searchTerm.trim().toLowerCase();

    return employees.filter((e) => {
      const matchesId = !idTerm || e.machineId.toLowerCase().includes(idTerm);
      const matchesName = !nameTerm || e.name.toLowerCase().includes(nameTerm);
      const matchesDept = selectedDepartment === 'All' || e.dept.toLowerCase() === selectedDepartment.toLowerCase();
      const matchesLegacy = !legacyTerm || e.machineId.toLowerCase().includes(legacyTerm) || e.name.toLowerCase().includes(legacyTerm);
      return matchesId && matchesName && matchesDept && matchesLegacy;
    });
  };

  const getEmployeeRecordMonths = (machineId: string) => {
    return Object.keys(monthlyRecords)
      .filter((month) => {
        const attendance = monthlyRecords[month]?.attendance?.[machineId];
        return attendance && Object.keys(attendance).length > 0;
      })
      .sort((a, b) => b.localeCompare(a));
  };

  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) return monthKey;
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const clearSearchFilters = () => {
    setEmployeeIdSearch('');
    setEmployeeNameSearch('');
    setSelectedDepartment('All');
    setSearchTerm('');
  };

  const getCalculationsForAttendance = (attendanceMap: { [date: string]: DailyPunch }, emp: Employee) => {
    const workingDays = emp.salaryType === 'Weekly' ? 6 : totalWorkingDays;
    const basic = parseFloat(emp.salary) || 0;
    
    const absentDays = Object.values(attendanceMap).filter(a => a.status === 'A').length;
    const absentDeduction = (basic / workingDays) * absentDays;

    const totalLateMins = Object.values(attendanceMap).reduce((sum, a) => sum + (a.lateMinutes || 0), 0);
    const perMinuteRate = basic / (workingDays * 8 * 60);
    const lateDeduction = totalLateMins * perMinuteRate;

    const totalDeduction = absentDeduction + lateDeduction;
    const netSalary = Math.max(0, basic - totalDeduction);

    return {
      totalDeduction: Math.round(totalDeduction),
      netPayable: Math.round(netSalary),
      absentDays,
      totalLateMins
    };
  };

  const getPayrollSummary = () => {
    const monthData: MonthlyData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };

    return getFilteredEmployees().filter(e => e.status === 'Active').map((emp) => {
      const empAtt: { [date: string]: DailyPunch } = monthData.attendance?.[emp.machineId] || {};
      const presentDays = Object.values(empAtt).filter(a => a.status === 'P').length;
      const leaveDays = Object.values(empAtt).filter(a => a.status === 'L').length;
      const holidayDays = Object.values(empAtt).filter(a => a.status === 'H').length;
      const totalOT = Object.values(empAtt).reduce((sum, a) => sum + (Number(a.overtimeHours) || 0), 0);
      
      const lateRecords = Object.values(empAtt).filter(a => a.lateMinutes > 0);
      const totalLateCount = lateRecords.length;
      const totalLateMinutes = lateRecords.reduce((sum, a) => sum + a.lateMinutes, 0);

      const workingDays = emp.salaryType === 'Weekly' ? 6 : totalWorkingDays;
      const paidDaysCount = presentDays + leaveDays + holidayDays;
      const absentDays = Math.max(0, workingDays - paidDaysCount);
      
      const basic = parseFloat(emp.salary) || 0;
      const absentDeduction = (basic / workingDays) * absentDays;
      const perMinuteRate = basic / (workingDays * 8 * 60);
      const lateDeduction = totalLateMinutes * perMinuteRate;
      const totalDeduction = absentDeduction + lateDeduction;

      const overtimePay = totalOT * 200;
      const netSalary = Math.max(0, basic - totalDeduction + overtimePay);

      return {
        machineId: emp.machineId,
        name: emp.name,
        dept: emp.dept,
        designation: emp.designation,
        basicSalary: basic,
        totalPresentDays: presentDays,
        totalLeaves: leaveDays,
        totalHolidays: holidayDays,
        totalAbsentDays: absentDays,
        totalLateCount,
        totalLateMinutes,
        overtimeHours: totalOT,
        deduction: totalDeduction,
        netSalary,
        isPaid: monthData.paidStatus?.[emp.machineId] || false
      };
    });
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Payroll & Attendance Report - ${selectedMonth} (${selectedDepartment === 'All' ? 'All Departments' : selectedDepartment})`, 14, 15);

    const summary = getPayrollSummary();
    const tableRows = summary.map((item) => [
      item.machineId,
      item.name,
      item.dept,
      `Rs. ${item.basicSalary.toLocaleString()}`,
      `${item.totalPresentDays}P / ${item.totalLeaves}L / ${item.totalHolidays}H`,
      `${item.totalLateCount} Days (${item.totalLateMinutes} Mins)`,
      `Rs. ${Math.round(item.deduction).toLocaleString()}`,
      `Rs. ${Math.round(item.netSalary).toLocaleString()}`,
      item.isPaid ? 'PAID' : 'UNPAID'
    ]);

    autoTable(doc, {
      head: [['Code', 'Name', 'Dept', 'Basic', 'P / L / H', 'Late Days & Mins', 'Deduction', 'Net Salary', 'Status']],
      body: tableRows,
      startY: 25,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`Payroll_${selectedMonth}_${selectedDepartment}.pdf`);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans antialiased">

      <div className="max-w-7xl mx-auto space-y-6">
        
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

        <div className="bg-slate-800/70 border border-slate-700/70 p-4 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Filter className="text-indigo-400" size={17} />
              <div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">Department Filter & Employee Search</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">Filter by Department, Employee ID or Name.</p>
              </div>
            </div>
            {(employeeIdSearch || employeeNameSearch || selectedDepartment !== 'All' || searchTerm) && (
              <button onClick={clearSearchFilters} className="text-[11px] text-slate-400 hover:text-white border border-slate-700 px-2.5 py-1.5 rounded-lg">Clear Filters</button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <label className="block">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Department Filter</span>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700 text-white text-xs rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-indigo-500 cursor-pointer">
                  <option value="All">All Departments</option>
                  {availableDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="block">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Employee ID / Machine Code</span>
              <div className="relative">
                <Cpu className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input type="text" value={employeeIdSearch} onChange={(e) => setEmployeeIdSearch(e.target.value)} placeholder="e.g. 10025" className="w-full bg-slate-900/80 border border-slate-700 text-white text-xs rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-indigo-500" />
              </div>
            </label>
            <label className="block">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Employee Name</span>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input type="text" value={employeeNameSearch} onChange={(e) => setEmployeeNameSearch(e.target.value)} placeholder="Search by name" className="w-full bg-slate-900/80 border border-slate-700 text-white text-xs rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-indigo-500" />
              </div>
            </label>
            <label
              htmlFor="record-month"
              onClick={() => monthInputRef.current?.showPicker?.()}
              className="block cursor-pointer"
            >
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Month</span>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} />
                <input id="record-month" ref={monthInputRef} type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700 text-white text-xs rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-indigo-500" />
              </div>
            </label>
          </div>
          {(employeeIdSearch || employeeNameSearch || selectedDepartment !== 'All') && (
            <div className="mt-4 pt-3 border-t border-slate-700/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Matching Employees & Available Months</span>
                <span className="text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-full">{getFilteredEmployees().length} found</span>
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {getFilteredEmployees().map((emp) => {
                  const months = getEmployeeRecordMonths(emp.machineId);
                  return (
                    <div key={emp.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[11px] font-bold text-indigo-300">{emp.machineId}</span>
                        <span className="text-xs font-medium text-white truncate">{emp.name}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">{emp.dept}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {months.length > 0 ? months.map((month) => (
                          <button key={month} type="button" onClick={() => setSelectedMonth(month)} className={`text-[9px] px-2 py-1 rounded-md border transition-colors ${selectedMonth === month ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-indigo-500'}`}>
                            {formatMonthLabel(month)}
                          </button>
                        )) : <span className="text-[10px] text-amber-400">No uploaded attendance month yet</span>}
                      </div>
                    </div>
                  );
                })}
                {getFilteredEmployees().length === 0 && <div className="text-center py-3 text-xs text-slate-500">No employee found in this department or search criteria.</div>}
              </div>
            </div>
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

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 shadow-xl overflow-x-auto">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">Employee Directory</h3>
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                        {selectedDepartment === 'All' ? 'All Departments' : selectedDepartment} ({getFilteredEmployees().length})
                      </span>
                    </div>
                    {selectedEmployeeIds.length > 0 && (
                      <button onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md">
                        <span>Delete Selected ({selectedEmployeeIds.length})</span>
                      </button>
                    )}
                  </div>

                  {loading ? (
                    <div className="text-center py-6 text-slate-400 text-xs">Loading employees...</div>
                  ) : getFilteredEmployees().length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">No employees found matching the filter.</div>
                  ) : (
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                        <tr>
                          <th className="p-2.5 w-10">
                            <input 
                              type="checkbox" 
                              onChange={handleSelectAll}
                              checked={getFilteredEmployees().length > 0 && selectedEmployeeIds.length === getFilteredEmployees().length}
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
                          <th className="p-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {getFilteredEmployees().map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-700/30">
                            <td className="p-2.5">
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
                            <td className="p-2.5 font-medium text-slate-200">{emp.dept}</td>
                            <td className="p-2.5">{emp.mobile || '-'}</td>
                            <td className="p-2.5">{emp.salaryType}</td>
                            <td className="p-2.5 font-semibold">Rs. {Number(emp.salary || 0).toLocaleString()}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 text-[10px] rounded-full font-semibold ${emp.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                {emp.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-right">
                              <button onClick={() => editEmployee(emp)} className="bg-slate-700 hover:bg-slate-600 text-indigo-300 px-2 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1" title="Edit Employee Info">
                                <Pencil size={12} /> Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'attendance' && (
              <div className="space-y-6">
                <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider">Biometric Logs & Shift Rules</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Upload .dat/.txt machine log file to populate punch times for {selectedMonth}.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg">
                      <Settings size={14} className="text-slate-400" />
                      <span className="text-slate-400">Start:</span>
                      <input type="time" value={shiftStartTime} onChange={e => setShiftStartTime(e.target.value)} className="bg-transparent text-white font-semibold focus:outline-none" />
                      <span className="text-slate-400 ml-2">End:</span>
                      <input type="time" value={shiftEndTime} onChange={e => setShiftEndTime(e.target.value)} className="bg-transparent text-white font-semibold focus:outline-none" />
                      <span className="text-slate-400 ml-2">Grace(m):</span>
                      <input type="number" value={gracePeriodMinutes} onChange={e => setGracePeriodMinutes(Number(e.target.value))} className="w-12 bg-transparent text-white font-semibold focus:outline-none" />
                      <button 
                        onClick={handleSaveShiftRules} 
                        className="ml-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-xs font-semibold transition-colors shadow"
                      >
                        Save / Update
                      </button>
                    </div>

                    <label className="cursor-pointer inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg font-semibold shadow-md transition-colors">
                      <Upload size={14} />
                      <span>Upload Biometric (.dat / .txt)</span>
                      <input type="file" accept=".txt,.dat,.csv" onChange={handleRawBiometricUpload} className="hidden" />
                    </label>
                  </div>
                </div>

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
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Attendance Dashboard ({selectedMonth}) {selectedDepartment !== 'All' ? `- ${selectedDepartment}` : ''}
                    </h3>
                    <span className="text-[10px] text-slate-400">Showing {getFilteredEmployees().filter(e => e.status === 'Active').length} active employees</span>
                  </div>
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                      <tr>
                        <th className="p-2.5">Machine Code</th>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Designation</th>
                        <th className="p-2.5">Dept</th>
                        <th className="p-2.5 text-center">Actions (View Report / Edit)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {getFilteredEmployees().filter(e => e.status === 'Active').map((emp) => (
                        <tr key={emp.id} className="hover:bg-slate-700/30">
                          <td className="p-2.5 font-bold text-indigo-400">{emp.machineId}</td>
                          <td className="p-2.5 font-medium text-white">{emp.name}</td>
                          <td className="p-2.5">{emp.designation || '-'}</td>
                          <td className="p-2.5 font-medium text-slate-200">{emp.dept}</td>
                          <td className="p-2.5 text-center">
                            <div className="inline-flex items-center gap-2">
                              <button 
                                onClick={() => openEmpViewModal(emp)} 
                                className="bg-slate-700 hover:bg-slate-600 text-indigo-300 border border-slate-600 px-3 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors"
                                title="View Attendance Report"
                              >
                                <Eye size={13} /> View Report
                              </button>
                              
                              <button 
                                onClick={() => openEmpEditModal(emp)} 
                                className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 px-3 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors"
                                title="Edit Attendance Punches"
                              >
                                <Pencil size={13} /> Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'payroll' && (() => {
              const allPayrollSummary = getPayrollSummary();
              const payrollSummary = allPayrollSummary.filter((item) => {
                if (payrollFilter === 'PAID') return item.isPaid;
                if (payrollFilter === 'UNPAID') return !item.isPaid;
                return true;
              });
              const totalBasicSalary = payrollSummary.reduce((sum, item) => sum + Math.round(item.basicSalary), 0);
              const totalDeductionSum = payrollSummary.reduce((sum, item) => sum + Math.round(item.deduction), 0);
              const totalNetSalary = payrollSummary.reduce((sum, item) => sum + Math.round(item.netSalary), 0);
              const paidCount = allPayrollSummary.filter(item => item.isPaid).length;
              const unpaidCount = allPayrollSummary.filter(item => !item.isPaid).length;

              return (
              <div className="space-y-6">
                <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl shadow-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setPayrollFilter('UNPAID')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${payrollFilter === 'UNPAID' ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700'}`}>
                      UNPAID ({unpaidCount})
                    </button>
                    <button onClick={() => setPayrollFilter('PAID')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${payrollFilter === 'PAID' ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700'}`}>
                      PAID ({paidCount})
                    </button>
                    <button onClick={() => setPayrollFilter('ALL')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${payrollFilter === 'ALL' ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700'}`}>
                      ALL ({allPayrollSummary.length})
                    </button>
                    <span className="ml-auto text-[11px] text-slate-400">Selected: <b className="text-white">{payrollFilter}</b></span>
                  </div>
                </div>

                <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-xl flex justify-between items-center">
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                      Payroll Report for {selectedMonth} {selectedDepartment !== 'All' ? `(${selectedDepartment})` : ''}
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Calculated net salaries mapped strictly to the selected department and month.</p>
                  </div>

                  <button onClick={exportPDF} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-md flex items-center space-x-1.5 transition-colors">
                    <Download size={14} />
                    <span>Export Printable PDF</span>
                  </button>
                </div>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 shadow-xl overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                      <tr>
                        <th className="p-2.5">Machine Code</th>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Designation</th>
                        <th className="p-2.5">Dept</th>
                        <th className="p-2.5">Basic</th>
                        <th className="p-2.5">P / L / H</th>
                        <th className="p-2.5">Late Days & Mins</th>
                        <th className="p-2.5">Deduction</th>
                        <th className="p-2.5">Net Salary</th>
                        <th className="p-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      <tr className="bg-slate-900/95 border-b-2 border-indigo-500/50 font-bold text-white">
                        <td colSpan={4} className="p-3 text-right text-indigo-300">Grand Total:</td>
                        <td className="p-3 text-indigo-300">Rs. {totalBasicSalary.toLocaleString()}</td>
                        <td colSpan={2}></td>
                        <td className="p-3 text-rose-400">Rs. {totalDeductionSum.toLocaleString()}</td>
                        <td className="p-3 text-emerald-400 text-sm">Rs. {totalNetSalary.toLocaleString()}</td>
                        <td></td>
                      </tr>
                      {payrollSummary.map((item) => (
                        <tr key={item.machineId} className="hover:bg-slate-700/30">
                          <td className="p-2.5 font-bold text-indigo-400">{item.machineId}</td>
                          <td className="p-2.5 font-medium text-white">{item.name}</td>
                          <td className="p-2.5">{item.designation || '-'}</td>
                          <td className="p-2.5 font-medium text-slate-200">{item.dept}</td>
                          <td className="p-2.5">Rs. {item.basicSalary.toLocaleString()}</td>
                          <td className="p-2.5">{item.totalPresentDays}P / {item.totalLeaves}L / {item.totalHolidays}H</td>
                          <td className="p-2.5 font-medium text-amber-400">{item.totalLateCount} Days ({item.totalLateMinutes} Mins)</td>
                          <td className="p-2.5 text-rose-400 font-medium">Rs. {Math.round(item.deduction).toLocaleString()}</td>
                          <td className="p-2.5 text-emerald-400 font-bold">Rs. {Math.round(item.netSalary).toLocaleString()}</td>
                          <td className="p-2.5 text-center">
                            {item.isPaid ? (
                              <button onClick={() => reversePayrollPayment(item.machineId)} className="px-2.5 py-1 text-[10px] rounded-full font-bold transition-all bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 inline-flex items-center gap-1" title="Reverse payment and mark as unpaid">
                                ↩ Reverse
                              </button>
                            ) : (
                              <button onClick={() => markPayrollPaid(item.machineId)} className="px-2.5 py-1 text-[10px] rounded-full font-bold transition-all bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30" title="Mark salary as paid">
                                MARK PAID
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
            })()}

          </main>
        </div>
      </div>

      {selectedEmpForView && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div id="printable-area" className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col printable-report text-slate-100">
            
            <div className="flex justify-between items-start border-b border-slate-700 pb-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Official Attendance & Salary Report</span>
                <h2 className="text-lg font-bold text-white mt-0.5">{selectedEmpForView.name}</h2>
                <p className="text-xs text-slate-400">Machine Code: <span className="font-semibold text-slate-200">{selectedEmpForView.machineId}</span> | Designation: <span className="font-semibold text-slate-200">{selectedEmpForView.designation || 'N/A'}</span> | Dept: <span className="font-semibold text-slate-200">{selectedEmpForView.dept}</span></p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-indigo-300">Month: {selectedMonth}</p>
                <div className="flex items-center gap-2 mt-2 no-print">
                  <button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow flex items-center gap-1.5 transition-colors">
                    <Printer size={14} /> Print Report
                  </button>
                  <button onClick={() => setSelectedEmpForView(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Basic Salary</span>
                <p className="text-sm font-bold text-white mt-0.5">Rs. {Number(selectedEmpForView.salary || 0).toLocaleString()}</p>
              </div>
              <div className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Total Absents</span>
                <p className="text-sm font-bold text-rose-400 mt-0.5">{getCalculationsForAttendance(tempEmpAttendance, selectedEmpForView).absentDays} Days</p>
              </div>
              <div className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Late Deductions</span>
                <p className="text-sm font-bold text-amber-400 mt-0.5">{getCalculationsForAttendance(tempEmpAttendance, selectedEmpForView).totalLateMins} Mins</p>
              </div>
              <div className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Net Payable</span>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">Rs. {getCalculationsForAttendance(tempEmpAttendance, selectedEmpForView).netPayable.toLocaleString()}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 border border-slate-800 rounded-xl print-scroll-container">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800 text-slate-400 sticky top-0">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">In Time</th>
                    <th className="p-2.5">Out Time</th>
                    <th className="p-2.5 text-right">Late / Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {Object.keys(tempEmpAttendance).sort().map((dateKey) => {
                    const punch = tempEmpAttendance[dateKey];
                    const lateMins = calculateLateMinutes(punch.inTime);
                    return (
                      <tr key={dateKey} className="hover:bg-slate-800/30">
                        <td className="p-2.5 font-medium text-slate-200">{dateKey}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${punch.status === 'P' ? 'bg-emerald-500/10 text-emerald-400' : punch.status === 'A' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
                            {punch.status === 'P' ? 'Present' : punch.status === 'A' ? 'Absent' : punch.status === 'L' ? 'Leave' : 'Holiday'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-300">{punch.inTime}</td>
                        <td className="p-2.5 text-slate-300">{punch.outTime}</td>
                        <td className="p-2.5 text-right">
                          {lateMins > 0 ? (
                            <span className="text-rose-400 font-semibold">{lateMins} Mins Late</span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-700 flex justify-end no-print">
              <button onClick={() => setSelectedEmpForView(null)} className="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2 rounded-lg text-xs font-semibold">
                Close Report
              </button>
            </div>

          </div>
        </div>
      )}

      {selectedEmpForEdit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-2xl rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            
            <div className="flex flex-wrap justify-between items-center border-b border-slate-700 pb-3 gap-2">
              <div>
                <h3 className="text-sm font-bold text-white">Edit Attendance - {selectedEmpForEdit.name} (Code: {selectedEmpForEdit.machineId})</h3>
                <p className="text-[11px] text-slate-400">Month: {selectedMonth}</p>
              </div>
              
              <div className="flex items-center space-x-2">
                <button onClick={handleBlankFill} className="bg-indigo-600/80 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition-colors">
                  All Fill
                </button>
                <button onClick={handleAllClear} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition-colors">
                  All Clear
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
                  <div key={dateKey} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900/65 p-2.5 rounded-lg border border-slate-700/50 text-xs gap-2">
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
                        onChange={(e) => setTempEmpAttendance({
                          ...tempEmpAttendance,
                          [dateKey]: { ...punch, status: e.target.value as DailyPunch['status'] }
                        })}
                        className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 focus:outline-none"
                      >
                        <option value="P">Present (P)</option>
                        <option value="A">Absent (A)</option>
                        <option value="L">Leave (L)</option>
                        <option value="H">Holiday (H)</option>
                      </select>
                      
                      <input 
                        type="time" 
                        value={punch.inTime !== '--:--' ? punch.inTime : ''} 
                        onChange={(e) => setTempEmpAttendance({
                          ...tempEmpAttendance,
                          [dateKey]: { ...punch, inTime: e.target.value || '--:--', lateMinutes: calculateLateMinutes(e.target.value) }
                        })}
                        className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 focus:outline-none" 
                      />

                      <input 
                        type="time" 
                        value={punch.outTime !== '--:--' ? punch.outTime : ''} 
                        onChange={(e) => setTempEmpAttendance({
                          ...tempEmpAttendance,
                          [dateKey]: { ...punch, outTime: e.target.value || '--:--' }
                        })}
                        className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 focus:outline-none" 
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
              <div className="flex gap-4 text-slate-300">
                <div>
                  <span className="text-slate-400">Total Deduction:</span>{' '}
                  <span className="font-bold text-red-400">Rs. {getCalculationsForAttendance(tempEmpAttendance, selectedEmpForEdit).totalDeduction.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-400">Net Payable:</span>{' '}
                  <span className="font-bold text-emerald-400">Rs. {getCalculationsForAttendance(tempEmpAttendance, selectedEmpForEdit).netPayable.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button onClick={() => setSelectedEmpForEdit(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-1.5 rounded-lg text-xs font-semibold">
                  Cancel
                </button>
                <button 
                  onClick={handleSaveAttendance} 
                  disabled={isSaving}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-md disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}