import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import Dashboard from './pages/Dashboard';
import SalesModule from './pages/SalesModule';
import MentorModule from './pages/MentorModule';
import StudentPortal from './pages/StudentPortal';
import AcademicModule from './pages/AcademicModule';
import CoursesModule from './pages/CoursesModule';
import AdminModule from './pages/AdminModule';
import Login from './pages/Login';

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/apply" element={<SalesModule />} /> {/* Public Student Registration Form */}

        {/* Protected Routes */}
        <Route element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sales" element={<SalesModule />} /> {/* Internal Sales View (with Sidebar) */}
          <Route path="/mentor" element={<MentorModule />} />
          <Route path="/student" element={<StudentPortal />} />
          <Route path="/academic" element={<AcademicModule />} />
          <Route path="/courses" element={<CoursesModule />} />
          <Route path="/admin" element={<AdminModule />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
