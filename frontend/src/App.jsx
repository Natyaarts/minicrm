import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import Dashboard from './pages/Dashboard';
import SalesModule from './pages/SalesModule';
import MentorModule from './pages/MentorModule';
import StudentPortal from './pages/StudentPortal';
import AcademicModule from './pages/AcademicModule';
import AcademicCoordinatorModule from './pages/AcademicCoordinatorModule';
import TeacherModule from './pages/TeacherModule';
import CoursesModule from './pages/CoursesModule';
import AdminModule from './pages/AdminModule';
import PublicApplicationForm from './pages/PublicApplicationForm';
import UsersModule from './pages/UsersModule';
import HRMSModule from './pages/HRMSModule';
import AttendanceModule from './pages/AttendanceModule';
import PayrollModule from './pages/PayrollModule';
import LeaveModule from './pages/LeaveModule';
import AnalyticsModule from './pages/AnalyticsModule';
import TasksModule from './pages/TasksModule';
import FinanceModule from './pages/FinanceModule';
import Login from './pages/Login';

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/apply/:programSlug" element={<PublicApplicationForm />} />

        {/* Protected Routes */}
        <Route element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/hrms" element={<HRMSModule />} />
          <Route path="/hrms/attendance" element={<AttendanceModule />} />
          <Route path="/hrms/payroll" element={<PayrollModule />} />
          <Route path="/hrms/leaves" element={<LeaveModule />} />
          <Route path="/hrms/tasks" element={<TasksModule />} />
          <Route path="/sales" element={<SalesModule />} /> {/* Internal Sales View (with Sidebar) */}
          <Route path="/mentor" element={<MentorModule />} />
          <Route path="/student" element={<StudentPortal />} />
          <Route path="/academic" element={<AcademicModule />} />
          <Route path="/academic-coordinator" element={<AcademicCoordinatorModule />} />
          <Route path="/teacher" element={<TeacherModule />} />
          <Route path="/courses" element={<CoursesModule />} />
          <Route path="/admin" element={<AdminModule />} />
          <Route path="/users" element={<UsersModule />} />
          <Route path="/analytics" element={<AnalyticsModule />} />
          <Route path="/finance" element={<FinanceModule />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
