import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import FAQ from './pages/FAQ';
import Terms from './pages/Terms';
import Changelog from './pages/Changelog';
import Guide from './pages/Guide';
import Roadmap from './pages/Roadmap';
import Callback from './pages/Callback';
import MyEntities from './pages/MyEntities';
import MyServers from './pages/MyServers';
import Operator from './pages/Operator';
import Tools from './pages/Tools';
import BugReports from './pages/BugReports';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/faq" element={<FAQ />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/changelog" element={<Changelog />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/roadmap" element={<Roadmap />} />
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
        <Route path="/tools" element={<Tools />} />
        <Route path="/bug-reports" element={<BugReports />} />
      </Route>
    </Routes>
  );
}
