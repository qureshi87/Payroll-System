'use client';
import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  Users, Clock, DollarSign, Download, 
  Calendar, Save, X, Upload, Settings, Cpu, ChevronRight, ChevronLeft, UserPlus, Pencil
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09');

  const [shiftStartTime, setShiftStartTime] = useState<string>('08:00');
  const [shiftEndTime, setShiftEndTime] = useState<string>('17:00');
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState<number>(15);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<{ [monthKey: string]: MonthlyData }>({
    '2026-09': { attendance: {}, paidStatus: {} }
  });

  const [selectedEmpForEdit, setSelectedEmpForEdit] = useState<Employee | null>(null);
  const [tempEmpAttendance, setTempEmpAttendance] = useState<{ [date: string]: DailyPunch }>({});
  const [totalWorkingDays] = useState<number>(30);
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

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

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);

    if (!supabase) {
      setLoading(false);
      alert('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
      return;
    }

    const { data, error } = await supabase.from('employees').select('*');
    if (error) {
      console.error('Error loading employees:', error.message);
    } else if (data) {
      const formatted: Employee[] = (data as Array<Record<string, any>>).map((e: Record<string, any>) => ({
        id: e.id,
        machineId: e.machine_id,
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

    if (!supabase) {
      alert('Supabase is not configured.');
      return;
    }

    const machineId = newEmployee.machineId.trim();
    const name = newEmployee.name.trim();
    const salary = newEmployee.salary.trim();

    if (!machineId || !name || !salary) {
      alert('Machine Code, Name and Salary are required.');
      return;
    }

    if (employees.some((emp) => emp.machineId === machineId && emp.id !== editingEmployeeId)) {
      alert('An employee with this Machine Code already exists.');
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
      const { error } = await supabase
        .from('employees')
        .update(payload)
        .eq('id', editingEmployeeId);

      if (error) {
        alert('Error updating employee: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('employees')
        .insert([payload]);

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

  const calculateLateMinutes = (inTime24: string) => {
    if (!inTime24 || inTime24 === '--:--') return 0;
    const [inH, inM] = inTime24.split(':').map(Number);
    const inTotalMins = inH * 60 + inM;

    const [startH, startM] = shiftStartTime.split(':').map(Number);
    const expectedMins = startH * 60 + startM;

    if (inTotalMins > expectedMins + gracePeriodMinutes) {
      return inTotalMins - expectedMins;
    }
    return 0;
  };

  const handleRawBiometricUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      const punchLogs: { [machineId: string]: { [date: string]: string[] } } = {};

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const mId = parts[0];
          let dateStr = '';
          let timeStr = '00:00:00';

          if (parts[1].includes('-') || parts[1].includes('/')) {
            dateStr = parts[1].replace(/\//g, '-');
            timeStr = parts[2] || '00:00:00';
          } else if (parts.length >= 3) {
            dateStr = parts[1];
            timeStr = parts[2];
          }

          if (dateStr) {
            if (!punchLogs[mId]) punchLogs[mId] = {};
            if (!punchLogs[mId][dateStr]) punchLogs[mId][dateStr] = [];
            punchLogs[mId][dateStr].push(timeStr);
          }
        }
      });

      const currentData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };
      const newAtt = { ...currentData.attendance };

      Object.keys(punchLogs).forEach((mId) => {
        if (!newAtt[mId]) newAtt[mId] = {};

        Object.keys(punchLogs[mId]).forEach((dateStr) => {
          const times = punchLogs[mId][dateStr].sort();
          const rawIn = times[0];
          const rawOut = times.length > 1 ? times[times.length - 1] : times[0];

          let totalHours = 0;
          if (rawIn && rawOut && rawIn !== rawOut) {
            const [inH, inM] = rawIn.split(':').map(Number);
            const [outH, outM] = rawOut.split(':').map(Number);
            totalHours = Math.max(0, parseFloat(((outH + outM / 60) - (inH + inM / 60)).toFixed(2)));
          }

          const otHours = totalHours > 8 ? parseFloat((totalHours - 8).toFixed(1)) : 0;
          const lateMins = calculateLateMinutes(rawIn);

          const existingRecord = newAtt[mId]?.[dateStr];
          const status = existingRecord?.status === 'L' || existingRecord?.status === 'H' ? existingRecord.status : 'P';

          newAtt[mId][dateStr] = {
            inTime: rawIn ? rawIn.substring(0, 5) : '--:--',
            outTime: rawOut ? rawOut.substring(0, 5) : '--:--',
            status,
            overtimeHours: otHours,
            totalHours,
            shift: 'Morning',
            lateMinutes: lateMins,
            note: existingRecord?.note || (lateMins > 0 ? `Late ${lateMins}m` : '')
          };
        });
      });

      setMonthlyRecords({
        ...monthlyRecords,
        [selectedMonth]: { ...currentData, attendance: newAtt }
      });

      alert('Biometric Machine Logs Processed Successfully!');
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

      if (importedEmployeesPayload.length > 0) {
        if (!supabase) {
          alert('Supabase is not configured.');
          return;
        }

        const { error } = await supabase.from('employees').insert(importedEmployeesPayload);
        if (error) {
          alert('Error importing Excel: ' + error.message);
        } else {
          alert('Employees Imported & Saved to Supabase Successfully!');
          await fetchEmployees();
        }
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const openEmpCalendar = (emp: Employee) => {
    setSelectedEmpForEdit(emp);
    const empAtt = monthlyRecords[selectedMonth]?.attendance?.[emp.machineId] || {};
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const fullMonthDates: { [date: string]: DailyPunch } = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month - 1, day);
      const isSunday = dateObj.getDay() === 0;

      const dateKey = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      const existing = empAtt[dateKey];

      if (existing) {
        fullMonthDates[dateKey] = existing;
      } else {
        fullMonthDates[dateKey] = {
          inTime: isSunday ? '--:--' : shiftStartTime,
          outTime: isSunday ? '--:--' : shiftEndTime,
          status: isSunday ? 'H' : 'P',
          overtimeHours: 0,
          totalHours: isSunday ? 0 : 8,
          shift: 'Morning',
          lateMinutes: 0,
          note: isSunday ? 'Sunday Holiday' : ''
        };
      }
    }

    setTempEmpAttendance(fullMonthDates);
  };

  const handleBlankFill = () => {
    setTempEmpAttendance((prevAttendance) => {
      const updated = { ...prevAttendance };
      Object.keys(updated).forEach(dateKey => {
        const punch = updated[dateKey];
        if (!punch.inTime || punch.inTime === '--:--') {
          punch.inTime = shiftStartTime;
        }
        if (!punch.outTime || punch.outTime === '--:--') {
          punch.outTime = shiftEndTime;
        }
        if (!punch.status || punch.status === 'A') {
          punch.status = 'P';
          punch.totalHours = 8;
        }
      });
      return updated;
    });
  };
    setTempEmpAttendance(updated);
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

  const getPayrollSummary = () => {
    const monthData = monthlyRecords[selectedMonth] || { attendance: {}, paidStatus: {} };

    return employees.filter(e => e.status === 'Active').map((emp) => {
      const empAtt = monthData.attendance?.[emp.machineId] || {};
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
      const deduction = (basic / workingDays) * absentDays;
      const overtimePay = totalOT * 200;
      const netSalary = Math.max(0, basic - deduction + overtimePay);

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
        deduction,
        netSalary,
        isPaid: monthData.paidStatus?.[emp.machineId] || false
      };
    });
  };

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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800/80 backdrop-blur border border-slate-700/60 p-5 rounded-2xl gap-4 shadow-xl">
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
                        <p className="text-[11px] text-slate-400 mt-0.5">Enter employee details and add them to directory.</p>
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
                      <input type="text" value={newEmployee.machineId} onChange={e => setNewEmployee({...newEmployee, machineId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. 1001" />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Full Name *</label>
                      <input type="text" value={newEmployee.name} onChange={e => setNewEmployee({...newEmployee, name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Muhammad Ali" />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Designation</label>
                      <input type="text" value={newEmployee.designation} onChange={e => setNewEmployee({...newEmployee, designation: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Operator" />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Department</label>
                      <input type="text" value={newEmployee.dept} onChange={e => setNewEmployee({...newEmployee, dept: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Stitching" />
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
                      <button type="button" onClick={resetEmployeeForm} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-lg text-xs font-semibold transition-colors">
                        Cancel
                      </button>
                    )}
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-xs font-semibold shadow-md transition-colors flex items-center space-x-1.5">
                      <Save size={14} />
                      <span>{editingEmployeeId === null ? 'Save Employee' : 'Update Employee'}</span>
                    </button>
                  </div>
                </form>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 shadow-xl overflow-x-auto">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Employee Directory</h3>
                  {loading ? (
                    <div className="text-center py-6 text-slate-400 text-xs">Loading employees...</div>
                  ) : employees.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">No employees found.</div>
                  ) : (
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                        <tr>
                          <th className="p-2.5">Code</th>
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
                        {employees.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-700/30">
                            <td className="p-2.5 font-semibold text-indigo-400">{emp.machineId}</td>
                            <td className="p-2.5 font-medium text-white">{emp.name}</td>
                            <td className="p-2.5">{emp.designation || '-'}</td>
                            <td className="p-2.5">{emp.dept}</td>
                            <td className="p-2.5">{emp.mobile || '-'}</td>
                            <td className="p-2.5">{emp.salaryType}</td>
                            <td className="p-2.5 font-semibold">Rs. {parseInt(emp.salary || '0').toLocaleString()}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 text-[10px] rounded-full font-semibold ${emp.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                {emp.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-right">
                              <button onClick={() => editEmployee(emp)} className="text-slate-400 hover:text-indigo-400 p-1 rounded transition-colors" title="Edit">
                                <Pencil size={14} />
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

            {/* ATTENDANCE LOG TAB */}
            {activeTab === 'attendance' && (
              <div className="space-y-6">
                <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider">Biometric Logs & Shift Rules</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Configure shift timings and tolerance, then upload log file.</p>
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
                    </div>

                    <button onClick={() => alert('Shift Configuration Saved Successfully!')} className="bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-lg font-semibold transition-colors flex items-center space-x-1.5">
                      <Save size={14} />
                      <span>Save Shift</span>
                    </button>

                    <label className="cursor-pointer inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg font-semibold shadow-md transition-colors">
                      <Upload size={14} />
                      <span>Upload Biometric (.txt)</span>
                      <input type="file" accept=".txt" onChange={handleRawBiometricUpload} className="hidden" />
                    </label>
                  </div>
                </div>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 shadow-xl overflow-x-auto">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Attendance Dashboard ({selectedMonth})</h3>
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                      <tr>
                        <th className="p-2.5">Code</th>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Dept</th>
                        <th className="p-2.5 text-center">Calendar / Edit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {employees.filter(e => e.status === 'Active').map((emp) => (
                        <tr key={emp.id} className="hover:bg-slate-700/30">
                          <td className="p-2.5 font-semibold text-indigo-400">{emp.machineId}</td>
                          <td className="p-2.5 font-medium text-white">{emp.name}</td>
                          <td className="p-2.5">{emp.dept}</td>
                          <td className="p-2.5 text-center">
                            <button onClick={() => openEmpCalendar(emp)} className="bg-slate-700 hover:bg-slate-600 text-indigo-300 border border-slate-600 px-3 py-1 rounded-lg text-xs font-medium transition-colors">
                              View / Edit Attendance
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PAYROLL TAB */}
            {activeTab === 'payroll' && (
              <div className="space-y-6">
                <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-xl flex justify-between items-center">
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider">Payroll Report</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Calculated net salaries with late minutes and attendance summaries.</p>
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
                        <th className="p-2.5">Code</th>
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
                      {getPayrollSummary().map((item) => (
                        <tr key={item.machineId} className="hover:bg-slate-700/30">
                          <td className="p-2.5 font-semibold text-indigo-400">{item.machineId}</td>
                          <td className="p-2.5 font-medium text-white">{item.name}</td>
                          <td className="p-2.5">Rs. {item.basicSalary.toLocaleString()}</td>
                          <td className="p-2.5">{item.totalPresentDays}P / {item.totalLeaves}L / {item.totalHolidays}H</td>
                          <td className="p-2.5 font-medium text-amber-400">{item.totalLateCount} Days ({item.totalLateMinutes} Mins)</td>
                          <td className="p-2.5 text-rose-400 font-medium">Rs. {Math.round(item.deduction).toLocaleString()}</td>
                          <td className="p-2.5 text-emerald-400 font-bold">Rs. {Math.round(item.netSalary).toLocaleString()}</td>
                          <td className="p-2.5 text-center">
                            <button onClick={() => togglePaidStatus(item.machineId)} className={`px-2.5 py-1 text-[10px] rounded-full font-bold transition-all ${item.isPaid ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                              {item.isPaid ? 'PAID' : 'UNPAID'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>

      {/* ATTENDANCE & BLANK FILL MODAL */}
      {selectedEmpForEdit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-2xl rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Monthly Attendance - {selectedEmpForEdit.name} ({selectedEmpForEdit.machineId})</h3>
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

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-700">
              <button onClick={() => setSelectedEmpForEdit(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-1.5 rounded-lg text-xs font-semibold">
                Cancel
              </button>
              <button onClick={saveEmpAttendance} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-md">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
