import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Callback from './pages/Callback';
import MyEntities from './pages/MyEntities';
import MyServers from './pages/MyServers';
import Operator from './pages/Operator';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/callback" element={<Callback />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/entities" element={<MyEntities />} />
        <Route path="/servers" element={<MyServers />} />
        <Route path="/operator" element={<Operator />} />
        <Route path="/" element={<Navigate to="/entities" replace />} />
      </Route>
    </Routes>
  );
}
