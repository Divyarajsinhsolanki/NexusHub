import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import PageLoader from "./ui/PageLoader";

const AccessDeniedRedirect = ({ message = "You are not authorized to access that page." }) => {
  const navigate = useNavigate();

  useEffect(() => {
    toast.error(message);
    navigate("/home", { replace: true });
  }, [message, navigate]);

  return <PageLoader title="Redirecting" message="Taking you back to the home page…" />;
};

export default AccessDeniedRedirect;
