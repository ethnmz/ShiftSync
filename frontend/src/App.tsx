import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import CreateFlow from "./screens/Create/CreateFlow";
import RecordPage from "./screens/Create/RecordPage";
import { ClarifyPage, ReviewPage, StepRedirect } from "./screens/Create/StepPages";
import ReceiveList from "./screens/Receive/ReceiveList";
import ReceiveScreen from "./screens/Receive/ReceiveScreen";

function NotBuilt({ name }: { name: string }) {
  return <p className="p-8 text-muted">{name} is P1 and not built yet.</p>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/create" replace />} />
      {/* Shift A: one page per step, full screen. */}
      <Route path="/create" element={<CreateFlow />}>
        <Route index element={<RecordPage />} />
        <Route path=":id" element={<StepRedirect />} />
        <Route path=":id/record" element={<RecordPage />} />
        <Route path=":id/clarify" element={<ClarifyPage />} />
        <Route path=":id/review" element={<ReviewPage />} />
      </Route>
      <Route
        path="*"
        element={
          <AppShell>
            <Routes>
              <Route path="/receive" element={<ReceiveList />} />
              <Route path="/receive/:id" element={<ReceiveScreen />} />
              <Route path="/history" element={<NotBuilt name="History" />} />
              <Route path="/supervisor" element={<NotBuilt name="Supervisor" />} />
              <Route path="/evaluation" element={<NotBuilt name="Evaluation" />} />
              <Route path="*" element={<NotBuilt name="This page" />} />
            </Routes>
          </AppShell>
        }
      />
    </Routes>
  );
}
