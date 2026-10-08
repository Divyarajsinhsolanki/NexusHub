import React, { useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Login from "./Login";
import Signup from "./Signup";
import ForgotPassword from "./ForgotPassword";
import AuthLayout from "../components/ui/AuthLayout";
import { AuthContext } from "../context/AuthContext";
import { safeReturnPath } from "../utils/safeReturnPath";

const defaultUserPath = (user) => {
  const landingPage = user?.landing_page;
  if (!landingPage) return "/home";
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
    <AuthLayout>
        {current === "signup" ? (
          <Signup embedded switchToLogin={() => setCurrent("login")} />
        ) : current === "forgot-password" ? (
          <ForgotPassword embedded switchToLogin={() => setCurrent("login")} />
        ) : (
          <Login embedded switchToSignup={() => setCurrent("signup")} switchToForgotPassword={() => setCurrent("forgot-password")} />
        )}
    </AuthLayout>
  );
}

export default AuthPage;
