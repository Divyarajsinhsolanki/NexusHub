import React, { useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import AuthBackground from "../components/ui/AuthBackground";
import Login from "./Login";
import Signup from "./Signup";
import { AuthContext } from "../context/AuthContext";
import { safeReturnPath } from "../utils/safeReturnPath";

const defaultUserPath = (user) => {
  const landingPage = user?.landing_page;
  if (!landingPage) return "/";
  return landingPage.startsWith("/") ? landingPage : `/${landingPage}`;
};

function AuthPage({ mode = "login" }) {
  const { isAuthenticated, user } = useContext(AuthContext);
  const [current, setCurrent] = useState(mode);
  const location = useLocation();

  useEffect(() => {
    setCurrent(mode);
  }, [mode]);

  if (isAuthenticated) {
    const returnTo = safeReturnPath(location.state?.from || window.sessionStorage.getItem("post_auth_return_to"));
    if (returnTo) window.sessionStorage.removeItem("post_auth_return_to");
    return <Navigate to={returnTo || defaultUserPath(user)} replace />;
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden auth-page bg-shell-bg">
      <AuthBackground />
      <div className="relative z-10 flex min-h-dvh items-center px-4 py-10 sm:px-6 lg:px-8">
        {current === "signup" ? (
          <Signup switchToLogin={() => setCurrent("login")} />
        ) : (
          <Login switchToSignup={() => setCurrent("signup")} />
        )}
      </div>
    </div>
  );
}

export default AuthPage;
