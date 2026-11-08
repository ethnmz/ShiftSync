import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import CreateScreen from "./screens/Create/CreateScreen";

function NotBuilt({ name }: { name: string }) {
  return <p className="p-8 text-muted">{name} is not built yet.</p>;
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/create" replace />} />
        <Route path="/create" element={<CreateScreen />} />
        <Route path="/receive/:id" element={<NotBuilt name="Receive" />} />
        <Route path="/history" element={<NotBuilt name="History" />} />
        <Route path="/supervisor" element={<NotBuilt name="Supervisor" />} />
        <Route path="/evaluation" element={<NotBuilt name="Evaluation" />} />
      </Routes>
    </AppShell>
  );
}
