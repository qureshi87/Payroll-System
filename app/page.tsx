'use client';
import { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  Users, Clock, DollarSign, Download, Trash2, 
  Calendar, Save, X, Upload, FileSpreadsheet, Settings, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Clock3, UserPlus, Pencil
} from 'lucide-react';

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
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState<number>(15);

  const [employees, setEmployees] = useState<Employee[]>([
    { id: 1, machineId: '8383', name: 'Ali Raza', designation: 'Stitcher', dept: 'Production', mobile: '03001234567', salaryType: 'Monthly', salary: '45000', status: 'Active' },
    { id: 2, machineId: '2132', name: 'Usman Ahmed', designation: 'HR Officer', dept: 'HR', mobile: '03217654321', salaryType: 'Monthly', salary: '65000', status: 'Active' }
  ]);

  const [monthlyRecords, setMonthlyRecords] = useState<{ [monthKey: string]: MonthlyData }>({
    '2026-09': { attendance: {}, paidStatus: {} }
  });

  const [selectedEmpForEdit, setSelectedEmpForEdit] = useState<Employee | null>(null);
  const [tempEmpAttendance, setTempEmpAttendance] = useState<{ [date: string]: DailyPunch }>({});
  const [totalWorkingDays] = useState<number>(30);
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
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

  const saveEmployee = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const machineId = newEmployee.machineId.trim();
    const name = newEmployee.name.trim();
    const salary = newEmployee.salary.trim();

    if (!machineId || !name || !salary) {
      alert('Machine Code, Name and Salary are required.');
      return;
    }

    if (employees.some((employee) => employee.machineId === machineId && employee.id !== editingEmployeeId)) {
      alert('An employee with this Machine Code already exists.');
      return;
    }

    const employeeDetails = {
      machineId,
      name,
      designation: newEmployee.designation.trim(),
      dept: newEmployee.dept.trim() || 'Production',
      mobile: newEmployee.mobile.trim(),
      salaryType: newEmployee.salaryType,
      salary,
      status: newEmployee.status
    };

    if (editingEmployeeId !== null) {
      const currentEmployee = employees.find((employee) => employee.id === editingEmployeeId);
      setEmployees((currentEmployees) => currentEmployees.map((employee) => (
        employee.id === editingEmployeeId ? { ...employee, ...employeeDetails } : employee
      )));

      if (currentEmployee && currentEmployee.machineId !== machineId) {
        setMonthlyRecords((currentRecords) => Object.fromEntries(
          Object.entries(currentRecords).map(([monthKey, monthData]) => {
            const attendance = { ...monthData.attendance };
            const paidStatus = { ...monthData.paidStatus };
            if (attendance[currentEmployee.machineId]) {
              attendance[machineId] = attendance[currentEmployee.machineId];
              delete attendance[currentEmployee.machineId];
            }
            if (paidStatus[currentEmployee.machineId] !== undefined) {
              paidStatus[machineId] = paidStatus[currentEmployee.machineId];
              delete paidStatus[currentEmployee.machineId];
            }
            return [monthKey, { ...monthData, attendance, paidStatus }];
          })
        ));
      }
    } else {
      setEmployees((currentEmployees) => [
        ...currentEmployees,
        { id: Date.now(), ...employeeDetails }
      ]);
    }

    resetEmployeeForm();
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

  const format12Hour = (time24: string) => {
    if (!time24 || time24 === '--:--') return '--:--';
    const parts = time24.split(':');
    if (parts.length < 2) return time24;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
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

  const handleExcelEmployeeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      if (!data) return;

      const workbook = XLSX.read(data, { type: 'binary' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet);

      const importedEmployees: Employee[] = jsonData.map((row, index) => ({
        id: Date.now() + index,
        machineId: String(row['Code'] || row['code'] || row['Machine ID'] || row['ID'] || '').trim() || `${1000 + index}`,
        name: String(row['Employee Name'] || row['Name'] || '').trim() || 'Unnamed',
        designation: String(row['Designation'] || '').trim(),
        dept: String(row['Department'] || 'Production').trim(),
        mobile: String(row['Mobile'] || '').trim(),
        salaryType: String(row['Type'] || 'Monthly').toLowerCase().includes('week') ? 'Weekly' : 'Monthly',
        salary: String(row['Salary'] || '0').trim(),
        status: String(row['Status'] || 'Active').toLowerCase().includes('resign') ? 'Resigned' : 'Active'
      }));

      if (importedEmployees.length > 0) {
        setEmployees(prev => [...prev, ...importedEmployees.filter(e => !prev.some(x => x.machineId === e.machineId))]);
        alert('Employees Imported Successfully!');
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
          inTime: '--:--',
          outTime: '--:--',
          status: isSunday ? 'H' : 'A',
          overtimeHours: 0,
          totalHours: 0,
          shift: 'Morning',
          lateMinutes: 0,
          note: isSunday ? 'Sunday Holiday' : ''
        };
      }
    }

    setTempEmpAttendance(fullMonthDates);
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
      const totalLateCount = Object.values(empAtt).filter(a => a.lateMinutes > 0).length;

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
    doc.text(`Payroll Report - ${selectedMonth}`, 14, 15);

    const summary = getPayrollSummary();
    const tableRows = summary.map((item) => [
      item.machineId,
      item.name,
      item.designation,
      `Rs. ${item.basicSalary.toLocaleString()}`,
      `${item.totalPresentDays}P / ${item.totalLeaves}L / ${item.totalHolidays}H`,
      `${item.totalLateCount} Days`,
      `Rs. ${Math.round(item.deduction).toLocaleString()}`,
      `Rs. ${Math.round(item.netSalary).toLocaleString()}`,
      item.isPaid ? 'PAID' : 'UNPAID'
    ]);

    autoTable(doc, {
      head: [['Code', 'Name', 'Designation', 'Basic', 'P / L / H', 'Late Days', 'Deduction', 'Net Salary', 'Status']],
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
        
        {/* Top Bar Header */}
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
              <button onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? 'Hide navigation' : 'Show navigation'} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700/60 transition-colors">
                {sidebarOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
              </button>
            </div>
            <nav className="flex md:flex-col gap-1 mt-2">
              <button onClick={() => setActiveTab('employees')} title="Employees" className={`flex items-center ${sidebarOpen ? 'justify-start' : 'justify-center'} gap-2 w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'employees' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
                <Users size={14} />{sidebarOpen && <span>Employees</span>}
              </button>
              <button onClick={() => setActiveTab('attendance')} title="Attendance Log" className={`flex items-center ${sidebarOpen ? 'justify-start' : 'justify-center'} gap-2 w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'attendance' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
                <Clock size={14} />{sidebarOpen && <span>Attendance Log</span>}
              </button>
              <button onClick={() => setActiveTab('payroll')} title="Payroll" className={`flex items-center ${sidebarOpen ? 'justify-start' : 'justify-center'} gap-2 w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'payroll' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
                <DollarSign size={14} />{sidebarOpen && <span>Payroll</span>}
              </button>
            </nav>
          </aside>

          <main className="min-w-0 flex-1">

        {/* TAB 1: EMPLOYEES */}
        {activeTab === 'employees' && (
          <div className="space-y-6">
            <form onSubmit={saveEmployee} className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center space-x-2">
                <UserPlus className="text-indigo-400" size={18} />
                <div>
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider">{editingEmployeeId === null ? 'Add Employee Manually' : 'Update Employee'}</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">{editingEmployeeId === null ? 'Enter employee details and add them to the directory.' : 'Update employee details and status.'}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <input required value={newEmployee.machineId} onChange={(e) => setNewEmployee({ ...newEmployee, machineId: e.target.value })} placeholder="Machine Code *" className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white placeholder:text-slate-500" />
                <input required value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} placeholder="Employee Name *" className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white placeholder:text-slate-500" />
                <input value={newEmployee.designation} onChange={(e) => setNewEmployee({ ...newEmployee, designation: e.target.value })} placeholder="Designation" className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white placeholder:text-slate-500" />
                <input value={newEmployee.dept} onChange={(e) => setNewEmployee({ ...newEmployee, dept: e.target.value })} placeholder="Department" className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white placeholder:text-slate-500" />
                <input value={newEmployee.mobile} onChange={(e) => setNewEmployee({ ...newEmployee, mobile: e.target.value })} placeholder="Mobile Number" className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white placeholder:text-slate-500" />
                <select value={newEmployee.salaryType} onChange={(e) => setNewEmployee({ ...newEmployee, salaryType: e.target.value as Employee['salaryType'] })} className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white">
                  <option value="Monthly">Monthly Salary</option>
                  <option value="Weekly">Weekly Salary</option>
                </select>
                <input required type="number" min="0" value={newEmployee.salary} onChange={(e) => setNewEmployee({ ...newEmployee, salary: e.target.value })} placeholder="Basic Salary *" className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white placeholder:text-slate-500" />
                <select value={newEmployee.status} onChange={(e) => setNewEmployee({ ...newEmployee, status: e.target.value as Employee['status'] })} className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white">
                  <option value="Active">Active</option>
                  <option value="Resigned">Resigned</option>
                </select>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg p-2.5 font-semibold flex items-center justify-center space-x-2 transition-colors">
                  {editingEmployeeId === null ? <UserPlus size={14} /> : <Save size={14} />}<span>{editingEmployeeId === null ? 'Add Employee' : 'Update Employee'}</span>
                </button>
                {editingEmployeeId !== null && <button type="button" onClick={resetEmployeeForm} className="bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg p-2.5 font-semibold transition-colors">Cancel</button>}
              </div>
            </form>

            <div className="bg-slate-800/40 border border-dashed border-slate-700 p-5 rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileSpreadsheet className="text-emerald-400" size={20} />
                <div>
                  <h3 className="text-xs font-semibold text-white">Import Employee List</h3>
                  <p className="text-[11px] text-slate-400">Supported formats: .xlsx, .csv</p>
                </div>
              </div>
              <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 px-4 py-2 rounded-xl text-xs font-medium transition-all">
                <span>Browse File</span>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleExcelEmployeeUpload} className="hidden" />
              </label>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-700/60 bg-slate-800/80">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Employee Directory ({employees.length})</h2>
              </div>
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-900/40 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-700/60">
                    <th className="p-4">Machine Code</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Designation</th>
                    <th className="p-4">Department</th>
                    <th className="p-4">Basic Salary</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40 text-slate-300">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="p-4 font-mono font-semibold text-indigo-400">{emp.machineId}</td>
                      <td className="p-4 font-medium text-white">{emp.name}</td>
                      <td className="p-4 text-slate-400">{emp.designation}</td>
                      <td className="p-4 text-slate-400">{emp.dept}</td>
                      <td className="p-4 font-semibold text-emerald-400">Rs. {Number(emp.salary).toLocaleString()}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${emp.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center items-center space-x-2">
                          <button onClick={() => editEmployee(emp)} title="Edit employee" className="text-slate-500 hover:text-indigo-400 transition-colors p-1"><Pencil size={15} /></button>
                          <button onClick={() => setEmployees(employees.filter(e => e.id !== emp.id))} title="Delete employee" className="text-slate-500 hover:text-rose-400 transition-colors p-1"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: MACHINE ATTENDANCE LOG */}
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Config Panel */}
              <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl space-y-4 md:col-span-1">
                <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-xs">
                  <Settings size={16} />
                  <h3>Shift Configuration</h3>
                </div>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Shift Start Time</label>
                    <input type="time" value={shiftStartTime} onChange={(e) => setShiftStartTime(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Late Grace Allowance (Mins)</label>
                    <input type="number" value={gracePeriodMinutes} onChange={(e) => setGracePeriodMinutes(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono" />
                  </div>
                </div>
              </div>

              {/* Upload Card */}
              <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl space-y-3 md:col-span-2 flex flex-col justify-center items-center text-center">
                <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-full mb-1">
                  <Upload size={22} />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">Upload Biometric Raw Logs</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Select standard machine file (.txt, .dat, .csv)</p>
                </div>
                <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-xs font-semibold transition-all shadow-lg shadow-indigo-600/20">
                  <span>Select Log File</span>
                  <input type="file" accept=".txt, .dat, .csv" onChange={handleRawBiometricUpload} className="hidden" />
                </label>
              </div>

            </div>

            {/* Attendance Overview Table */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-700/60 bg-slate-800/80">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Detected Punch Records ({selectedMonth})</h2>
              </div>
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-900/40 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-700/60">
                    <th className="p-4">Code</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Summary (P / L / H)</th>
                    <th className="p-4">Late Count</th>
                    <th className="p-4">Overtime</th>
                    <th className="p-4 text-center">Detail Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40 text-slate-300">
                  {employees.map((emp) => {
                    const empAtt = monthlyRecords[selectedMonth]?.attendance?.[emp.machineId] || {};
                    const presentCount = Object.values(empAtt).filter(a => a.status === 'P').length;
                    const leaveCount = Object.values(empAtt).filter(a => a.status === 'L').length;
                    const holidayCount = Object.values(empAtt).filter(a => a.status === 'H').length;
                    const lateDaysCount = Object.values(empAtt).filter(a => a.lateMinutes > 0).length;
                    const otHours = Object.values(empAtt).reduce((s, a) => s + (Number(a.overtimeHours) || 0), 0);

                    return (
                      <tr key={emp.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="p-4 font-mono font-semibold text-indigo-400">{emp.machineId}</td>
                        <td className="p-4 font-medium text-white">{emp.name}</td>
                        <td className="p-4 font-semibold space-x-1.5">
                          <span className="text-emerald-400">{presentCount} P</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-blue-400">{leaveCount} L</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-purple-400">{holidayCount} H</span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md ${lateDaysCount > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-700/40 text-slate-400'}`}>
                            {lateDaysCount} Late Days
                          </span>
                        </td>
                        <td className="p-4 text-slate-300 font-mono">{otHours.toFixed(1)} hrs</td>
                        <td className="p-4 text-center">
                          <button 
                            onClick={() => openEmpCalendar(emp)}
                            className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 mx-auto transition-colors"
                          >
                            <span>Punch Times</span>
                            <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: PAYROLL */}
        {activeTab === 'payroll' && (
          <div className="space-y-6">
            <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl flex justify-between items-center shadow-xl">
              <div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">Monthly Payroll Summary</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Calculated net payout for <span className="text-indigo-400 font-semibold">{selectedMonth}</span></p>
              </div>
              <button onClick={exportPDF} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center space-x-2 transition-all shadow-lg shadow-emerald-600/20">
                <Download size={14} /><span>Export PDF</span>
              </button>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-900/40 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-700/60">
                    <th className="p-4">Code</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Basic</th>
                    <th className="p-4">Attd (P/L/H/A)</th>
                    <th className="p-4">Deductions</th>
                    <th className="p-4">Net Salary</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40 text-slate-300">
                  {getPayrollSummary().map((item) => (
                    <tr key={item.machineId} className="hover:bg-slate-700/30 transition-colors">
                      <td className="p-4 font-mono font-semibold text-indigo-400">{item.machineId}</td>
                      <td className="p-4 font-medium text-white">{item.name}</td>
                      <td className="p-4 text-slate-400">Rs. {item.basicSalary.toLocaleString()}</td>
                      <td className="p-4 font-semibold space-x-1">
                        <span className="text-emerald-400">{item.totalPresentDays}P</span> / 
                        <span className="text-blue-400 ml-1">{item.totalLeaves}L</span> / 
                        <span className="text-purple-400 ml-1">{item.totalHolidays}H</span> / 
                        <span className="text-rose-400 ml-1">{item.totalAbsentDays}A</span>
                      </td>
                      <td className="p-4 text-rose-400 font-mono">Rs. {Math.round(item.deduction).toLocaleString()}</td>
                      <td className="p-4 font-bold text-emerald-400 font-mono">Rs. {Math.round(item.netSalary).toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => togglePaidStatus(item.machineId)}
                          className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center space-x-1 mx-auto ${item.isPaid ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}
                        >
                          {item.isPaid ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}
                          <span>{item.isPaid ? 'PAID' : 'UNPAID'}</span>
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

      {/* MODAL */}
      {selectedEmpForEdit && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <div>
                <h3 className="font-bold text-white text-xs">{selectedEmpForEdit.name} - Punch Logs</h3>
                <p className="text-[11px] text-slate-400 font-mono">Code: {selectedEmpForEdit.machineId} | Month: {selectedMonth}</p>
              </div>
              <button onClick={() => setSelectedEmpForEdit(null)} className="text-slate-400 hover:text-white p-1 rounded-lg"><X size={16} /></button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2">
              <div className="grid grid-cols-6 font-bold text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2 gap-2">
                <span>Date</span>
                <span>Punch IN</span>
                <span>Punch OUT</span>
                <span>Status</span>
                <span>Arrival</span>
                <span>Notes</span>
              </div>
              {Object.keys(tempEmpAttendance).sort().map((dateKey) => {
                const rec = tempEmpAttendance[dateKey];
                const [y, m, d] = dateKey.split('-').map(Number);
                const dateObj = new Date(y, m - 1, d);
                const isSunday = dateObj.getDay() === 0;

                return (
                  <div key={dateKey} className={`grid grid-cols-6 items-center text-xs border-b border-slate-800/60 pb-2 gap-2 ${isSunday ? 'bg-purple-500/5 p-1 rounded-lg' : ''}`}>
                    <span className="font-mono text-slate-300 font-medium text-[11px]">{dateKey}</span>

                    <span className="font-mono text-[11px] bg-slate-800/80 p-1 rounded text-center text-indigo-300 border border-slate-700/50">
                      {format12Hour(rec.inTime)}
                    </span>
                    <span className="font-mono text-[11px] bg-slate-800/80 p-1 rounded text-center text-slate-300 border border-slate-700/50">
                      {format12Hour(rec.outTime)}
                    </span>

                    <select 
                      value={rec.status} 
                      onChange={(e) => setTempEmpAttendance({
                        ...tempEmpAttendance,
                        [dateKey]: { ...rec, status: e.target.value as DailyPunch['status'] }
                      })}
                      className="p-1 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none"
                    >
                      <option value="P">Present (P)</option>
                      <option value="A">Absent (A)</option>
                      <option value="L">Leave (L)</option>
                      <option value="H">Holiday (H)</option>
                    </select>

                    <div>
                      {rec.lateMinutes > 0 ? (
                        <span className="text-amber-400 text-[10px] font-semibold">{rec.lateMinutes}m Late</span>
                      ) : (
                        <span className="text-emerald-400 text-[10px] font-semibold">On Time</span>
                      )}
                    </div>

                    <input 
                      type="text" 
                      value={rec.note || ''} 
                      onChange={(e) => setTempEmpAttendance({
                        ...tempEmpAttendance,
                        [dateKey]: { ...rec, note: e.target.value }
                      })}
                      className="p-1 bg-slate-800 border border-slate-700 rounded text-xs text-white" 
                      placeholder="Note"
                    />
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-800/30 flex justify-end space-x-2">
              <button onClick={() => setSelectedEmpForEdit(null)} className="px-3 py-1.5 border border-slate-700 rounded-lg text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={saveEmpAttendance} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-500 flex items-center space-x-1">
                <Save size={13} /><span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}