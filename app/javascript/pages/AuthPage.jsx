import React, { useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Login from "./Login";
import Signup from "./Signup";
import { AuthContext } from "../context/AuthContext";
import authCommandDeck from "../images/nexus/auth-command-deck.webp";
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
    <div className="relative min-h-dvh overflow-x-hidden bg-shell-dark">
      <div className="pointer-events-none absolute inset-0">
        <img
          src={authCommandDeck}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-slate-950/66" />
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-theme-secondary/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-theme/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-info/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              "linear-gradient(rgb(var(--color-muted-rgb) / 0.08) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--color-muted-rgb) / 0.08) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>
      <div className="relative z-10 flex min-h-dvh items-center px-4 py-4 sm:px-6 lg:px-8">
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
