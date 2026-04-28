import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import ProjectsPage from "./pages/ProjectsPage";
import CreateProjectPage from "./pages/CreateProjectPage";
import TaskerDashboard from "./pages/TaskerDashboard";
import QADashboard from "./pages/QADashboard";
import IAADashboard from "./pages/IAADashboard";
import InterfaceBuilder from "./pages/InterfaceBuilder";
import ManagerDashboard from "./pages/ManagerDashboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />

      {/* Admin routes */}
      <Route path="/admin" component={Admin} />
      <Route path="/admin/projects" component={ProjectsPage} />
      <Route path="/admin/projects/create" component={CreateProjectPage} />
      <Route path="/admin/interface" component={InterfaceBuilder} />

      {/* Manager routes (v4) */}
      <Route path="/manager" component={ManagerDashboard} />
      <Route path="/manager/projects" component={ProjectsPage} />

      {/* Worker routes */}
      <Route path="/tasker/tasks" component={TaskerDashboard} />
      <Route path="/qa/queue" component={QADashboard} />
      <Route path="/iaa" component={IAADashboard} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
