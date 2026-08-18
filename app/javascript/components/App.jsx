import React, { Suspense, lazy, useContext } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { motion } from "framer-motion";

import { AuthProvider } from "../context/AuthContext";
import PrivateRoute from "../components/PrivateRoute";
import ProjectMemberRoute from "../components/ProjectMemberRoute";

import Navbar from "../components/Navbar";
import PageTitle from "./PageTitle";
import PageLoader from "./ui/PageLoader";
import ChatLauncher from "./ChatLauncher";
import DemoBanner from "./DemoBanner";
import DemoTourNavigator from "./DemoTourNavigator";
import CommandPalette from "./CommandPalette";
import { AuthContext } from "../context/AuthContext";
import { WorkspaceDataProvider } from "../context/WorkspaceDataContext";
import { portfolioEnabled } from "../config/features";
import { routeFrameKeyForPath } from "../utils/routeFrameKey";
import { getRouteLayout } from "./shell/routeLayout";

const Admin = lazy(() => import("../components/Admin/Admin"));
const AdminImpersonation = lazy(() => import("../pages/AdminImpersonation"));
const AuthPage = lazy(() => import("../pages/AuthPage"));
const Calendar = lazy(() => import("../pages/Calendar"));
const Chat = lazy(() => import("../pages/Chat"));
const Meeting = lazy(() => import("../pages/Meeting"));
const Contact = lazy(() => import("../pages/Contact"));
const DailyMomentumHub = lazy(() => import("../pages/DailyMomentumHub"));
const DepartmentDetails = lazy(() => import("../pages/DepartmentDetails"));
const Departments = lazy(() => import("../pages/Departments"));
const ForgotPassword = lazy(() => import("../pages/ForgotPassword"));
const IssueTracker = lazy(() => import("../pages/IssueTracker"));
const KnowledgeDashboard = lazy(() => import("../pages/KnowledgeDashboard"));
const Legal = lazy(() => import("../pages/Legal"));
const MetaverseLanding = lazy(() => import("../pages/MetaverseLanding"));
const MyWork = lazy(() => import("../pages/MyWork"));
const Notifications = lazy(() => import("../pages/Notifications"));
const DemoHub = lazy(() => import("../pages/DemoHub"));
const PdfMaster = lazy(() => import("./PdfMaster"));
const PortfolioAdmin = lazy(() => import("../pages/PortfolioAdmin"));
const PostPage = lazy(() => import("../pages/PostPage"));
const PublicPortfolio = lazy(() => import("../pages/PublicPortfolio"));
const Profile = lazy(() => import("../components/Profile"));
const ProjectMetaverse = lazy(() => import("../pages/ProjectMetaverse"));
const Projects = lazy(() => import("../pages/Projects"));
const ResetPassword = lazy(() => import("../pages/ResetPassword"));
const Settings = lazy(() => import("../pages/Settings"));
const SprintDashboard = lazy(() => import("../pages/SprintDashboard"));
const Teams = lazy(() => import("../pages/Teams"));
const Users = lazy(() => import("../pages/Users"));
const Vault = lazy(() => import("../pages/Vault"));
const WorkLog = lazy(() => import("../pages/WorkLog"));

const routeTransitionProps = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

const AppRoutes = () => {
  const location = useLocation();
  // Query parameters often represent in-page state, so keep the route mounted
  // when they change instead of replaying the full-page loading transition.
  const routeKey = routeFrameKeyForPath(location.pathname);

  return (
    <motion.div key={routeKey} className="shell-route-frame" {...routeTransitionProps}>
      <Suspense fallback={<PageLoader title="Loading view" message="Preparing this screen..." />}>
        <Routes location={location}>
            <Route path="/" element={portfolioEnabled ? <PublicPortfolio /> : <AuthPage mode="login" />} />
            <Route path="/contact" element={portfolioEnabled ? <Contact /> : <Navigate to="/login" replace />} />
            <Route path="/legal" element={<Legal />} />
            <Route path="/metaverse-landing" element={portfolioEnabled ? <MetaverseLanding /> : <Navigate to="/login" replace />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/projects/:projectId/issues"
              element={
                <ProjectMemberRoute>
                  <IssueTracker standalone />
                </ProjectMemberRoute>
              }
            />

            <Route path="/demo" element={portfolioEnabled ? <PrivateRoute><DemoHub /></PrivateRoute> : <Navigate to="/login" replace />} />
            <Route path="/my-work" element={<PrivateRoute><MyWork /></PrivateRoute>} />
            <Route
              path="/momentum"
              element={
                <PrivateRoute>
                  <DailyMomentumHub />
                </PrivateRoute>
              }
            />
            <Route
              path="/pdf"
              element={<Navigate to="/pdf-master" replace />}
            />
            <Route
              path="/pdf-master"
              element={
                <PrivateRoute>
                  <PdfMaster />
                </PrivateRoute>
              }
            />
            <Route
              path="/posts"
              element={
                <PrivateRoute>
                  <PostPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/vault"
              element={
                <PrivateRoute>
                  <Vault />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile/:userId"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />
            <Route
              path="/knowledge"
              element={
                <PrivateRoute>
                  <KnowledgeDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/worklog"
              element={
                <PrivateRoute>
                  <WorkLog />
                </PrivateRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <PrivateRoute>
                  <Calendar />
                </PrivateRoute>
              }
            />
            <Route
              path="/projects"
              element={
                <PrivateRoute>
                  <Projects />
                </PrivateRoute>
              }
            />
            <Route
              path="/teams"
              element={
                <PrivateRoute>
                  <Teams />
                </PrivateRoute>
              }
            />
            <Route
              path="/projects/:projectId/dashboard"
              element={
                <ProjectMemberRoute>
                  <SprintDashboard />
                </ProjectMemberRoute>
              }
            />
            <Route
              path="/projects/:projectId/metaverse"
              element={
                <ProjectMemberRoute>
                  <ProjectMetaverse />
                </ProjectMemberRoute>
              }
            />
            <Route
              path="/users"
              element={
                <PrivateRoute>
                  <Users />
                </PrivateRoute>
              }
            />
            <Route
              path="/departments"
              element={
                <PrivateRoute>
                  <Departments />
                </PrivateRoute>
              }
            />
            <Route
              path="/departments/:id"
              element={
                <PrivateRoute>
                  <DepartmentDetails />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <PrivateRoute allowedRoles={["owner", "admin"]}>
                  <Admin />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/portfolio"
              element={
                portfolioEnabled ? (
                  <PrivateRoute siteAdminOnly>
                    <PortfolioAdmin />
                  </PrivateRoute>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/admin/login-as-user"
              element={
                <PrivateRoute ownerOnly>
                  <AdminImpersonation />
                </PrivateRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <PrivateRoute>
                  <Settings />
                </PrivateRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <PrivateRoute>
                  <Chat />
                </PrivateRoute>
              }
            />
            <Route
              path="/chat/:conversationId"
              element={
                <PrivateRoute>
                  <Chat />
                </PrivateRoute>
              }
            />
            <Route
              path="/meet/:publicId"
              element={
                <PrivateRoute>
                  <Meeting />
                </PrivateRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <PrivateRoute>
                  <Notifications />
                </PrivateRoute>
              }
            />
          </Routes>
        </Suspense>
      </motion.div>
    );
};

const AppShell = () => {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isProjectMetaverseRoute = /^\/projects\/[^/]+\/metaverse$/.test(location.pathname);
  const isPdfRoute = location.pathname.startsWith("/pdf");
  const isImmersiveRoute = location.pathname.startsWith("/knowledge") || location.pathname.startsWith("/meet/") || isProjectMetaverseRoute || isPdfRoute;
  const isChatRoute = location.pathname.startsWith("/chat");
  const portfolioPublicRoutes = portfolioEnabled ? ["/contact", "/metaverse-landing"] : [];
  const isPublicRoute = ["/", "/legal", ...portfolioPublicRoutes].includes(location.pathname);
  const isAuthRoute = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(location.pathname);
  const routeLayout = getRouteLayout(location.pathname);
  const isChatThreadRoute = routeLayout.mobileChrome === "thread";
  const isMobileImmersiveRoute = ["thread", "immersive"].includes(routeLayout.mobileChrome);

  if (isPublicRoute || isAuthRoute) {
    return <AppRoutes />;
  }

  return (
    <div
      className={`shell-app nexus-workspace-shell flex min-h-dvh flex-col ${isImmersiveRoute ? "shell-app-immersive" : ""} ${isChatRoute ? "shell-app-chat" : ""} ${isChatThreadRoute ? "nexus-shell-chat-thread" : ""} ${isMobileImmersiveRoute ? "nexus-shell-mobile-immersive" : ""} ${isProjectMetaverseRoute ? "nexus-shell-chromeless" : ""}`}
      data-layout-mode={routeLayout.mode}
      data-density={routeLayout.density}
      data-route={location.pathname}
    >
      <CommandPalette />
      {isProjectMetaverseRoute ? null : <Navbar />}

      <main className={`shell-main ${isImmersiveRoute ? "shell-main-immersive" : ""} ${isChatRoute ? "shell-main-chat" : ""}`}>
        {user?.demo_account && !isProjectMetaverseRoute && !isChatThreadRoute ? (
          <div className="nexus-demo-chrome">
            <DemoBanner />
            <DemoTourNavigator />
          </div>
        ) : null}
        <div className={`shell-main-stage ${isImmersiveRoute ? "shell-main-stage-immersive" : ""} ${isChatRoute ? "shell-main-stage-chat" : ""}`}>
          <AppRoutes />
        </div>
      </main>

      {isProjectMetaverseRoute ? null : <ChatLauncher />}
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <WorkspaceDataProvider>
          <Toaster
          position="top-right"
          toastOptions={{
            duration: 3200,
            removeDelay: 300,
            style: {
              border: "1px solid rgba(255, 255, 255, 0.75)",
              borderRadius: "20px",
              background: "rgba(15, 23, 42, 0.92)",
              color: "#f8fbff",
              boxShadow: "0 24px 64px rgba(15, 23, 42, 0.24)",
              backdropFilter: "blur(18px)",
            },
            success: {
              iconTheme: {
                primary: "#67e8f9",
                secondary: "#0f172a",
              },
            },
            error: {
              iconTheme: {
                primary: "#fb7185",
                secondary: "#ffffff",
              },
            },
          }}
          />
          <PageTitle />
          <AppShell />
        </WorkspaceDataProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
