import React from "react";
import { Link } from "react-router-dom";
import { portfolioEnabled } from "../config/features";

const Footer = () => {
  return (
    <footer className="mt-auto w-full border-t border-shell-border bg-surface-elevated shadow-shell-sm">
      <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 py-4 text-sm text-shell-muted sm:px-6 md:flex-row md:py-3">
        <p className="text-center md:text-left">
          &copy; {new Date().getFullYear()} <span className="font-medium text-theme">Nexus Hub</span>. Built by Divyarajsinh Solanki.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link to="/legal" className="transition hover:text-theme">
            Privacy & Terms
          </Link>
          {portfolioEnabled ? (
            <Link to="/" className="transition hover:text-theme">
              Portfolio
            </Link>
          ) : null}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
